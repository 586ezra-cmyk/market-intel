import type { KlineCandle } from './binanceWebSocket'

/**
 * FVG, market structure and Wyckoff detection from the candle buffer.
 *
 * These three only ever existed in the Pine Script, so they reached NQ/SPX via
 * webhook while crypto — which has no TradingView alert — could never produce
 * them. Deriving them server-side closes that gap without requiring any
 * TradingView change.
 */

export interface PatternResult {
  type: string
  label: string
  emoji: string
  direction: 'bullish' | 'bearish'
  score: number
  detail: string
}

/**
 * Fair Value Gap: a three-candle imbalance where the wicks of candle 1 and 3
 * fail to overlap, leaving a band price never traded through.
 */
export function detectFVG(buf: KlineCandle[]): PatternResult | null {
  if (buf.length < 3) return null
  const [a, b, c] = buf.slice(-3)

  // Bullish: candle 3's low sits above candle 1's high
  if (c.low > a.high) {
    const size = c.low - a.high
    // Ignore gaps too small to trade — noise on low-volatility candles
    if (size / b.close < 0.0005) return null
    return {
      type: 'fvg',
      label: 'FVG — פער מחיר',
      emoji: '🕳',
      direction: 'bullish',
      score: 1.2,
      detail: `פער בין $${a.high.toLocaleString()} ל-$${c.low.toLocaleString()} — לא נסחר`,
    }
  }

  // Bearish: candle 3's high sits below candle 1's low
  if (c.high < a.low) {
    const size = a.low - c.high
    if (size / b.close < 0.0005) return null
    return {
      type: 'fvg',
      label: 'FVG — פער מחיר',
      emoji: '🕳',
      direction: 'bearish',
      score: 1.2,
      detail: `פער בין $${c.high.toLocaleString()} ל-$${a.low.toLocaleString()} — לא נסחר`,
    }
  }

  return null
}

/** Confirmed pivot highs/lows, oldest first. */
function pivots(buf: KlineCandle[], lookback = 2) {
  const highs: Array<{ price: number; i: number }> = []
  const lows:  Array<{ price: number; i: number }> = []

  for (let i = lookback; i < buf.length - lookback; i++) {
    let isHigh = true, isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (buf[j].high >= buf[i].high) isHigh = false
      if (buf[j].low  <= buf[i].low)  isLow  = false
    }
    if (isHigh) highs.push({ price: buf[i].high, i })
    if (isLow)  lows.push({ price: buf[i].low,  i })
  }
  return { highs, lows }
}

/**
 * BOS continues the existing trend; CHoCH is the first break against it.
 * Which one fired is decided by the direction of the preceding swing sequence.
 */
export function detectStructure(buf: KlineCandle[]): PatternResult | null {
  if (buf.length < 20) return null

  const { highs, lows } = pivots(buf.slice(0, -1))
  if (highs.length < 2 || lows.length < 2) return null

  const last = buf[buf.length - 1]
  const lastHigh = highs[highs.length - 1]
  const lastLow  = lows[lows.length - 1]

  // Trend read over three swings where available — two is noisy enough that
  // highs and lows routinely disagree.
  const rising = (arr: Array<{ price: number }>) => {
    const n = arr.length
    if (n >= 3) {
      // Majority of the recent steps pointing the same way
      const steps = [arr[n - 1].price > arr[n - 2].price, arr[n - 2].price > arr[n - 3].price]
      return steps.filter(Boolean).length >= 2
    }
    return arr[n - 1].price > arr[n - 2].price
  }
  const falling = (arr: Array<{ price: number }>) => {
    const n = arr.length
    if (n >= 3) {
      const steps = [arr[n - 1].price < arr[n - 2].price, arr[n - 2].price < arr[n - 3].price]
      return steps.filter(Boolean).length >= 2
    }
    return arr[n - 1].price < arr[n - 2].price
  }

  const uptrend   = rising(highs)  && rising(lows)
  const downtrend = falling(highs) && falling(lows)

  // CHoCH means a break AGAINST an established trend. Deriving it as "not an
  // uptrend" made every indeterminate market — highs rising while lows fall,
  // which is common — resolve to CHoCH, so it outnumbered BOS.

  // Break above the last swing high
  if (last.close > lastHigh.price) {
    const isBOS = !downtrend      // reversal only when a downtrend is in place
    return {
      type: isBOS ? 'bos' : 'choch',
      label: isBOS ? 'BOS — שבירת מבנה' : 'CHoCH — שינוי אופי',
      emoji: '📐',
      direction: 'bullish',
      score: isBOS ? 1.4 : 1.6,
      detail: `נשבר שיא הסווינג ב-$${lastHigh.price.toLocaleString()} · סגירה $${last.close.toLocaleString()}`,
    }
  }

  // Break below the last swing low
  if (last.close < lastLow.price) {
    const isBOS = !uptrend        // reversal only when an uptrend is in place
    return {
      type: isBOS ? 'bos' : 'choch',
      label: isBOS ? 'BOS — שבירת מבנה' : 'CHoCH — שינוי אופי',
      emoji: '📐',
      direction: 'bearish',
      score: isBOS ? 1.4 : 1.6,
      detail: `נשבר שפל הסווינג ב-$${lastLow.price.toLocaleString()} · סגירה $${last.close.toLocaleString()}`,
    }
  }

  return null
}

