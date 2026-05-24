export type Timeframe =
  | '1m' | '3m' | '5m' | '15m'
  | '30m' | '1h' | '4h' | '6h' | '12h'
  | '1D' | '1W' | '1M'

export type Direction = 'bullish' | 'bearish'
export type TFClass = 'low' | 'high'
export type AlertFactor = 'BOS' | 'CHoCH' | 'LiquiditySweep' | 'FVG' | 'SMT' | 'DoubleTop' | 'DoubleBottom' | 'Wyckoff' | 'OrderBlock'
export type Session = 'asian' | 'london' | 'ny'
export type Recommendation = 'long' | 'short' | 'neutral'
export type PremiumDiscount = 'premium' | 'discount' | 'midpoint'

export type LiquidityType =
  | 'equal_highs' | 'equal_lows'
  | 'swing_high' | 'swing_low'
  | 'session_high' | 'session_low'
  | 'pdh' | 'pdl'
  | 'pwh' | 'pwl'
  | 'pmh' | 'pml'

export interface FVG {
  id: string
  symbol: string
  timeframe: Timeframe
  direction: Direction
  topPrice: number
  bottomPrice: number
  midPrice: number
  candleTime: number
  isActive: boolean
  filledAt: number | null
  inPremium: boolean
  nearLiquidity: boolean
  inKillZone: boolean
  structureRef: string | null
  createdAt: number
}

export interface Structure {
  id: string
  symbol: string
  timeframe: Timeframe
  type: 'BOS' | 'CHoCH'
  direction: Direction
  price: number
  time: number
  confirmed: boolean
  createdAt: number
}

export interface Range {
  id: string
  symbol: string
  timeframe: Timeframe
  tfClass: TFClass
  rangeType: 'session' | 'swing'
  high: number
  low: number
  midpoint: number
  startTime: number
  endTime: number | null
  isActive: boolean
  session: Session | null
}

export interface Liquidity {
  id: string
  symbol: string
  timeframe: Timeframe
  type: LiquidityType
  price: number
  touchCount: number
  firstTime: number
  lastTime: number
  swept: boolean
  sweptAt: number | null
  createdAt: number
}

export interface SMTSignal {
  id: string
  timeframe: Timeframe
  time: number
  asset1: string
  asset2: string
  type: 'bearish_smt' | 'bullish_smt'
  asset1Price: number
  asset2Price: number
  createdAt: number
}

export interface Alert {
  id: string
  symbol: string
  timeframe: Timeframe
  triggeredAt: number
  factors: AlertFactor[]
  score?: number
  direction?: Direction
  recommendation: Recommendation
  premiumDiscount: PremiumDiscount
  session: string
  inKillZone: boolean
  messageHe: string
  stopLoss?: number | null
  tp1?: number | null
  tp2?: number | null
  tp3?: number | null
  sent: boolean
  fvgId: string | null
  structureId: string | null
  userRating?: number | null   // 1–5 stars, set by user after the fact
  userOutcome?: 'win' | 'loss' | 'be' | null  // W / L / Break-Even
  userNotes?: string | null
  createdAt: number
}

export interface WyckoffPhase {
  id: string
  symbol: string
  timeframe: Timeframe
  phase: 'accumulation' | 'markup' | 'distribution' | 'markdown'
  startTime: number
  endTime: number | null
  confidence: number
  createdAt: number
}

export interface Inducement {
  id: string
  symbol: string
  timeframe: Timeframe
  direction: Direction
  trapPrice: number
  sweepPrice: number
  time: number
  createdAt: number
}

export interface Repricing {
  id: string
  symbol: string
  timeframe: Timeframe
  direction: Direction
  zoneTop: number
  zoneBottom: number
  startTime: number
  createdAt: number
}

export interface SessionHL {
  id: string
  symbol: string
  timeframe: Timeframe
  session: Session
  high: number
  low: number
  date: string
  createdAt: number
}

// WebSocket message types sent from server to browser
export type WSMessage =
  | { type: 'ping'; payload: { time: number } }
  | { type: 'fvg'; payload: FVG }
  | { type: 'fvg_filled'; payload: { id: string; filledAt: number } }
  | { type: 'structure'; payload: Structure }
  | { type: 'liquidity'; payload: Liquidity }
  | { type: 'liquidity_swept'; payload: { id: string; sweptAt: number } }
  | { type: 'range'; payload: Range }
  | { type: 'smt'; payload: SMTSignal }
  | { type: 'alert'; payload: Alert }
  | { type: 'wyckoff'; payload: WyckoffPhase }
  | { type: 'inducement'; payload: Inducement }
  | { type: 'repricing'; payload: Repricing }
  | { type: 'session_hl'; payload: SessionHL }
