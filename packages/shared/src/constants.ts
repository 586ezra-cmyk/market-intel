import type { Timeframe } from './types'

export const LOW_TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m']
export const HIGH_TIMEFRAMES: Timeframe[] = ['30m', '1h', '4h', '6h', '12h', '1D', '1W', '1M']
export const ALL_TIMEFRAMES: Timeframe[] = [...LOW_TIMEFRAMES, ...HIGH_TIMEFRAMES]

// UTC hours (inclusive start, exclusive end)
export const KILL_ZONES = {
  london: { start: 7, end: 11 },
  ny: { start: 13, end: 16 },
} as const

// Asian session in UTC hours
export const ASIAN_SESSION = { start: 20, end: 24 } // 20:00 prev day – 00:00

export const LAYER_NAMES = [
  'structure',
  'liquidity',
  'fvg',
  'range',
  'killZone',
  'wyckoff',
  'smt',
  'inducement',
  'repricing',
  'session',
] as const

export type LayerName = (typeof LAYER_NAMES)[number]

export const LAYER_LABELS_HE: Record<LayerName, string> = {
  structure: 'מבנה שוק (BOS/CHoCH)',
  liquidity: 'נזילות',
  fvg: 'FVG',
  range: 'טווח עסקאות',
  killZone: 'Kill Zone',
  wyckoff: 'Wyckoff',
  smt: 'SMT',
  inducement: 'פיתוי (Inducement)',
  repricing: 'תמחור מחדש',
  session: 'גבוה/נמוך סשן',
}

// Hebrew labels for directions
export const DIRECTION_HE: Record<string, string> = {
  bullish: 'עולה',
  bearish: 'יורד',
}

export const SESSION_HE: Record<string, string> = {
  asian: 'אסייתי',
  london: 'לונדון',
  ny: 'ניו יורק',
}

export const RECOMMENDATION_HE: Record<string, string> = {
  long: 'בדוק אפשרות כניסה לונג',
  short: 'בדוק אפשרות כניסה שורט',
  neutral: 'המתן לאישור נוסף',
}

export const FACTOR_HE: Record<string, string> = {
  BOS: 'שבירת מבנה (BOS)',
  CHoCH: 'שינוי כיוון (CHoCH)',
  LiquiditySweep: 'שטיפת נזילות',
  FVG: 'פער ערך הוגן (FVG)',
  SMT: 'SMT דיברגנס',
}
