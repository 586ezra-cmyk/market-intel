/**
 * מערכת 3 — לוח ההחלטה החי.
 * HTT Snapshot (Pine) שולח בכל סגירת נר צילום מצב לכל מסגרת זמן: כל האישורים ללונג ולשורט, הפאזה, סוג הכניסה, הסטופ והרמות.
 * כאן שומרים את הצילום האחרון לכל (נכס, מסגרת) ובונים מהם את הלוח: סיכום לכל כיוון, "כמה חסר" לכל אישור, כרטיס עסקה, אופציות ו-Order Flow.
 * אין כאן חיזוי ואין ניקוד — רק מה שדולק עכשיו וכמה רחוק מה שעוד לא.
 */
import { getDb } from '../db/client'
import { HTT_FLAG_KEYS, HTT_FLAG_NAMES, HTT_FLAG_GROUP, HTT_GROUP_ORDER } from './httFlagKeys'

export const BOARD_TFS = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'] as const
const TF_MIN: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1D': 1440, '1W': 10080 }
const EXEC_TFS = new Set(['1m', '5m'])
export const ENTRY_NAMES: Record<string, string> = {
  F: 'כניסת טיסה', W: 'כניסת שבירת כנף', O: 'כניסת אורדר בלוק', M: 'כניסת W/M', K: 'כניסת ריטסט קריק/אייס', P: 'כניסת ריטסט POC', B: 'כניסת פריצה (BOS/CHoCH)',
}
const PHASE_HE = ['—', 'A', 'B', 'C', 'D', 'E']
/** חוזה המיקרו לכל נכס: שווי נקודה בדולרים. נכס בלי הגדרה = כמות יחידות (קריפטו). */
const INSTRUMENT: Record<string, { micro: string; pointUsd: number; maxContracts: number }> = {
  NQ: { micro: 'MNQ', pointUsd: 2, maxContracts: 5 },
  ES: { micro: 'MES', pointUsd: 5, maxContracts: 5 },
}

export interface SnapshotInput {
  symbol: string; tf: string; time: number; tc?: number | null
  price: number; op?: number | null; hi?: number | null; lo?: number | null; vol?: number | null
  L: string; S: string
  phase: number; cBull: number; ms: number; htfMs: number; htfPh: number; dq: number
  rsi?: number | null; atr?: number | null; vix?: number | null
  trL: string; trS: string; stL?: number | null; stS?: number | null
  lv: Record<string, number | null | undefined>
}
export interface StoredSnap extends Omit<SnapshotInput, 'lv'> { lv: Record<string, number>; receivedAt: number }

/** NQ1! / MNQ1! / NQZ2026 → NQ ; ES1! / MES1! → ES ; BTCUSDT נשאר */
export function normSymbol(raw: string): string {
  const s = raw.toUpperCase().replace(/^[A-Z_]+:/, '')
  if (/^M?NQ(\d|!|[FGHJKMNQUVXZ]\d|$)/.test(s)) return 'NQ'
  if (/^M?ES(\d|!|[FGHJKMNQUVXZ]\d|$)/.test(s)) return 'ES'
  return s.replace(/\d!$/, '')
}

// ─── אחסון: זיכרון + שורה אחת לכל (נכס, מסגרת) ב-DB כדי לשרוד הפעלה מחדש ───
const mem = new Map<string, Map<string, StoredSnap>>()
let loaded = false
function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  try {
    const rows = getDb().prepare('SELECT symbol, tf, received_at, json FROM live_snapshots').all() as Array<{ symbol: string; tf: string; received_at: number; json: string }>
    for (const r of rows ?? []) {
      try {
        const snap = JSON.parse(r.json) as StoredSnap
        if (!mem.has(r.symbol)) mem.set(r.symbol, new Map())
        mem.get(r.symbol)!.set(r.tf, snap)
      } catch { /* שורה פגומה — מדלגים */ }
    }
  } catch { /* אין טבלה (בדיקות) */ }
}

