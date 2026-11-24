/**
 * רמזור הכניסה — "מתי בדיוק להיכנס".
 *
 * רשימת תנאים אחת וקבועה (צ'ק-ליסט הכניסה של קורס Orderra, backtest/course_orderra/SUMMARY.md סעיף 1),
 * שנבדקת בכל סגירת נר דקה מתוך צילום המצב של HTT Snapshot (נתוני TradingView):
 *   שעה · יציאה מהאזור ההוגן · EMA 12 בכיוון · קרוב ל-EMA · נר מומנטום · CVD בכיוון.
 * אדום = אין עסקה / אסור להיכנס · צהוב = חסר תנאי אחד · ירוק = כל התנאים התקיימו יחד בסגירת נר הדקה האחרון.
 * ירוק תקף לנר אחד בלבד ("כניסה בנר השני"). אחריו לא רודפים: מחכים לתיקון ולנר מומנטום חדש.
 *
 * מ-24.11.2026 (בקשת המשתמש) הבדיקה היא מלמעלה למטה, בשלושה שלבים:
 *   1. גרף 15 דקות — מופיע שם לפחות אחד מהאישורים הרגילים של HTT (BOS, חטיפת נזילות, FVG, אורדר בלוק, SMT...). זה קובע את הכיוון.
 *   ואחר כך האסטרטגיה:
 *   2. גרף 5 דקות — יש שם לפחות תנאי אחד של האסטרטגיה באותו כיוון (יציאה מהאזור ההוגן / EMA 12 / CVD).
 *   3. גרף דקה — האישור: כל תנאי הדקה מתקיימים באותו כיוון. רק אז נדלק ירוק ונשלחת התראה.
 *
 * כל "ירוק" נרשם, ואחר כך נרשם מה קרה (יעד / סטופ / סוף הסשן), כדי לדעת אם הוא שווה משהו.
 * ירוק פירושו "הכללים מתקיימים" — לא "העסקה תרוויח". המערכת רק מציגה; היא לא שולחת פקודות.
 *
 * המספרים שאינם מהקורס אלא הגדרה שלנו מסומנים [הגדרה].
 */
import { getDb } from '../db/client'
import { HTT_FLAG_KEYS, HTT_FLAG_NAMES } from './httFlagKeys'
import { getSnap, getBars, normSymbol, nyClock, ilClock, marketState, ENTRY_NAMES, type StoredSnap } from './liveBoard'
import { getCachedCalendar } from './forexFactory'

export type Dir = 'long' | 'short'
export interface GateRules {
  stopPts: number; rr: number                           // סטופ קבוע בנקודות ויחס היעד (החלטת המשתמש: 30 נק', 1:2)
  pointUsd: number; micro: string; maxContracts: number
  openMin: number; waitMin: number; closeMin: number    // דקות מחצות בניו יורק: פתיחה 9:30, המתנה 5 דק' (הקורס), סגירה 16:00
  newsMin: number                                       // דקות לפני ואחרי הודעה כלכלית חשובה
  maxEmaDistPts: number                                 // [הגדרה] "לא רחוק מה-EMA" = לא יותר מגודל הסטופ
  maxTrades: number; maxLosses: number; cooldownMin: number   // חוקי היום שאושרו (מסמך 27, M3-0.7)
  dayTargetUsd: number                                  // "עצירה ביעד" — המשתמש קבע 1,500$ (19.11.2026)
  roomMin: number                                       // "יש מקום ליעד": היעד חייב להיות בתוך הטווח של כך וכך דקות אחרונות
  reentryPts: number; reentryMin: number                // [הגדרה] "לא חוזרים לאותו מקום": אחרי סטופ, לא נכנסים שוב באותו כיוון בטווח הזה ובזמן הזה
}
export const GATE_RULES: Record<string, GateRules> = {
  NQ: { stopPts: 30, rr: 2, pointUsd: 2, micro: 'MNQ', maxContracts: 5, openMin: 570, waitMin: 5, closeMin: 960, newsMin: 5, maxEmaDistPts: 30, maxTrades: 5, maxLosses: 2, cooldownMin: 10, dayTargetUsd: 1500, roomMin: 60, reentryPts: 45, reentryMin: 60 },
}
const STALE_SEC = 150
const f = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
const DIR_HE: Record<Dir, string> = { long: 'לונג', short: 'שורט' }
const IDX: Record<string, number> = Object.fromEntries(HTT_FLAG_KEYS.map((k, i) => [k, i]))
const flag = (s: StoredSnap, dir: Dir, key: string): boolean => (dir === 'long' ? s.L : s.S)[IDX[key] ?? -1] === '1'
const nyDay = (now: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now))

// ─── חדשות: ההודעה הכלכלית החשובה הקרובה (USD, השפעה גבוהה). לא מחכים לרשת יותר משנייה וחצי ───
export interface News { title: string; inMin: number }
export async function nextNews(now: number): Promise<News | null> {
  try {
    const events = await Promise.race([getCachedCalendar(), new Promise<null>(r => setTimeout(() => r(null), 1500))])
    if (!events) return null
    let best: News | null = null
    for (const e of events) {
      if (e.impact !== 'high' || e.currency !== 'USD') continue
      const ts = Date.parse(`${e.date}T${e.time}:00Z`)
      if (!Number.isFinite(ts)) continue
      const inMin = Math.round((ts - now) / 60_000)
      if (inMin < -5 || inMin > 24 * 60) continue
      if (!best || inMin < best.inMin) best = { title: e.titleHe || e.title, inMin }
    }
    return best
  } catch { return null }
}

// ─── כיוון ה-CVD ב-Bookmap ───
// המחשב של המשתמש (האתר הפתוח + העיניים) שולח לכאן רק מילה אחת: ה-CVD עולה / יורד / לא ברור. בלי שום מספר מ-Bookmap.
// כשהמילה טרייה, היא מחליפה את ה-CVD המשוער של TradingView בתנאי של הרמזור.
export type FlowDir = 'up' | 'down' | 'flat'
const FLOW_FRESH_MS = 20_000
const flowMem = new Map<string, { cvd: FlowDir; ts: number }>()
export function setFlow(symbolRaw: string, cvd: FlowDir, now = Date.now()): void { flowMem.set(normSymbol(symbolRaw), { cvd, ts: now }) }
export function getFlow(symbolRaw: string, now = Date.now()): { cvd: FlowDir; ageSec: number } | null {
  const f = flowMem.get(normSymbol(symbolRaw))
  return f && now - f.ts <= FLOW_FRESH_MS ? { cvd: f.cvd, ageSec: Math.max(0, Math.round((now - f.ts) / 1000)) } : null
}

// ─── התנאים ───
export interface GateCondition { key: string; name: string; ok: boolean; detail: string; need: string | null; level?: number | null }

