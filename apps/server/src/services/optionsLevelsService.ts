import { getDb } from '../db/client'
import { sendTelegram, TOPIC_BRIEFING, TOPIC_HIGH } from './alertDispatcher'

/**
 * רמות שוק האופציות לנאסדק (שלב 2.7): איפה הדילרים מגדרים.
 * מקור חינמי: CBOE delayed quotes (15 דק' עיכוב) — שרשרת מלאה של QQQ ו-NDX/NDXP עם gamma, open interest, volume לכל סטרייק.
 * GEX לכל אופציה = gamma × OI × 100 × spot² × 1%  (קולים +, פוטים −; ההנחה המקובלת: דילרים לונג קולים, שורט פוטים).
 * שתי שכבות: מבנית (פקיעות עד 45 יום) ויומית (פוקע היום / הפקיעה הקרובה). QQQ (רוב הגמא של הנאסדק) מומר לסקאלה של NDX לפי היחס,
 * ו-NDX מומר ל-NQ לפי הבסיס (NQ − NDX) מהמחיר האחרון של NQ=F.
 */
const CBOE = 'https://cdn-api.cboe.com/api/global/delayed_quotes/options'
const YAHOO_NQ = 'https://query1.finance.yahoo.com/v8/finance/chart/NQ=F?interval=1m&range=1d'
const STRUCT_DTE = 45
const NEAR = 0.08   // ±8% מהספוט לקירות
const MAGNET_NEAR = 0.05
const ALERT_PCT = 0.25  // "מתקרב לרמה": מרחק באחוזים

interface Opt { exp: string; dte: number; cp: 'C' | 'P'; k: number; gamma: number; oi: number; vol: number }
interface Chain { underlying: string; spot: number; ts: string; opts: Opt[] }
export interface Levels {
  callWall: number | null; putWall: number | null; zeroGamma: number | null; magnet: number | null; zdte: number | null
  zdteExpiry: string | null; netGex: number; regime: 'positive' | 'negative' | 'unknown'
}
export interface OptionsSnapshot {
  ts: number; day: string; cboeTs: string
  ndxSpot: number; qqqSpot: number; ratio: number; nqLast: number | null; basis: number | null
  ndx: Levels; nq: Record<keyof Levels, number | string | null>; qqq: Levels
  profile: Array<{ k: number; gex: number; oi: number }>   // פרופיל משולב בסקאלת NDX (±8%)
}

function parseSymbol(sym: string): { root: string; exp: string; cp: 'C' | 'P'; k: number } | null {
  const m = /^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(sym)
  if (!m) return null
  return { root: m[1], exp: `20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}`, cp: m[3] as 'C' | 'P', k: parseInt(m[4], 10) / 1000 }
}
function dteOf(exp: string, nowET: Date): number {
  const d = new Date(exp + 'T00:00:00Z'); const t = Date.UTC(nowET.getUTCFullYear(), nowET.getUTCMonth(), nowET.getUTCDate())
  return Math.round((d.getTime() - t) / 86_400_000)
}
function nowInET(): Date { return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })) }

async function fetchChain(file: string, underlying: string): Promise<Chain> {
  const res = await fetch(`${CBOE}/${file}.json`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } })
  if (!res.ok) throw new Error(`CBOE ${file} ${res.status}`)
  const j = (await res.json()) as { timestamp: string; data: { current_price: number; options: Array<Record<string, unknown>> } }
  const et = nowInET()
  const opts: Opt[] = []
  for (const o of j.data.options) {
    const p = parseSymbol(String(o['option'] ?? ''))
    if (!p) continue
    const dte = dteOf(p.exp, et)
    if (dte < 0 || dte > STRUCT_DTE) continue
    opts.push({ exp: p.exp, dte, cp: p.cp, k: p.k, gamma: Number(o['gamma'] ?? 0) || 0, oi: Number(o['open_interest'] ?? 0) || 0, vol: Number(o['volume'] ?? 0) || 0 })
  }
  return { underlying, spot: Number(j.data.current_price), ts: j.timestamp, opts }
}