export function saveSnapshot(input: SnapshotInput, now = Date.now()): StoredSnap {
  ensureLoaded()
  const n = HTT_FLAG_KEYS.length
  if (input.L.length !== n || input.S.length !== n) throw new Error(`flags length ${input.L.length}/${input.S.length}, expected ${n}`)
  const symbol = normSymbol(input.symbol)
  const lv: Record<string, number> = {}
  for (const [k, v] of Object.entries(input.lv ?? {})) if (typeof v === 'number' && Number.isFinite(v)) lv[k] = v
  // הסוד של ה-Webhook מגיע בתוך ההודעה — לא שומרים אותו, לא בזיכרון ולא ב-DB
  const { secret: _secret, ...clean } = input as SnapshotInput & { secret?: unknown }
  const snap: StoredSnap = { ...clean, symbol, lv, receivedAt: now }
  if (!mem.has(symbol)) mem.set(symbol, new Map())
  mem.get(symbol)!.set(input.tf, snap)
  try {
    getDb().prepare(`INSERT INTO live_snapshots (symbol, tf, received_at, json) VALUES (?, ?, ?, ?)
      ON CONFLICT(symbol, tf) DO UPDATE SET received_at = excluded.received_at, json = excluded.json`).run(symbol, input.tf, now, JSON.stringify(snap))
  } catch { /* הזיכרון הוא המקור החי; כתיבה שנכשלה לא עוצרת את הלוח */ }
  saveBar(symbol, input.tf, input)
  return snap
}

// ─── נרות חיים: כל צילום מצב הוא גם נר סגור (פתיחה/גבוה/נמוך/סגירה) מ-TradingView בזמן אמת ───
export interface LiveBar { time: number; open: number; high: number; low: number; close: number; volume?: number }
const BARS_KEEP = 3000
const barMem = new Map<string, LiveBar[]>()          // symbol|tf → נרות ממוינים לפי זמן
function barsOf(symbol: string, tf: string): LiveBar[] {
  const key = `${symbol}|${tf}`
  let arr = barMem.get(key)
  if (arr) return arr
  arr = []
  try {
    const rows = getDb().prepare('SELECT time, o, h, l, c, v FROM live_bars WHERE symbol = ? AND tf = ? ORDER BY time DESC LIMIT ?').all(symbol, tf, BARS_KEEP) as Array<{ time: number; o: number; h: number; l: number; c: number; v: number | null }>
    arr = (rows ?? []).reverse().map(r => ({ time: r.time, open: r.o, high: r.h, low: r.l, close: r.c, ...(r.v != null ? { volume: r.v } : {}) }))
  } catch { /* אין טבלה (בדיקות) */ }
  barMem.set(key, arr)
  return arr
}
function saveBar(symbol: string, tf: string, s: SnapshotInput): void {
  const time = Math.floor(s.time / 1000)
  if (!Number.isFinite(time) || time <= 0) return
  const arr = barsOf(symbol, tf)
  const prev = arr.length && arr[arr.length - 1].time < time ? arr[arr.length - 1] : null
  // גרסה ישנה של הסקריפט לא שולחת פתיחה — אז הפתיחה היא הסגירה של הנר הקודם (בחוזה רציף זה אותו מחיר)
  const open = s.op ?? prev?.close ?? s.price
  // נפח: רק מגרסת הסקריפט ששולחת אותו (שדה vol). בלי נפח הנר נשמר בלעדיו, ולא כאפס
  const vol = typeof s.vol === 'number' && Number.isFinite(s.vol) && s.vol >= 0 ? s.vol : null
  const bar: LiveBar = { time, open, high: Math.max(s.hi ?? s.price, open, s.price), low: Math.min(s.lo ?? s.price, open, s.price), close: s.price, ...(vol != null ? { volume: vol } : {}) }
  const i = arr.findIndex(b => b.time === time)
  if (i >= 0) arr[i] = bar
  else { arr.push(bar); if (arr.length > 1 && arr[arr.length - 2].time > time) arr.sort((a, b) => a.time - b.time) }
  if (arr.length > BARS_KEEP) arr.splice(0, arr.length - BARS_KEEP)
  try {
    const db = getDb()
    db.prepare(`INSERT INTO live_bars (symbol, tf, time, o, h, l, c, v) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, tf, time) DO UPDATE SET o = excluded.o, h = excluded.h, l = excluded.l, c = excluded.c, v = excluded.v`).run(symbol, tf, time, bar.open, bar.high, bar.low, bar.close, vol)
    if (arr.length === BARS_KEEP) db.prepare('DELETE FROM live_bars WHERE symbol = ? AND tf = ? AND time < ?').run(symbol, tf, arr[0].time)
  } catch { /* הזיכרון מספיק לגרף */ }
}
/** הנרות החיים של (נכס, מסגרת), מהישן לחדש. */
export function getBars(symbolRaw: string, tf: string, limit = 500): LiveBar[] {
  ensureLoaded()
  return barsOf(normSymbol(symbolRaw), tf).slice(-Math.max(1, Math.min(limit, BARS_KEEP)))
}

