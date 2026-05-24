import type { Alert, AlertFactor, Direction, Timeframe, PremiumDiscount, Recommendation } from '@market/shared'
import { isInKillZone, currentSession } from '../utils/timeframe'
import { getActiveRange } from './rangeEngine'
import { getLatestStructure } from './structureEngine'
import { getActiveFVGs } from './fvgEngine'
import { getActiveLiquidity, getNearestLiquidityTargets } from './liquidityEngine'
import { getRecentSMTSignals } from './smtEngine'
import { saveAlert } from './alertDispatcher'

// TF base scores for alert rating
const TF_BASE_SCORE: Record<string, number> = {
  '1M': 5.0, '1W': 4.5, '1D': 4.0,
  '4h': 3.0, '1h': 2.5, '30m': 2.0,
  '15m': 1.5, '5m': 1.0, '3m': 0.8, '1m': 0.5,
}

// Cascade scan TF order (highest to lowest)
const CASCADE_ORDER: Timeframe[] = ['1M', '1W', '1D', '4h', '6h', '12h', '1h', '30m', '15m', '5m', '3m', '1m']

function getTFsBelow(timeframe: Timeframe): Timeframe[] {
  const idx = CASCADE_ORDER.indexOf(timeframe)
  if (idx === -1) return []
  return CASCADE_ORDER.slice(idx + 1)
}

export interface ConfluenceInput {
  symbol: string
  timeframe: Timeframe
  direction: Direction
  currentPrice: number
  time: number
  hasBOSorCHoCH: boolean
  hasLiquiditySweep: boolean
  hasFVG: boolean
  hasSMT: boolean
  hasISMT?: boolean
  hasWyckoff?: boolean
  wyckoffPhase?: string
  hasDoubleTop?: boolean
  hasDoubleBottom?: boolean
  hasOrderBlock?: boolean
  // Optional: confirmations from higher TFs
  higherTFConfirmations?: Timeframe[]
}

export interface AlertContext {
  premiumDiscount: 'premium' | 'discount' | 'midpoint' | null
  inKillZone: boolean
  session: string
  stopLoss: number | null
  tp1: number | null
  tp2: number | null
  tp3: number | null
  tp1Label: string
  tp2Label: string
  tp3Label: string
  r1: string
  r2: string
  r3: string
}

function calcPremiumDiscount(
  symbol: string,
  timeframe: Timeframe,
  price: number,
): 'premium' | 'discount' | 'midpoint' | null {
  const range = getActiveRange(symbol, timeframe)
  if (!range) return null
  if (price > range.midpoint) return 'premium'
  if (price < range.midpoint) return 'discount'
  return 'midpoint'
}

function calcSL(
  timeframe: Timeframe,
  direction: Direction,
  price: number,
  structure: ReturnType<typeof getLatestStructure>,
): number | null {
  if (!structure) return null
  const buffer = price * 0.001 // 0.1% buffer

  if (direction === 'bullish') {
    return structure.price - buffer
  } else {
    return structure.price + buffer
  }
}

function calcRR(entry: number, sl: number | null, tp: number | null): string {
  if (!sl || !tp) return '—'
  const risk = Math.abs(entry - sl)
  if (risk === 0) return '—'
  const reward = Math.abs(tp - entry)
  return `1:${(reward / risk).toFixed(1)}`
}

function buildHebrewMessage(
  input: ConfluenceInput,
  score: number,
  factors: AlertFactor[],
  context: AlertContext,
): string {
  const dirHe = input.direction === 'bullish' ? 'לונג 🟢' : 'שורט 🔴'
  const sessionHe = {
    'asian': 'אסייה',
    'london': 'לונדון',
    'ny': 'ניו יורק',
    'off-session': 'מחוץ לסשן',
  }[context.session] ?? context.session

  const premiumHe = context.premiumDiscount === 'premium' ? 'Premium (מעל אמצע)' :
                    context.premiumDiscount === 'discount' ? 'Discount (מתחת לאמצע)' :
                    context.premiumDiscount === 'midpoint' ? 'Midpoint (מרכז הטווח)' : 'לא ידוע'

  const factorHe: Record<AlertFactor, string> = {
    BOS: 'שבירת מבנה (BOS)',
    CHoCH: 'שינוי כיוון (CHoCH)',
    LiquiditySweep: 'שאיבת נזילות',
    FVG: 'FVG פעיל',
    SMT: 'SMT (דיברגנס)',
    DoubleTop: 'דאבל טופ 🔴',
    DoubleBottom: 'דאבל בוטום 🟢',
    Wyckoff: 'Wyckoff',
    OrderBlock: 'Order Block',
  }

  const factorsText = factors.map(f => factorHe[f]).join(', ')
  const killZoneText = context.inKillZone ? `✅ ${sessionHe} Kill Zone` : `⬜ מחוץ ל-Kill Zone`

  let msg = `🔔 *התראה חשובה בשוק*\n\n`
  msg += `נכס: \`${input.symbol}\` | טווח זמן: ${input.timeframe}\n`
  msg += `כיוון: ${dirHe} | דירוג: ${score.toFixed(1)}/10\n\n`
  msg += `📋 אירועים: ${factorsText}\n`
  msg += `⏰ הקשר: ${premiumHe} | ${killZoneText}\n\n`

  if (input.wyckoffPhase) {
    msg += `🌊 Wyckoff: ${input.wyckoffPhase}\n`
  }

  if (context.stopLoss) {
    msg += `\n🎯 *יעדים מומלצים:*\n`
    msg += `   SL:  $${context.stopLoss.toLocaleString()}\n`
    if (context.tp1) msg += `   TP1: $${context.tp1.toLocaleString()} (${context.tp1Label}) — R:R ${context.r1}\n`
    if (context.tp2) msg += `   TP2: $${context.tp2.toLocaleString()} (${context.tp2Label}) — R:R ${context.r2}\n`
    if (context.tp3) msg += `   TP3: $${context.tp3.toLocaleString()} (${context.tp3Label}) — R:R ${context.r3}\n`
  }

  const recHe = input.direction === 'bullish'
    ? 'בדוק אפשרות כניסה לונג בהמתנה לאישור'
    : 'בדוק אפשרות כניסה שורט בהמתנה לאישור'
  msg += `\n💡 המלצה: ${recHe}`

  return msg
}

