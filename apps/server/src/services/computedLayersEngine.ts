import { fetchCandles, type Candle } from './binanceService'
import { getDb } from '../db/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OBZone {
  id: string
  direction: 'bullish' | 'bearish'
  high: number
  low: number
  time: number
  isActive: boolean
}

export interface IFVGZone {
  id: string
  originalDirection: 'bullish' | 'bearish'
  high: number
  low: number
  candleTime: number
  filledAt: number
}

export interface BollingerPoint {
  time: number
  upper: number
  middle: number
  lower: number
}

export interface SessionHL {
  session: 'london' | 'ny' | 'asia'
  high: number
  low: number
  startTime: number
  endTime: number
  isCurrent: boolean
}

export interface SwingPoint {
  id: string
  type: 'high' | 'low'
  price: number
  time: number
  isSwept: boolean
}

export interface WyckoffLabel {
  id: string
  phase: 'accumulation' | 'distribution' | 'markup' | 'markdown' | 'spring' | 'upthrust'
  time: number
  price: number
  label: string
}

export interface JudasSwing {
  id: string
  direction: 'bullish' | 'bearish'
  startTime: number
  peakTime: number
  peakPrice: number
  session: 'london' | 'ny'
}

export interface ISMTPoint {
  id: string
  direction: 'bullish' | 'bearish'
  time: number
  price: number
}

export interface RepricingZone {
  id: string
  type: 'ob' | 'fvg'
  direction: 'bullish' | 'bearish'
  high: number
  low: number
  time: number
  distance: number  // % distance from current price
}

export interface ComputedLayers {
  orderBlocks: OBZone[]
  iFVGs: IFVGZone[]
  bollinger: BollingerPoint[]
  sessionHL: SessionHL[]
  swingPoints: SwingPoint[]
  wyckoffLabels: WyckoffLabel[]
  judasSwings: JudasSwing[]
  ismtDivergences: ISMTPoint[]
  repricingZones: RepricingZone[]
}

// ─── Session time boundaries (UTC) ───────────────────────────────────────────

function getSessionBounds(timestamp: number): { session: 'london' | 'ny' | 'asia'; start: number; end: number } {
  const d = new Date(timestamp * 1000)
  const h = d.getUTCHours()

  if (h >= 7 && h < 13)  return { session: 'london', start: floorToHour(timestamp, 7),  end: floorToHour(timestamp, 13) }
  if (h >= 13 && h < 20) return { session: 'ny',     start: floorToHour(timestamp, 13), end: floorToHour(timestamp, 20) }
  return { session: 'asia', start: 0, end: 0 }
}