/** רמות HTT לגרף: הצילום של המסגרת המבוקשת, ואם אין — של מסגרת הביצוע הטרייה ביותר. */
export function getLevels(symbolRaw: string, tf: string, now = Date.now()) {
  ensureLoaded()
  const symbol = normSymbol(symbolRaw)
  const snaps = mem.get(symbol)
  const pick = snaps?.get(tf) ?? [...(snaps?.values() ?? [])].sort((a, b) => b.receivedAt - a.receivedAt)[0] ?? null
  if (!pick) return { symbol, tf: null, exact: false, ageSec: null, stale: true, price: null, lv: {}, names: LEVEL_HE }
  const ageSec = Math.round((now - pick.receivedAt) / 1000)
  return { symbol, tf: pick.tf, exact: pick.tf === tf, ageSec, stale: ageSec > (TF_MIN[pick.tf] ?? 1) * 60 * 2 + 90, price: pick.price, lv: pick.lv, names: LEVEL_HE }
}
/** הצילום האחרון של (נכס, מסגרת) — לרמזור הכניסה. */
export function getSnap(symbolRaw: string, tf: string): StoredSnap | null { ensureLoaded(); return mem.get(normSymbol(symbolRaw))?.get(tf) ?? null }
export function liveSymbols(): string[] { ensureLoaded(); return [...mem.keys()].sort() }
export function clearLive(): void { mem.clear(); barMem.clear(); loaded = true }      // לבדיקות

