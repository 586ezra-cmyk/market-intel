import { fetchCandles, type Candle } from './binanceService'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TFAnalysis {
  timeframe: string
  trend: 'bullish' | 'bearish' | 'neutral'
  currentPrice: number
  structures: Array<{ type: 'BOS' | 'CHoCH'; direction: 'bullish' | 'bearish'; price: number }>
  fvgs: Array<{ direction: 'bullish' | 'bearish'; top: number; bottom: number }>
  liquiditySweep: boolean
  equalHighs: number[]
  equalLows: number[]
  dealingRange: { high: number; low: number; mid: number; position: 'premium' | 'discount' | 'mid' } | null
  killZone: { active: boolean; session: string | null }
  iSMT: { detected: boolean; direction: 'bullish' | 'bearish' } | null
  wyckoff: { phase: string; spring: boolean; upthrust: boolean } | null
  wingBreak: { detected: boolean; inPhaseD: boolean; hasRetest: boolean; bosConfirmed: boolean } | null
  wPattern: { detected: boolean; confirmed: boolean } | null
  mPattern: { detected: boolean; confirmed: boolean } | null
  doubleTop: { detected: boolean; price: number } | null
  doubleBottom: { detected: boolean; price: number } | null
  score: number
}

export interface FullAnalysis {
  symbol: string
  analyzedAt: number
  currentPrice: number
  overallDirection: 'bullish' | 'bearish' | 'neutral'
  overallScore: number
  timeframes: TFAnalysis[]
  strategies: Array<{ name: string; confidence: number; details: string }>
  recommendation: string
  nextLevels: { tp1: number | null; tp2: number | null; tp3: number | null; sl: number | null }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEFRAMES = ['1M', '1W', '1D', '4h', '1h', '30m', '15m', '5m', '3m', '1m'] as const

const TF_BASE_SCORE: Record<string, number> = {
  '1M': 5.0, '1W': 4.5, '1D': 4.0, '4h': 3.0,
  '1h': 2.5, '30m': 2.0, '15m': 1.5, '5m': 1.0, '3m': 0.8, '1m': 0.5,
}

const LOW_TF_SET = new Set(['1m', '3m', '5m', '15m'])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0
  let sum = 0
  for (let i = candles.length - period; i < candles.length; i++) {
    const prev = candles[i - 1].close
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev),
      Math.abs(candles[i].low - prev),
    )
    sum += tr
  }
  return sum / period
}

interface PivotResult {
  highs: Array<{ index: number; price: number }>
  lows: Array<{ index: number; price: number }>
}

function findPivots(candles: Candle[], lookback = 3): PivotResult {
  const highs: Array<{ index: number; price: number }> = []
  const lows: Array<{ index: number; price: number }> = []

  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i]
    let isHigh = true
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].high >= c.high) isHigh = false
      if (candles[j].low <= c.low) isLow = false
    }
    if (isHigh) highs.push({ index: i, price: c.high })
    if (isLow)  lows.push({ index: i, price: c.low })
  }

  return { highs, lows }
}

// ─── Per-timeframe analysis ────────────────────────────────────────────────────

