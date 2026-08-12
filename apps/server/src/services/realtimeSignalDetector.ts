import type { KlineCandle } from './binanceWebSocket'
import { getDb } from '../db/client'
import { saveAlert } from './alertDispatcher'
import { getActiveFVGs } from './fvgEngine'
import { detectSMT, getRecentSMTSignals } from './smtEngine'
import { getLatestStructure, getRecentStructures } from './structureEngine'
import { getActiveLiquidity, checkLiquiditySweep } from './liquidityEngine'
import { scanAndStoreLiquidity, selectTargets } from './liquidityDetector'
import { toAlertFactor, toAlertFactors } from './factorMapping'
import { detectFVG, detectStructure, detectWyckoff, classifyWyckoffPhase } from './candlePatternDetectors'

// The only correlated pairs defined in the knowledge base. A symbol absent
// from this list (SOLUSDT) has nothing to diverge against and therefore
// produces neither SMT nor iSMT.
const LIVE_SMT_PAIRS: Array<[string, string]> = [
  ['ETHUSDT', 'BTCUSDT'],   // crypto — Bybit socket
  ['NQU2026', 'SPX500'],    // indices — Yahoo feed
]

// ─── Candle buffer (rolling 300 candles per symbol+TF) ───────────────────────

const candleBuffers = new Map<string, KlineCandle[]>()
const MAX_BUFFER = 300

function getBuffer(symbol: string, tf: string): KlineCandle[] {
  const key = `${symbol}:${tf}`
  if (!candleBuffers.has(key)) candleBuffers.set(key, [])
  return candleBuffers.get(key)!
}

function pushCandle(candle: KlineCandle): void {
  const buf = getBuffer(candle.symbol, candle.timeframe)
  buf.push(candle)
  if (buf.length > MAX_BUFFER) buf.shift()
}

/**
 * Preload historical candles so detectors can run immediately after boot.
 * Without this the in-memory buffer starts empty and higher timeframes need
 * days of uptime before reaching the minimum candle count — and every deploy
 * resets it. Candles must be passed oldest-first.
 */
export function seedCandles(symbol: string, tf: string, candles: KlineCandle[]): void {
  if (candles.length === 0) return
  const key = `${symbol}:${tf}`
  const existing = candleBuffers.get(key) ?? []

  // Keep any live candles that are newer than the seeded history
  const seedEnd = candles[candles.length - 1].time
  const newer = existing.filter(c => c.time > seedEnd)

  const merged = [...candles, ...newer].slice(-MAX_BUFFER)
  candleBuffers.set(key, merged)
}