// ─── "כמה חסר": לכל אישור — לאיזו רמה המחיר צריך להגיע, ומאיזה כיוון ───
type How = 'up' | 'down'
interface DistRule { lv: string[]; how: How; far?: string }
const zone = (near: string, far: string, how: How): DistRule => ({ lv: [near], how, far })
const DIST: Record<string, { L: DistRule; S: DistRule }> = {
  bos:      { L: { lv: ['pH'], how: 'up' }, S: { lv: ['pL'], how: 'down' } },
  choch:    { L: { lv: ['pH'], how: 'up' }, S: { lv: ['pL'], how: 'down' } },
  sweep:    { L: { lv: ['plL', 'pL'], how: 'down' }, S: { lv: ['plH', 'pH'], how: 'up' } },
  smt:      { L: { lv: ['lo20'], how: 'down' }, S: { lv: ['hi20'], how: 'up' } },
  fvgAt:    { L: zone('fLt', 'fLb', 'down'), S: zone('fSb', 'fSt', 'up') },
  ifvgAt:   { L: zone('iLt', 'iLb', 'down'), S: zone('iSb', 'iSt', 'up') },
  ob:       { L: zone('obL', 'obLs', 'down'), S: zone('obS', 'obSs', 'up') },
  atEdge:   { L: { lv: ['rLo'], how: 'down' }, S: { lv: ['rHi'], how: 'up' } },
  jac:      { L: { lv: ['rHi'], how: 'up' }, S: { lv: ['rLo'], how: 'down' } },
  crkRt:    { L: { lv: ['jac'], how: 'down' }, S: { lv: ['jac'], how: 'up' } },
  atHtfLvl: { L: { lv: ['h4L', 'dL', 'wL'], how: 'down' }, S: { lv: ['h4H', 'dH', 'wH'], how: 'up' } },
  ddt:      { L: { lv: ['h4L', 'dL', 'wL'], how: 'down' }, S: { lv: ['h4H', 'dH', 'wH'], how: 'up' } },
  atSesLvl: { L: { lv: ['sesL', 'asL'], how: 'down' }, S: { lv: ['sesH', 'asH'], how: 'up' } },
  atPool:   { L: { lv: ['plL'], how: 'down' }, S: { lv: ['plH'], how: 'up' } },
  orBrk:    { L: { lv: ['orH'], how: 'up' }, S: { lv: ['orL'], how: 'down' } },
  bb:       { L: { lv: ['bbU'], how: 'up' }, S: { lv: ['bbL'], how: 'down' } },
  pocRt:    { L: { lv: ['poc'], how: 'down' }, S: { lv: ['poc'], how: 'up' } },
  pocAt:    { L: { lv: ['poc'], how: 'down' }, S: { lv: ['poc'], how: 'up' } },
  avwapRt:  { L: { lv: ['avD'], how: 'down' }, S: { lv: ['avD'], how: 'up' } },
  avwTdoRt: { L: { lv: ['avT'], how: 'down' }, S: { lv: ['avT'], how: 'up' } },
  vaCheap:  { L: { lv: ['val'], how: 'down' }, S: { lv: ['vah'], how: 'up' } },
  'T:W':    { L: { lv: ['wgD'], how: 'up' }, S: { lv: ['wgU'], how: 'down' } },
}
const LEVEL_HE: Record<string, string> = {
  pH: 'שיא הפיבוט האחרון', pL: 'שפל הפיבוט האחרון', plH: 'בריכת נזילות עליונה', plL: 'בריכת נזילות תחתונה', lo20: 'שפל 20 נרות', hi20: 'שיא 20 נרות',
  fLt: 'FVG תומך', fSb: 'FVG מתנגד', iLt: 'iFVG תומך', iSb: 'iFVG מתנגד', obL: 'אורדר בלוק לונג (עומק 21%)', obS: 'אורדר בלוק שורט (עומק 21%)',
  rLo: 'אייס (תחתית הטווח)', rHi: 'קריק (תקרת הטווח)', jac: 'קו הקפיצה (קריק/אייס)', h4L: 'שפל 4H', h4H: 'שיא 4H', dL: 'שפל יומי', dH: 'שיא יומי', wL: 'שפל שבועי', wH: 'שיא שבועי',
  sesL: 'שפל הסשן הקודם', sesH: 'שיא הסשן הקודם', asL: 'שפל אסיה', asH: 'שיא אסיה', orH: 'שיא טווח הפתיחה', orL: 'שפל טווח הפתיחה', bbU: 'בולינגר עליון', bbL: 'בולינגר תחתון',
  fLb: 'תחתית FVG תומך', fSt: 'תקרת FVG מתנגד', iLb: 'תחתית iFVG תומך', iSt: 'תקרת iFVG מתנגד', obLs: 'קצה אורדר בלוק לונג', obSs: 'קצה אורדר בלוק שורט', avW: 'AVWAP שבועי', ema: 'EMA 12',
  poc: 'POC של היום', avD: 'AVWAP יומי', avT: 'AVWAP מ-True Day Open', val: 'תחתית אזור הערך', vah: 'תקרת אזור הערך', wgD: 'קו הכנף היורד', wgU: 'קו הכנף העולה',
}
const NAMES: Record<string, string> = { ...HTT_FLAG_NAMES, 'T:W': ENTRY_NAMES.W }

