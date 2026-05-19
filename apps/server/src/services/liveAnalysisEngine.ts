import { fetchCandles, type Candle } from './binanceService'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WyckoffDetail {
  phase: string        // 'Accumulation' | 'Distribution' | 'N/A'
  phaseDetail: string  // 'B' | 'C' | 'D' | ''
  spring: boolean
  testAfterSpring: boolean
  sos: boolean
  lps: boolean
  utad: boolean
  testOfUtad: boolean
  upthrust: boolean
  sow: boolean
  lpsy: boolean
}

export interface BreakerBlock {
  direction: 'bullish' | 'bearish'
  top: number
  bottom: number
}

export interface Po3Signal {
  detected: boolean
  judas: boolean           // fake move detected (Judas Swing)
  direction: 'bullish' | 'bearish'  // real direction after Judas
}

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
  wyckoff: WyckoffDetail | null
  wingBreak: { detected: boolean; inPhaseD: boolean; hasRetest: boolean; bosConfirmed: boolean } | null
  wPattern: { detected: boolean; confirmed: boolean } | null
  mPattern: { detected: boolean; confirmed: boolean } | null
  doubleTop: { detected: boolean; price: number } | null
  doubleBottom: { detected: boolean; price: number } | null
  breakerBlock: BreakerBlock | null
  pdh: number | null   // Previous Day High
  pdl: number | null   // Previous Day Low
  pwh: number | null   // Previous Week High
  pwl: number | null   // Previous Week Low
  vwap: number | null
  po3: Po3Signal | null
  score: number
}

export interface SMTComparison {
  correlated: string
  correlatedPrice: number
  smtDetected: boolean
  smtDirection: 'bullish' | 'bearish' | null
  details: string
  timeframes: Array<{
    tf: string
    mainTrend: 'bullish' | 'bearish' | 'neutral'
    corrTrend: 'bullish' | 'bearish' | 'neutral'
    divergence: boolean
  }>
}