function analyzeTF(
  tf: string,
  candles: Candle[],
  ethCandles: Candle[] | null,
  symbol: string,
): Omit<TFAnalysis, 'score'> {
  const last = candles[candles.length - 1]
  const currentPrice = last.close
  const atr = calcATR(candles)
  const { highs: pivotHighs, lows: pivotLows } = findPivots(candles)

  // ── Market structure ──────────────────────────────────────────────────────
  const structures: TFAnalysis['structures'] = []
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral'
  let lastSwingHigh = pivotHighs.length > 0 ? pivotHighs[pivotHighs.length - 1].price : 0
  let lastSwingLow  = pivotLows.length  > 0 ? pivotLows[pivotLows.length - 1].price : Infinity

  // Determine trend from last few swings
  if (pivotHighs.length >= 2 && pivotLows.length >= 2) {
    const ph = pivotHighs.slice(-2)
    const pl = pivotLows.slice(-2)
    if (ph[1].price > ph[0].price && pl[1].price > pl[0].price) trend = 'bullish'
    else if (ph[1].price < ph[0].price && pl[1].price < pl[0].price) trend = 'bearish'
  }

  // Check for BOS / CHoCH on recent candles
  const recentStart = Math.max(0, candles.length - 30)
  for (let i = recentStart + 1; i < candles.length; i++) {
    const c = candles[i]
    if (lastSwingHigh > 0 && c.close > lastSwingHigh) {
      const type = trend === 'bullish' ? 'BOS' : 'CHoCH'
      structures.push({ type, direction: 'bullish', price: lastSwingHigh })
      trend = 'bullish'
      // Update lastSwingHigh after break
      const newHigh = pivotHighs.filter(h => h.index < i).slice(-1)[0]
      if (newHigh) lastSwingHigh = newHigh.price
    }
    if (lastSwingLow < Infinity && c.close < lastSwingLow) {
      const type = trend === 'bearish' ? 'BOS' : 'CHoCH'
      structures.push({ type, direction: 'bearish', price: lastSwingLow })
      trend = 'bearish'
      const newLow = pivotLows.filter(l => l.index < i).slice(-1)[0]
      if (newLow) lastSwingLow = newLow.price
    }
  }

  // ── FVGs ─────────────────────────────────────────────────────────────────
  const fvgs: TFAnalysis['fvgs'] = []
  const lookbackFVG = Math.max(0, candles.length - 20)
  for (let i = lookbackFVG + 2; i < candles.length; i++) {
    const body = Math.abs(candles[i - 1].close - candles[i - 1].open)
    if (body < 1.5 * atr) continue

    // Bullish FVG: i's low > (i-2)'s high
    if (candles[i].low > candles[i - 2].high) {
      // Check not filled (price hasn't revisited)
      const top = candles[i].low
      const bottom = candles[i - 2].high
      const filled = candles.slice(i + 1).some(c => c.low <= bottom)
      if (!filled) fvgs.push({ direction: 'bullish', top, bottom })
    }
    // Bearish FVG: i's high < (i-2)'s low
    if (candles[i].high < candles[i - 2].low) {
      const top    = candles[i - 2].low
      const bottom = candles[i].high
      const filled = candles.slice(i + 1).some(c => c.high >= top)
      if (!filled) fvgs.push({ direction: 'bearish', top, bottom })
    }
  }

  // ── Liquidity ────────────────────────────────────────────────────────────
  const last20 = candles.slice(-20)
  const equalHighs: number[] = []
  const equalLows: number[]  = []
  let liquiditySweep = false

  for (let i = 0; i < last20.length - 1; i++) {
    for (let j = i + 1; j < last20.length; j++) {
      const hiDiff = Math.abs(last20[i].high - last20[j].high) / last20[i].high
      const loDiff = Math.abs(last20[i].low - last20[j].low) / last20[i].low
      if (hiDiff < 0.0005) equalHighs.push(last20[i].high)
      if (loDiff < 0.0005) equalLows.push(last20[i].low)
    }
  }

  // Sweep: wick exceeds equal high but closes below
  for (const level of equalHighs) {
    const swept = last20.some(c => c.high > level && c.close < level)
    if (swept) { liquiditySweep = true; break }
  }
  if (!liquiditySweep) {
    for (const level of equalLows) {
      const swept = last20.some(c => c.low < level && c.close > level)
      if (swept) { liquiditySweep = true; break }
    }
  }

  // ── Kill Zone ────────────────────────────────────────────────────────────
  const nowHour = new Date().getUTCHours()
  let killZone: TFAnalysis['killZone'] = { active: false, session: null }
  if (nowHour >= 7 && nowHour < 11)  killZone = { active: true, session: 'London' }
  else if (nowHour >= 13 && nowHour < 16) killZone = { active: true, session: 'NY' }
  else if (nowHour >= 20 || nowHour < 4)  killZone = { active: true, session: 'Asian' }

  // ── Dealing Range ─────────────────────────────────────────────────────────
  let dealingRange: TFAnalysis['dealingRange'] = null
  if (LOW_TF_SET.has(tf)) {
    // Asian session high/low: 20–4 UTC
    const asianCandles = candles.slice(-96).filter(c => {
      const h = new Date(c.time * 1000).getUTCHours()
      return h >= 20 || h < 4
    })
    if (asianCandles.length > 0) {
      const high = Math.max(...asianCandles.map(c => c.high))
      const low  = Math.min(...asianCandles.map(c => c.low))
      const mid  = (high + low) / 2
      dealingRange = {
        high, low, mid,
        position: currentPrice > mid ? 'premium' : currentPrice < mid ? 'discount' : 'mid',
      }
    }
  } else {
    // Last pivot high/low
    if (pivotHighs.length > 0 && pivotLows.length > 0) {
      const high = pivotHighs[pivotHighs.length - 1].price
      const low  = pivotLows[pivotLows.length - 1].price
      const mid  = (high + low) / 2
      dealingRange = {
        high, low, mid,
        position: currentPrice > mid ? 'premium' : currentPrice < mid ? 'discount' : 'mid',
      }
    }
  }

  // ── iSMT ─────────────────────────────────────────────────────────────────
  let iSMT: TFAnalysis['iSMT'] = null
  const isCrypto = /BTC|ETH/i.test(symbol)
  if (isCrypto && ethCandles && ethCandles.length >= 2 && candles.length >= 2) {
    const prevBTC = candles[candles.length - 2]
    const curBTC  = candles[candles.length - 1]
    const prevETH = ethCandles[ethCandles.length - 2]
    const curETH  = ethCandles[ethCandles.length - 1]

    const bearISMT = curBTC.high > prevBTC.high && curBTC.close < prevBTC.high && !(curETH.high > prevETH.high)
    const bullISMT = curBTC.low < prevBTC.low   && curBTC.close > prevBTC.low  && !(curETH.low < prevETH.low)

    if (bearISMT) iSMT = { detected: true, direction: 'bearish' }
    else if (bullISMT) iSMT = { detected: true, direction: 'bullish' }
  }

  // ── W/M patterns ─────────────────────────────────────────────────────────
  let wPattern: TFAnalysis['wPattern'] = null
  let mPattern: TFAnalysis['mPattern'] = null

  if (pivotLows.length >= 3) {
    const recentLows = pivotLows.slice(-3)
    const lo1 = recentLows[0].price
    const lo2 = recentLows[2].price
    const bounce = recentLows[1] // middle bounce — check that it's a pivot HIGH between the two lows
    const diffPct = Math.abs(lo1 - lo2) / lo1
    if (diffPct < 0.002) {
      const confirmed =
        fvgs.some(f => f.direction === 'bullish') ||
        (iSMT?.direction === 'bullish' && iSMT.detected)
      wPattern = { detected: true, confirmed }
    }
  }

  if (pivotHighs.length >= 3) {
    const recentHighs = pivotHighs.slice(-3)
    const hi1 = recentHighs[0].price
    const hi2 = recentHighs[2].price
    const diffPct = Math.abs(hi1 - hi2) / hi1
    if (diffPct < 0.002) {
      const confirmed =
        fvgs.some(f => f.direction === 'bearish') ||
        (iSMT?.direction === 'bearish' && iSMT.detected)
      mPattern = { detected: true, confirmed }
    }
  }

  // ── Double Top / Bottom ───────────────────────────────────────────────────
  let doubleTop: TFAnalysis['doubleTop'] = null
  let doubleBottom: TFAnalysis['doubleBottom'] = null

  if (pivotHighs.length >= 2) {
    const hi1 = pivotHighs[pivotHighs.length - 2].price
    const hi2 = pivotHighs[pivotHighs.length - 1].price
    if (Math.abs(hi1 - hi2) / hi1 < 0.001) {
      doubleTop = { detected: true, price: (hi1 + hi2) / 2 }
    }
  }
  if (pivotLows.length >= 2) {
    const lo1 = pivotLows[pivotLows.length - 2].price
    const lo2 = pivotLows[pivotLows.length - 1].price
    if (Math.abs(lo1 - lo2) / lo1 < 0.001) {
      doubleBottom = { detected: true, price: (lo1 + lo2) / 2 }
    }
  }

  // ── Wyckoff ───────────────────────────────────────────────────────────────
  let wyckoff: TFAnalysis['wyckoff'] = null
  const last50 = candles.slice(-50)
  if (last50.length >= 20) {
    const maxH = Math.max(...last50.map(c => c.high))
    const minL = Math.min(...last50.map(c => c.low))
    const range50 = maxH - minL
    const rangePct = range50 / currentPrice

    // Sideways = small range relative to price
    const isSideways = rangePct < 0.05

    // Determine prior trend from first half vs second half
    const firstHalf  = last50.slice(0, 25)
    const secondHalf = last50.slice(25)
    const firstClose  = firstHalf[firstHalf.length - 1].close
    const secondClose = secondHalf[secondHalf.length - 1].close
    const priorDown = secondClose < firstClose * 0.98
    const priorUp   = secondClose > firstClose * 1.02

    let phase = 'N/A'
    let spring = false
    let upthrust = false

    if (priorDown && isSideways) phase = 'Accumulation'
    else if (priorUp && isSideways) phase = 'Distribution'

    // Spring: last candle has low wick below recent lows, closes back inside, low volume
    const avgVol = last50.reduce((s, c) => s + c.volume, 0) / last50.length
    const lastC = last50[last50.length - 1]
    const recentLow = Math.min(...last50.slice(-10, -1).map(c => c.low))
    const recentHigh = Math.max(...last50.slice(-10, -1).map(c => c.high))

    if (lastC.low < recentLow && lastC.close > recentLow && lastC.volume < avgVol * 0.8) {
      spring = true
    }
    if (lastC.high > recentHigh && lastC.close < recentHigh && lastC.volume < avgVol * 0.8) {
      upthrust = true
    }

    if (phase !== 'N/A' || spring || upthrust) {
      wyckoff = { phase, spring, upthrust }
    }
  }

  // ── Wing Break (שבירת כנף) ─────────────────────────────────────────────────
  let wingBreak: TFAnalysis['wingBreak'] = null
  const inPhaseD = wyckoff?.phase === 'Distribution'
  if (inPhaseD && pivotLows.length >= 3) {
    // Check for higher lows sequence (upward trendline in dist. phase)
    const recentPivotLows = pivotLows.slice(-4)
    let higherLowsCount = 0
    for (let i = 1; i < recentPivotLows.length; i++) {
      if (recentPivotLows[i].price > recentPivotLows[i - 1].price) higherLowsCount++
    }
    const hasWing = higherLowsCount >= 2

    if (hasWing && recentPivotLows.length >= 2) {
      const lastHL = recentPivotLows[recentPivotLows.length - 2].price
      const wingBroken = last.close < lastHL

      // Retest: price came back up after break
      const hasRetest = wingBroken && candles.slice(-5).some(c => c.high >= lastHL * 0.999 && c.high < lastHL * 1.01)

      // BOS: bearish BOS after retest
      const bosConfirmed = hasRetest && structures.some(s => s.direction === 'bearish' && s.type === 'BOS')

      wingBreak = { detected: hasWing && wingBroken, inPhaseD, hasRetest, bosConfirmed }
    }
  }

  return {
    timeframe: tf,
    trend,
    currentPrice,
    structures,
    fvgs,
    liquiditySweep,
    equalHighs: [...new Set(equalHighs)].slice(0, 5),
    equalLows:  [...new Set(equalLows)].slice(0, 5),
    dealingRange,
    killZone,
    iSMT,
    wyckoff,
    wingBreak,
    wPattern,
    mPattern,
    doubleTop,
    doubleBottom,
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreTF(
  result: Omit<TFAnalysis, 'score'>,
  higherTFConfirmations: number,
): number {
  let score = TF_BASE_SCORE[result.timeframe] ?? 1.0

  // Higher TF confirmation bonus
  if (higherTFConfirmations === 1) score += 1.0
  else if (higherTFConfirmations === 2) score += 2.5
  else if (higherTFConfirmations >= 3) score += 4.0

  // Confluence bonuses
  const hasBOS    = result.structures.some(s => s.type === 'BOS')
  const hasCHoCH  = result.structures.some(s => s.type === 'CHoCH')
  const hasFVG    = result.fvgs.length > 0
  const hasLiqSweep = result.liquiditySweep
  const hasKZ     = result.killZone.active
  const hasISMT   = result.iSMT?.detected ?? false
  const hasWyckoffEntry = (result.wyckoff?.spring || result.wyckoff?.upthrust) ?? false
  const hasWM     = (result.wPattern?.detected && result.wPattern.confirmed) ||
                    (result.mPattern?.detected && result.mPattern.confirmed)
  const hasDT     = (result.doubleTop?.detected || result.doubleBottom?.detected) ?? false

  if (hasFVG)           score += 0.3
  if (hasBOS || hasCHoCH) score += 0.3
  if (hasLiqSweep)      score += 0.3
  if (hasKZ)            score += 0.3
  if (hasISMT)          score += 0.4
  if (hasWyckoffEntry)  score += 0.5
  if (hasWM)            score += 0.4
  if (hasDT)            score += 0.3

  return Math.min(10, score)
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function analyzeSymbol(symbol: string): Promise<FullAnalysis> {
  const upper = symbol.toUpperCase()

  // Fetch candles for all TFs concurrently
  const candleResults = await Promise.allSettled(
    TIMEFRAMES.map(tf => fetchCandles(upper, tf, 200)),
  )

  const candleMap = new Map<string, Candle[]>()
  TIMEFRAMES.forEach((tf, i) => {
    const r = candleResults[i]
    if (r.status === 'fulfilled' && r.value.length > 0) {
      candleMap.set(tf, r.value)
    }
  })

  // Fetch ETH candles for iSMT (only if symbol has BTC/ETH)
  let ethCandleMap = new Map<string, Candle[]>()
  const needsETH = /BTC|ETH/i.test(upper) && upper !== 'ETHUSDT'
  if (needsETH) {
    const ethResults = await Promise.allSettled(
      TIMEFRAMES.map(tf => fetchCandles('ETHUSDT', tf, 200)),
    )
    TIMEFRAMES.forEach((tf, i) => {
      const r = ethResults[i]
      if (r.status === 'fulfilled' && r.value.length > 0) {
        ethCandleMap.set(tf, r.value)
      }
    })
  }

  // Analyze each TF (without score first, to compute higher-TF confirmations)
  const rawResults = new Map<string, Omit<TFAnalysis, 'score'>>()
  for (const tf of TIMEFRAMES) {
    const candles = candleMap.get(tf)
    if (!candles || candles.length < 10) continue
    const eth = ethCandleMap.get(tf) ?? null
    rawResults.set(tf, analyzeTF(tf, candles, eth, upper))
  }

  // Compute scores with higher-TF confirmation
  const tfOrder = [...TIMEFRAMES] // highest first
  const tfAnalyses: TFAnalysis[] = []

  for (let i = 0; i < tfOrder.length; i++) {
    const tf = tfOrder[i]
    const raw = rawResults.get(tf)
    if (!raw) continue

    // Count higher TFs that confirm same direction
    const higherTFs = tfOrder.slice(0, i)
    const confirmations = higherTFs.filter(htf => {
      const h = rawResults.get(htf)
      return h && h.trend === raw.trend && raw.trend !== 'neutral'
    }).length

    const score = scoreTF(raw, confirmations)
    tfAnalyses.push({ ...raw, score })
  }

  // Overall direction: weighted by score
  let bullScore = 0, bearScore = 0
  for (const tf of tfAnalyses) {
    if (tf.trend === 'bullish') bullScore += tf.score
    else if (tf.trend === 'bearish') bearScore += tf.score
  }

  const overallDirection: 'bullish' | 'bearish' | 'neutral' =
    bullScore > bearScore * 1.2 ? 'bullish'
    : bearScore > bullScore * 1.2 ? 'bearish'
    : 'neutral'

  const overallScore = tfAnalyses.length > 0
    ? Math.min(10, tfAnalyses.reduce((s, t) => s + t.score, 0) / tfAnalyses.length * 2)
    : 0

  // Strategies
  const strategies: FullAnalysis['strategies'] = []
  for (const tf of tfAnalyses) {
    const hasBOS = tf.structures.some(s => s.type === 'BOS')
    const hasFVG = tf.fvgs.length > 0

    if (tf.wingBreak?.detected && tf.wingBreak.bosConfirmed) {
      strategies.push({ name: 'שבירת כנף', confidence: 0.85, details: `${tf.timeframe} - BOS מאושר לאחר שבירה ורטסט` })
    }
    if (tf.wPattern?.detected && tf.wPattern.confirmed) {
      strategies.push({ name: 'תבנית W', confidence: 0.75, details: `${tf.timeframe} - תחתיות כפולות עם FVG/iSMT` })
    }
    if (tf.mPattern?.detected && tf.mPattern.confirmed) {
      strategies.push({ name: 'תבנית M', confidence: 0.75, details: `${tf.timeframe} - פסגות כפולות עם FVG/iSMT` })
    }
    if (hasBOS && hasFVG && tf.killZone.active) {
      strategies.push({ name: 'ICT קונפלואנס', confidence: 0.80, details: `${tf.timeframe} - BOS + FVG + ${tf.killZone.session} Kill Zone` })
    }
    if (tf.wyckoff?.spring) {
      strategies.push({ name: 'Wyckoff Spring', confidence: 0.70, details: `${tf.timeframe} - Spring עם נפח נמוך` })
    }
    if (tf.wyckoff?.upthrust) {
      strategies.push({ name: 'Wyckoff Upthrust', confidence: 0.70, details: `${tf.timeframe} - Upthrust עם נפח נמוך` })
    }
    if (tf.doubleBottom?.detected) {
      strategies.push({ name: 'דאבל בוטום', confidence: 0.65, details: `${tf.timeframe} - תחתיות כפולות @ $${tf.doubleBottom.price.toFixed(2)}` })
    }
    if (tf.doubleTop?.detected) {
      strategies.push({ name: 'דאבל טופ', confidence: 0.65, details: `${tf.timeframe} - פסגות כפולות @ $${tf.doubleTop.price.toFixed(2)}` })
    }
  }

  // Recommendation
  let recommendation: string
  if (overallScore >= 7 && overallDirection === 'bullish') {
    recommendation = 'סטאפ חזק לכניסת לונג. חכה לאישור בטווח הנמוך לפני כניסה.'
  } else if (overallScore >= 7 && overallDirection === 'bearish') {
    recommendation = 'סטאפ חזק לכניסת שורט. חכה לאישור בטווח הנמוך לפני כניסה.'
  } else if (overallScore >= 5) {
    recommendation = 'סטאפ בינוני. דרוש אישור נוסף.'
  } else {
    recommendation = 'אין סטאפ ברור כרגע. המתן.'
  }

  // SL/TP from 1h timeframe
  const tf1h = tfAnalyses.find(t => t.timeframe === '1h')
  const currentPrice = tfAnalyses[0]?.currentPrice ?? 0
  let sl: number | null = null
  let tp1: number | null = null
  let tp2: number | null = null
  let tp3: number | null = null

  if (tf1h) {
    const { highs, lows } = findPivots(candleMap.get('1h') ?? [], 3)
    if (overallDirection === 'bearish' && highs.length > 0) {
      sl = highs[highs.length - 1].price
    } else if (overallDirection === 'bullish' && lows.length > 0) {
      sl = lows[lows.length - 1].price
    }

    // TP1: nearest unfilled FVG in direction
    const dirFVGs = tf1h.fvgs.filter(f =>
      overallDirection === 'bullish' ? f.direction === 'bullish' : f.direction === 'bearish',
    )
    if (dirFVGs.length > 0) {
      tp1 = overallDirection === 'bullish'
        ? Math.min(...dirFVGs.map(f => f.bottom))
        : Math.max(...dirFVGs.map(f => f.top))
    }

    // TP2: nearest liquidity level
    if (overallDirection === 'bullish' && tf1h.equalHighs.length > 0) {
      tp2 = Math.min(...tf1h.equalHighs.filter(h => h > currentPrice))
    } else if (overallDirection === 'bearish' && tf1h.equalLows.length > 0) {
      tp2 = Math.max(...tf1h.equalLows.filter(l => l < currentPrice))
    }

    // TP3: dealing range opposite side
    if (tf1h.dealingRange) {
      tp3 = overallDirection === 'bullish' ? tf1h.dealingRange.high : tf1h.dealingRange.low
    }
  }

  return {
    symbol: upper,
    analyzedAt: Date.now(),
    currentPrice,
    overallDirection,
    overallScore: parseFloat(overallScore.toFixed(2)),
    timeframes: tfAnalyses,
    strategies,
    recommendation,
    nextLevels: { tp1, tp2, tp3, sl },
  }
}