interface NearItem { key: string; name: string; dir: 'long' | 'short'; tfs: string[]; level: number; levelName: string; dist: number; pct: number; inZone: boolean; note?: string }

function distFor(rule: DistRule, lv: Record<string, number>, price: number): { level: number; lvKey: string; dist: number; inZone: boolean } | null {
  let best: { level: number; lvKey: string; dist: number; inZone: boolean } | null = null
  for (const k of rule.lv) {
    const level = lv[k]
    if (level == null) continue
    let dist: number; let inZone = false
    if (rule.far) {
      const far = lv[rule.far]
      if (far == null) continue
      const [lo, hi] = level < far ? [level, far] : [far, level]
      if (price >= lo && price <= hi) { dist = 0; inZone = true }
      else if (rule.how === 'down' && price > hi) dist = price - hi
      else if (rule.how === 'up' && price < lo) dist = lo - price
      else continue                                            // המחיר כבר עבר את האזור
    } else {
      dist = rule.how === 'up' ? level - price : price - level
      if (dist < 0) continue                                    // הרמה כבר מאחורינו
    }
    if (!best || dist < best.dist) best = { level, lvKey: k, dist, inZone }
  }
  return best
}

export function nyClock(now: number): { hhmm: string; minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(now))
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const h = parseInt(get('hour'), 10) % 24; const m = parseInt(get('minute'), 10)
  return { hhmm: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, minutes: h * 60 + m, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')) }
}
export function ilClock(now: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour12: false, hour: '2-digit', minute: '2-digit' }).format(new Date(now))
}

export interface BoardExtras {
  options?: { ts: number; nq: Record<string, number | string | null> } | null
  orderflow?: Record<string, { updatedAt: number | null; lastDelta: number | null; cvdSlope5: number | null; cvdDay: number | null } | null>
  news?: { title: string; inMin: number } | null
  riskUsd?: number
  /** מחיר חי ממקור אחר (Binance לקריפטו). משמש כשהוא טרי יותר מצילום המצב האחרון, או כשעוד אין צילום בכלל */
  spot?: { price: number; ts: number } | null
}
/** קריפטו נסחר 24/7 — שעות הסשן של ניו יורק הן מידע, לא תנאי */
export function isAllDay(symbol: string): boolean { return /(USDT|USDC|USD)$/.test(symbol) }

// ─── בריאות הנתונים: אילו נכסים הפסיקו לשלוח (לחלון הקופץ באתר) ───
const HEALTH_TFS = ['1m', '5m', '15m', '1h'] as const
const PRICE_STALE_MS = 150_000
/**
 * האם השוק של הנכס פתוח עכשיו, וממתי. קריפטו — תמיד. חוזים ב-CME: ראשון 18:00 עד שישי 17:00 (ניו יורק),
 * עם הפסקה יומית 17:00–18:00. חגים לא מטופלים — ביום חג החלון יקפוץ פעם אחת והמשתמש יסגור אותו.
 */
export function marketState(symbol: string, now: number): { open: boolean; openedAt: number | null } {
  if (isAllDay(symbol)) return { open: true, openedAt: null }
  const { minutes: m, weekday: d } = nyClock(now)
  const open = d === 6 ? false : d === 0 ? m >= 1080 : d === 5 ? m < 1020 : (m < 1020 || m >= 1080)
  if (!open) return { open: false, openedAt: null }
  const minsSinceOpen = m >= 1080 ? m - 1080 : m + 360
  return { open: true, openedAt: Math.floor(now / 60_000) * 60_000 - minsSinceOpen * 60_000 }
}