export interface DrawingLayer {
  tf: string
  fvgBoxes: Array<{ direction: 'bullish' | 'bearish'; top: number; bottom: number }>
  horizontalLines: Array<{ label: string; price: number; color: string; dash: boolean }>
  markers: Array<{ price: number; label: string; color: string; position: 'above' | 'below' }>
  vwap: number | null
  breakerBoxes: Array<{ direction: 'bullish' | 'bearish'; top: number; bottom: number }>
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
  smtComparison: SMTComparison | null
  drawingLayers: DrawingLayer[]  // one per timeframe, for chart overlay
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

// ─── VWAP ─────────────────────────────────────────────────────────────────────

function calcVWAP(candles: Candle[]): number | null {
  if (candles.length === 0) return null
  // Today's candles: filter by UTC date
  const nowDay = new Date().toISOString().slice(0, 10)
  const todayCandles = candles.filter(c => {
    const d = new Date(c.time * 1000).toISOString().slice(0, 10)
    return d === nowDay
  })
  const pool = todayCandles.length >= 3 ? todayCandles : candles.slice(-20)
  if (pool.length === 0) return null

  let sumTPV = 0, sumV = 0
  for (const c of pool) {
    const tp = (c.high + c.low + c.close) / 3
    sumTPV += tp * c.volume
    sumV += c.volume
  }
  return sumV > 0 ? sumTPV / sumV : null
}

// ─── PDH / PDL / PWH / PWL ────────────────────────────────────────────────────

function calcPDHPDL(dailyCandles: Candle[]): { pdh: number; pdl: number } | null {
  if (dailyCandles.length < 2) return null
  const prev = dailyCandles[dailyCandles.length - 2]
  return { pdh: prev.high, pdl: prev.low }
}

function calcPWHPWL(weeklyCandles: Candle[]): { pwh: number; pwl: number } | null {
  if (weeklyCandles.length < 2) return null
  const prev = weeklyCandles[weeklyCandles.length - 2]
  return { pwh: prev.high, pwl: prev.low }
}

// ─── Wyckoff Full Phase Detection ────────────────────────────────────────────

function detectWyckoff(candles: Candle[], currentPrice: number): WyckoffDetail | null {
  const last100 = candles.slice(-100)
  if (last100.length < 40) return null

  // Range in middle 60 candles (Phase B range)
  const rangeWindow = last100.slice(-70, -10)
  if (rangeWindow.length < 20) return null

  const rangeHigh = Math.max(...rangeWindow.map(c => c.high))
  const rangeLow  = Math.min(...rangeWindow.map(c => c.low))
  const range     = rangeHigh - rangeLow
  const rangePct  = range / currentPrice

  // Must be sideways (consolidation < 12%)
  if (rangePct > 0.12 || rangePct < 0.005) return null

  // Prior trend (before the range)
  const beforeRange = last100.slice(0, 30)
  if (beforeRange.length < 10) return null
  const firstClose = beforeRange[0].close
  const lastBefore = beforeRange[beforeRange.length - 1].close
  const priorDown  = lastBefore < firstClose * 0.94
  const priorUp    = lastBefore > firstClose * 1.06

  if (!priorDown && !priorUp) return null

  const isAccum = priorDown

  const avgVol = last100.reduce((s, c) => s + c.volume, 0) / last100.length
  const recent20 = last100.slice(-20)
  const last10   = last100.slice(-10)

  let spring = false, testAfterSpring = false
  let sos    = false, lps             = false
  let utad   = false, testOfUtad      = false
  let upthrust = false
  let sow    = false, lpsy            = false

  if (isAccum) {
    // ── Phase C: Spring ──────────────────────────────────────────────────
    for (let i = 1; i < recent20.length - 1; i++) {
      const c = recent20[i]
      // Spring: wick below rangeLow, close back inside, low volume
      if (c.low < rangeLow * 0.999 && c.close > rangeLow && c.volume < avgVol * 0.9) {
        spring = true
        // Test after Spring: subsequent rally holding above rangeLow
        const after = recent20.slice(i + 1)
        testAfterSpring = after.some(a =>
          a.close > rangeLow && a.close < (rangeHigh + rangeLow) / 2 && a.volume < avgVol * 0.85
        )
        break
      }
    }

    // ── Phase D: SOS (Sign of Strength) ──────────────────────────────────
    for (const c of last10) {
      if (c.close > rangeHigh && c.volume > avgVol * 1.15) {
        sos = true
        break
      }
    }

    // ── Phase D: LPS (Last Point of Support) ─────────────────────────────
    if (sos) {
      const afterSOS = last10.slice(-5)
      const midPoint = (rangeHigh + rangeLow) / 2
      lps = afterSOS.some(c =>
        c.close > midPoint && c.close <= rangeHigh * 1.01 && c.volume < avgVol * 0.8
      )
    }

  } else {
    // ── Phase C: UTAD (Upthrust After Distribution) ───────────────────────
    for (let i = 1; i < recent20.length - 1; i++) {
      const c = recent20[i]
      // UTAD: wick above rangeHigh, close back inside, low volume
      if (c.high > rangeHigh * 1.001 && c.close < rangeHigh && c.volume < avgVol * 0.9) {
        utad = true
        const after = recent20.slice(i + 1)
        testOfUtad = after.some(a =>
          a.close < rangeHigh && a.close > (rangeHigh + rangeLow) / 2 && a.volume < avgVol * 0.85
        )
        break
      }
    }

    // ── Upthrust (bearish rejection at top of range) ──────────────────────
    const lastC = last10[last10.length - 1]
    const midRange = (rangeHigh + rangeLow) / 2
    if (!utad && lastC.high > rangeHigh * 0.98 && lastC.close < midRange) {
      upthrust = true
    }

    // ── Phase D: SOW (Sign of Weakness) ──────────────────────────────────
    for (const c of last10) {
      if (c.close < rangeLow && c.volume > avgVol * 1.15) {
        sow = true
        break
      }
    }

    // ── Phase D: LPSY (Last Point of Supply) ─────────────────────────────
    if (sow) {
      const afterSOW = last10.slice(-5)
      const midPoint  = (rangeHigh + rangeLow) / 2
      lpsy = afterSOW.some(c =>
        c.close > rangeLow * 0.99 && c.close < midPoint && c.volume < avgVol * 0.8
      )
    }
  }

  // Determine phase label
  const phase = isAccum ? 'Accumulation' : 'Distribution'
  let phaseDetail = 'B'  // default: in Phase B (testing)

  if (isAccum) {
    if (sos || lps) phaseDetail = 'D'
    else if (spring || testAfterSpring) phaseDetail = 'C'
  } else {
    if (sow || lpsy) phaseDetail = 'D'
    else if (utad || testOfUtad || upthrust) phaseDetail = 'C'
  }

  // Only return if there's meaningful evidence
  const hasAnyEvent = spring || testAfterSpring || sos || lps ||
                      utad || testOfUtad || upthrust || sow || lpsy

  return {
    phase,
    phaseDetail,
    spring,
    testAfterSpring,
    sos,
    lps,
    utad,
    testOfUtad,
    upthrust,
    sow,
    lpsy,
  }
}

// ─── Breaker Block ───────────────────────────────────────────────────────────

function detectBreakerBlock(
  candles: Candle[],
  structures: TFAnalysis['structures'],
): BreakerBlock | null {
  if (candles.length < 20 || structures.length === 0) return null

  // For each BOS/CHoCH, find the last opposing candle before it (= Order Block)
  // Then check if price returned and broke through that OB
  for (let si = structures.length - 1; si >= 0; si--) {
    const struct = structures[si]
    const bosPrice = struct.price

    // Find approximate index where BOS happened
    const bosIdx = candles.findIndex(c => {
      if (struct.direction === 'bullish') return c.close > bosPrice
      return c.close < bosPrice
    })
    if (bosIdx < 2 || bosIdx >= candles.length - 1) continue

    // Find the Order Block: last opposing candle before BOS
    let obTop = 0, obBottom = 0
    if (struct.direction === 'bullish') {
      // BOS bullish → OB = last bearish candle before BOS
      for (let i = bosIdx - 1; i >= Math.max(0, bosIdx - 15); i--) {
        if (candles[i].close < candles[i].open) {
          obTop    = candles[i].high
          obBottom = candles[i].low
          break
        }
      }
      // Breaker: price returned BELOW the OB after BOS
      if (obBottom > 0) {
        const afterBOS = candles.slice(bosIdx + 1)
        const broken   = afterBOS.some(c => c.close < obBottom)
        if (broken) {
          return { direction: 'bearish', top: obTop, bottom: obBottom }
        }
      }
    } else {
      // BOS bearish → OB = last bullish candle before BOS
      for (let i = bosIdx - 1; i >= Math.max(0, bosIdx - 15); i--) {
        if (candles[i].close > candles[i].open) {
          obTop    = candles[i].high
          obBottom = candles[i].low
          break
        }
      }
      if (obTop > 0) {
        const afterBOS = candles.slice(bosIdx + 1)
        const broken   = afterBOS.some(c => c.close > obTop)
        if (broken) {
          return { direction: 'bullish', top: obTop, bottom: obBottom }
        }
      }
    }
  }

  return null
}

// ─── Power of 3 / Judas Swing ────────────────────────────────────────────────

function detectPo3(candles: Candle[]): Po3Signal | null {
  if (candles.length < 8) return null

  // London: 07:00–07:30 UTC | NY: 13:30–14:00 UTC
  const nowHour = new Date().getUTCHours()
  const nowMin  = new Date().getUTCMinutes()

  const inLondonOpen = nowHour === 7 && nowMin < 30
  const inNYOpen     = nowHour === 13 && nowMin >= 30

  if (!inLondonOpen && !inNYOpen) return null

  // Look at last 6 candles: did price fake one direction then reverse?
  const recent = candles.slice(-6)
  const first3 = recent.slice(0, 3)
  const last3  = recent.slice(3)

  const first3High  = Math.max(...first3.map(c => c.high))
  const first3Low   = Math.min(...first3.map(c => c.low))
  const first3Open  = first3[0].open
  const last3Close  = last3[last3.length - 1].close

  // Judas bullish: price first dropped (manipulation down), then reversed up
  const judasBullish = first3Low < first3Open * 0.999 && last3Close > first3High
  // Judas bearish: price first pumped (manipulation up), then reversed down
  const judasBearish = first3High > first3Open * 1.001 && last3Close < first3Low

  if (!judasBullish && !judasBearish) return null

  return {
    detected: true,
    judas: true,
    direction: judasBullish ? 'bullish' : 'bearish',
  }
}

// ─── Per-timeframe analysis ────────────────────────────────────────────────────

function analyzeTF(
  tf: string,
  candles: Candle[],
  ethCandles: Candle[] | null,
  symbol: string,
  dailyCandles: Candle[] | null,
  weeklyCandles: Candle[] | null,
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

  if (pivotHighs.length >= 2 && pivotLows.length >= 2) {
    const ph = pivotHighs.slice(-2)
    const pl = pivotLows.slice(-2)
    if (ph[1].price > ph[0].price && pl[1].price > pl[0].price) trend = 'bullish'
    else if (ph[1].price < ph[0].price && pl[1].price < pl[0].price) trend = 'bearish'
  }

  const recentStart = Math.max(0, candles.length - 30)
  for (let i = recentStart + 1; i < candles.length; i++) {
    const c = candles[i]
    if (lastSwingHigh > 0 && c.close > lastSwingHigh) {
      const type = trend === 'bullish' ? 'BOS' : 'CHoCH'
      structures.push({ type, direction: 'bullish', price: lastSwingHigh })
      trend = 'bullish'
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

    if (candles[i].low > candles[i - 2].high) {
      const top    = candles[i].low
      const bottom = candles[i - 2].high
      const filled = candles.slice(i + 1).some(c => c.low <= bottom)
      if (!filled) fvgs.push({ direction: 'bullish', top, bottom })
    }
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
  const equalLows:  number[] = []
  let liquiditySweep = false

  for (let i = 0; i < last20.length - 1; i++) {
    for (let j = i + 1; j < last20.length; j++) {
      const hiDiff = Math.abs(last20[i].high - last20[j].high) / last20[i].high
      const loDiff = Math.abs(last20[i].low  - last20[j].low)  / last20[i].low
      if (hiDiff < 0.0005) equalHighs.push(last20[i].high)
      if (loDiff < 0.0005) equalLows.push(last20[i].low)
    }
  }

  for (const level of equalHighs) {
    if (last20.some(c => c.high > level && c.close < level)) { liquiditySweep = true; break }
  }
  if (!liquiditySweep) {
    for (const level of equalLows) {
      if (last20.some(c => c.low < level && c.close > level)) { liquiditySweep = true; break }
    }
  }

  // ── Kill Zone ────────────────────────────────────────────────────────────
  const nowHour = new Date().getUTCHours()
  let killZone: TFAnalysis['killZone'] = { active: false, session: null }
  if      (nowHour >= 7  && nowHour < 11) killZone = { active: true, session: 'London' }
  else if (nowHour >= 13 && nowHour < 16) killZone = { active: true, session: 'NY' }
  else if (nowHour >= 20 || nowHour < 4)  killZone = { active: true, session: 'Asian' }

  // ── Dealing Range ─────────────────────────────────────────────────────────
  let dealingRange: TFAnalysis['dealingRange'] = null
  if (LOW_TF_SET.has(tf)) {
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
    const bullISMT = curBTC.low  < prevBTC.low  && curBTC.close > prevBTC.low  && !(curETH.low  < prevETH.low)

    if (bearISMT)      iSMT = { detected: true, direction: 'bearish' }
    else if (bullISMT) iSMT = { detected: true, direction: 'bullish' }
  }

  // ── W/M Patterns ─────────────────────────────────────────────────────────
  let wPattern: TFAnalysis['wPattern'] = null
  let mPattern: TFAnalysis['mPattern'] = null

  if (pivotLows.length >= 3) {
    const recentLows = pivotLows.slice(-3)
    const lo1 = recentLows[0].price
    const lo2 = recentLows[2].price
    if (Math.abs(lo1 - lo2) / lo1 < 0.002) {
      const confirmed = fvgs.some(f => f.direction === 'bullish') ||
                        (iSMT?.direction === 'bullish' && iSMT.detected)
      wPattern = { detected: true, confirmed }
    }
  }

  if (pivotHighs.length >= 3) {
    const recentHighs = pivotHighs.slice(-3)
    const hi1 = recentHighs[0].price
    const hi2 = recentHighs[2].price
    if (Math.abs(hi1 - hi2) / hi1 < 0.002) {
      const confirmed = fvgs.some(f => f.direction === 'bearish') ||
                        (iSMT?.direction === 'bearish' && iSMT.detected)
      mPattern = { detected: true, confirmed }
    }
  }

  // ── Double Top / Bottom ───────────────────────────────────────────────────
  let doubleTop:    TFAnalysis['doubleTop']    = null
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

  // ── Wyckoff (Full B/C/D) ──────────────────────────────────────────────────
  const wyckoff = detectWyckoff(candles, currentPrice)

  // ── Wing Break ────────────────────────────────────────────────────────────
  let wingBreak: TFAnalysis['wingBreak'] = null
  const inPhaseD = wyckoff?.phase === 'Distribution' && wyckoff.phaseDetail === 'D'
  if (wyckoff?.phase === 'Distribution' && pivotLows.length >= 3) {
    const recentPivotLows = pivotLows.slice(-4)
    let higherLowsCount = 0
    for (let i = 1; i < recentPivotLows.length; i++) {
      if (recentPivotLows[i].price > recentPivotLows[i - 1].price) higherLowsCount++
    }
    const hasWing = higherLowsCount >= 2

    if (hasWing && recentPivotLows.length >= 2) {
      const lastHL    = recentPivotLows[recentPivotLows.length - 2].price
      const wingBroken = last.close < lastHL
      const hasRetest  = wingBroken && candles.slice(-5).some(c => c.high >= lastHL * 0.999 && c.high < lastHL * 1.01)
      const bosConfirmed = hasRetest && structures.some(s => s.direction === 'bearish' && s.type === 'BOS')

      wingBreak = { detected: hasWing && wingBroken, inPhaseD, hasRetest, bosConfirmed }
    }
  }

  // ── Breaker Block ─────────────────────────────────────────────────────────
  const breakerBlock = detectBreakerBlock(candles, structures)

  // ── PDH / PDL / PWH / PWL ─────────────────────────────────────────────────
  const pdhpdl = dailyCandles  ? calcPDHPDL(dailyCandles)   : null
  const pwhpwl = weeklyCandles ? calcPWHPWL(weeklyCandles)  : null

  // ── VWAP ──────────────────────────────────────────────────────────────────
  const vwap = calcVWAP(candles)

  // ── Po3 / Judas Swing ─────────────────────────────────────────────────────
  const po3 = detectPo3(candles)

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
    breakerBlock,
    pdh: pdhpdl?.pdh ?? null,
    pdl: pdhpdl?.pdl ?? null,
    pwh: pwhpwl?.pwh ?? null,
    pwl: pwhpwl?.pwl ?? null,
    vwap,
    po3,
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreTF(
  result: Omit<TFAnalysis, 'score'>,
  higherTFConfirmations: number,
): number {
  let score = TF_BASE_SCORE[result.timeframe] ?? 1.0

  // Higher TF confirmation bonus
  if      (higherTFConfirmations === 1) score += 1.0
  else if (higherTFConfirmations === 2) score += 2.5
  else if (higherTFConfirmations >= 3)  score += 4.0

  // Confluence bonuses
  const hasBOS    = result.structures.some(s => s.type === 'BOS')
  const hasCHoCH  = result.structures.some(s => s.type === 'CHoCH')
  const hasFVG    = result.fvgs.length > 0
  const hasKZ     = result.killZone.active
  const hasISMT   = result.iSMT?.detected ?? false
  const hasLiqSweep = result.liquiditySweep

  // Wyckoff best-entry events
  const wyckoffBestEntry =
    (result.wyckoff?.spring)           ||
    (result.wyckoff?.testAfterSpring)  ||
    (result.wyckoff?.lps)              ||
    (result.wyckoff?.upthrust)         ||
    (result.wyckoff?.testOfUtad)       ||
    (result.wyckoff?.lpsy)

  const wyckoffPhaseD = result.wyckoff?.phaseDetail === 'D'
  const wyckoffPhaseC = result.wyckoff?.phaseDetail === 'C'

  const hasWM  = (result.wPattern?.detected  && result.wPattern.confirmed)  ||
                 (result.mPattern?.detected   && result.mPattern.confirmed)
  const hasDT  = result.doubleTop?.detected   || result.doubleBottom?.detected
  const hasBB  = result.breakerBlock !== null
  const hasPo3 = result.po3?.detected && result.po3.judas
  const hasWB  = result.wingBreak?.detected

  if (hasFVG)          score += 0.3
  if (hasBOS || hasCHoCH) score += 0.3
  if (hasLiqSweep)     score += 0.3
  if (hasKZ)           score += 0.3
  if (hasISMT)         score += 0.4
  if (wyckoffBestEntry) score += 0.5
  if (wyckoffPhaseD)   score += 0.3
  if (wyckoffPhaseC)   score += 0.2
  if (hasWM)           score += 0.4
  if (hasDT)           score += 0.3
  if (hasBB)           score += 0.3
  if (hasPo3)          score += 0.4
  if (hasWB)           score += 0.4

  return Math.min(10, score)
}

// ─── Build drawing layer ──────────────────────────────────────────────────────

function buildDrawingLayer(tf: TFAnalysis, cp: number): DrawingLayer {
  const lines: DrawingLayer['horizontalLines'] = []
  const markers: DrawingLayer['markers'] = []

  // PDH / PDL
  if (tf.pdh) lines.push({ label: 'PDH', price: tf.pdh, color: '#f59e0b', dash: true })
  if (tf.pdl) lines.push({ label: 'PDL', price: tf.pdl, color: '#f59e0b', dash: true })

  // PWH / PWL
  if (tf.pwh) lines.push({ label: 'PWH', price: tf.pwh, color: '#8b5cf6', dash: true })
  if (tf.pwl) lines.push({ label: 'PWL', price: tf.pwl, color: '#8b5cf6', dash: true })

  // VWAP
  if (tf.vwap) lines.push({ label: 'VWAP', price: tf.vwap, color: '#06b6d4', dash: false })

  // Equal highs / lows
  for (const h of tf.equalHighs.slice(0, 3)) {
    lines.push({ label: 'EQH', price: h, color: '#ef4444', dash: true })
  }
  for (const l of tf.equalLows.slice(0, 3)) {
    lines.push({ label: 'EQL', price: l, color: '#22c55e', dash: true })
  }

  // Dealing range
  if (tf.dealingRange) {
    lines.push({ label: 'Range High', price: tf.dealingRange.high, color: '#64748b', dash: false })
    lines.push({ label: 'Mid', price: tf.dealingRange.mid, color: '#94a3b8', dash: true })
    lines.push({ label: 'Range Low', price: tf.dealingRange.low, color: '#64748b', dash: false })
  }

  // Wyckoff markers
  if (tf.wyckoff?.spring)          markers.push({ price: cp, label: 'Spring 🌱', color: '#22c55e', position: 'below' })
  if (tf.wyckoff?.testAfterSpring) markers.push({ price: cp, label: 'Test ✅', color: '#86efac', position: 'below' })
  if (tf.wyckoff?.lps)             markers.push({ price: cp, label: 'LPS 🟢', color: '#22c55e', position: 'below' })
  if (tf.wyckoff?.sos)             markers.push({ price: cp, label: 'SOS ↑', color: '#4ade80', position: 'above' })
  if (tf.wyckoff?.utad)            markers.push({ price: cp, label: 'UTAD ⚡', color: '#f87171', position: 'above' })
  if (tf.wyckoff?.testOfUtad)      markers.push({ price: cp, label: 'Test UTAD', color: '#fca5a5', position: 'above' })
  if (tf.wyckoff?.upthrust)        markers.push({ price: cp, label: 'UT 🔴', color: '#ef4444', position: 'above' })
  if (tf.wyckoff?.sow)             markers.push({ price: cp, label: 'SOW ↓', color: '#f87171', position: 'below' })
  if (tf.wyckoff?.lpsy)            markers.push({ price: cp, label: 'LPSY 🔴', color: '#ef4444', position: 'above' })

  // Wing Break
  if (tf.wingBreak?.detected)      markers.push({ price: cp, label: '🪶 Wing', color: '#fb923c', position: 'above' })

  // W/M patterns
  if (tf.wPattern?.detected)       markers.push({ price: cp, label: 'W 📈', color: '#22c55e', position: 'below' })
  if (tf.mPattern?.detected)       markers.push({ price: cp, label: 'M 📉', color: '#ef4444', position: 'above' })

  // Judas Swing
  if (tf.po3?.judas)               markers.push({ price: cp, label: `Judas ${tf.po3.direction === 'bullish' ? '⬆️' : '⬇️'}`, color: '#a78bfa', position: tf.po3.direction === 'bullish' ? 'below' : 'above' })

  // iSMT (intra-bar SMT — 2 candles, detected per-TF)
  if (tf.iSMT?.detected) {
    const dir = tf.iSMT.direction
    markers.push({
      price: cp,
      label: `iSMT ${dir === 'bullish' ? '⬆️' : '⬇️'}`,
      color: '#e879f9',   // fuchsia
      position: dir === 'bullish' ? 'below' : 'above',
    })
    // Also draw a horizontal line at current price so it's visible even when zoomed out
    lines.push({ label: 'iSMT', price: cp, color: '#e879f9', dash: true })
  }

  return {
    tf: tf.timeframe,
    fvgBoxes: tf.fvgs,
    horizontalLines: lines,
    markers,
    vwap: tf.vwap,
    breakerBoxes: tf.breakerBlock ? [tf.breakerBlock] : [],
  }
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
  const ethCandleMap = new Map<string, Candle[]>()
  const needsETH = /BTC|ETH/i.test(upper) && upper !== 'ETHUSDT'
  if (needsETH) {
    const ethResults = await Promise.allSettled(
      TIMEFRAMES.map(tf => fetchCandles('ETHUSDT', tf, 200)),
    )
    TIMEFRAMES.forEach((tf, i) => {
      const r = ethResults[i]
      if (r.status === 'fulfilled' && r.value.length > 0) ethCandleMap.set(tf, r.value)
    })
  }

  // Daily & Weekly candles for PDH/PDL/PWH/PWL
  const dailyCandles  = candleMap.get('1D')  ?? null
  const weeklyCandles = candleMap.get('1W')  ?? null

  // Analyze each TF
  const rawResults = new Map<string, Omit<TFAnalysis, 'score'>>()
  for (const tf of TIMEFRAMES) {
    const candles = candleMap.get(tf)
    if (!candles || candles.length < 10) continue
    const eth = ethCandleMap.get(tf) ?? null
    rawResults.set(tf, analyzeTF(tf, candles, eth, upper, dailyCandles, weeklyCandles))
  }

  // Compute scores with higher-TF confirmation
  const tfOrder = [...TIMEFRAMES]
  const tfAnalyses: TFAnalysis[] = []

  for (let i = 0; i < tfOrder.length; i++) {
    const tf  = tfOrder[i]
    const raw = rawResults.get(tf)
    if (!raw) continue

    const higherTFs      = tfOrder.slice(0, i)
    const confirmations  = higherTFs.filter(htf => {
      const h = rawResults.get(htf)
      return h && h.trend === raw.trend && raw.trend !== 'neutral'
    }).length

    const score = scoreTF(raw, confirmations)
    tfAnalyses.push({ ...raw, score })
  }

  // Overall direction
  let bullScore = 0, bearScore = 0
  for (const tf of tfAnalyses) {
    if      (tf.trend === 'bullish') bullScore += tf.score
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

    if (tf.wingBreak?.detected && tf.wingBreak.bosConfirmed)
      strategies.push({ name: 'שבירת כנף', confidence: 0.85, details: `${tf.timeframe} — BOS מאושר לאחר שבירה ורטסט` })

    if (tf.wPattern?.detected && tf.wPattern.confirmed)
      strategies.push({ name: 'תבנית W', confidence: 0.75, details: `${tf.timeframe} — תחתיות כפולות עם FVG/iSMT` })

    if (tf.mPattern?.detected && tf.mPattern.confirmed)
      strategies.push({ name: 'תבנית M', confidence: 0.75, details: `${tf.timeframe} — פסגות כפולות עם FVG/iSMT` })

    if (hasBOS && hasFVG && tf.killZone.active)
      strategies.push({ name: 'ICT קונפלואנס', confidence: 0.80, details: `${tf.timeframe} — BOS + FVG + ${tf.killZone.session} Kill Zone` })

    if (tf.wyckoff?.spring)
      strategies.push({ name: 'Wyckoff Spring', confidence: 0.70, details: `${tf.timeframe} — Spring עם נפח נמוך (Phase C)` })

    if (tf.wyckoff?.testAfterSpring)
      strategies.push({ name: 'Test after Spring ✅', confidence: 0.82, details: `${tf.timeframe} — כניסה הטובה ביותר בצבירה` })

    if (tf.wyckoff?.lps)
      strategies.push({ name: 'LPS — Last Point of Support', confidence: 0.80, details: `${tf.timeframe} — נקודת תמיכה אחרונה בשלב D` })

    if (tf.wyckoff?.sos)
      strategies.push({ name: 'SOS — Sign of Strength', confidence: 0.75, details: `${tf.timeframe} — פריצה מאושרת מעל AR בנפח גבוה` })

    if (tf.wyckoff?.utad)
      strategies.push({ name: 'UTAD ⚡', confidence: 0.70, details: `${tf.timeframe} — Upthrust After Distribution (Phase C)` })

    if (tf.wyckoff?.testOfUtad)
      strategies.push({ name: 'Test of UTAD ✅', confidence: 0.82, details: `${tf.timeframe} — כניסה הטובה ביותר בהפצה` })

    if (tf.wyckoff?.lpsy)
      strategies.push({ name: 'LPSY — Last Point of Supply', confidence: 0.80, details: `${tf.timeframe} — נקודת היצע אחרונה בשלב D` })

    if (tf.wyckoff?.upthrust)
      strategies.push({ name: 'Wyckoff Upthrust', confidence: 0.70, details: `${tf.timeframe} — Upthrust עם נפח נמוך (Phase C)` })

    if (tf.wyckoff?.sow)
      strategies.push({ name: 'SOW — Sign of Weakness', confidence: 0.75, details: `${tf.timeframe} — פריצה מאושרת מתחת ל-ICE בנפח גבוה` })

    if (tf.breakerBlock)
      strategies.push({ name: `Breaker Block ${tf.breakerBlock.direction === 'bullish' ? '🟢' : '🔴'}`, confidence: 0.72, details: `${tf.timeframe} — OB שנשבר הפך לכיוון ${tf.breakerBlock.direction === 'bullish' ? 'בוליש' : 'בארישׁ'}` })

    if (tf.po3?.judas)
      strategies.push({ name: `Judas Swing ${tf.po3.direction === 'bullish' ? '⬆️' : '⬇️'}`, confidence: 0.73, details: `${tf.timeframe} — Po3: תנועה מזויפת → כיוון אמיתי ${tf.po3.direction === 'bullish' ? 'בוליש' : 'בארישׁ'}` })

    if (tf.doubleBottom?.detected)
      strategies.push({ name: 'דאבל בוטום', confidence: 0.65, details: `${tf.timeframe} — תחתיות כפולות @ $${tf.doubleBottom.price.toFixed(2)}` })

    if (tf.doubleTop?.detected)
      strategies.push({ name: 'דאבל טופ', confidence: 0.65, details: `${tf.timeframe} — פסגות כפולות @ $${tf.doubleTop.price.toFixed(2)}` })
  }

  // Recommendation
  let recommendation: string
  const hasWyckoffBestLong  = tfAnalyses.some(t => t.wyckoff?.testAfterSpring || t.wyckoff?.lps)
  const hasWyckoffBestShort = tfAnalyses.some(t => t.wyckoff?.testOfUtad || t.wyckoff?.lpsy)

  if (overallScore >= 7 && overallDirection === 'bullish') {
    recommendation = hasWyckoffBestLong
      ? 'סטאפ חזק לכניסת לונג — Wyckoff Phase D מאושר. כניסה עם Stop מתחת ל-Spring/LPS.'
      : 'סטאפ חזק לכניסת לונג. חכה לאישור בטווח הנמוך לפני כניסה.'
  } else if (overallScore >= 7 && overallDirection === 'bearish') {
    recommendation = hasWyckoffBestShort
      ? 'סטאפ חזק לכניסת שורט — Wyckoff Phase D מאושר. כניסה עם Stop מעל LPSY/Test of UTAD.'
      : 'סטאפ חזק לכניסת שורט. חכה לאישור בטווח הנמוך לפני כניסה.'
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
    if (overallDirection === 'bearish' && highs.length > 0) sl = highs[highs.length - 1].price
    else if (overallDirection === 'bullish' && lows.length > 0) sl = lows[lows.length - 1].price

    // TP1: PDL/PDH or nearest FVG
    if (overallDirection === 'bullish') {
      tp1 = tf1h.pdh ?? (tf1h.fvgs.find(f => f.direction === 'bullish')?.bottom ?? null)
    } else {
      tp1 = tf1h.pdl ?? (tf1h.fvgs.find(f => f.direction === 'bearish')?.top ?? null)
    }

    // TP2: PWH/PWL or equal highs/lows
    if (overallDirection === 'bullish') {
      tp2 = tf1h.pwh ?? (tf1h.equalHighs.find(h => h > currentPrice) ?? null)
    } else {
      tp2 = tf1h.pwl ?? (tf1h.equalLows.find(l => l < currentPrice) ?? null)
    }

    // TP3: dealing range opposite side
    if (tf1h.dealingRange) {
      tp3 = overallDirection === 'bullish' ? tf1h.dealingRange.high : tf1h.dealingRange.low
    }
  }

  // ─── SMT Comparison ────────────────────────────────────────────────────────
  const SMT_PAIRS: Record<string, string> = {
    'BTCUSDT': 'ETHUSDT',
    'ETHUSDT': 'BTCUSDT',
    'NQ':      'ES',
    'ES':      'NQ',
  }

  let smtComparison: SMTComparison | null = null
  const corrSymbol = SMT_PAIRS[upper]

  if (corrSymbol) {
    const corrResults = await Promise.allSettled(
      TIMEFRAMES.map(tf => fetchCandles(corrSymbol, tf, 200)),
    )
    const corrCandleMap = new Map<string, Candle[]>()
    TIMEFRAMES.forEach((tf, i) => {
      const r = corrResults[i]
      if (r.status === 'fulfilled' && r.value.length > 0) corrCandleMap.set(tf, r.value)
    })

    const smtTFs: SMTComparison['timeframes'] = []
    let smtBullish = false, smtBearish = false

    for (const tf of TIMEFRAMES) {
      const mainCandles = candleMap.get(tf)
      const corrCandles = corrCandleMap.get(tf)
      if (!mainCandles || !corrCandles || mainCandles.length < 10) continue

      const mainTrend = rawResults.get(tf)?.trend ?? 'neutral'

      const cLen = corrCandles.length
      const corrClose = corrCandles[cLen - 1].close
      const corrPrev  = corrCandles[cLen - 6]?.close ?? corrClose
      const corrTrend: 'bullish' | 'bearish' | 'neutral' =
        corrClose > corrPrev * 1.001 ? 'bullish'
        : corrClose < corrPrev * 0.999 ? 'bearish'
        : 'neutral'

      const divergence = mainTrend !== 'neutral' && corrTrend !== 'neutral' && mainTrend !== corrTrend
      if (divergence) {
        if (mainTrend === 'bearish') smtBearish = true
        if (mainTrend === 'bullish') smtBullish = true
      }
      smtTFs.push({ tf, mainTrend, corrTrend, divergence })
    }

    const smtDetected  = smtBullish || smtBearish
    const smtDirection = smtBearish ? 'bearish' : smtBullish ? 'bullish' : null

    const corrPrice = corrCandleMap.get('1h')?.[corrCandleMap.get('1h')!.length - 1]?.close
      ?? corrCandleMap.get('15m')?.[corrCandleMap.get('15m')!.length - 1]?.close
      ?? 0

    const smtDetails = smtDetected && smtDirection === 'bearish'
      ? `${upper} עולה אך ${corrSymbol} לא מאשר — סימן חולשה, SMT בארישׁ`
      : smtDetected && smtDirection === 'bullish'
        ? `${upper} יורד אך ${corrSymbol} לא מאשר — סימן חוזק, SMT בוליש`
        : `${upper} ו-${corrSymbol} נעים באותו כיוון — אין דיברגנס SMT כרגע`

    smtComparison = { correlated: corrSymbol, correlatedPrice: corrPrice, smtDetected, smtDirection, details: smtDetails, timeframes: smtTFs }

    if (smtDetected) {
      strategies.push({
        name: smtDirection === 'bearish' ? 'SMT בארישׁ' : 'SMT בוליש',
        confidence: 0.80,
        details: smtDetails,
      })
    }
  }

  // ─── Drawing Layers (chart overlay) ────────────────────────────────────────
  const drawingLayers: DrawingLayer[] = tfAnalyses.map(tf =>
    buildDrawingLayer(tf, tf.currentPrice)
  )

  // Inject SMT markers into the drawing layers where divergence is detected
  if (smtComparison?.smtDetected && smtComparison.smtDirection) {
    const smtColor = smtComparison.smtDirection === 'bearish' ? '#f87171' : '#4ade80'
    const smtPos   = smtComparison.smtDirection === 'bearish' ? 'above' : 'below'
    const smtLabel = `SMT ${smtComparison.smtDirection === 'bearish' ? '🔴' : '🟢'} ⚡`

    for (const smtTF of smtComparison.timeframes.filter(t => t.divergence)) {
      const layer = drawingLayers.find(l => l.tf === smtTF.tf)
      if (!layer) continue
      const tfData = tfAnalyses.find(t => t.timeframe === smtTF.tf)
      const price = tfData?.currentPrice ?? currentPrice

      layer.markers.push({ price, label: smtLabel, color: smtColor, position: smtPos })
      layer.horizontalLines.push({ label: 'SMT', price, color: smtColor, dash: true })
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
    smtComparison,
    drawingLayers,
  }
}
