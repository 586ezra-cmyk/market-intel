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
  // Pine Script's Kill Zone state — authoritative (avoids server-time mismatch)
  inKillZoneOverride?: boolean
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

// ATR-based SL buffers per TF (approximate % of price)
const SL_BUFFER_PCT: Record<string, number> = {
  '1m': 0.002, '3m': 0.003, '5m': 0.004, '15m': 0.006,
  '30m': 0.008, '1h': 0.01, '4h': 0.015, '6h': 0.018,
  '12h': 0.02, '1D': 0.025, '1W': 0.04, '1M': 0.06,
}

function calcSL(
  timeframe: Timeframe,
  direction: Direction,
  price: number,
  structure: ReturnType<typeof getLatestStructure>,
): number | null {
  if (!structure) return null
  // Use TF-appropriate buffer — avoids SL being too tight
  const bufferPct = SL_BUFFER_PCT[timeframe] ?? 0.01
  const buffer = price * bufferPct

  // SL must be beyond the structure level (not just at it)
  const rawSL = direction === 'bullish'
    ? Math.min(structure.price, price) - buffer
    : Math.max(structure.price, price) + buffer

  return rawSL
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
  // Use Pine Script's KZ state when available — avoids server-time mismatch
  const inKZ = input.inKillZoneOverride !== undefined ? input.inKillZoneOverride : isInKillZone()
  if (inKZ) score += 0.3
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

  // Gate: require ≥2 factors only — KZ gating is handled by Pine Script (requireKZ param)
  const inKZ = input.inKillZoneOverride !== undefined ? input.inKillZoneOverride : isInKillZone()
  if (factors.length < 2) return null

  const score = calcScore(input)
  const premiumDiscount = calcPremiumDiscount(input.symbol, input.timeframe, input.currentPrice)
  const session = currentSession()
  const structure = getLatestStructure(input.symbol, input.timeframe)

  // TP targets from liquidity engine
  const targets = getNearestLiquidityTargets(input.symbol, input.timeframe, input.direction, input.currentPrice)
  const sl = calcSL(input.timeframe, input.direction, input.currentPrice, structure)

  const context: AlertContext = {
    premiumDiscount,
    inKillZone: inKZ,
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

  const slReason = structure
    ? `מתחת ל-${structure.type} ב-$${structure.price.toLocaleString()} (+ 0.1% buffer)`
    : null

  // ── Build per-factor specific details ──────────────────────────────────────
  const factorDetails: Record<string, any> = {}

  if (input.hasBOSorCHoCH && structure) {
    factorDetails[structure.type] = {
      price: structure.price,
      tf: input.timeframe,
      direction: structure.direction,
      desc: `${structure.type} ב-$${structure.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} על ה-${input.timeframe}`,
    }
  }

  if (input.hasFVG) {
    const fvgs = getActiveFVGs(input.symbol, input.timeframe)
    const matchFVG = fvgs.find(f => f.direction === input.direction) ?? fvgs[0]
    if (matchFVG) {
      factorDetails.FVG = {
        top: matchFVG.topPrice,
        bottom: matchFVG.bottomPrice,
        tf: input.timeframe,
        direction: matchFVG.direction,
        desc: `FVG (${matchFVG.direction === 'bullish' ? 'בולשי' : 'בארשי'}) מ-$${matchFVG.bottomPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })} עד $${matchFVG.topPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })} ב-${input.timeframe}`,
      }
    }
  }

  if (input.hasSMT || input.hasISMT) {
    const smtSignals = getRecentSMTSignals(input.timeframe, 3)
    const latest = smtSignals[0]
    if (latest) {
      factorDetails.SMT = {
        asset1: latest.asset1,
        asset1Price: latest.asset1Price,
        asset2: latest.asset2,
        asset2Price: latest.asset2Price,
        type: latest.type,
        tf: input.timeframe,
        desc: `SMT דיברגנס — ${latest.asset1} ב-$${latest.asset1Price.toLocaleString('en-US', { maximumFractionDigits: 2 })} מול ${latest.asset2} ב-$${latest.asset2Price.toLocaleString('en-US', { maximumFractionDigits: 2 })} על ה-${input.timeframe}`,
      }
    } else {
      factorDetails.SMT = {
        tf: input.timeframe,
        desc: `SMT דיברגנס על ה-${input.timeframe} — נכס מתואם לא אישר את ה-${input.direction === 'bullish' ? 'high' : 'low'} החדש`,
      }
    }
  }

  if (input.hasLiquiditySweep) {
    const liquidity = getActiveLiquidity(input.symbol, input.timeframe)
    const swept = liquidity[0]
    if (swept) {
      factorDetails.LiquiditySweep = {
        price: swept.price,
        type: swept.type,
        tf: input.timeframe,
        desc: `שאיבת נזילות מ-$${swept.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${swept.type}) ב-${input.timeframe} — Stop Losses נשאבו לפני ההיפוך`,
      }
    } else {
      factorDetails.LiquiditySweep = {
        tf: input.timeframe,
        desc: `שאיבת נזילות על ה-${input.timeframe} — המחיר פרץ swing קודם וחזר`,
      }
    }
  }

  if (input.hasOrderBlock) {
    factorDetails.OrderBlock = {
      price: input.currentPrice,
      tf: input.timeframe,
      desc: `Order Block על ה-${input.timeframe} — אזור פקודות מוסדיות סמוך ל-$${input.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    }
  }

  if (input.hasWyckoff && input.wyckoffPhase) {
    factorDetails.Wyckoff = {
      phase: input.wyckoffPhase,
      tf: input.timeframe,
      desc: `Wyckoff — שלב ${input.wyckoffPhase} על ה-${input.timeframe} — כסף חכם ${input.direction === 'bullish' ? 'צובר' : 'מפיץ'}`,
    }
  }

  if (input.hasDoubleTop) {
    factorDetails.DoubleTop = {
      price: input.currentPrice,
      tf: input.timeframe,
      desc: `דאבל טופ על ה-${input.timeframe} — כישלון שני לפרוץ resistance סמוך ל-$${input.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    }
  }

  if (input.hasDoubleBottom) {
    factorDetails.DoubleBottom = {
      price: input.currentPrice,
      tf: input.timeframe,
      desc: `דאבל בוטום על ה-${input.timeframe} — כישלון שני לשבור support סמוך ל-$${input.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    }
  }

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
    entryPrice: input.currentPrice,
    stopLoss: context.stopLoss,
    tp1: context.tp1,
    tp2: context.tp2,
    tp3: context.tp3,
    fvgId: null,
    structureId: structure?.id ?? null,
    tp1Label: context.tp1Label || null,
    tp2Label: context.tp2Label || null,
    tp3Label: context.tp3Label || null,
    r1: context.r1 !== '—' ? context.r1 : null,
    r2: context.r2 !== '—' ? context.r2 : null,
    r3: context.r3 !== '—' ? context.r3 : null,
    slReason,
    factorDetails: Object.keys(factorDetails).length > 0 ? factorDetails : null,
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