export interface HealthItem { symbol: string; kind: 'snapshots' | 'price'; tfs: string[]; since: number | null; ageSec: number | null }
/**
 * מה נעצר: צילומי מצב שלא הגיעו שני נרות ברצף בזמן שהשוק פתוח (נמדד מפתיחת השוק, כדי שההפסקה היומית לא תיחשב),
 * ומחיר Binance שלא התעדכן. spots: נכס → המחיר האחרון, או null כשאין בכלל.
 */
export function liveHealth(now = Date.now(), spots: Record<string, { price: number; ts: number } | null> = {}) {
  ensureLoaded()
  const items: HealthItem[] = []
  for (const [symbol, snaps] of mem) {
    const mk = marketState(symbol, now)
    if (!mk.open) continue
    const stopped: string[] = []; let since = 0
    for (const tf of HEALTH_TFS) {
      const s = snaps.get(tf)
      if (!s) continue
      if (now - Math.max(s.receivedAt, mk.openedAt ?? 0) > TF_MIN[tf] * 60_000 * 2 + 90_000) { stopped.push(tf); since = Math.max(since, s.receivedAt) }
    }
    if (stopped.length) items.push({ symbol, kind: 'snapshots', tfs: stopped, since, ageSec: Math.round((now - since) / 1000) })
  }
  for (const [symbol, spot] of Object.entries(spots)) {
    if (spot && now - spot.ts <= PRICE_STALE_MS) continue
    items.push({ symbol, kind: 'price', tfs: [], since: spot?.ts ?? null, ageSec: spot ? Math.round((now - spot.ts) / 1000) : null })
  }
  return { serverTs: now, ok: items.length === 0, items }
}