/**
 * Wyckoff phase from range behaviour and volume.
 *
 * Spring — price pierces the bottom of a established range on high volume and
 * closes back inside: sellers were absorbed, accumulation is ending.
 * UTAD — the mirror image at the top: buyers absorbed, distribution is ending.
 */
export function detectWyckoff(buf: KlineCandle[]): PatternResult | null {
  if (buf.length < 30) return null

  const range = buf.slice(-30, -1)
  const last  = buf[buf.length - 1]

  const rangeHigh = Math.max(...range.map(c => c.high))
  const rangeLow  = Math.min(...range.map(c => c.low))
  const height    = rangeHigh - rangeLow
  if (height <= 0) return null

  // Only meaningful inside a genuine range, not a trend
  if (height / last.close > 0.12) return null

  const avgVol = range.reduce((s, c) => s + c.volume, 0) / range.length
  const highVolume = last.volume > avgVol * 1.5

  // Spring: wick below the range, close back inside
  if (last.low < rangeLow && last.close > rangeLow && highVolume) {
    return {
      type: 'wyckoff',
      label: 'Wyckoff — Spring (סוף צבירה)',
      emoji: '🔵',
      direction: 'bullish',
      score: 1.8,
      detail: `דקירה מתחת ל-$${rangeLow.toLocaleString()} וסגירה בחזרה בטווח, ווליום ×${(last.volume / avgVol).toFixed(1)}`,
    }
  }

  // UTAD: wick above the range, close back inside
  if (last.high > rangeHigh && last.close < rangeHigh && highVolume) {
    return {
      type: 'wyckoff',
      label: 'Wyckoff — UTAD (סוף הפצה)',
      emoji: '🟠',
      direction: 'bearish',
      score: 1.8,
      detail: `דקירה מעל $${rangeHigh.toLocaleString()} וסגירה בחזרה בטווח, ווליום ×${(last.volume / avgVol).toFixed(1)}`,
    }
  }

  return null
}

/**
 * Current Wyckoff phase — always returns one.
 *
 * detectWyckoff only fires on Spring/UTAD, which are rare, so most alerts
 * carried no Wyckoff information at all. Every alert should state where in the
 * cycle price currently sits, independent of whether an event just triggered.
 */
