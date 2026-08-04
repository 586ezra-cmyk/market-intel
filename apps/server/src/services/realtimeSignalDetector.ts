import type { KlineCandle } from './binanceWebSocket'
import { getDb } from '../db/client'
import { sendTelegram } from './alertDispatcher'
import { getActiveFVGs } from './fvgEngine'
import { getRecentSMTSignals } from './smtEngine'
import { getLatestStructure, getRecentStructures } from './structureEngine'
import { getActiveLiquidity } from './liquidityEngine'

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

// ─── Telegram topic map ───────────────────────────────────────────────────────

function topicForTF(tf: string): string {
  const map: Record<string, string> = {
    '5m': 'TELEGRAM_TOPIC_5M', '15m': 'TELEGRAM_TOPIC_15M',
    '30m': 'TELEGRAM_TOPIC_30M', '1h': 'TELEGRAM_TOPIC_1H',
    '4h': 'TELEGRAM_TOPIC_4H', '1D': 'TELEGRAM_TOPIC_1D',
    '1W': 'TELEGRAM_TOPIC_1W',
  }
  const envKey = map[tf] ?? 'TELEGRAM_TOPIC_DAILY'
  return process.env[envKey] ?? '2'
}

// ─── Local pattern detectors (run on candle buffer) ──────────────────────────