export function buildBoard(symbolRaw: string, extras: BoardExtras = {}, now = Date.now()) {
  ensureLoaded()
  const symbol = normSymbol(symbolRaw)
  const snaps = mem.get(symbol) ?? new Map<string, StoredSnap>()
  const riskUsd = extras.riskUsd ?? 300
  // המחיר העדכני ביותר = הצילום האחרון שהגיע (בדרך כלל נר הדקה)
  let latest: StoredSnap | null = null
  for (const s of snaps.values()) if (!latest || s.receivedAt > latest.receivedAt) latest = s
  let price = latest?.price ?? null
  let priceTs = latest?.receivedAt ?? null
  let priceSource: 'snapshot' | 'spot' | null = latest ? 'snapshot' : null
  const spot = extras.spot
  if (spot && spot.price > 0 && (priceTs == null || spot.ts > priceTs)) { price = spot.price; priceTs = spot.ts; priceSource = 'spot' }
  const priceAgeSec = priceTs != null ? Math.max(0, Math.round((now - priceTs) / 1000)) : null

  const tfs = BOARD_TFS.map(tf => {
    const s = snaps.get(tf)
    if (!s) return { tf, missing: true as const, exec: EXEC_TFS.has(tf) }
    const ageSec = Math.round((now - s.receivedAt) / 1000)
    const stale = ageSec > TF_MIN[tf] * 60 * 2 + 90                    // שני נרות שלא הגיעו
    const long: string[] = []; const short: string[] = []; const neutral: string[] = []
    HTT_FLAG_KEYS.forEach((k, i) => {
      const l = s.L[i] === '1'; const sh = s.S[i] === '1'
      if (l && sh) neutral.push(k); else if (l) long.push(k); else if (sh) short.push(k)
    })
    return {
      tf, missing: false as const, exec: EXEC_TFS.has(tf), receivedAt: s.receivedAt, barTime: s.time, ageSec, stale, price: s.price,
      phase: PHASE_HE[s.phase] ?? '—', phaseDir: s.phase >= 3 ? (s.cBull ? 'long' : 'short') : null, ms: s.ms, htfMs: s.htfMs, dq: s.dq,
      rsi: s.rsi ?? null, atr: s.atr ?? null, entryL: s.trL || null, entryS: s.trS || null, stL: s.stL ?? null, stS: s.stS ?? null,
      long, short, neutral,
    }
  })

  // ─── סיכום: כמה אישורים דולקים עכשיו לכל כיוון (מסגרות הביצוע בנפרד מההקשר) ───
  const side = (d: 'long' | 'short') => {
    let exec = 0; let context = 0; const entries: Array<{ tf: string; code: string; name: string }> = []
    for (const t of tfs) {
      if (t.missing || t.stale) continue
      const n = t[d].length
      if (t.exec) exec += n; else context += n
      const code = d === 'long' ? t.entryL : t.entryS
      if (code) entries.push({ tf: t.tf, code, name: ENTRY_NAMES[code] ?? code })
    }
    return { exec, context, total: exec + context, entries }
  }
  const summary = { long: side('long'), short: side('short') }

  // ─── כמה חסר ───
  const nearMap = new Map<string, NearItem>()
  if (price != null) {
    for (const t of tfs) {
      if (t.missing || t.stale) continue
      const s = snaps.get(t.tf)!
      for (const [key, rules] of Object.entries(DIST)) {
        for (const d of ['long', 'short'] as const) {
          const idx = HTT_FLAG_KEYS.indexOf(key)
          const on = idx >= 0 ? (d === 'long' ? s.L[idx] : s.S[idx]) === '1' : (d === 'long' ? s.trL : s.trS) === key.slice(2)
          if (on) continue
          const r = distFor(d === 'long' ? rules.L : rules.S, s.lv, price)
          if (!r) continue
          let note: string | undefined
          if (key === 'smt') {
            const p2 = s.lv['p2']; const ref = d === 'long' ? s.lv['p2lo'] : s.lv['p2hi']
            if (p2 != null && ref != null) {
              const holds = d === 'long' ? p2 > ref : p2 < ref
              const gap = Math.abs(p2 - ref) / p2 * 100
              note = holds ? `הצמד מחזיק (${gap.toFixed(2)}% מהקיצון שלו)` : 'הצמד כבר בקיצון שלו — אין SMT אם גם אנחנו נגיע'
            }
          }
          const id = `${key}|${d}|${r.level}`
          const ex = nearMap.get(id)
          if (ex) { if (!ex.tfs.includes(t.tf)) ex.tfs.push(t.tf); continue }
          nearMap.set(id, { key, name: NAMES[key] ?? key, dir: d, tfs: [t.tf], level: r.level, levelName: LEVEL_HE[r.lvKey] ?? r.lvKey, dist: +r.dist.toFixed(2), pct: +(r.dist / price * 100).toFixed(3), inZone: r.inZone, note })
        }
      }
    }
  }
  const near = [...nearMap.values()].sort((a, b) => a.pct - b.pct)

  // ─── כרטיס עסקה: סטופ → כמה חוזים → כמה דולרים (לפי מסגרת הביצוע הטרייה הקטנה ביותר) ───
  const execSnap = ['1m', '5m'].map(tf => snaps.get(tf)).find(s => s && now - s.receivedAt <= TF_MIN[s.tf] * 60_000 * 2 + 90_000) ?? null
  const inst = INSTRUMENT[symbol]
  const cardSide = (d: 'long' | 'short') => {
    if (!execSnap || price == null) return null
    const mk = (label: string, stop: number | null | undefined) => {
      if (stop == null) return null
      const pts = d === 'long' ? price - stop : stop - price
      if (!(pts > 0)) return null
      if (inst) {
        const contracts = Math.min(inst.maxContracts, Math.floor(riskUsd / (pts * inst.pointUsd)))
        const usd = contracts * pts * inst.pointUsd
        return { label, stop, pts: +pts.toFixed(2), contracts, unit: inst.micro, riskUsd: Math.round(usd), t1: d === 'long' ? price + pts : price - pts, t2: d === 'long' ? price + 2 * pts : price - 2 * pts, r1Usd: Math.round(usd), r2Usd: Math.round(usd * 2), fits: contracts >= 1 }
      }
      const qty = riskUsd / pts
      return { label, stop, pts: +pts.toFixed(2), contracts: +qty.toFixed(4), unit: 'יחידות', riskUsd, t1: d === 'long' ? price + pts : price - pts, t2: d === 'long' ? price + 2 * pts : price - 2 * pts, r1Usd: riskUsd, r2Usd: riskUsd * 2, fits: true }
    }
    const pivot = d === 'long' ? execSnap.lv['pL'] : execSnap.lv['pH']
    return { tf: execSnap.tf, options: [mk('סטופ מבני (פיבוט אחרון)', pivot), mk('סטופ הקורס (פיבוט + מרווח)', d === 'long' ? execSnap.stL : execSnap.stS)].filter(Boolean) }
  }
  const card = { riskUsd, long: cardSide('long'), short: cardSide('short') }

  // ─── אופציות (גמא) ───
  let options: null | { ageMin: number; regime: string; netGexB: number | null; nearFlip: boolean; levels: Array<{ key: string; name: string; price: number; dist: number | null }> } = null
  if (extras.options && symbol === 'NQ') {
    const o = extras.options.nq
    const defs: Array<[string, string]> = [['callWall', 'קיר קולים'], ['putWall', 'קיר פוטים'], ['zeroGamma', 'אפס-גמא'], ['magnet', 'מגנט (OI הגדול)'], ['zdte', '0DTE']]
    options = {
      ageMin: Math.round((now - extras.options.ts) / 60_000), regime: String(o['regime'] ?? 'unknown'),
      netGexB: typeof o['netGex'] === 'number' ? +((o['netGex'] as number) / 1e9).toFixed(1) : null,
      // קרוב לאפס-גמא (פחות מ-0.3%) = המשטר יכול להתהפך בתנועה קטנה; מציגים את זה במקום להעמיד פנים שהוא יציב
      nearFlip: typeof o['zeroGamma'] === 'number' && price != null && Math.abs((o['zeroGamma'] as number) - price) / price < 0.003,
      levels: defs.filter(([k]) => typeof o[k] === 'number').map(([k, name]) => ({ key: k, name, price: o[k] as number, dist: price != null ? +((o[k] as number) - price).toFixed(2) : null })),
    }
  }

  // ─── שעון הסשן (ניו יורק 9:30–16:00) ───
  const ny = nyClock(now)
  const weekday = ny.weekday >= 1 && ny.weekday <= 5
  const inRth = weekday && ny.minutes >= 570 && ny.minutes < 960
  const allDay = isAllDay(symbol)
  const session = {
    ny: ny.hhmm, il: ilClock(now), inRth, allDay,
    minutesToOpen: weekday && ny.minutes < 570 ? 570 - ny.minutes : null,
    minutesToClose: inRth ? 960 - ny.minutes : null,
  }
  const news = extras.news ?? null
  const guard = {
    live: priceAgeSec != null && priceAgeSec <= 150,
    // האישורים חיים רק כשיש צילום מצב טרי לפחות ממסגרת אחת (מחיר חי לבד לא מספיק)
    snapshots: tfs.some(t => !t.missing && !t.stale),
    inSession: allDay || inRth,
    newsClear: !news || Math.abs(news.inMin) > 5,
  }
  return { symbol, serverTs: now, price, priceAgeSec, priceSource, tfs, summary, near, card, options, orderflow: extras.orderflow ?? {}, session, news, guard }
}

export function boardMeta() {
  return { flags: HTT_FLAG_KEYS, names: HTT_FLAG_NAMES, groups: HTT_FLAG_GROUP, groupOrder: HTT_GROUP_ORDER, entries: ENTRY_NAMES, tfs: BOARD_TFS }
}