function sessionClock(rules: GateRules, now: number) {
  const ny = nyClock(now)
  const start = rules.openMin + rules.waitMin
  const weekday = ny.weekday >= 1 && ny.weekday <= 5
  return {
    ok: weekday && ny.minutes >= start && ny.minutes < rules.closeMin,
    waiting: weekday && ny.minutes < start,                         // היום עוד ייפתח
    firstMinutes: weekday && ny.minutes >= rules.openMin && ny.minutes < start,
    minutesToStart: weekday && ny.minutes < start ? start - ny.minutes : null,
    over: !weekday || ny.minutes >= rules.closeMin,
    // שעת ההתחלה בשעון ישראל, מחושבת מהשעון של היום (ההפרש מניו יורק משתנה כמה שבועות בשנה)
    startIl: ilClock(now + (start - ny.minutes) * 60_000),
  }
}

// ─── השלבים הגבוהים: מה רואים בגרף 15 דקות ובגרף 5 דקות ───
export interface HtfSnaps { s15: StoredSnap | null; s5: StoredSnap | null; range?: { hi: number; lo: number; n: number } | null }
const TF_NAME: Record<string, string> = { '15m': '15 דק׳', '5m': '5 דק׳' }
const TF_MINUTES: Record<string, number> = { '15m': 15, '5m': 5 }
/**
 * "האישורים הרגילים" של HTT לשלב גרף 15 הדקות: דברים שקורים על הגרף (מבנה, נזילות, FVG, אורדר בלוק, SMT, וויקוף, ריטסטים).
 * לא נכללים דגלי הקשר שדולקים כמעט תמיד (סשן, פאזה, VIX, "באיזה צד של...", תורת הרבעים) ולא תנאי האסטרטגיה עצמם (EMA 12, CVD, אזור הוגן),
 * שנבדקים בשלבים הבאים. [הבחירה אילו אישורים נחשבים "רגילים" היא פירוש שלנו לבקשת המשתמש מ-24.11.2026.]
 */
export const REGULAR_CONFIRMATIONS: readonly string[] = [
  'bos', 'choch', 'sweep', 'smt', 'ismt', 'ifvg', 'fvg', 'judas', 'tweezer', 'shake', 'volC', 'lps', 'gap', 'ob', 'wm', 'ddt', 'engulf', 'bb', 'rsi', 'climax',
  'fvgAt', 'ifvgAt', 'atPool', 'orBrk', 'jac', 'crkRt', 'tso', 'qtJudas', 'pocRt', 'test',
  'atEdge', 'atHtfLvl', 'atSesLvl', 'cTso', 'reacc', 'avwapRt', 'cvdDiv', 'avwTdoRt', 'avwSwRt', 'pocAt',
]
/** האישורים הרגילים שדולקים במסגרת הזאת לכיוון הזה בלבד (אישור שדולק לשני הכיוונים לא קובע כיוון), וגם סוג הכניסה של HTT אם יש. */
function regularHits(s: StoredSnap, dir: Dir): string[] {
  const other: Dir = dir === 'long' ? 'short' : 'long'
  const hits = REGULAR_CONFIRMATIONS.filter(k => flag(s, dir, k) && !flag(s, other, k)).map(k => HTT_FLAG_NAMES[k] ?? k)
  const entry = dir === 'long' ? s.trL : s.trS
  if (entry) hits.unshift(ENTRY_NAMES[entry] ?? `כניסה ${entry}`)
  return hits
}
/** אילו משלושת תנאי הכיוון של האסטרטגיה מתקיימים במסגרת הזאת, לכיוון הזה (לפי הנר האחרון שנסגר בה). */
function tfHits(s: StoredSnap, dir: Dir): string[] {
  const long = dir === 'long'; const hits: string[] = []
  const edge = long ? s.lv['vah'] : s.lv['val']
  if (edge != null && (long ? s.price > edge : s.price < edge)) hits.push(long ? 'המחיר מעל האזור ההוגן' : 'המחיר מתחת לאזור ההוגן')
  if (flag(s, dir, 'ema12Ok')) hits.push(`EMA 12 ${long ? 'עולה והמחיר מעליו' : 'יורד והמחיר מתחתיו'}`)
  if (flag(s, dir, 'cvdOk')) hits.push(`ה-CVD ${long ? 'עולה' : 'יורד'}`)
  return hits
}
/**
 * שלב של מסגרת גבוהה: מתקיים כשיש בה לפחות אחד בכיוון, ויותר בכיוון הזה מאשר בכיוון ההפוך.
 * ב-15 דקות סופרים את האישורים הרגילים של HTT; ב-5 דקות את תנאי הכיוון של האסטרטגיה.
 */
export function tfStage(s: StoredSnap | null, tf: '15m' | '5m', dir: Dir, now: number): GateCondition {
  const what = tf === '15m' ? 'אישור' : 'תנאי של האסטרטגיה'
  const name = `גרף ${TF_NAME[tf]}: יש ${what} ל${DIR_HE[dir]}`
  const key = tf === '15m' ? 'tf15' : 'tf5'
  if (!s) return { key, name, ok: false, detail: `עוד לא הגיע נר ${TF_NAME[tf]}`, need: `מחכים לנר ${TF_NAME[tf]} הראשון` }
  if (now - s.receivedAt > (TF_MINUTES[tf] * 2 * 60 + 90) * 1000) return { key, name, ok: false, detail: `הנתון של ${TF_NAME[tf]} ישן`, need: `אין נתון טרי מגרף ${TF_NAME[tf]}` }
  const hitsOf = tf === '15m' ? regularHits : tfHits
  const mineAll = hitsOf(s, dir); const otherAll = hitsOf(s, dir === 'long' ? 'short' : 'long')
  const ok = mineAll.length >= 1 && mineAll.length > otherAll.length
  const otherHe = DIR_HE[dir === 'long' ? 'short' : 'long']
  const show = (l: string[]) => (l.length > 4 ? `${l.slice(0, 4).join(' · ')} ועוד ${l.length - 4}` : l.join(' · '))
  const mine = show(mineAll); const other = show(otherAll)
  return {
    key, name, ok,
    detail: ok ? `בנר ${TF_NAME[tf]} האחרון: ${mine}${otherAll.length ? ` (ל${otherHe} רק: ${other})` : ''}`
      : mineAll.length ? `בנר ${TF_NAME[tf]} האחרון: ${mine}, אבל ל${otherHe} יש אותו מספר או יותר (${other})`
      : otherAll.length ? `בנר ${TF_NAME[tf]} האחרון אין ${what} ל${DIR_HE[dir]}. יש ל${otherHe}: ${other}`
      : `בנר ${TF_NAME[tf]} האחרון אין אף ${what}`,
    need: ok ? null
      : mineAll.length ? `בגרף ${TF_NAME[tf]} התמונה מעורבת: ${mine} מול ${other}`
      : `בגרף ${TF_NAME[tf]} אין עדיין ${what} ל${DIR_HE[dir]}${otherAll.length ? ` (יש ל${otherHe}: ${other})` : ''}`,
  }
}
/** הכיוון שגרף 15 הדקות מצביע עליו, אם יש */
function dirOf15(s15: StoredSnap | null, now: number): Dir | null {
  return tfStage(s15, '15m', 'long', now).ok ? 'long' : tfStage(s15, '15m', 'short', now).ok ? 'short' : null
}