export function classifyWyckoffPhase(buf: KlineCandle[]): {
  phase: 'accumulation' | 'markup' | 'distribution' | 'markdown'
  label: string
  detail: string
} | null {
  if (buf.length < 30) return null

  const recent = buf.slice(-30)
  const last   = recent[recent.length - 1]
  const high   = Math.max(...recent.map(c => c.high))
  const low    = Math.min(...recent.map(c => c.low))
  const height = high - low
  if (height <= 0) return null

  // Where price sits inside the recent range
  const pos = (last.close - low) / height
  // Range width relative to price separates consolidation from trend
  const tight = height / last.close < 0.05

  // Trend over the window: compare the two halves
  const firstHalf = recent.slice(0, 15)
  const lastHalf  = recent.slice(15)
  const avg = (a: KlineCandle[]) => a.reduce((s, c) => s + c.close, 0) / a.length
  const rising = avg(lastHalf) > avg(firstHalf)

  const pct = (n: number) => `${Math.round(n * 100)}%`

  if (tight) {
    // Consolidation — accumulation after a decline, distribution after a rally
    return rising
      ? { phase: 'distribution', label: 'הפצה',
          detail: `דשדוש בראש הטווח (${pct(pos)}) אחרי עלייה — כסף חכם מוכר` }
      : { phase: 'accumulation', label: 'צבירה',
          detail: `דשדוש בתחתית הטווח (${pct(pos)}) אחרי ירידה — כסף חכם קונה` }
  }

  return rising
    ? { phase: 'markup', label: 'עלייה (Markup)',
        detail: `מגמת עלייה, מיקום ${pct(pos)} בטווח` }
    : { phase: 'markdown', label: 'ירידה (Markdown)',
        detail: `מגמת ירידה, מיקום ${pct(pos)} בטווח` }
}

/**
 * SMT — divergence between two correlated assets at SWING level.
 *
 * The previous implementation compared each candle against a running maximum
 * held since process start, so it implemented neither SMT nor iSMT: there was
 * no confirmed pivot and no close-back condition. Worse, the running maximum
 * reset on every deploy, which made how often SMT fired depend on server
 * uptime rather than on the market.
 *
 * A Higher High is a structural event: the latest confirmed swing high sits
 * above the one before it. Bearish SMT is asset A printing that Higher High
 * while asset B fails to.
 */
export function detectSwingSMT(
  bufA: KlineCandle[],
  bufB: KlineCandle[],
  symbolA: string,
  symbolB: string,
): PatternResult | null {
  if (bufA.length < 20 || bufB.length < 20) return null

  const pa = pivots(bufA)
  const pb = pivots(bufB)

  // Two swings on each side of both assets are needed to compare structure
  if (pa.highs.length < 2 || pb.highs.length < 2) return null
  if (pa.lows.length  < 2 || pb.lows.length  < 2) return null

  const aHigh = pa.highs[pa.highs.length - 1], aHighPrev = pa.highs[pa.highs.length - 2]
  const bHigh = pb.highs[pb.highs.length - 1], bHighPrev = pb.highs[pb.highs.length - 2]
  const aLow  = pa.lows[pa.lows.length - 1],   aLowPrev  = pa.lows[pa.lows.length - 2]
  const bLow  = pb.lows[pb.lows.length - 1],   bLowPrev  = pb.lows[pb.lows.length - 2]

  // Only report while the divergence is still fresh — the swing that formed it
  // must be among the most recent candles, or this is old news.
  const fresh = (i: number, len: number) => len - i <= 6

  // Bearish: A made a Higher High, B did not
  if (aHigh.price > aHighPrev.price && bHigh.price <= bHighPrev.price
      && fresh(aHigh.i, bufA.length)) {
    return {
      type: 'smt',
      label: `SMT — ${symbolA} מול ${symbolB}`,
      emoji: '⚡',
      direction: 'bearish',
      score: 1.5,
      detail: `${symbolA} עשה Higher High ($${aHigh.price.toLocaleString()} מעל $${aHighPrev.price.toLocaleString()}) — ${symbolB} לא ($${bHigh.price.toLocaleString()} מול $${bHighPrev.price.toLocaleString()})`,
    }
  }

  // Bullish: A made a Lower Low, B did not
  if (aLow.price < aLowPrev.price && bLow.price >= bLowPrev.price
      && fresh(aLow.i, bufA.length)) {
    return {
      type: 'smt',
      label: `SMT — ${symbolA} מול ${symbolB}`,
      emoji: '⚡',
      direction: 'bullish',
      score: 1.5,
      detail: `${symbolA} עשה Lower Low ($${aLow.price.toLocaleString()} מתחת ל-$${aLowPrev.price.toLocaleString()}) — ${symbolB} לא ($${bLow.price.toLocaleString()} מול $${bLowPrev.price.toLocaleString()})`,
    }
  }

  return null
}