export function getBufferSize(symbol: string, tf: string): number {
  return candleBuffers.get(`${symbol}:${tf}`)?.length ?? 0
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

interface LastSent {
  symbol: string
  timeframe: string
  direction: string
  score: number
  signals: string[]
  at: number
}

const detectorStats = {
  candlesProcessed: 0,
  liquidityLevels: 0,
  saved: 0,
  sent: 0,
  lastCandleAt: 0 as number,
  lastSent: null as LastSent | null,
}

export function getDetectorStats() {
  const buffers: Record<string, number> = {}
  for (const [key, buf] of candleBuffers.entries()) buffers[key] = buf.length
  return { ...detectorStats, buffers }
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

function getSettings(): { active: boolean; signals: string[]; timeframes: string[] } {
  const db = getDb()
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN
    ('telegram_active','alert_signals','alert_timeframes')`).all() as any[]

  const map: Record<string, string> = {}
  rows.forEach(r => { map[r.key] = r.value })

  return {
    active:     map['telegram_active'] !== 'false',
    signals:    map['alert_signals']     ? JSON.parse(map['alert_signals'])     : ALL_SIGNALS,
    timeframes: map['alert_timeframes']  ? JSON.parse(map['alert_timeframes'])  : ALL_TIMEFRAMES,
  }
}

const ALL_SIGNALS = ['bos','choch','fvg','ifvg','liquidity','smt','ismt','ob','doubletop','doublebottom','judas','wyckoff','session','inducement','repricing']
const ALL_TIMEFRAMES = ['1m','5m','15m','30m','1h','4h','1D','1W']

// ─── Local pattern detectors (run on candle buffer) ──────────────────────────

interface DetectedSignal {
  type: string
  label: string
  emoji: string
  direction: 'bullish' | 'bearish'
  timeframe: string
  score: number
  /** What the system actually saw — concrete prices/assets, not a definition. */
  detail?: string
  /** Candle open time (seconds) the signal was found on. */
  at?: number
}

/** Short "why this matters" line shown under each confirmation in Telegram. */
const SIGNAL_WHY: Record<string, string> = {
  smt:          'חוסר הסכמה בין נכסים מתואמים — התנועה לא נתמכת',
  ismt:         'דיברגנס קצר בין שני נרות — סימן להיחלשות',
  ob:           'אזור שממנו יצאה תנועה חדה — צפוי ביקוש/היצע בחזרה אליו',
  doubletop:    'שני שיאים באותו אזור — הקונים נכשלו לפרוץ',
  doublebottom: 'שני שפלים באותו אזור — המוכרים נכשלו לשבור',
  judas:        'תנועה מזויפת בפתיחה שנועדה לאסוף נזילות לפני הכיוון האמיתי',
  session:      'שיא/שפל חדש בפתיחת סשן — קובע את טווח היום',
  bos:          'שבירת מבנה — המגמה ממשיכה',
  choch:        'שינוי אופי — המגמה עשויה להתהפך',
  fvg:          'פער מחיר שהשוק נוטה לחזור למלא',
  liquidity:    'רמה שבה מרוכזות הוראות סטופ',
  wyckoff:      'שלב במחזור צבירה/הפצה של כסף חכם',
}

/** Human labels for the liquidity level types. */
const LIQ_LABEL: Record<string, string> = {
  equal_highs: 'שיאים שווים', equal_lows: 'שפלים שווים',
  swing_high:  'שיא סווינג',  swing_low:  'שפל סווינג',
  pdh: 'שיא אתמול (PDH)',     pdl: 'שפל אתמול (PDL)',
  pwh: 'שיא השבוע (PWH)',     pwl: 'שפל השבוע (PWL)',
  session_high: 'שיא הסשן',   session_low: 'שפל הסשן',
}

/** UTC hour → trading session, matching the Kill Zone windows. */
function sessionForHour(h: number): string {
  if (h >= 7 && h < 11)  return 'london'
  if (h >= 13 && h < 16) return 'ny'
  return 'asian'
}

function isKillZone(h: number): boolean {
  return (h >= 7 && h < 11) || (h >= 13 && h < 16)
}

/**
 * Stop loss anchored to the swing the trade is built on, not a fixed percentage:
 * below the recent low for longs, above the recent high for shorts, plus a small
 * buffer so a wick touching the exact level does not stop the trade out.
 */
function buildStopLoss(
  buf: KlineCandle[],
  direction: 'bullish' | 'bearish',
  entry: number,
): { price: number; reason: string } | null {
  const window = buf.slice(-10)
  if (window.length < 3) return null

  const buffer = entry * 0.0005   // 0.05%

  if (direction === 'bullish') {
    const low = Math.min(...window.map(c => c.low))
    if (low >= entry) return null
    return {
      price: low - buffer,
      reason: `מתחת לשפל הסווינג ב-$${low.toLocaleString('en-US', { maximumFractionDigits: 2 })} — שבירה שלו מבטלת את הסטאפ`,
    }
  }

  const high = Math.max(...window.map(c => c.high))
  if (high <= entry) return null
  return {
    price: high + buffer,
    reason: `מעל שיא הסווינג ב-$${high.toLocaleString('en-US', { maximumFractionDigits: 2 })} — פריצה שלו מבטלת את הסטאפ`,
  }
}

const TF_SECONDS: Record<string, number> = {
  '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
  '1h': 3600, '4h': 14400, '1D': 86400, '1W': 604800,
}

/**
 * Candle times are open times, but a signal is only true once the candle
 * closes — reporting the open made an 18:00 hourly signal look like it
 * happened at 18:00 when it was confirmed at 19:00. Webhook payloads carry
 * milliseconds while candle buffers carry seconds, which rendered as "27T00".
 */
function fmtTime(t?: number, tf?: string): string {
  if (!t) return ''
  const sec = t > 1e11 ? Math.floor(t / 1000) : t
  const close = sec + (tf ? TF_SECONDS[tf] ?? 0 : 0)
  return new Date(close * 1000).toISOString().slice(11, 16) + ' UTC'
}

function detectOB(buf: KlineCandle[], tf: string): DetectedSignal | null {
  if (buf.length < 3) return null
  const [prev, curr, next] = buf.slice(-3)

  // Bullish OB: bearish candle → next closes above
  if (curr.close < curr.open && next.close > curr.high) {
    const body = Math.abs(next.close - next.open)
    if (body > (curr.high - curr.low) * 0.3) {
      return { type: 'ob', label: 'Order Block', emoji: '🧱', direction: 'bullish', timeframe: tf, score: 1.2 }
    }
  }
  // Bearish OB
  if (curr.close > curr.open && next.close < curr.low) {
    const body = Math.abs(next.close - next.open)
    if (body > (curr.high - curr.low) * 0.3) {
      return { type: 'ob', label: 'Order Block', emoji: '🧱', direction: 'bearish', timeframe: tf, score: 1.2 }
    }
  }
  return null
}

/**
 * iSMT — Intermarket SMT, the fast form of SMT across exactly two consecutive
 * candles of a CORRELATED PAIR.
 *
 * Bearish: on candle 2, asset A takes out candle 1's high and closes back below
 * it (a sweep), while asset B fails to confirm — it either does not take its own
 * candle 1 high, or closes down as well.
 * Bullish: the mirror image on lows.
 *
 * This requires both assets. A symbol with no pair (SOLUSDT) cannot produce it.
 */
function detectISMT(
  bufA: KlineCandle[],
  bufB: KlineCandle[],
  tf: string,
  symbolA: string,
  symbolB: string,
): DetectedSignal | null {
  if (bufA.length < 2 || bufB.length < 2) return null

  const [a1, a2] = bufA.slice(-2)
  const [b1, b2] = bufB.slice(-2)

  // Both assets must be on the same candle for the comparison to mean anything
  if (a2.time !== b2.time) return null

  // Bearish: A sweeps its own high and closes back under it, while B never
  // reached a new high at all. Merely closing lower is not divergence — B has
  // to fail to make the move, or the signal fires on ~38% of candles.
  if (a2.high > a1.high && a2.close < a1.high) {
    if (b2.high <= b1.high) {
      return {
        type: 'ismt',
        label: `iSMT — ${symbolA} מול ${symbolB}`,
        emoji: '🔀',
        direction: 'bearish',
        timeframe: tf,
        score: 1.0,
        detail: `${symbolA} חטף את $${a1.high.toLocaleString()} וסגר מתחתיו — ${symbolB} לא אישר`,
        at: a2.time,
      }
    }
  }

  // Bullish: mirror image — A takes a new low, B never does
  if (a2.low < a1.low && a2.close > a1.low) {
    if (b2.low >= b1.low) {
      return {
        type: 'ismt',
        label: `iSMT — ${symbolA} מול ${symbolB}`,
        emoji: '🔀',
        direction: 'bullish',
        timeframe: tf,
        score: 1.0,
        detail: `${symbolA} חטף את $${a1.low.toLocaleString()} וסגר מעליו — ${symbolB} לא אישר`,
        at: a2.time,
      }
    }
  }

  return null
}

function detectDoublePattern(buf: KlineCandle[], tf: string): DetectedSignal | null {
  if (buf.length < 20) return null
  const recent = buf.slice(-20)
  const last   = recent[recent.length - 1]

  // Tight tolerance: a double top is two touches of the SAME level. A loose
  // band matches any nearby high and turns ordinary chop into a pattern.
  const tol = last.close * 0.0005   // 0.05%

  const prior = recent.slice(0, -1)

  // The second top must be THIS candle — otherwise the pattern already played
  // out and is history, not a trigger.
  const maxH = Math.max(...prior.map(c => c.high))
  if (Math.abs(last.high - maxH) < tol && last.close < last.open) {
    const idx = prior.map(c => c.high).lastIndexOf(maxH)
    const ago = prior.length - idx
    return {
      type: 'doubletop', label: 'Double Top', emoji: '🔴',
      direction: 'bearish', timeframe: tf, score: 1.0,
      detail: `שיא שני ב-$${last.high.toLocaleString()} — הראשון לפני ${ago} נרות`,
      at: last.time,
    }
  }

  const minL = Math.min(...prior.map(c => c.low))
  if (Math.abs(last.low - minL) < tol && last.close > last.open) {
    const idx = prior.map(c => c.low).lastIndexOf(minL)
    const ago = prior.length - idx
    return {
      type: 'doublebottom', label: 'Double Bottom', emoji: '🟢',
      direction: 'bullish', timeframe: tf, score: 1.0,
      detail: `שפל שני ב-$${last.low.toLocaleString()} — הראשון לפני ${ago} נרות`,
      at: last.time,
    }
  }

  return null
}

function detectJudas(buf: KlineCandle[], tf: string): DetectedSignal | null {
  if (buf.length < 5) return null
  const last = buf[buf.length - 1]
  const h = new Date(last.time * 1000).getUTCHours()
  const m = new Date(last.time * 1000).getUTCMinutes()

  const isOpen = (h === 7 && m < 30) || (h === 13 && m < 30)
  if (!isOpen) return null

  const prev4 = buf.slice(-5, -1)
  const peakH = Math.max(...prev4.map(c => c.high))
  const peakL = Math.min(...prev4.map(c => c.low))

  if (peakH > last.high * 1.002 && last.close < last.open) {
    return { type: 'judas', label: `Judas Swing ${h === 7 ? 'לונדון' : 'NY'}`, emoji: '🃏', direction: 'bearish', timeframe: tf, score: 0.8 }
  }
  if (peakL < last.low * 0.998 && last.close > last.open) {
    return { type: 'judas', label: `Judas Swing ${h === 7 ? 'לונדון' : 'NY'}`, emoji: '🃏', direction: 'bullish', timeframe: tf, score: 0.8 }
  }
  return null
}

function detectSessionHL(buf: KlineCandle[], tf: string): DetectedSignal | null {
  // Only fire on 1h or 4h when session starts
  if (!['1h', '4h'].includes(tf)) return null
  const last = buf[buf.length - 1]
  const h = new Date(last.time * 1000).getUTCHours()

  if (h !== 7 && h !== 13) return null

  const sessionName = h === 7 ? 'London' : 'New York'
  const dir = last.close > last.open ? 'bullish' : 'bearish'
  return {
    type: 'session', label: `פתיחת ${sessionName} — H/L חדש`, emoji: '🕐', direction: dir, timeframe: tf, score: 0.5,
  }
}

// ─── Multi-TF signal aggregation ──────────────────────────────────────────────

// Tracks signals seen in the last 4h per symbol to detect MTF confluence
const recentSignals = new Map<string, { signal: DetectedSignal; ts: number }[]>()

function addRecentSignal(symbol: string, sig: DetectedSignal): void {
  const key = symbol
  if (!recentSignals.has(key)) recentSignals.set(key, [])
  const arr = recentSignals.get(key)!
  arr.push({ signal: sig, ts: Date.now() })
  // Keep last 4h
  const cutoff = Date.now() - 4 * 3600_000
  recentSignals.set(key, arr.filter(x => x.ts > cutoff))
}

function getMTFSignals(symbol: string): DetectedSignal[] {
  const arr = recentSignals.get(symbol) ?? []
  const cutoff = Date.now() - 4 * 3600_000
  return arr.filter(x => x.ts > cutoff).map(x => x.signal)
}

// ─── Score calculator ─────────────────────────────────────────────────────────

const TF_BASE: Record<string, number> = {
  '1m': 0.5, '5m': 1.0, '15m': 1.5, '30m': 2.0,
  '1h': 2.5, '4h': 3.0, '1D': 4.0, '1W': 4.5,
}

function calcScore(signals: DetectedSignal[], baseScores: number[]): number {
  let score = Math.max(...baseScores, 0)
  signals.forEach(s => { score += s.score })
  // MTF bonus
  const tfs = new Set(signals.map(s => s.timeframe))
  if (tfs.size >= 3) score += 2.0
  else if (tfs.size === 2) score += 1.0
  return Math.min(score, 10)
}

// ─── Message builder ─────────────────────────────────────────────────────────

/** Order in which confirmations are listed — strongest evidence first. */
const SIGNAL_RANK: Record<string, number> = {
  smt: 1, ismt: 2, wyckoff: 3, choch: 4, bos: 5,
  liquidity: 6, fvg: 7, ob: 8, doubletop: 9, doublebottom: 10,
  judas: 11, session: 12,
}

const TF_ORDER = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W']

function buildMessage(
  symbol: string,
  triggerTF: string,
  direction: 'bullish' | 'bearish',
  allSignals: DetectedSignal[],
  score: number,
  lastClose: number,
  dbSignals: { smts: any[]; structures: any[]; fvgs: any[]; liquidity: any[] },
  extras: {
    entry?: number | null
    stopLoss?: number | null
    tp?: { price: number; r: number; label: string } | null
    wyckoff?: { label: string; detail: string } | null
  } = {},
): string {
  const dirHe = direction === 'bullish' ? 'לונג 🟢' : 'שורט 🔴'
  const scoreEmoji = score >= 7 ? '🔥' : score >= 5 ? '⭐' : '📊'
  const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

  let msg = `🔔 *${symbol}* — ${dirHe}  ·  ${scoreEmoji} ${score.toFixed(1)}/10  ·  ⏱ ${triggerTF}\n`

  // Bottom line first: what to actually do, on one line.
  if (extras.entry && extras.stopLoss) {
    msg += `📍 כניסה ${money(extras.entry)}  ·  🛑 SL ${money(extras.stopLoss)}`
    msg += extras.tp ? `  ·  🎯 TP ${money(extras.tp.price)} (${extras.tp.r}R)\n` : `  ·  🎯 אין יעד ≥1R\n`
  } else {
    msg += `💰 ${money(lastClose)}\n`
  }

  if (extras.wyckoff) {
    msg += `📚 Wyckoff: *${extras.wyckoff.label}* — ${extras.wyckoff.detail}\n`
  }

  msg += `\n`

  /**
   * Group identical confirmations across timeframes into one line, and collapse
   * repeats of the same level. A break of one price re-reported on every new
   * candle produced nine identical BOS entries in a single message.
   */
  const groups = new Map<string, {
    emoji: string; label: string; type: string
    tfs: Set<string>; latest: number; detail?: string; score: number
  }>()

  for (const s of allSignals) {
    // Same signal at the same level is one event, however many candles report it
    const levelKey = s.detail?.match(/\$[\d,.]+/)?.[0] ?? ''
    const key = `${s.type}|${levelKey}`
    const g = groups.get(key)
    if (g) {
      g.tfs.add(s.timeframe)
      if ((s.at ?? 0) > g.latest) { g.latest = s.at ?? 0; g.detail = s.detail ?? g.detail }
      g.score = Math.max(g.score, s.score)
    } else {
      groups.set(key, {
        emoji: s.emoji, label: s.label.replace(/ — .*$/, ''), type: s.type,
        tfs: new Set([s.timeframe]), latest: s.at ?? 0, detail: s.detail, score: s.score,
      })
    }
  }

  const ordered = [...groups.values()].sort((a, b) =>
    (SIGNAL_RANK[a.type] ?? 99) - (SIGNAL_RANK[b.type] ?? 99) || b.score - a.score)

  const SHOWN = 6
  msg += `🧩 *אישורים*\n`
  for (const g of ordered.slice(0, SHOWN)) {
    const tfs = TF_ORDER.filter(t => g.tfs.has(t)).join(' ')
    const when = g.latest ? ` · ${fmtTime(g.latest, [...g.tfs][0])}` : ''
    msg += `${g.emoji} *${g.label}* · ${tfs}${when}\n`
    if (g.detail) msg += `   ${g.detail}\n`
  }
  if (ordered.length > SHOWN) {
    msg += `_+${ordered.length - SHOWN} אישורים נוספים — ראה באתר_\n`
  }

  // Synergy: which timeframes agree on the direction, and which oppose it
  const byTF = new Map<string, { bull: number; bear: number }>()
  for (const s of allSignals) {
    const e = byTF.get(s.timeframe) ?? { bull: 0, bear: 0 }
    if (s.direction === 'bullish') e.bull++; else e.bear++
    byTF.set(s.timeframe, e)
  }
  const agree: string[] = []
  const oppose: string[] = []
  for (const tf of TF_ORDER) {
    const e = byTF.get(tf)
    if (!e) continue
    const tfDir = e.bull >= e.bear ? 'bullish' : 'bearish'
    ;(tfDir === direction ? agree : oppose).push(tf)
  }

  msg += `\n📡 *סינרגיה:* ${dirHe}\n`
  if (agree.length)  msg += `   ✅ מסכימים: ${agree.join(' ')}\n`
  if (oppose.length) msg += `   ⚠️ מנוגדים: ${oppose.join(' ')}\n`
  if (!oppose.length && agree.length > 1) msg += `   כל הטווחים מיושרים\n`

  msg += `\n_מערכת מסחר חכמה | ICT + Wyckoff_`
  return msg
}

// ─── Dedup: avoid sending the same signal twice within 1h ────────────────────

const sentCache = new Map<string, number>()

function isDuplicate(key: string): boolean {
  const last = sentCache.get(key)
  if (last && Date.now() - last < 3_600_000) return true
  sentCache.set(key, Date.now())
  return false
}

// ─── Main detector ────────────────────────────────────────────────────────────

export async function runRealtimeDetector(candle: KlineCandle): Promise<void> {
  const settings = getSettings()
  // NOTE: settings.active is deliberately NOT checked here. The website switch
  // silences Telegram only — detection and persistence keep running so the site
  // always holds the full record. The gate lives in sendTelegram().
  if (!settings.timeframes.includes(candle.timeframe)) return

  detectorStats.candlesProcessed++
  detectorStats.lastCandleAt = Date.now()

  pushCandle(candle)
  const buf = getBuffer(candle.symbol, candle.timeframe)
  if (buf.length < 5) return


  const enabledSignals = settings.signals
  const detectedLocal: DetectedSignal[] = []

  // Register resting liquidity before the other detectors run, so sweeps and
  // TP targets in this same pass can see the levels.
  try {
    detectorStats.liquidityLevels += scanAndStoreLiquidity(
      candle.symbol, candle.timeframe, buf,
      getBuffer(candle.symbol, '1D'),
      getBuffer(candle.symbol, '1W'),
    )

    if (enabledSignals.includes('liquidity')) {
      const swept = checkLiquiditySweep(
        candle.symbol, candle.timeframe as any,
        candle.high, candle.low, candle.close, candle.time,
      )
      for (const liq of swept) {
        detectedLocal.push({
          type: 'liquidity',
          label: 'שאיבת נזילות',
          emoji: '💧',
          // Buy-side taken above price → bearish; sell-side taken below → bullish
          direction: liq.price > candle.close ? 'bearish' : 'bullish',
          timeframe: candle.timeframe,
          score: 1.3,
          detail: `נשאבה ${LIQ_LABEL[liq.type] ?? liq.type} ב-$${liq.price.toLocaleString()}`,
          at: candle.time,
        })
      }
    }
  } catch (err: any) {
    console.error('[Detector] liquidity scan failed:', err.message)
  }

  // Run local detectors
  // FVG / structure / Wyckoff previously existed only in the Pine Script, so
  // crypto could never produce them. Derived from the buffer, they now apply
  // to every streamed symbol.
  for (const [signal, detect] of [
    ['fvg',     detectFVG],
    ['bos',     detectStructure],   // returns bos or choch; gate covers both
    ['wyckoff', detectWyckoff],
  ] as const) {
    if (signal === 'bos'
      ? !enabledSignals.includes('bos') && !enabledSignals.includes('choch')
      : !enabledSignals.includes(signal)) continue

    const r = detect(buf)
    if (r && (r.type !== 'choch' || enabledSignals.includes('choch'))) {
      detectedLocal.push({
        type: r.type, label: r.label, emoji: r.emoji,
        direction: r.direction, timeframe: candle.timeframe,
        score: r.score, detail: r.detail, at: candle.time,
      })
    }
  }

  if (enabledSignals.includes('ob')) {
    const ob = detectOB(buf, candle.timeframe)
    if (ob) detectedLocal.push(ob)
  }
  // iSMT needs the correlated asset — a symbol with no pair produces none.
  if (enabledSignals.includes('ismt')) {
    for (const [a1, a2] of LIVE_SMT_PAIRS) {
      if (candle.symbol !== a1 && candle.symbol !== a2) continue
      const otherSym = candle.symbol === a1 ? a2 : a1
      const ismt = detectISMT(
        buf, getBuffer(otherSym, candle.timeframe),
        candle.timeframe, candle.symbol, otherSym,
      )
      if (ismt) detectedLocal.push(ismt)
    }
  }
  if (enabledSignals.includes('doubletop') || enabledSignals.includes('doublebottom')) {
    const dp = detectDoublePattern(buf, candle.timeframe)
    if (dp) detectedLocal.push(dp)
  }
  if (enabledSignals.includes('judas')) {
    const js = detectJudas(buf, candle.timeframe)
    if (js) detectedLocal.push(js)
  }
  if (enabledSignals.includes('session')) {
    const sh = detectSessionHL(buf, candle.timeframe)
    if (sh) detectedLocal.push(sh)
  }

  // Live SMT detection between correlated pairs (ETH ↔ BTC)
  if (enabledSignals.includes('smt')) {
    for (const [a1, a2] of LIVE_SMT_PAIRS) {
      if (candle.symbol !== a1 && candle.symbol !== a2) continue
      const otherSym = candle.symbol === a1 ? a2 : a1
      const otherBuf = getBuffer(otherSym, candle.timeframe)
      if (otherBuf.length < 2) continue
      const other = otherBuf[otherBuf.length - 1]
      const smtResult = detectSMT({
        timeframe: candle.timeframe as any,
        time: candle.time,
        asset1: candle.symbol,
        asset1Price: candle.close,
        asset1High: candle.high,
        asset1Low: candle.low,
        asset2: otherSym,
        asset2Price: other.close,
        asset2High: other.high,
        asset2Low: other.low,
      })
      if (smtResult) {
        const bullish = smtResult.type === 'bullish_smt'
        const detail = bullish
          ? `${candle.symbol} שבר שפל חדש ($${candle.low.toLocaleString()}) — ${otherSym} לא אישר ($${other.low.toLocaleString()})`
          : `${candle.symbol} שבר שיא חדש ($${candle.high.toLocaleString()}) — ${otherSym} לא אישר ($${other.high.toLocaleString()})`

        detectedLocal.push({
          type: 'smt',
          label: `SMT — ${candle.symbol} מול ${otherSym}`,
          emoji: '⚡',
          direction: bullish ? 'bullish' : 'bearish',
          timeframe: candle.timeframe,
          score: 1.5,
          detail,
          at: candle.time,
        })
      }
    }
  }

  if (detectedLocal.length === 0) return

  // Store for MTF confluence
  detectedLocal.forEach(s => addRecentSignal(candle.symbol, s))

  // Get direction (majority vote)
  const bullCount = detectedLocal.filter(s => s.direction === 'bullish').length
  const direction: 'bullish' | 'bearish' = bullCount >= detectedLocal.length / 2 ? 'bullish' : 'bearish'

  // Get DB signals (from Pine Script webhook)
  const symbol = candle.symbol
  const tf     = candle.timeframe
  const dbSignals = {
    smts:       getRecentSMTSignals(tf as any, symbol).slice(0, 2),
    structures: getRecentStructures(symbol, tf as any).filter(s => s.direction === direction).slice(0, 2),
    fvgs:       getActiveFVGs(symbol, tf as any).filter(f => f.direction === direction),
    liquidity:  getActiveLiquidity(symbol, tf as any).slice(0, 2),
  }

  // MTF signals in same direction
  const HOUR = 3600
  const nowSec = candle.time
  const mtfSignals = getMTFSignals(symbol)
    .filter(s => s.direction === direction && s.timeframe !== tf)
    // Only context from the last hour — older confirmations have usually been
    // invalidated by price and only inflate the message.
    .filter(s => !s.at || nowSec - s.at <= HOUR)

  const allSignals = [...detectedLocal, ...mtfSignals]

  // Score
  const baseTFScores = allSignals.map(s => TF_BASE[s.timeframe] ?? 1.0)
  const dbBonus = (dbSignals.smts.length > 0 ? 1.5 : 0) +
                  (dbSignals.fvgs.length > 0 ? 0.5 : 0) +
                  (dbSignals.structures.length > 0 ? 0.5 : 0)
  const score = Math.min(calcScore(allSignals, baseTFScores) + dbBonus, 10)

  // Dedup
  const dedupKey = `${symbol}:${tf}:${direction}:${detectedLocal.map(s => s.type).sort().join(',')}`
  if (isDuplicate(dedupKey)) return

  // Persist before notifying. Until now this path called sendTelegram directly
  // and skipped saveAlert, so crypto alerts existed only in Telegram — absent
  // from the website, the statistics and the TP/SL outcome tracker.
  const factors = toAlertFactors(detectedLocal.map(s => s.type))
  const sl = buildStopLoss(buf, direction, candle.close)
  const wyckoffPhase = classifyWyckoffPhase(buf)

  // Targets must beat the stop distance — the nearest level is usually
  // internal liquidity a few ticks away, which would make every trade sub-1R.
  const targets = selectTargets(
    getActiveLiquidity(symbol, tf as any),
    candle.close, sl?.price ?? null, direction,
  )
  const [t1, t2, t3] = targets

  const msg = buildMessage(symbol, tf, direction, allSignals, score, candle.close, dbSignals, {
    entry: candle.close,
    stopLoss: sl?.price ?? null,
    tp: t1 ? { price: t1.price, r: t1.r, label: LIQ_LABEL[t1.type] ?? t1.type } : null,
    wyckoff: wyckoffPhase,
  })

  try {
    await saveAlert({
      symbol,
      timeframe: tf as any,
      triggeredAt: candle.time * 1000,
      factors,
      score: parseFloat(score.toFixed(1)),
      direction,
      recommendation: direction === 'bullish' ? 'long' : 'short',
      premiumDiscount: 'midpoint',
      session: sessionForHour(new Date(candle.time * 1000).getUTCHours()),
      inKillZone: isKillZone(new Date(candle.time * 1000).getUTCHours()),
      messageHe: msg,
      entryPrice: candle.close,
      stopLoss: sl?.price ?? null,
      tp1: t1?.price ?? null,
      tp2: t2?.price ?? null,
      tp3: t3?.price ?? null,
      fvgId: null,
      structureId: null,
      slReason: sl?.reason ?? null,
      tp1Label: t1 ? LIQ_LABEL[t1.type] ?? t1.type : null,
      tp2Label: t2 ? LIQ_LABEL[t2.type] ?? t2.type : null,
      tp3Label: t3 ? LIQ_LABEL[t3.type] ?? t3.type : null,
      r1: t1 ? `${t1.r}R` : null,
      r2: t2 ? `${t2.r}R` : null,
      r3: t3 ? `${t3.r}R` : null,
      factorDetails: Object.fromEntries(
        detectedLocal
          .filter(s => s.detail && toAlertFactor(s.type))
          .map(s => [toAlertFactor(s.type)!, { desc: s.detail, timeframe: s.timeframe, at: s.at }])
      ),
    })
    detectorStats.saved++
  } catch (err: any) {
    console.error('[Detector] saveAlert failed:', err.message)
  }

  // saveAlert already routes to Telegram by timeframe and score, so sending
  // again here would duplicate every crypto alert.

  detectorStats.sent++
  detectorStats.lastSent = {
    symbol, timeframe: tf, direction,
    score: parseFloat(score.toFixed(1)),
    signals: detectedLocal.map(s => s.type),
    at: Date.now(),
  }

  console.log(`[Detector] Sent alert: ${symbol} ${tf} ${direction} score=${score.toFixed(1)}`)
}