/** כל התנאים לכיוון אחד: קודם 15 דק׳ ו-5 דק׳ (כשנמסרו), ואז נר הדקה האחרון שנסגר. prevClose משמש רק כשהסקריפט לא שלח מחיר פתיחה. */
export function evalConditions(snap: StoredSnap, dir: Dir, rules: GateRules, now: number, prevClose: number | null = null, flow: FlowDir | null = null, htf: HtfSnaps | null = null): GateCondition[] {
  const long = dir === 'long'; const p = snap.price
  const vah = snap.lv['vah'] ?? null; const val = snap.lv['val'] ?? null; const ema = snap.lv['ema'] ?? null
  const out: GateCondition[] = []

  const ses = sessionClock(rules, now)
  out.push({
    key: 'time', name: `שעת מסחר (אחרי ${ses.startIl})`, ok: ses.ok,
    detail: ses.ok ? 'בתוך שעות המסחר של ניו יורק' : ses.firstMinutes ? '5 הדקות הראשונות אחרי הפתיחה' : ses.waiting ? 'הסשן עוד לא נפתח' : 'הסשן של ניו יורק סגור',
    need: ses.ok ? null : ses.waiting ? `מחכים ל-${ses.startIl}` : 'הסשן של ניו יורק סגור',
  })
  // מלמעלה למטה: 15 דקות, אחר כך 5 דקות, ורק אז האישור בנר הדקה
  if (htf) { out.push(tfStage(htf.s15, '15m', dir, now)); out.push(tfStage(htf.s5, '5m', dir, now)) }

  const edge = long ? vah : val
  const valueOk = edge != null && (long ? p > edge : p < edge)
  const inside = vah != null && val != null && p <= vah && p >= val
  out.push({
    key: 'value', name: 'דקה: יציאה מהאזור ההוגן', ok: valueOk, level: edge,
    detail: edge == null ? 'עוד אין אזור הוגן להיום'
      : valueOk ? (long ? `המחיר מעל תקרת האזור ההוגן (${f(edge)})` : `המחיר מתחת לתחתית האזור ההוגן (${f(edge)})`)
      : inside ? `המחיר בתוך האזור ההוגן (${f(val!)} עד ${f(vah!)})`
      : long ? `המחיר מתחת לאזור ההוגן (תקרה ${f(edge)})` : `המחיר מעל האזור ההוגן (תחתית ${f(edge)})`,
    need: valueOk ? null : edge == null ? 'האזור ההוגן של היום עוד לא נבנה'
      : long ? `סגירת נר דקה מעל ${f(edge)} (תקרת האזור ההוגן), עוד ${f(edge - p)} נק׳`
      : `סגירת נר דקה מתחת ל-${f(edge)} (תחתית האזור ההוגן), עוד ${f(p - edge)} נק׳`,
  })

  const emaOk = flag(snap, dir, 'ema12Ok')
  const sideOk = ema != null ? (long ? p > ema : p < ema) : flag(snap, dir, 'ema12Side')
  const emaTxt = ema != null ? ` (${f(ema)})` : ''
  out.push({
    key: 'ema', name: 'דקה: EMA 12 בכיוון', ok: emaOk, level: ema,
    detail: emaOk ? (long ? `המחיר מעל EMA 12${emaTxt} וה-EMA עולה` : `המחיר מתחת ל-EMA 12${emaTxt} וה-EMA יורד`)
      : sideOk ? `המחיר בצד הנכון, אבל ה-EMA 12 עוד לא ${long ? 'עולה' : 'יורד'}`
      : long ? `המחיר מתחת ל-EMA 12${emaTxt}` : `המחיר מעל EMA 12${emaTxt}`,
    need: emaOk ? null : !sideOk ? (long ? `סגירת נר דקה מעל EMA 12${emaTxt}` : `סגירת נר דקה מתחת ל-EMA 12${emaTxt}`)
      : `EMA 12 צריך להתחיל ${long ? 'לעלות' : 'לרדת'}`,
  })

  const dist = ema != null ? Math.abs(p - ema) : null
  const nearOk = dist != null && dist <= rules.maxEmaDistPts
  const pull = ema != null ? (long ? ema + rules.maxEmaDistPts : ema - rules.maxEmaDistPts) : null
  out.push({
    key: 'emaNear', name: `דקה: קרוב ל-EMA (עד ${rules.maxEmaDistPts} נק׳)`, ok: nearOk, level: pull,
    detail: dist == null ? 'אין ערך EMA בצילום' : `המרחק מה-EMA: ${f(dist)} נק׳`,
    need: nearOk ? null : dist == null ? 'אין ערך EMA בצילום'
      : `המחיר רחוק מה-EMA (${f(dist)} נק׳). מחכים לתיקון עד בערך ${f(pull!)}`,
  })

  const open = snap.op ?? prevClose
  const candleOk = open != null && (long ? p > open : p < open)
  const color = long ? 'ירוק' : 'אדום'
  out.push({
    key: 'candle', name: 'דקה: נר מומנטום (נר הדקה האחרון בכיוון)', ok: candleOk,
    detail: candleOk ? `נר הדקה האחרון נסגר ${color}` : `נר הדקה האחרון לא נסגר ${color}`,
    need: candleOk ? null : `נר דקה ${color} שנסגר (הכניסה בנר שאחריו)`,
  })

  if (flow) {
    // Bookmap מחובר: הכיוון האמיתי של ה-CVD (5 דקות אחרונות) קובע, לא ההערכה של TradingView
    const cvdOk = flow === (long ? 'up' : 'down')
    const now_ = flow === 'up' ? 'עולה' : flow === 'down' ? 'יורד' : 'לא זז לכיוון ברור'
    out.push({
      key: 'cvd', name: 'דקה: CVD בכיוון (Bookmap, 5 דק׳)', ok: cvdOk,
      detail: `ה-CVD ב-Bookmap ${now_}`,
      need: cvdOk ? null : `ה-CVD ב-Bookmap ${now_}, וצריך ${long ? 'לעלות' : 'לרדת'}`,
    })
  } else {
    const cvdOk = flag(snap, dir, 'cvdOk')
    out.push({
      key: 'cvd', name: 'דקה: CVD בכיוון (TradingView בלבד, Bookmap לא מחובר)', ok: cvdOk,
      detail: cvdOk ? `ה-CVD המשוער של TradingView ${long ? 'עולה' : 'יורד'} (5 נרות דקה)` : `ה-CVD המשוער של TradingView לא ${long ? 'עולה' : 'יורד'}`,
      need: cvdOk ? null : `ה-CVD צריך ${long ? 'לעלות' : 'לרדת'}`,
    })
  }
  if (htf) {
    // ── יש מקום ליעד: היעד חייב להיות בתוך הטווח של השעה האחרונה ──
    // נוסף 24.11.2026 אחרי שלושה שורטים לתוך שפל שהחזיק. ב-32 הירוקים שנמדדו עד אז: כשהקצה של השעה האחרונה היה לפני היעד — 4 טובות מ-23; כשהיה מעבר ליעד — 3 מ-7.
    const tgt = rules.stopPts * rules.rr
    const r = htf.range
    if (!r || r.n < rules.roomMin / 2) {
      out.push({ key: 'room', name: 'דקה: יש מקום ליעד', ok: true, detail: 'אין מספיק נרות מהשעה האחרונה כדי לבדוק, ולכן לא נחסם', need: null })
    } else {
      const edge = long ? r.hi : r.lo
      const d = long ? edge - p : p - edge
      const what = long ? 'השיא' : 'השפל'
      const ok = d >= tgt
      out.push({
        key: 'room', name: 'דקה: יש מקום ליעד', ok, level: edge,
        detail: `${what} של ${rules.roomMin} הדקות האחרונות (${f(edge)}) נמצא ${f(d)} נק׳ מהמחיר${ok ? `, מעבר ליעד (${tgt} נק׳)` : `, לפני היעד (${tgt} נק׳)`}`,
        need: ok ? null : `אין מקום ליעד: ${what} של השעה האחרונה (${f(edge)}) רק ${f(d)} נק׳ מהמחיר, והיעד ${tgt} נק׳`,
      })
    }
    // ── לא חוזרים לאותו מקום אחרי סטופ ──
    const failed = [...signals].reverse().find(x => x.symbol === snap.symbol && x.dir === dir && !x.blocked && x.status === 'stop'
      && now - x.ts < rules.reentryMin * 60_000 && Math.abs(x.entry - p) <= rules.reentryPts)
    out.push({
      key: 'fresh', name: 'דקה: לא אותו מקום שכבר נכשל', ok: !failed,
      detail: failed ? `כבר היה סטופ ל${DIR_HE[dir]} באזור הזה: כניסה ${f(failed.entry)} ב-${ilClock(failed.ts)}` : `לא היה סטופ ל${DIR_HE[dir]} באזור הזה בשעה האחרונה`,
      need: failed ? `כבר היה סטופ ל${DIR_HE[dir]} באזור הזה (כניסה ${f(failed.entry)} ב-${ilClock(failed.ts)}). לא חוזרים לאותו מקום במשך ${rules.reentryMin} דק׳` : null,
    })
  }
  return out
}

