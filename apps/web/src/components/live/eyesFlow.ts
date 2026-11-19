// כיוון ה-CVD ב-Bookmap, מחושב בדפדפן מהקריאות של העיניים (העוזר המקומי 127.0.0.1:8770).
// המספרים נשארים במחשב הזה. לשרת נשלחת רק מילה אחת: up / down / flat.
import { create } from 'zustand'

export type FlowDir = 'up' | 'down' | 'flat'
export interface EyesFlow {
  running: boolean
  symbol: string | null          // לפי כותרת חלון ה-Bookmap
  cvd: number | null             // ה-CVD עכשיו (חציון 3 קריאות אחרונות)
  ref: number | null             // ה-CVD לפני כמה דקות
  refAgeS: number | null         // לפני כמה שניות נמדד ה-ref
  dir: FlowDir | null            // null = אין מספיק היסטוריה
  ageS: number | null            // גיל הקריאה האחרונה
  sent: boolean                  // האם הכיוון נשלח לשרת בהצלחה לאחרונה
}
export const useEyesFlow = create<EyesFlow>(() => ({ running: false, symbol: null, cvd: null, ref: null, refAgeS: null, dir: null, ageS: null, sent: false }))

export const LOOKBACK_S = 300    // משווים ל-CVD של לפני 5 דקות (כמו "5 נרות דקה")
export const MIN_LOOKBACK_S = 120 // פחות משתי דקות היסטוריה = עוד לא קובעים כיוון
export const FLAT_ABS = 30       // [הגדרה] שינוי של פחות מ-30 חוזים ב-5 דקות = "לא זז לכיוון ברור"

const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN }

/** hist: [זמן בשניות, CVD] מהישן לחדש. מחזיר את הכיוון, או null כשאין מספיק היסטוריה. */
export function cvdDirection(hist: Array<[number, number]>, nowS: number): { dir: FlowDir | null; cvd: number | null; ref: number | null; refAgeS: number | null } {
  const fresh = hist.filter(h => nowS - h[0] <= 420)
  if (fresh.length < 4 || nowS - fresh[fresh.length - 1][0] > 15) return { dir: null, cvd: null, ref: null, refAgeS: null }
  // חציון של 3 הקריאות האחרונות, כדי שקריאת מסך שגויה אחת לא תהפוך את הכיוון
  const cvd = median(fresh.slice(-3).map(h => h[1]))
  // נקודת ההשוואה: הקריאות שסביב "לפני 5 דקות"; אם אין כל כך הרבה היסטוריה — הישנות ביותר (לפחות 2 דקות אחורה)
  const target = nowS - LOOKBACK_S
  let idx = 0
  for (let i = 0; i < fresh.length; i++) if (Math.abs(fresh[i][0] - target) < Math.abs(fresh[idx][0] - target)) idx = i
  const around = fresh.slice(Math.max(0, idx - 1), idx + 2)
  const refTs = around[Math.floor(around.length / 2)][0]
  const refAgeS = Math.round(nowS - refTs)
  if (refAgeS < MIN_LOOKBACK_S) return { dir: null, cvd, ref: null, refAgeS }
  const ref = median(around.map(h => h[1]))
  const d = cvd - ref
  return { dir: Math.abs(d) < FLAT_ABS ? 'flat' : d > 0 ? 'up' : 'down', cvd, ref, refAgeS }
}