function floorToHour(dayTs: number, hour: number): number {
  const d = new Date(dayTs * 1000)
  d.setUTCHours(hour, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

// ─── Order Blocks ─────────────────────────────────────────────────────────────
// Bullish OB: last bearish candle before a strong bullish impulse (next candle closes above OB high)
// Bearish OB: last bullish candle before a strong bearish impulse (next candle closes below OB low)

function detectOrderBlocks(candles: Candle[]): OBZone[] {
  const obs: OBZone[] = []
  const lastPrice = candles[candles.length - 1]?.close ?? 0

  for (let i = 1; i < candles.length - 1; i++) {
    const curr = candles[i]
    const next = candles[i + 1]

    const currBearish = curr.close < curr.open
    const currBullish = curr.close > curr.open
    const currRange   = curr.high - curr.low

    // Bullish OB: bearish candle → next closes above OB high with strong body
    if (currBearish && next.close > curr.high) {
      const nextBody = Math.abs(next.close - next.open)
      if (nextBody > currRange * 0.3) {
        const isActive = lastPrice >= curr.low  // price hasn't gone below OB
        obs.push({
          id:        `ob_bull_${curr.time}`,
          direction: 'bullish',
          high:      curr.high,
          low:       curr.low,
          time:      curr.time,
          isActive,
        })
      }
    }

    // Bearish OB: bullish candle → next closes below OB low with strong body
    if (currBullish && next.close < curr.low) {
      const nextBody = Math.abs(next.close - next.open)
      if (nextBody > currRange * 0.3) {
        const isActive = lastPrice <= curr.high  // price hasn't gone above OB
        obs.push({
          id:        `ob_bear_${curr.time}`,
          direction: 'bearish',
          high:      curr.high,
          low:       curr.low,
          time:      curr.time,
          isActive,
        })
      }
    }
  }

  return obs.slice(-30)
}

// ─── iFVG (Filled FVGs that flipped polarity) ────────────────────────────────
// Get from DB: filled FVGs become support (bullish FVG filled → now support) or resistance

function getIFVGs(symbol: string, timeframe: string): IFVGZone[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM fvgs
    WHERE symbol = ? AND timeframe = ? AND is_active = 0 AND filled_at IS NOT NULL
    ORDER BY filled_at DESC LIMIT 20
  `).all(symbol, timeframe) as any[]

  return rows.map(r => ({
    id:                r.id,
    originalDirection: r.direction as 'bullish' | 'bearish',
    high:              r.top_price,
    low:               r.bottom_price,
    candleTime:        r.candle_time,
    filledAt:          r.filled_at,
  }))
}

// ─── Bollinger Bands (20-period SMA ± 2σ) ───────────────────────────────────

function calcBollinger(candles: Candle[], period = 20, mult = 2): BollingerPoint[] {
  const result: BollingerPoint[] = []

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const closes = slice.map(c => c.close)
    const mean = closes.reduce((a, b) => a + b, 0) / period
    const variance = closes.reduce((a, b) => a + (b - mean) ** 2, 0) / period
    const std = Math.sqrt(variance)

    result.push({
      time:   candles[i].time,
      upper:  mean + mult * std,
      middle: mean,
      lower:  mean - mult * std,
    })
  }

  return result
}

// ─── Session H/L ─────────────────────────────────────────────────────────────

function calcSessionHL(candles: Candle[]): SessionHL[] {
  const sessions: Map<string, SessionHL> = new Map()

  for (const c of candles) {
    const { session, start, end } = getSessionBounds(c.time)
    if (session === 'asia') continue  // skip off-hours for simplicity

    const key = `${session}_${start}`
    const existing = sessions.get(key)
    const nowTs = Date.now() / 1000

    if (!existing) {
      sessions.set(key, {
        session,
        high:      c.high,
        low:       c.low,
        startTime: start || c.time,
        endTime:   end,
        isCurrent: nowTs >= (start || c.time) && nowTs < end,
      })
    } else {
      existing.high = Math.max(existing.high, c.high)
      existing.low  = Math.min(existing.low,  c.low)
    }
  }

  // Return last 4 sessions (2 london + 2 ny)
  return Array.from(sessions.values()).slice(-6)
}

// ─── Swing Points (for Inducement) ───────────────────────────────────────────
// Swing high: candle[i].high > candle[i-1].high && candle[i].high > candle[i+1].high
// Swing low:  candle[i].low  < candle[i-1].low  && candle[i].low  < candle[i+1].low

function detectSwingPoints(candles: Candle[], lookback = 3): SwingPoint[] {
  const points: SwingPoint[] = []
  const lastPrice = candles[candles.length - 1]?.close ?? 0

  for (let i = lookback; i < candles.length - lookback; i++) {
    const curr = candles[i]
    let isSwingHigh = true
    let isSwingLow  = true

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= curr.high || candles[i + j].high >= curr.high) isSwingHigh = false
      if (candles[i - j].low  <= curr.low  || candles[i + j].low  <= curr.low)  isSwingLow  = false
    }

    if (isSwingHigh) {
      points.push({
        id:      `sh_${curr.time}`,
        type:    'high',
        price:   curr.high,
        time:    curr.time,
        isSwept: lastPrice > curr.high,
      })
    }
    if (isSwingLow) {
      points.push({
        id:      `sl_${curr.time}`,
        type:    'low',
        price:   curr.low,
        time:    curr.time,
        isSwept: lastPrice < curr.low,
      })
    }
  }

  return points.slice(-40)
}

// ─── Wyckoff Phase Detection (simplified) ────────────────────────────────────

function detectWyckoff(candles: Candle[]): WyckoffLabel[] {
  const labels: WyckoffLabel[] = []
  if (candles.length < 50) return labels

  const recent = candles.slice(-50)
  const closes = recent.map(c => c.close)
  const highs  = recent.map(c => c.high)
  const lows   = recent.map(c => c.low)

  const rangeHigh = Math.max(...highs)
  const rangeLow  = Math.min(...lows)
  const rangeSize = rangeHigh - rangeLow
  const lastClose = closes[closes.length - 1]
  const lastHigh  = highs[highs.length - 1]
  const lastLow   = lows[lows.length - 1]
  const lastTime  = recent[recent.length - 1].time

  // Trend detection over first 30 candles
  const firstHalf  = closes.slice(0, 25)
  const secondHalf = closes.slice(25)
  const firstAvg   = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const secondAvg  = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
  const trendUp    = secondAvg > firstAvg * 1.02
  const trendDown  = secondAvg < firstAvg * 0.98
  const ranging    = !trendUp && !trendDown

  if (ranging) {
    // Accumulation: ranging after downtrend, with spring (price briefly below range)
    if (lastLow < rangeLow - rangeSize * 0.01) {
      labels.push({ id: `wy_spring_${lastTime}`, phase: 'spring', time: lastTime, price: lastLow, label: '🌱 Spring' })
    }
    // Distribution: ranging after uptrend, with upthrust (price briefly above range)
    if (lastHigh > rangeHigh + rangeSize * 0.01) {
      labels.push({ id: `wy_ut_${lastTime}`, phase: 'upthrust', time: lastTime, price: lastHigh, label: '⚡ UT' })
    }
    const phase = trendDown ? 'accumulation' : 'distribution'
    const phaseLabel = phase === 'accumulation' ? '📦 Accumulation' : '🏭 Distribution'
    labels.push({ id: `wy_phase_${lastTime}`, phase, time: recent[25].time, price: (rangeHigh + rangeLow) / 2, label: phaseLabel })
  } else if (trendUp) {
    labels.push({ id: `wy_markup_${lastTime}`, phase: 'markup', time: lastTime, price: lastClose, label: '📈 Markup' })
  } else if (trendDown) {
    labels.push({ id: `wy_markdown_${lastTime}`, phase: 'markdown', time: lastTime, price: lastClose, label: '📉 Markdown' })
  }

  return labels
}

// ─── Judas Swing ─────────────────────────────────────────────────────────────
// False move at session open that reverses — price moves one way then sharply reverses

function detectJudasSwings(candles: Candle[]): JudasSwing[] {
  const swings: JudasSwing[] = []

  for (let i = 1; i < candles.length - 3; i++) {
    const c = candles[i]
    const h = c.time
    const utcH = new Date(h * 1000).getUTCHours()
    const utcM = new Date(h * 1000).getUTCMinutes()

    // London open: 07:00-07:30 UTC  |  NY open: 13:00-13:30 UTC
    const isLondonOpen = utcH === 7 && utcM < 30
    const isNYOpen     = utcH === 13 && utcM < 30

    if (!isLondonOpen && !isNYOpen) continue

    const session = isLondonOpen ? 'london' : 'ny'

    // Look ahead 3-6 candles for a reversal
    const look = candles.slice(i + 1, i + 6)
    if (look.length < 3) continue

    const peakHigh = Math.max(...look.map(x => x.high))
    const peakLow  = Math.min(...look.map(x => x.low))

    // Bullish Judas (fake up → real down): spike up then closes below open candle
    const peakHighCandle = look.find(x => x.high === peakHigh)
    const lastLook = look[look.length - 1]
    if (peakHigh > c.high * 1.003 && lastLook.close < c.open) {
      swings.push({
        id:        `judas_bull_${c.time}`,
        direction: 'bullish',
        startTime: c.time,
        peakTime:  peakHighCandle!.time,
        peakPrice: peakHigh,
        session,
      })
    }

    // Bearish Judas (fake down → real up): spike down then closes above open candle
    const peakLowCandle = look.find(x => x.low === peakLow)
    if (peakLow < c.low * 0.997 && lastLook.close > c.open) {
      swings.push({
        id:        `judas_bear_${c.time}`,
        direction: 'bearish',
        startTime: c.time,
        peakTime:  peakLowCandle!.time,
        peakPrice: peakLow,
        session,
      })
    }
  }

  return swings.slice(-10)
}

// ─── iSMT (2-candle divergence within same asset) ────────────────────────────
// Pattern: candle[i] makes a higher high, candle[i+1] fails to confirm (lower high)
// and closes below candle[i] open — signals bearish reversal (and vice versa)

function detectISMT(candles: Candle[]): ISMTPoint[] {
  const points: ISMTPoint[] = []

  for (let i = 2; i < candles.length - 1; i++) {
    const prev = candles[i - 1]
    const curr = candles[i]
    const next = candles[i + 1]

    // Bearish iSMT: curr makes new high vs prev, next fails (lower high) and closes below curr.open
    if (curr.high > prev.high && next.high < curr.high && next.close < curr.open) {
      points.push({
        id:        `ismt_bear_${curr.time}`,
        direction: 'bearish',
        time:      curr.time,
        price:     curr.high,
      })
    }

    // Bullish iSMT: curr makes new low vs prev, next fails (higher low) and closes above curr.open
    if (curr.low < prev.low && next.low > curr.low && next.close > curr.open) {
      points.push({
        id:        `ismt_bull_${curr.time}`,
        direction: 'bullish',
        time:      curr.time,
        price:     curr.low,
      })
    }
  }

  return points.slice(-20)
}

// ─── Repricing Zones ─────────────────────────────────────────────────────────
// OBs and iFVGs that price hasn't yet revisited — these are "reprice" targets

function detectRepricingZones(candles: Candle[], obs: OBZone[], ifvgs: IFVGZone[]): RepricingZone[] {
  const lastPrice = candles[candles.length - 1]?.close ?? 0
  const zones: RepricingZone[] = []

  // Active OBs that price hasn't visited yet = repricing targets
  for (const ob of obs) {
    if (!ob.isActive) continue
    const dist = Math.abs((ob.high + ob.low) / 2 - lastPrice) / lastPrice * 100
    zones.push({
      id:        `reprice_ob_${ob.time}`,
      type:      'ob',
      direction: ob.direction,
      high:      ob.high,
      low:       ob.low,
      time:      ob.time,
      distance:  dist,
    })
  }

  // iFVGs = repricing targets (price needs to return to fill them again)
  for (const fvg of ifvgs.slice(0, 10)) {
    const mid  = (fvg.high + fvg.low) / 2
    const dist = Math.abs(mid - lastPrice) / lastPrice * 100
    zones.push({
      id:        `reprice_ifvg_${fvg.candleTime}`,
      type:      'fvg',
      direction: fvg.originalDirection === 'bullish' ? 'bearish' : 'bullish', // flipped
      high:      fvg.high,
      low:       fvg.low,
      time:      fvg.candleTime,
      distance:  dist,
    })
  }

  return zones.sort((a, b) => a.distance - b.distance).slice(0, 15)
}

// ─── Main entry point ─────────────────────────────────────────────────────────

const cache = new Map<string, { ts: number; data: ComputedLayers }>()
const CACHE_TTL = 60_000  // 1 minute

export async function getComputedLayers(symbol: string, timeframe: string): Promise<ComputedLayers> {
  const key = `${symbol}:${timeframe}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  const candles = await fetchCandles(symbol, timeframe, 300)

  const orderBlocks       = detectOrderBlocks(candles)
  const iFVGs             = getIFVGs(symbol, timeframe)
  const bollinger         = calcBollinger(candles)
  const sessionHL         = calcSessionHL(candles)
  const swingPoints       = detectSwingPoints(candles)
  const wyckoffLabels     = detectWyckoff(candles)
  const judasSwings       = detectJudasSwings(candles)
  const ismtDivergences   = detectISMT(candles)
  const repricingZones    = detectRepricingZones(candles, orderBlocks, iFVGs)

  const data: ComputedLayers = {
    orderBlocks,
    iFVGs,
    bollinger,
    sessionHL,
    swingPoints,
    wyckoffLabels,
    judasSwings,
    ismtDivergences,
    repricingZones,
  }

  cache.set(key, { ts: Date.now(), data })
  return data
}