/** הגבוה והנמוך של הדקות האחרונות (כולל נר הדקה האחרון שנסגר), לבדיקת "יש מקום ליעד" */
function recentRange(symbol: string, snap: StoredSnap, minutes: number): { hi: number; lo: number; n: number } | null {
  const to = Math.floor(snap.time / 1000); const from = to - (minutes - 1) * 60
  const w = getBars(symbol, '1m', minutes + 5).filter(b => b.time >= from && b.time <= to)
  if (!w.length) return null
  return { hi: Math.max(...w.map(b => b.high)), lo: Math.min(...w.map(b => b.low)), n: w.length }
}

// ─── זיכרון: איתותים, מצב "דרוך" מהנר הקודם, עסקאות היום ───
export interface GateSignal {
  id: number; symbol: string; dir: Dir; barTime: number; ts: number; validUntil: number
  entry: number; stop: number; t1: number; t2: number; blocked: string | null; atr: number | null
  status: 'open' | 'target' | 'stop' | 'expired'; hit1At: number | null; resolvedAt: number | null
  r: number | null; mfe: number; mae: number; ambiguous: boolean
  why: string[]                          // התנאים והמספרים ברגע שנדלק הירוק
  cvdSrc: 'bookmap' | 'tv'               // מאיפה נבדק ה-CVD
  method: 'v1' | 'mtf'                   // v1 = נר דקה בלבד (עד 24.11.2026) · mtf = 15 דק׳ ← 5 דק׳ ← דקה
}
export interface DayTrade { id: number; day: string; symbol: string; ts: number; result: 'win' | 'loss' | 'be'; usd: number }
const KEEP = 2000
const signals: GateSignal[] = []                                             // מהישן לחדש
const armedMem = new Map<string, { barTime: number; long: boolean; short: boolean }>()
const dayTrades: DayTrade[] = []
let loaded = false
let nextId = 1

function parseWhy(v: unknown): string[] { try { const a = JSON.parse(String(v ?? '[]')); return Array.isArray(a) ? a.map(String) : [] } catch { return [] } }
function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM gate_signals ORDER BY id DESC LIMIT ?').all(KEEP) as Array<Record<string, unknown>>
    for (const r of (rows ?? []).reverse()) {
      signals.push({
        id: Number(r['id']), symbol: String(r['symbol']), dir: r['dir'] === 'short' ? 'short' : 'long', barTime: Number(r['bar_time']), ts: Number(r['ts']), validUntil: Number(r['valid_until']),
        entry: Number(r['entry']), stop: Number(r['stop']), t1: Number(r['t1']), t2: Number(r['t2']), blocked: (r['blocked'] as string | null) ?? null, atr: r['atr'] == null ? null : Number(r['atr']),
        status: (r['status'] as GateSignal['status']) ?? 'open', hit1At: r['hit1_at'] == null ? null : Number(r['hit1_at']), resolvedAt: r['resolved_at'] == null ? null : Number(r['resolved_at']),
        r: r['r'] == null ? null : Number(r['r']), mfe: Number(r['mfe'] ?? 0), mae: Number(r['mae'] ?? 0), ambiguous: !!r['ambiguous'],
        why: parseWhy(r['why']), cvdSrc: r['cvd_src'] === 'bookmap' ? 'bookmap' : 'tv', method: r['method'] === 'mtf' ? 'mtf' : 'v1',
      })
    }
    const since = nyDay(Date.now() - 3 * 86_400_000)
    const trades = db.prepare('SELECT * FROM gate_day_trades WHERE day >= ? ORDER BY id').all(since) as Array<Record<string, unknown>>
    for (const t of trades ?? []) dayTrades.push({ id: Number(t['id']), day: String(t['day']), symbol: String(t['symbol']), ts: Number(t['ts']), result: t['result'] as DayTrade['result'], usd: Number(t['usd']) })
    nextId = Math.max(0, ...signals.map(s => s.id), ...dayTrades.map(t => t.id)) + 1
  } catch { /* אין טבלה (בדיקות) — עובדים מהזיכרון */ }
}
export function clearGate(): void { signals.length = 0; dayTrades.length = 0; armedMem.clear(); flowMem.clear(); loaded = true; nextId = 1 }      // לבדיקות