/** פרופיל GEX לפי סטרייק (בדולרים ל-1%): קולים חיובי, פוטים שלילי; מסנן לפי טווח DTE */
function profileOf(chain: Chain, dteMin: number, dteMax: number, scale = 1, roundTo = 0): Map<number, { c: number; p: number; oi: number; vol: number }> {
  const m = new Map<number, { c: number; p: number; oi: number; vol: number }>()
  for (const o of chain.opts) {
    if (o.dte < dteMin || o.dte > dteMax) continue
    const gex = o.gamma * o.oi * 100 * chain.spot * chain.spot * 0.01
    let k = o.k * scale
    if (roundTo > 0) k = Math.round(k / roundTo) * roundTo
    const e = m.get(k) ?? { c: 0, p: 0, oi: 0, vol: 0 }
    if (o.cp === 'C') e.c += gex; else e.p -= gex
    e.oi += o.oi; e.vol += o.vol
    m.set(k, e)
  }
  return m
}
function mergeInto(dst: Map<number, { c: number; p: number; oi: number; vol: number }>, src: Map<number, { c: number; p: number; oi: number; vol: number }>): void {
  for (const [k, v] of src) { const e = dst.get(k) ?? { c: 0, p: 0, oi: 0, vol: 0 }; e.c += v.c; e.p += v.p; e.oi += v.oi; e.vol += v.vol; dst.set(k, e) }
}
function levelsFrom(struct: Map<number, { c: number; p: number; oi: number; vol: number }>, today: Map<number, { c: number; p: number; oi: number; vol: number }>, spot: number, zdteExpiry: string | null): Levels {
  const near = [...struct.keys()].filter(k => Math.abs(k - spot) <= spot * NEAR).sort((a, b) => a - b)
  const pick = (keys: number[], f: (k: number) => number, max: boolean): number | null => {
    if (!keys.length) return null
    let best = keys[0], bv = f(keys[0])
    for (const k of keys) { const v = f(k); if (max ? v > bv : v < bv) { best = k; bv = v } }
    return best
  }
  const callWall = pick(near.filter(k => k >= spot * 1.003), k => struct.get(k)!.c, true)
  const putWall = pick(near.filter(k => k <= spot * 0.997), k => struct.get(k)!.p, false)
  const magnet = pick(near.filter(k => Math.abs(k - spot) <= spot * MAGNET_NEAR), k => struct.get(k)!.oi, true)
  // אפס-גמא: סכום מצטבר של GEX מהסטרייק הנמוך לגבוה, החצייה הקרובה ביותר לספוט
  const all = [...struct.keys()].sort((a, b) => a - b)
  let cum = 0, prev = 0, zero: number | null = null, bestDist = Infinity
  for (const k of all) {
    cum += struct.get(k)!.c + struct.get(k)!.p
    if (prev !== 0 && (prev < 0) !== (cum < 0) && Math.abs(k - spot) < bestDist) { zero = k; bestDist = Math.abs(k - spot) }
    prev = cum
  }
  const netGex = cum
  const tKeys = [...today.keys()].filter(k => Math.abs(k - spot) <= spot * NEAR)
  const zdte = pick(tKeys, k => Math.abs(today.get(k)!.c + today.get(k)!.p), true)
  return { callWall, putWall, zeroGamma: zero, magnet, zdte, zdteExpiry, netGex, regime: netGex > 0 ? 'positive' : netGex < 0 ? 'negative' : 'unknown' }
}

async function fetchNqLast(): Promise<number | null> {
  try {
    const res = await fetch(YAHOO_NQ, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) return null
    const j = (await res.json()) as { chart: { result: Array<{ meta: { regularMarketPrice?: number }; indicators: { quote: Array<{ close: Array<number | null> }> } }> } }
    const r = j.chart.result[0]
    const closes = r.indicators.quote[0].close.filter((x): x is number => x != null)
    return r.meta.regularMarketPrice ?? closes[closes.length - 1] ?? null
  } catch { return null }
}

