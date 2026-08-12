import type { KlineCandle } from './binanceWebSocket'
import type { LiquidityType, Timeframe } from '@market/shared'
import { upsertLiquidity } from './liquidityEngine'

/**
 * Detects liquidity levels from the candle buffer.
 *
 * The Pine Script only ever emits `liquidity_sweep` — the moment a level is
 * taken — and never registers the levels themselves, so the liquidity table
 * stayed empty. That left `getNearestLiquidityTargets` with nothing to return,
 * which is why every alert had tp1 = null. Detecting levels server-side fills
 * that gap for crypto and futures alike, without touching TradingView.
 */

/** Bars either side of a pivot required to confirm it. */
const PIVOT_LOOKBACK = 2

/** Two extremes within this distance count as an equal high/low cluster. */
const EQUAL_TOLERANCE_PCT = 0.0015   // 0.15%

/** Cap per scan so a single candle cannot flood the table. */
const MAX_LEVELS_PER_SIDE = 6

export interface DetectedLevel {
  type: LiquidityType
  price: number
  time: number
  /** How many extremes formed this level — higher means more stops resting. */
  touches: number
}

/** True when candle[i] is the highest high within PIVOT_LOOKBACK bars either side. */
function isPivotHigh(buf: KlineCandle[], i: number): boolean {
  const h = buf[i].high
  for (let j = i - PIVOT_LOOKBACK; j <= i + PIVOT_LOOKBACK; j++) {
    if (j === i) continue
    if (buf[j].high >= h) return false
  }
  return true
}

function isPivotLow(buf: KlineCandle[], i: number): boolean {
  const l = buf[i].low
  for (let j = i - PIVOT_LOOKBACK; j <= i + PIVOT_LOOKBACK; j++) {
    if (j === i) continue
    if (buf[j].low <= l) return false
  }
  return true
}

/**
 * Collapse nearby extremes into clusters. A cluster of 2+ is an equal high/low
 * — the strongest form of resting liquidity, since stops pile at a level the
 * market has already defended.
 */
function cluster(
  points: Array<{ price: number; time: number }>,
  equalType: LiquidityType,
  singleType: LiquidityType,
): DetectedLevel[] {
  const out: DetectedLevel[] = []
  const used = new Set<number>()

  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue
    const tol = points[i].price * EQUAL_TOLERANCE_PCT
    const group = [points[i]]
    used.add(i)

    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue
      if (Math.abs(points[j].price - points[i].price) <= tol) {
        group.push(points[j])
        used.add(j)
      }
    }

    out.push({
      type: group.length > 1 ? equalType : singleType,
      // Average the cluster so the level sits where the stops actually are
      price: group.reduce((s, p) => s + p.price, 0) / group.length,
      time: Math.max(...group.map(p => p.time)),
      touches: group.length,
    })
  }

  // Prefer clustered (equal) levels — they hold the most liquidity
  return out
    .sort((a, b) => b.touches - a.touches || b.time - a.time)
    .slice(0, MAX_LEVELS_PER_SIDE)
}

/** Find swing- and equal-high/low liquidity in a candle buffer. */
export function detectLevels(buf: KlineCandle[]): DetectedLevel[] {
  if (buf.length < PIVOT_LOOKBACK * 2 + 3) return []

  const highs: Array<{ price: number; time: number }> = []
  const lows:  Array<{ price: number; time: number }> = []

  for (let i = PIVOT_LOOKBACK; i < buf.length - PIVOT_LOOKBACK; i++) {
    if (isPivotHigh(buf, i)) highs.push({ price: buf[i].high, time: buf[i].time })
    if (isPivotLow(buf, i))  lows.push({ price: buf[i].low,  time: buf[i].time })
  }

  return [
    ...cluster(highs, 'equal_highs', 'swing_high'),
    ...cluster(lows,  'equal_lows',  'swing_low'),
  ]
}

/**
 * Previous day/week high and low — the classic external liquidity targets.
 * `buf` must be the 1D or 1W buffer; the final candle is the one in progress.
 */
export function detectPreviousPeriod(
  buf: KlineCandle[],
  period: 'day' | 'week',
): DetectedLevel[] {
  if (buf.length < 2) return []
  const prev = buf[buf.length - 1]   // last CLOSED candle (buffers hold closed only)

  const [hi, lo]: LiquidityType[] = period === 'day' ? ['pdh', 'pdl'] : ['pwh', 'pwl']
  return [
    { type: hi, price: prev.high, time: prev.time, touches: 1 },
    { type: lo, price: prev.low,  time: prev.time, touches: 1 },
  ]
}

/**
 * Liquidity sitting outside the current range is a target the market runs
 * toward; liquidity inside it is fuel that gets swept on the way. Callers use
 * this to pick take-profits (external) versus entries (internal).
 */
export function classifyLevel(
  price: number,
  rangeLow: number,
  rangeHigh: number,
): 'internal' | 'external' {
  return price > rangeHigh || price < rangeLow ? 'external' : 'internal'
}

/**
 * Scan a buffer and persist everything found. Safe to call on every closed
 * candle: upsertLiquidity merges levels within 0.05% instead of inserting.
 */
export function scanAndStoreLiquidity(
  symbol: string,
  timeframe: string,
  buf: KlineCandle[],
  dailyBuf?: KlineCandle[],
  weeklyBuf?: KlineCandle[],
): number {
  const levels = [
    ...detectLevels(buf),
    ...(dailyBuf  ? detectPreviousPeriod(dailyBuf,  'day')  : []),
    ...(weeklyBuf ? detectPreviousPeriod(weeklyBuf, 'week') : []),
  ]

  let stored = 0
  for (const lvl of levels) {
    if (!Number.isFinite(lvl.price) || lvl.price <= 0) continue
    try {
      upsertLiquidity({
        symbol,
        timeframe: timeframe as Timeframe,
        type: lvl.type,
        price: lvl.price,
        firstTime: lvl.time,
      })
      stored++
    } catch {
      // A bad level must not take down candle processing
    }
  }
  return stored
}