function persistSignal(s: GateSignal): void {
  try {
    getDb().prepare(`UPDATE gate_signals SET status = ?, hit1_at = ?, resolved_at = ?, r = ?, mfe = ?, mae = ?, ambiguous = ? WHERE id = ?`)
      .run(s.status, s.hit1At, s.resolvedAt, s.r, s.mfe, s.mae, s.ambiguous ? 1 : 0, s.id)
  } catch { /* הזיכרון הוא המקור החי */ }
}

// ─── חוקי היום: לפי העסקאות שהמשתמש מסמן (המערכת לא רואה פקודות) ───
function sizing(rules: GateRules, riskUsd: number) {
  const contracts = Math.max(0, Math.min(rules.maxContracts, Math.floor(riskUsd / (rules.stopPts * rules.pointUsd))))
  const risk = contracts * rules.stopPts * rules.pointUsd
  return { contracts, unit: rules.micro, riskUsd: risk, rewardUsd: risk * rules.rr }
}
export function dayStatus(rules: GateRules, now: number) {
  ensureLoaded()
  const date = nyDay(now)
  const list = dayTrades.filter(t => t.day === date)
  const wins = list.filter(t => t.result === 'win').length; const losses = list.filter(t => t.result === 'loss').length
  const usd = list.reduce((a, t) => a + t.usd, 0)
  const lastLoss = [...list].reverse().find(t => t.result === 'loss')
  const last = list[list.length - 1]
  // צינון רק כשההפסד הוא העסקה האחרונה
  const cooldownLeftMin = lastLoss && last === lastLoss ? Math.max(0, Math.ceil(rules.cooldownMin - (now - lastLoss.ts) / 60_000)) : 0
  let locked: string | null = null
  if (losses >= rules.maxLosses) locked = `נעילה יומית: ${losses} הפסדים היום. חוזרים מחר.`
  else if (usd >= rules.dayTargetUsd) locked = `הגעת ליעד היומי (+${f(usd)}$). עוצרים להיום.`
  else if (list.length >= rules.maxTrades) locked = `הגעת ל-${rules.maxTrades} עסקאות היום.`
  else if (cooldownLeftMin > 0) locked = `צינון אחרי הפסד: עוד ${cooldownLeftMin} דק׳.`
  return { date, trades: list.length, wins, losses, usd, maxTrades: rules.maxTrades, maxLosses: rules.maxLosses, dayTargetUsd: rules.dayTargetUsd, cooldownLeftMin, locked }
}
export function addDayTrade(symbolRaw: string, result: DayTrade['result'], riskUsd = 300, now = Date.now()): DayTrade | null {
  const symbol = normSymbol(symbolRaw); const rules = GATE_RULES[symbol]
  if (!rules) return null
  ensureLoaded()
  const sz = sizing(rules, riskUsd)
  const usd = result === 'win' ? sz.rewardUsd : result === 'loss' ? -sz.riskUsd : 0
  const t: DayTrade = { id: nextId++, day: nyDay(now), symbol, ts: now, result, usd }
  try {
    const info = getDb().prepare('INSERT INTO gate_day_trades (day, symbol, ts, result, usd) VALUES (?, ?, ?, ?, ?)').run(t.day, symbol, now, result, usd) as { lastInsertRowid?: number | bigint } | undefined
    const id = Number(info?.lastInsertRowid); if (id > 0) { t.id = id; nextId = Math.max(nextId, id + 1) }
  } catch { /* נשאר בזיכרון */ }
  dayTrades.push(t)
  return t
}
/** מבטל את העסקה האחרונה שסומנה היום (טעות בלחיצה). */
export function undoDayTrade(now = Date.now()): DayTrade | null {
  ensureLoaded()
  const date = nyDay(now)
  for (let i = dayTrades.length - 1; i >= 0; i--) {
    if (dayTrades[i].day !== date) continue
    const [t] = dayTrades.splice(i, 1)
    try { getDb().prepare('DELETE FROM gate_day_trades WHERE id = ?').run(t.id) } catch { /* זיכרון בלבד */ }
    return t
  }
  return null
}

// ─── בכל סגירת נר דקה: מכריעים איתותים פתוחים, ובודקים אם נדלק ירוק חדש ───
function resolveOpen(snap: StoredSnap, rules: GateRules, now: number): void {
  const hi = snap.hi ?? snap.price; const lo = snap.lo ?? snap.price
  const over = sessionClock(rules, now).over
  for (const s of signals) {
    if (s.symbol !== snap.symbol || s.status !== 'open' || s.barTime >= snap.time) continue
    const long = s.dir === 'long'
    s.mfe = Math.max(s.mfe, long ? hi - s.entry : s.entry - lo)
    s.mae = Math.max(s.mae, long ? s.entry - lo : hi - s.entry)
    const hitStop = long ? lo <= s.stop : hi >= s.stop
    const hitT1 = long ? hi >= s.t1 : lo <= s.t1
    const hitT2 = long ? hi >= s.t2 : lo <= s.t2
    if (hitT1 && !hitStop && s.hit1At == null) s.hit1At = now
    // סטופ ויעד באותו נר: אי אפשר לדעת מה קרה קודם — נרשם כסטופ (שמרני) ומסומן
    if (hitStop) { s.status = 'stop'; s.r = -1; s.ambiguous = hitT2; s.resolvedAt = now }
    else if (hitT2) { s.status = 'target'; s.r = rules.rr; s.resolvedAt = now }
    else if (over || now - s.ts > 8 * 3_600_000) { s.status = 'expired'; s.r = +(((long ? snap.price - s.entry : s.entry - snap.price)) / rules.stopPts).toFixed(2); s.resolvedAt = now }
    persistSignal(s)
  }
}