export async function computeSnapshot(): Promise<OptionsSnapshot> {
  const [qqq, ndx, nqLast] = await Promise.all([fetchChain('QQQ', 'QQQ'), fetchChain('_NDX', 'NDX'), fetchNqLast()])
  const ratio = ndx.spot / qqq.spot
  // שכבה יומית: הפקיעה הקרובה ביותר שעוד חיה (אחרי 16:00 ET אופציות של היום כבר פקעו → מחר). שכבה מבנית: DTE 1 עד 45 —
  // בלי ה-0DTE, כי הגמא של סטרייק ה-ATM ביום הפקיעה מתפוצצת ומוחקת את הקירות האמיתיים.
  const afterClose = nowInET().getHours() >= 16
  const minLive = afterClose ? 1 : 0
  const nearestDte = (c: Chain) => { const ds = c.opts.map(o => o.dte).filter(d => d >= minLive); return ds.length ? Math.min(...ds) : minLive }
  const qDte = nearestDte(qqq), nDte = nearestDte(ndx)
  const qExp = qqq.opts.find(o => o.dte === qDte)?.exp ?? null
  const sMin = Math.max(1, qDte + 1)
  // פרופיל משולב בסקאלת NDX: QQQ × יחס, מעוגל ל-25 נקודות
  const struct = profileOf(qqq, sMin, STRUCT_DTE, ratio, 25); mergeInto(struct, profileOf(ndx, sMin, STRUCT_DTE, 1, 25))
  const today = profileOf(qqq, qDte, qDte, ratio, 25); mergeInto(today, profileOf(ndx, nDte, nDte, 1, 25))
  const ndxLv = levelsFrom(struct, today, ndx.spot, qExp)
  const qqqLv = levelsFrom(profileOf(qqq, sMin, STRUCT_DTE), profileOf(qqq, qDte, qDte), qqq.spot, qExp)
  const basis = nqLast != null ? nqLast - ndx.spot : null
  const toNq = (v: number | null) => (v == null || basis == null ? null : Math.round(v + basis))
  const nq: Record<keyof Levels, number | string | null> = {
    callWall: toNq(ndxLv.callWall), putWall: toNq(ndxLv.putWall), zeroGamma: toNq(ndxLv.zeroGamma), magnet: toNq(ndxLv.magnet), zdte: toNq(ndxLv.zdte),
    zdteExpiry: ndxLv.zdteExpiry, netGex: ndxLv.netGex, regime: ndxLv.regime,
  }
  const profile = [...struct.entries()].filter(([k]) => Math.abs(k - ndx.spot) <= ndx.spot * NEAR).sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ k, gex: Math.round(v.c + v.p), oi: Math.round(v.oi) }))
  const et = nowInET(); const day = `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`
  const snap: OptionsSnapshot = { ts: Date.now(), day, cboeTs: ndx.ts, ndxSpot: ndx.spot, qqqSpot: qqq.spot, ratio, nqLast, basis, ndx: ndxLv, nq, qqq: qqqLv, profile }
  getDb().prepare('INSERT INTO options_levels (ts, day, json) VALUES (?, ?, ?)').run(snap.ts, day, JSON.stringify(snap))
  return snap
}

export function latestSnapshot(): OptionsSnapshot | null {
  const r = getDb().prepare('SELECT json FROM options_levels ORDER BY ts DESC LIMIT 1').get() as { json: string } | undefined
  return r ? (JSON.parse(r.json) as OptionsSnapshot) : null
}
export function snapshotHistory(days: number): OptionsSnapshot[] {
  const since = Date.now() - days * 86_400_000
  return (getDb().prepare('SELECT json FROM options_levels WHERE ts >= ? ORDER BY ts ASC').all(since) as Array<{ json: string }>).map(r => JSON.parse(r.json) as OptionsSnapshot)
}