interface DetectedSignal {
  type: string
  label: string
  emoji: string
  direction: 'bullish' | 'bearish'
  timeframe: string
  score: number
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

function detectISMT(buf: KlineCandle[], tf: string): DetectedSignal | null {
  if (buf.length < 3) return null
  const [prev, curr, next] = buf.slice(-3)

  // Bearish iSMT
  if (curr.high > prev.high && next.high < curr.high && next.close < curr.open) {
    return { type: 'ismt', label: 'iSMT (דיברגנס 2 נרות)', emoji: '🔀', direction: 'bearish', timeframe: tf, score: 1.0 }
  }
  // Bullish iSMT
  if (curr.low < prev.low && next.low > curr.low && next.close > curr.open) {
    return { type: 'ismt', label: 'iSMT (דיברגנס 2 נרות)', emoji: '🔀', direction: 'bullish', timeframe: tf, score: 1.0 }
  }
  return null
}

function detectDoublePattern(buf: KlineCandle[], tf: string): DetectedSignal | null {
  if (buf.length < 20) return null
  const recent = buf.slice(-20)
  const highs  = recent.map(c => c.high)
  const lows   = recent.map(c => c.low)
  const last   = recent[recent.length - 1]
  const tol    = last.close * 0.003  // 0.3% tolerance

  // Double top: two highs within tolerance, last candle bearish
  const maxH = Math.max(...highs.slice(0, -1))
  if (Math.abs(last.high - maxH) < tol && last.close < last.open) {
    return { type: 'doubletop', label: 'Double Top', emoji: '🔴', direction: 'bearish', timeframe: tf, score: 1.0 }
  }
  // Double bottom: two lows within tolerance, last candle bullish
  const minL = Math.min(...lows.slice(0, -1))
  if (Math.abs(last.low - minL) < tol && last.close > last.open) {
    return { type: 'doublebottom', label: 'Double Bottom', emoji: '🟢', direction: 'bullish', timeframe: tf, score: 1.0 }
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

function buildMessage(
  symbol: string,
  triggerTF: string,
  direction: 'bullish' | 'bearish',
  allSignals: DetectedSignal[],
  score: number,
  lastClose: number,
  dbSignals: { smts: any[]; structures: any[]; fvgs: any[]; liquidity: any[] },
): string {
  const dirHe = direction === 'bullish' ? 'לונג 🟢' : 'שורט 🔴'
  const scoreEmoji = score >= 7 ? '🔥' : score >= 5 ? '⭐' : '📊'

  let msg = `🔔 *${symbol} — התראת Confluence*\n`
  msg += `📊 כיוון: ${dirHe} | ${scoreEmoji} דירוג: ${score.toFixed(1)}/10\n\n`
  msg += `━━━━━━━━━━━━━━━━━━━\n`
  msg += `🧩 *גורמים פעילים:*\n\n`

  // DB signals (from webhook/Pine Script)
  if (dbSignals.structures.length > 0) {
    for (const s of dbSignals.structures.slice(0, 2)) {
      msg += `   ✅ ${s.type} — ${s.direction === 'bullish' ? 'שבירת מבנה' : 'שינוי כיוון'} — ${triggerTF}\n`
    }
  }
  if (dbSignals.fvgs.length > 0) {
    msg += `   ✅ FVG פעיל — ${triggerTF}\n`
  }
  if (dbSignals.liquidity.length > 0) {
    msg += `   ✅ שאיבת נזילות — ${triggerTF}\n`
  }
  if (dbSignals.smts.length > 0) {
    msg += `   ✅ SMT (דיברגנס) — ${triggerTF} 🔥\n`
  }

  // Computed signals (detected from candles)
  const byTF = new Map<string, DetectedSignal[]>()
  allSignals.forEach(s => {
    if (!byTF.has(s.timeframe)) byTF.set(s.timeframe, [])
    byTF.get(s.timeframe)!.push(s)
  })

  byTF.forEach((sigs, tf) => {
    sigs.forEach(s => {
      const isTrigger = tf === triggerTF
      msg += `   ✅ ${s.emoji} ${s.label} — ${tf}${isTrigger ? '' : ' (MTF)'}\n`
    })
  })

  // MTF summary
  const tfs = [...new Set(allSignals.map(s => s.timeframe))].sort()
  if (tfs.length > 1) {
    msg += `\n━━━━━━━━━━━━━━━━━━━\n`
    msg += `📡 *סינרגיה בין טווחי זמן:*\n`
    const allTFs = ['1m','5m','15m','30m','1h','4h','1D','1W']
    const activeTFs = allTFs.filter(tf => tfs.includes(tf) || tf === triggerTF)
    msg += `   ${activeTFs.map(tf => tfs.includes(tf) ? `${tf} ✅` : `${tf} ⬜`).join(' | ')}\n`
  }

  msg += `\n💡 *מחיר נוכחי:* $${lastClose.toLocaleString()}\n`
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
  if (!settings.active) return
  if (!settings.timeframes.includes(candle.timeframe)) return

  pushCandle(candle)
  const buf = getBuffer(candle.symbol, candle.timeframe)
  if (buf.length < 5) return

  const enabledSignals = settings.signals
  const detectedLocal: DetectedSignal[] = []

  // Run local detectors
  if (enabledSignals.includes('ob')) {
    const ob = detectOB(buf, candle.timeframe)
    if (ob) detectedLocal.push(ob)
  }
  if (enabledSignals.includes('ismt')) {
    const ismt = detectISMT(buf, candle.timeframe)
    if (ismt) detectedLocal.push(ismt)
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
    smts:       getRecentSMTSignals(tf as any).slice(0, 2),
    structures: getRecentStructures(symbol, tf as any).filter(s => s.direction === direction).slice(0, 2),
    fvgs:       getActiveFVGs(symbol, tf as any).filter(f => f.direction === direction),
    liquidity:  getActiveLiquidity(symbol, tf as any).slice(0, 2),
  }

  // MTF signals in same direction
  const mtfSignals = getMTFSignals(symbol)
    .filter(s => s.direction === direction && s.timeframe !== tf)

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

  // Build and send message
  const msg = buildMessage(symbol, tf, direction, allSignals, score, candle.close, dbSignals)
  const topic = topicForTF(tf)

  await sendTelegram(msg, 0, undefined, String(topic))

  // Also send to high-score topic if score >= 7
  const highTopic = process.env['TELEGRAM_TOPIC_HIGH'] ?? '4'
  if (score >= 7) {
    await sendTelegram(msg, 0, undefined, highTopic)
  }

  console.log(`[Detector] Sent alert: ${symbol} ${tf} ${direction} score=${score.toFixed(1)}`)
}