export function onMinuteSnapshot(snap: StoredSnap, opts: { news?: News | null } = {}, now = snap.receivedAt): GateSignal | null {
  if (snap.tf !== '1m') return null
  const rules = GATE_RULES[snap.symbol]
  if (!rules) return null
  ensureLoaded()
  resolveOpen(snap, rules, now)

  const bars = getBars(snap.symbol, '1m', 3)
  const prevBar = [...bars].reverse().find(b => b.time * 1000 === snap.time - 60_000) ?? null
  const flow = getFlow(snap.symbol, now)?.cvd ?? null
  const htf: HtfSnaps = { s15: getSnap(snap.symbol, '15m'), s5: getSnap(snap.symbol, '5m'), range: recentRange(snap.symbol, snap, rules.roomMin) }
  const conds = { long: evalConditions(snap, 'long', rules, now, prevBar?.close ?? null, flow, htf), short: evalConditions(snap, 'short', rules, now, prevBar?.close ?? null, flow, htf) }
  const now_ = { long: conds.long.every(c => c.ok), short: conds.short.every(c => c.ok) }
  const prev = armedMem.get(snap.symbol)
  if (prev && prev.barTime === snap.time) return null                        // אותו נר הגיע פעמיים
  const wasArmed = (dir: Dir): boolean => {
    if (prev && prev.barTime === snap.time - 60_000) return prev[dir]
    // אין זיכרון רציף (השרת עלה מחדש או שחסר נר): אם הנר הקודם כבר היה בכיוון ומעבר לקצה האזור ההוגן — מניחים שהאיתות כבר ניתן
    if (!prevBar) return false
    const edge = dir === 'long' ? snap.lv['vah'] : snap.lv['val']
    if (edge == null) return false
    return dir === 'long' ? prevBar.close > prevBar.open && prevBar.close > edge : prevBar.close < prevBar.open && prevBar.close < edge
  }
  let made: GateSignal | null = null
  for (const dir of ['long', 'short'] as const) {
    if (!now_[dir] || wasArmed(dir)) continue
    if (signals.some(s => s.symbol === snap.symbol && s.dir === dir && s.barTime === snap.time)) continue
    const long = dir === 'long'; const e = snap.price; const k = long ? 1 : -1
    const news = opts.news ?? null
    // חוקי היום (נעילה, יעד יומי, צינון) לא חוסמים את המדידה: המשתמש רוצה שכל ירוק יירשם וייבדק גם כשהוא לא לוקח עסקאות (19.11.2026)
    const blocked = news && Math.abs(news.inMin) <= rules.newsMin ? `חדשות: ${news.title}` : null
    const sig: GateSignal = {
      id: nextId++, symbol: snap.symbol, dir, barTime: snap.time, ts: now, validUntil: snap.time + 120_000,       // עד סוף הנר השני
      entry: e, stop: e - k * rules.stopPts, t1: e + k * rules.stopPts, t2: e + k * rules.stopPts * rules.rr,
      blocked: blocked ?? null, atr: snap.atr ?? null, status: 'open', hit1At: null, resolvedAt: null, r: null, mfe: 0, mae: 0, ambiguous: false,
      why: conds[dir].map(c => `${c.name}: ${c.detail}`), cvdSrc: flow ? 'bookmap' : 'tv', method: 'mtf',
    }
    try {
      const info = getDb().prepare(`INSERT INTO gate_signals (symbol, dir, bar_time, ts, valid_until, entry, stop, t1, t2, blocked, atr, why, cvd_src, method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(sig.symbol, dir, sig.barTime, sig.ts, sig.validUntil, sig.entry, sig.stop, sig.t1, sig.t2, sig.blocked, sig.atr, JSON.stringify(sig.why), sig.cvdSrc, sig.method) as { lastInsertRowid?: number | bigint } | undefined
      const id = Number(info?.lastInsertRowid); if (id > 0) { sig.id = id; nextId = Math.max(nextId, id + 1) }
    } catch { /* נשאר בזיכרון */ }
    signals.push(sig)
    if (signals.length > KEEP) signals.splice(0, signals.length - KEEP)
    made = sig
  }
  armedMem.set(snap.symbol, { barTime: snap.time, ...now_ })
  return made
}

/** הודעת טלגרם לרגע שהרמזור נדלק ירוק. רק לירוק מלא (לא חסום). טקסט פשוט, בלי תווי Markdown מיוחדים. */
export function gateTelegramText(sig: GateSignal, riskUsd = 300): string | null {
  const rules = GATE_RULES[sig.symbol]
  if (!rules || sig.blocked) return null
  const sz = sizing(rules, riskUsd)
  const until = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(sig.validUntil))
  return [
    `🟢 רמזור כניסה: ${sig.symbol === 'NQ' ? 'נאסד״ק' : sig.symbol} ${DIR_HE[sig.dir]}${sig.method === 'mtf' ? ' (15 דק׳ ← 5 דק׳ ← אישור בדקה)' : ''}`,
    `כניסה ${f(sig.entry)} · סטופ ${f(sig.stop)} (${rules.stopPts} נק׳) · יעד ${f(sig.t2)} (1:${rules.rr})`,
    `${sz.contracts} ${sz.unit} · סיכון ${f(sz.riskUsd)}$ · יעד ${f(sz.rewardUsd)}$`,
    `⏱ תקף לנר הזה בלבד, עד ${until}. אחריו לא רודפים.`,
    ...(sig.atr != null && sig.atr > rules.stopPts ? [`⚠️ יום תנודתי (נר דקה ממוצע כ-${f(Math.round(sig.atr))} נק׳): להוריד כמות חוזים.`] : []),
    sig.cvdSrc === 'bookmap' ? '✅ ה-CVD אושר ב-Bookmap.' : '⚠️ בלי אישור Bookmap (העיניים כבויות או האתר סגור): ה-CVD לפי הערכה של TradingView.',
    'למה:',
    ...sig.why.map(w => `• ${w}`),
    'הכללים מתקיימים עכשיו. זו לא הבטחה לרווח.',
  ].join('\n')
}

// ─── מדד הרמזור: כמה מהירוקים שנשלחו היו טובים וכמה לא ───
// "טוב" = הגיע ליעד 1:2 לפני הסטופ. "לא טוב" = פגע בסטופ. "נסגר" = לא הוכרע עד סוף הסשן (לפי המחיר בסגירה).
// הכניסה לפי מחיר הסגירה של נר האיתות, בלי עמלות והחלקה. ירוקים שנחסמו (חדשות / נעילה) לא נספרים.
function tally(list: GateSignal[], riskUsd: number) {
  const good = list.filter(s => s.status === 'target').length
  const bad = list.filter(s => s.status === 'stop').length
  const closed = list.filter(s => s.status === 'expired').length
  const open = list.filter(s => s.status === 'open').length
  const sumR = +list.reduce((a, s) => a + (s.r ?? 0), 0).toFixed(2)
  return {
    n: list.length, good, bad, closed, open,
    winPct: good + bad > 0 ? Math.round(good / (good + bad) * 100) : null,
    sumR, usd: Math.round(sumR * riskUsd),
    // כמה נגעו ביעד 1:1 לפני הסטופ (אילו היעד היה 1:1)
    hit1: list.filter(s => s.hit1At != null || s.status === 'target').length,
  }
}
/** מה היה קורה ביום הזה אם לוקחים את הירוקים לפי חוקי היום: עסקה אחת בכל פעם, צינון אחרי הפסד, נעילה, מקסימום עסקאות, עצירה ביעד. */
function simulateDay(day: GateSignal[], rules: GateRules, riskUsd: number) {
  let busyUntil = 0; let losses = 0; let usd = 0; let lastLoss = 0
  const taken: GateSignal[] = []
  for (const s of [...day].sort((a, b) => a.ts - b.ts)) {
    if (losses >= rules.maxLosses || taken.length >= rules.maxTrades || usd >= rules.dayTargetUsd) break
    if (s.ts < busyUntil) continue                                   // עסקה קודמת עוד פתוחה
    if (lastLoss && s.ts - lastLoss < rules.cooldownMin * 60_000) continue
    taken.push(s)
    busyUntil = s.resolvedAt ?? Number.MAX_SAFE_INTEGER
    usd += Math.round((s.r ?? 0) * riskUsd)
    if (s.status === 'stop') { losses++; lastLoss = s.resolvedAt ?? s.ts }
  }
  return { ...tally(taken, riskUsd), ids: taken.map(s => s.id) }
}
export function gateScore(symbolRaw: string, riskUsd = 300, now = Date.now()) {
  const symbol = normSymbol(symbolRaw)
  const rules = GATE_RULES[symbol]
  if (!rules) return { supported: false as const, symbol }
  ensureLoaded()
  const sz = sizing(rules, riskUsd)
  const mine = signals.filter(s => s.symbol === symbol)
  const full = mine.filter(s => !s.blocked)
  const group = <K extends string>(key: (s: GateSignal) => K) => {
    const m = new Map<K, GateSignal[]>()
    for (const s of full) { const k = key(s); if (!m.has(k)) m.set(k, []); m.get(k)!.push(s) }
    return [...m.entries()].map(([k, l]) => ({ key: k, ...tally(l, sz.riskUsd) }))
  }
  const ilHour = (ts: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour12: false, hour: '2-digit' }).format(new Date(ts))
  const days = new Map<string, GateSignal[]>()
  for (const s of full) { const d = nyDay(s.ts); if (!days.has(d)) days.set(d, []); days.get(d)!.push(s) }
  return {
    supported: true as const, symbol, serverTs: now,
    rules: { stopPts: rules.stopPts, rr: rules.rr, ...sz, maxTrades: rules.maxTrades, maxLosses: rules.maxLosses, cooldownMin: rules.cooldownMin, dayTargetUsd: rules.dayTargetUsd },
    since: mine.length ? mine[0].ts : null,
    total: tally(full, sz.riskUsd),
    blocked: mine.length - full.length,
    bySource: group(s => s.cvdSrc),
    byMethod: group(s => s.method),
    current: tally(full.filter(s => s.method === 'mtf'), sz.riskUsd),          // השיטה הנוכחית בלבד (15 ← 5 ← 1)
    byDir: group(s => s.dir),
    byVol: group(s => (s.atr != null && s.atr > rules.stopPts ? 'volatile' : 'calm')),
    byHour: group(s => ilHour(s.ts)).sort((a, b) => a.key.localeCompare(b.key)),
    byDay: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, l]) => ({ day, ...tally(l, sz.riskUsd), byRules: simulateDay(l, rules, sz.riskUsd) })),
    list: full.slice(-300).reverse(),
  }
}

// ─── מה שהאתר מציג ───
export interface GateExtras { news?: News | null; riskUsd?: number; optionLevels?: Array<{ name: string; price: number }> }

function bySrc(list: GateSignal[], src: GateSignal['cvdSrc']) {
  const l = list.filter(s => s.cvdSrc === src)
  return { n: l.length, target: l.filter(s => s.status === 'target').length, stop: l.filter(s => s.status === 'stop').length }
}
function logSummary(symbol: string, now: number) {
  const mine = signals.filter(s => s.symbol === symbol)
  const full = mine.filter(s => !s.blocked)
  const count = (st: GateSignal['status']) => full.filter(s => s.status === st).length
  const target = count('target'); const stop = count('stop')
  const resolved = full.filter(s => s.r != null)
  const today = nyDay(now)
  return {
    stats: {
      n: full.length, target, stop, expired: count('expired'), open: count('open'), blocked: mine.length - full.length,
      winPct: target + stop > 0 ? Math.round(target / (target + stop) * 100) : null,
      sumR: +resolved.reduce((a, s) => a + (s.r ?? 0), 0).toFixed(2),
      since: mine.length ? mine[0].ts : null,
      bookmap: bySrc(full, 'bookmap'), tv: bySrc(full, 'tv'),
    },
    recent: mine.slice(-15).reverse(),
    today: mine.filter(s => nyDay(s.ts) === today),
  }
}

export function buildGate(symbolRaw: string, extras: GateExtras = {}, now = Date.now()) {
  const symbol = normSymbol(symbolRaw)
  const rules = GATE_RULES[symbol]
  if (!rules) return { supported: false as const, symbol }
  ensureLoaded()
  const sz = sizing(rules, extras.riskUsd ?? 300)
  const day = dayStatus(rules, now)
  const ses = sessionClock(rules, now)
  const log = logSummary(symbol, now)
  const snap = getSnap(symbol, '1m')
  const dataAgeSec = snap ? Math.max(0, Math.round((now - snap.receivedAt) / 1000)) : null
  const base = {
    supported: true as const, symbol, serverTs: now, dataAgeSec, day, log,
    rules: { stopPts: rules.stopPts, rr: rules.rr, startIl: ses.startIl, newsMin: rules.newsMin, maxEmaDistPts: rules.maxEmaDistPts, cooldownMin: rules.cooldownMin, ...sz },
  }
  const mkPlan = (dir: Dir, entry: number, estimated: boolean) => {
    const k = dir === 'long' ? 1 : -1
    return { dir, entry, stop: entry - k * rules.stopPts, t1: entry + k * rules.stopPts, t2: entry + k * rules.stopPts * rules.rr, stopPts: rules.stopPts, estimated, ...sz }
  }

  // ─── חסימות: גוברות על הכול ───
  const blocks: Array<{ key: string; text: string }> = []
  if (!ses.ok) blocks.push({ key: 'time', text: ses.firstMinutes ? `5 הדקות הראשונות אחרי הפתיחה. מתחילים ב-${ses.startIl}.` : ses.waiting ? `הסשן של ניו יורק עוד לא נפתח. מתחילים ב-${ses.startIl}.` : 'הסשן של ניו יורק סגור.' })
  const news = extras.news ?? null
  if (news && Math.abs(news.inMin) <= rules.newsMin) blocks.push({ key: 'news', text: `חדשות: ${news.title} ${news.inMin >= 0 ? `בעוד ${news.inMin} דק׳` : `לפני ${-news.inMin} דק׳`}.` })

  if (!snap || dataAgeSec == null || dataAgeSec > STALE_SEC) {
    const open = marketState(symbol, now).open
    return {
      ...base, state: 'off' as const, dir: null, headline: open ? 'אין נתונים חיים' : 'השוק סגור',
      missing: !snap ? 'עוד לא הגיע צילום מצב של נר הדקה.' : open ? `צילום המצב האחרון של נר הדקה הגיע לפני ${Math.round(dataAgeSec! / 60)} דק׳. בלי נתון טרי אי אפשר לשפוט.` : null,
      blocks, warnings: [] as string[], conditions: [] as GateCondition[], other: null, plan: null, signal: null,
      flow: { source: 'tv' as const, cvd: null, ageSec: null }, why: [] as string[],
    }
  }

  const bars = getBars(symbol, '1m', 3)
  const prevBar = [...bars].reverse().find(b => b.time * 1000 === snap.time - 60_000) ?? null
  const flow = getFlow(symbol, now)
  const htf: HtfSnaps = { s15: getSnap(symbol, '15m'), s5: getSnap(symbol, '5m'), range: recentRange(symbol, snap, rules.roomMin) }
  const conds = { long: evalConditions(snap, 'long', rules, now, prevBar?.close ?? null, flow?.cvd ?? null, htf), short: evalConditions(snap, 'short', rules, now, prevBar?.close ?? null, flow?.cvd ?? null, htf) }
  const top = dirOf15(htf.s15, now)                      // הכיוון נקבע מלמעלה: גרף 15 הדקות
  const market = (cs: GateCondition[]) => cs.filter(c => c.key !== 'time')
  const okN = (cs: GateCondition[]) => market(cs).filter(c => c.ok).length
  const active = [...signals].reverse().find(s => s.symbol === symbol && s.barTime === snap.time && now <= s.validUntil) ?? null
  const nL = okN(conds.long); const nS = okN(conds.short)
  const dir: Dir | null = active ? active.dir : top ?? (nL > nS ? 'long' : nS > nL ? 'short' : flag(snap, 'long', 'ema12Side') ? 'long' : flag(snap, 'short', 'ema12Side') ? 'short' : null)
  const shown = dir ? conds[dir] : conds.long
  const otherDir: Dir = dir === 'short' ? 'long' : 'short'
  const other = dir ? { dir: otherDir, ok: okN(conds[otherDir]), total: market(conds[otherDir]).length } : null
  const miss = dir ? market(shown).filter(c => !c.ok) : []

  // ─── אזהרות: לא חוסמות, אבל כדאי לדעת ───
  const warnings: string[] = []
  // חוקי היום הם תזכורת בלבד: הרמזור ממשיך להראות ולמדוד ירוקים גם אחרי נעילה או יעד יומי
  if (day.locked) warnings.push(`לפי חוקי היום שלך: ${day.locked} הרמזור ממשיך להראות ולמדוד בכל זאת.`)
  if (snap.atr != null && snap.atr > rules.stopPts) warnings.push(`יום תנודתי: נר דקה ממוצע כ-${f(Math.round(snap.atr))} נק׳, יותר מהסטופ (${rules.stopPts}). להוריד כמות חוזים.`)
  if (dir && flag(snap, otherDir, 'cvdDiv')) warnings.push(`דיברגנס CVD נגד ה${DIR_HE[dir]}: המחיר וה-CVD לא הולכים יחד.`)

  let state: 'red' | 'yellow' | 'green'; let headline: string; let missing: string | null = null
  let plan: ReturnType<typeof mkPlan> | null = null
  if (active && blocks.length === 0) {
    state = 'green'; headline = `עכשיו: ${DIR_HE[active.dir]}`
    plan = { ...mkPlan(active.dir, active.entry, false) }
  } else if (blocks.length) {
    state = 'red'; headline = 'אסור להיכנס'
    missing = active ? 'כל התנאים מתקיימים, אבל יש חסימה.' : null
  } else if (!dir) {
    state = 'red'; headline = 'אין עסקה: אין כיוון'
  } else if (miss.length === 0) {
    state = 'yellow'; headline = `מתקרב: ${DIR_HE[dir]}`
    const last = [...signals].reverse().find(s => s.symbol === symbol && s.dir === dir)
    // הירוק כבר ניתן על המהלך הזה ותוקפו עבר: לא מציגים מחיר כניסה, כדי שלא לרדוף
    missing = last && now - last.ts < 30 * 60_000
      ? `האיתות ניתן ב-${ilClock(last.ts)} ותוקפו פג. לא רודפים: מחכים לתיקון ולנר מומנטום חדש.`
      : 'כל התנאים מתקיימים. מחכים לסגירת נר הדקה הבא.'
  } else if (miss.length === 1 && miss[0].key === 'value' && miss[0].level != null && Math.abs(miss[0].level - snap.price) > rules.stopPts) {
    // [הגדרה] חסר רק הקצה של האזור ההוגן, אבל הוא רחוק יותר מגודל הסטופ: זה עוד לא "מתקרב"
    state = 'red'; headline = 'אין עסקה'
    missing = `חסר: ${miss[0].need}`
  } else if (miss.length === 1) {
    state = 'yellow'; headline = `מתקרב: ${DIR_HE[dir]}`
    missing = `חסר רק: ${miss[0].need}`
    plan = mkPlan(dir, miss[0].key === 'value' && miss[0].level != null ? miss[0].level : snap.price, true)
  } else {
    state = 'red'; headline = 'אין עסקה'
    missing = `חסרים ${miss.length} תנאים ל${DIR_HE[dir]}.`
  }
  if (plan) {
    const lo = Math.min(plan.entry, plan.t2); const hi = Math.max(plan.entry, plan.t2)
    for (const l of extras.optionLevels ?? []) if (l.price > lo && l.price < hi) warnings.push(`${l.name} (${f(l.price)}) נמצא בין הכניסה ליעד.`)
  }
  return {
    ...base, state, dir, headline, missing, blocks, warnings, conditions: dir ? shown : [], other, plan,
    flow: flow ? { source: 'bookmap' as const, cvd: flow.cvd, ageSec: flow.ageSec } : { source: 'tv' as const, cvd: null, ageSec: null },
    why: active ? active.why : [],
    signal: active ? { id: active.id, ts: active.ts, validUntil: active.validUntil, secLeft: Math.max(0, Math.round((active.validUntil - now) / 1000)), blocked: active.blocked } : null,
  }
}