const fmt = (v: number | string | null) => (v == null ? '—' : typeof v === 'number' ? v.toLocaleString('en-US') : String(v))
export function briefingText(s: OptionsSnapshot): string {
  const reg = s.ndx.regime === 'positive' ? 'גמא חיובית — שוק רגוע, חוזר לממוצע; הסטאפים של טווח (OB, W/M, ריטסט)' : s.ndx.regime === 'negative' ? 'גמא שלילית — תנועות מתעצמות; הסטאפים של מגמה (טיסה, פריצה), זהירות בלונג נגדי' : 'לא ידוע'
  const pos = s.nq.zeroGamma != null && s.nqLast != null ? (s.nqLast > Number(s.nq.zeroGamma) ? 'מעל אפס-גמא' : 'מתחת לאפס-גמא') : ''
  return [
    `🎯 *רמות שוק האופציות — נאסדק (NQ)* · ${new Date(s.ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}`,
    `NQ ${fmt(s.nqLast)} · NDX ${fmt(Math.round(s.ndxSpot))} · בסיס ${s.basis == null ? '—' : (s.basis >= 0 ? '+' : '') + Math.round(s.basis)} ${pos ? '· ' + pos : ''}`,
    `משטר: ${reg}`,
    `🧱 קיר קולים: *${fmt(s.nq.callWall)}*`,
    `🛡 קיר פוטים: *${fmt(s.nq.putWall)}*`,
    `⚖️ אפס-גמא: *${fmt(s.nq.zeroGamma)}*`,
    `🧲 מגנט (OI הגדול): *${fmt(s.nq.magnet)}*`,
    `⏱ 0DTE (פוקע ${s.nq.zdteExpiry ?? '—'}): *${fmt(s.nq.zdte)}*`,
    `_מקור: CBOE (עיכוב 15 דק'), QQQ+NDX מומר ל-NQ. הרמות הן הערכה מהנחות על גידור הדילרים._`,
    `📋 להדבקה ב-HTT Master: ${['callWall', 'putWall', 'zeroGamma', 'magnet', 'zdte'].map(k => fmt(s.nq[k as keyof Levels])).join(',')}`,
  ].join('\n')
}

// ── "מתקרב לרמה": פעם ביום לכל רמה, כשהמחיר במרחק ≤ ALERT_PCT ומתקדם לכיוונה ──
const alerted = new Set<string>()
let lastNq: number | null = null
export async function checkApproaching(s: OptionsSnapshot): Promise<void> {
  const nq = s.nqLast
  if (nq == null) return
  const names: Array<[keyof Levels, string]> = [['callWall', 'קיר קולים'], ['putWall', 'קיר פוטים'], ['zeroGamma', 'אפס-גמא'], ['magnet', 'מגנט OI'], ['zdte', 'רמת 0DTE']]
  for (const [k, he] of names) {
    const lv = s.nq[k]
    if (typeof lv !== 'number') continue
    const pct = Math.abs(nq - lv) / nq * 100
    const toward = lastNq == null || Math.abs(lv - nq) < Math.abs(lv - lastNq)
    const key = `${s.day}:${k}`
    if (pct <= ALERT_PCT && toward && !alerted.has(key)) {
      alerted.add(key)
      await sendTelegram(`📍 NQ ${nq.toLocaleString('en-US')} מתקרב ל${he} ${lv.toLocaleString('en-US')} (${pct.toFixed(2)}%)\nמשטר: ${s.ndx.regime === 'positive' ? 'גמא חיובית (ציפייה לתגובה/סיבוב)' : 'גמא שלילית (ציפייה להאצה)'}`, 0, undefined, TOPIC_HIGH)
    }
  }
  lastNq = nq
}

let timer: NodeJS.Timeout | null = null
export function startOptionsLevels(): void {
  const run = async (brief: boolean) => {
    try {
      const s = await computeSnapshot()
      if (brief) await sendTelegram(briefingText(s), 0, undefined, TOPIC_BRIEFING, { ignoreMasterSwitch: true })
      await checkApproaching(s)
    } catch (e) { console.warn('[options] compute failed:', String(e).slice(0, 160)) }
  }
  // חישוב ראשון בעלייה (בלי תדריך), ואז כל 15 דק' — התדריך נשלח מהמתזמן ב-15:30 IL
  void run(false)
  timer = setInterval(() => { void run(false) }, 15 * 60_000)
}
export async function sendOptionsBriefing(): Promise<void> {
  const s = await computeSnapshot()
  await sendTelegram(briefingText(s), 0, undefined, TOPIC_BRIEFING, { ignoreMasterSwitch: true })
}
export function stopOptionsLevels(): void { if (timer) clearInterval(timer); timer = null }