function calcScore(input: ConfluenceInput): number {
  let score = TF_BASE_SCORE[input.timeframe] ?? 1.0

  // Multi-TF synergy bonus
  const confirmations = input.higherTFConfirmations?.length ?? 0
  if (confirmations === 1) score += 1.0
  else if (confirmations === 2) score += 2.5
  else if (confirmations >= 3) score += 4.0

  // Internal confluence bonuses
  if (input.hasFVG) score += 0.3
  if (input.hasBOSorCHoCH) score += 0.3
  if (input.hasLiquiditySweep) score += 0.3
  if (isInKillZone()) score += 0.3
  if (input.hasSMT || input.hasISMT) score += 0.4
  if (input.hasWyckoff) score += 0.5
  if (input.hasDoubleTop || input.hasDoubleBottom) score += 0.3
  if (input.hasOrderBlock) score += 0.3

  const range = getActiveRange(input.symbol, input.timeframe)
  if (range) score += 0.2 // Dealing Range context available

  return Math.min(score, 10)
}

/**
 * Main confluence gate.
 * Requires: ≥2 factors AND in Kill Zone.
 * Returns the created Alert or null if conditions not met.
 */
export async function evaluateConfluence(input: ConfluenceInput): Promise<Alert | null> {
  const factors: AlertFactor[] = []

  if (input.hasBOSorCHoCH) {
    const latest = getLatestStructure(input.symbol, input.timeframe)
    if (latest) factors.push(latest.type as AlertFactor)
  }
  if (input.hasLiquiditySweep) factors.push('LiquiditySweep')
  if (input.hasFVG) factors.push('FVG')
  if (input.hasSMT || input.hasISMT) factors.push('SMT')
  if (input.hasDoubleTop && input.direction === 'bearish') factors.push('DoubleTop')
  if (input.hasDoubleBottom && input.direction === 'bullish') factors.push('DoubleBottom')
  if (input.hasOrderBlock) factors.push('OrderBlock')
  if (input.hasWyckoff) factors.push('Wyckoff')

  // Gate: require ≥2 factors AND kill zone
  if (factors.length < 2 || !isInKillZone()) return null

  const score = calcScore(input)
  const premiumDiscount = calcPremiumDiscount(input.symbol, input.timeframe, input.currentPrice)
  const session = currentSession()
  const structure = getLatestStructure(input.symbol, input.timeframe)

  // TP targets from liquidity engine
  const targets = getNearestLiquidityTargets(input.symbol, input.timeframe, input.direction, input.currentPrice)
  const sl = calcSL(input.timeframe, input.direction, input.currentPrice, structure)

  const context: AlertContext = {
    premiumDiscount,
    inKillZone: true,
    session,
    stopLoss: sl,
    tp1: targets.tp1?.price ?? null,
    tp2: targets.tp2?.price ?? null,
    tp3: targets.tp3?.price ?? null,
    tp1Label: targets.tp1 ? `נזילות פנימית — ${targets.tp1.type}` : '',
    tp2Label: targets.tp2 ? `נזילות חיצונית — ${targets.tp2.type}` : '',
    tp3Label: targets.tp3 ? `נזילות חיצונית — ${targets.tp3.type}` : '',
    r1: calcRR(input.currentPrice, sl, targets.tp1?.price ?? null),
    r2: calcRR(input.currentPrice, sl, targets.tp2?.price ?? null),
    r3: calcRR(input.currentPrice, sl, targets.tp3?.price ?? null),
  }

  const messageHe = buildHebrewMessage(input, score, factors, context)

  const alert = await saveAlert({
    symbol: input.symbol,
    timeframe: input.timeframe,
    triggeredAt: input.time,
    factors,
    score,
    direction: input.direction,
    recommendation: (input.direction === 'bullish' ? 'long' : 'short') as Recommendation,
    premiumDiscount: (context.premiumDiscount ?? 'midpoint') as PremiumDiscount,
    session: context.session,
    inKillZone: context.inKillZone,
    messageHe,
    stopLoss: context.stopLoss,
    tp1: context.tp1,
    tp2: context.tp2,
    tp3: context.tp3,
    fvgId: null,
    structureId: structure?.id ?? null,
  })

  return alert
}

/**
 * Cascade scan: check all TFs below the given TF for confluence signals.
 * Returns a summary of findings.
 */
export function cascadeScan(
  symbol: string,
  timeframe: Timeframe,
  direction: Direction,
): Record<Timeframe, { hasFVG: boolean; hasStructure: boolean; hasLiquidity: boolean }> {
  const lowerTFs = getTFsBelow(timeframe)
  const result: Record<string, { hasFVG: boolean; hasStructure: boolean; hasLiquidity: boolean }> = {}

  for (const tf of lowerTFs) {
    const fvgs = getActiveFVGs(symbol, tf)
    const structure = getLatestStructure(symbol, tf)
    const liquidity = getActiveLiquidity(symbol, tf)

    result[tf] = {
      hasFVG: fvgs.some(f => f.direction === direction),
      hasStructure: structure !== null,
      hasLiquidity: liquidity.length > 0,
    }
  }

  return result as Record<Timeframe, { hasFVG: boolean; hasStructure: boolean; hasLiquidity: boolean }>
}
