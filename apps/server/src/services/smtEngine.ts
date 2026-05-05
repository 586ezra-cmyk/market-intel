import { v4 as uuid } from 'uuid'
import type { SMTSignal, Timeframe } from '@market/shared'
import { getDb } from '../db/client'

// SMT pairs: asset1 is the primary chart, asset2 is the correlated asset
export const SMT_PAIRS: Array<[string, string]> = [
  ['BTCUSDT', 'ETHUSDT'],
  ['NQ1!', 'ES1!'],
]

// Per-pair pivot tracking for SMT detection — tracks BOTH assets separately
interface PivotState {
  a1PrevHigh: number | null
  a1PrevLow: number | null
  a1CurrentHigh: number | null
  a1CurrentLow: number | null
  a2PrevHigh: number | null
  a2PrevLow: number | null
  a2CurrentHigh: number | null
  a2CurrentLow: number | null
}

const pivotCache = new Map<string, PivotState>()

function getPivotState(asset1: string, asset2: string, timeframe: Timeframe): PivotState {
  const key = `${asset1}:${asset2}:${timeframe}`
  if (!pivotCache.has(key)) {
    pivotCache.set(key, {
      a1PrevHigh: null, a1PrevLow: null, a1CurrentHigh: null, a1CurrentLow: null,
      a2PrevHigh: null, a2PrevLow: null, a2CurrentHigh: null, a2CurrentLow: null,
    })
  }
  return pivotCache.get(key)!
}

export interface SMTInput {
  timeframe: Timeframe
  time: number
  asset1: string
  asset1Price: number
  asset1High: number
  asset1Low: number
  asset2: string
  asset2Price: number
  asset2High: number
  asset2Low: number
}

export function detectSMT(input: SMTInput): SMTSignal | null {
  const state = getPivotState(input.asset1, input.asset2, input.timeframe)
  let result: SMTSignal | null = null

  // Need at least one prior bar for both assets
  if (state.a1CurrentHigh !== null && state.a2CurrentHigh !== null) {
    // Bearish SMT: asset1 makes new HH (above its previous), asset2 does NOT confirm
    if (input.asset1High > state.a1CurrentHigh &&
        input.asset2High <= state.a2CurrentHigh) {
      result = saveSMTSignal({
        timeframe: input.timeframe,
        time: input.time,
        asset1: input.asset1,
        asset2: input.asset2,
        type: 'bearish_smt',
        asset1Price: input.asset1Price,
        asset2Price: input.asset2Price,
      })
    }
    // Bullish SMT: asset1 makes new LL (below its previous), asset2 does NOT confirm
    else if (state.a1CurrentLow !== null && state.a2CurrentLow !== null &&
             input.asset1Low < state.a1CurrentLow &&
             input.asset2Low >= state.a2CurrentLow) {
      result = saveSMTSignal({
        timeframe: input.timeframe,
        time: input.time,
        asset1: input.asset1,
        asset2: input.asset2,
        type: 'bullish_smt',
        asset1Price: input.asset1Price,
        asset2Price: input.asset2Price,
      })
    }
  }

  // Update pivot state for both assets (keep running max/min)
  state.a1PrevHigh = state.a1CurrentHigh
  state.a1PrevLow = state.a1CurrentLow
  state.a1CurrentHigh = state.a1CurrentHigh === null ? input.asset1High : Math.max(state.a1CurrentHigh, input.asset1High)
  state.a1CurrentLow  = state.a1CurrentLow  === null ? input.asset1Low  : Math.min(state.a1CurrentLow,  input.asset1Low)

  state.a2PrevHigh = state.a2CurrentHigh
  state.a2PrevLow = state.a2CurrentLow
  state.a2CurrentHigh = state.a2CurrentHigh === null ? input.asset2High : Math.max(state.a2CurrentHigh, input.asset2High)
  state.a2CurrentLow  = state.a2CurrentLow  === null ? input.asset2Low  : Math.min(state.a2CurrentLow,  input.asset2Low)

  return result
}

function saveSMTSignal(payload: Omit<SMTSignal, 'id' | 'createdAt'>): SMTSignal {
  const db = getDb()
  const id = uuid()
  const now = Date.now()
  db.prepare(`INSERT INTO smt_signals (id, timeframe, time, asset1, asset2, type, asset1_price, asset2_price, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, payload.timeframe, payload.time, payload.asset1, payload.asset2,
         payload.type, payload.asset1Price, payload.asset2Price, now)
  return { id, ...payload, createdAt: now }
}

// ─── iSMT (Intermarket SMT — exactly 2 consecutive candles) ───────────────────
// TF: 5m, 15m, 30m, 1h only

export const ISMT_TIMEFRAMES: Timeframe[] = ['5m', '15m', '30m', '1h']

interface ISMTCandleBuffer {
  candles: Array<{ time: number; high: number; low: number; close: number }>
}

const ismtBuffer = new Map<string, ISMTCandleBuffer>()

function getISMTBuffer(asset: string, timeframe: Timeframe): ISMTCandleBuffer {
  const key = `${asset}:${timeframe}`
  if (!ismtBuffer.has(key)) ismtBuffer.set(key, { candles: [] })
  return ismtBuffer.get(key)!
}

export interface ISMTCandle {
  asset: string
  timeframe: Timeframe
  time: number
  high: number
  low: number
  close: number
}

export interface ISMTResult {
  type: 'bearish_ismt' | 'bullish_ismt'
  asset1: string
  asset2: string
  timeframe: Timeframe
  time: number
  leadingAsset: string   // the asset that moved more (price leader)
  entryAsset: string     // the asset with more potential (laggard)
}

/**
 * Feed a candle for an asset and check for iSMT pattern.
 * iSMT requires exactly 2 consecutive candles:
 *   Bearish: Asset A: candle1 sweeps high → candle2 doesn't return → falls down
 *            Asset B: candle2 goes above candle1 high → falls down
 *   Bullish: opposite with lows
 */
export function detectISMT(
  assetA: ISMTCandle,
  assetB: ISMTCandle,
): ISMTResult | null {
  if (!ISMT_TIMEFRAMES.includes(assetA.timeframe)) return null

  const bufA = getISMTBuffer(assetA.asset, assetA.timeframe)
  const bufB = getISMTBuffer(assetB.asset, assetB.timeframe)

  bufA.candles.push({ time: assetA.time, high: assetA.high, low: assetA.low, close: assetA.close })
  bufB.candles.push({ time: assetB.time, high: assetB.high, low: assetB.low, close: assetB.close })

  // Keep only last 2 candles
  if (bufA.candles.length > 2) bufA.candles.shift()
  if (bufB.candles.length > 2) bufB.candles.shift()

  if (bufA.candles.length < 2 || bufB.candles.length < 2) return null

  const [a1, a2] = bufA.candles
  const [b1, b2] = bufB.candles

  // Bearish iSMT:
  // Asset A: candle1 sweeps high (wick above), candle2 does NOT return to candle1 high
  // Asset B: candle2 breaks above candle1 high, then closes below → divergence
  const bearish =
    a1.high < a2.high && // A makes new high on candle2 (or we look at it differently)
    a2.close < a1.high && // A candle2 closes back below A candle1 high → A swept and rejected
    b2.high > b1.high &&  // B candle2 also makes new high
    b2.close < b1.high    // B candle2 also closes back below B candle1 high

  // Actually the iSMT bearish definition: A sweeps ABOVE candle1 on candle2, B does NOT confirm
  // Let me re-interpret: A1 has a high. A2 comes and sweeps ABOVE A1 high then closes below.
  // B2 does NOT sweep above B1 high (or sweeps less). → Divergence → bearish signal
  const bearish_ismt =
    a2.high > a1.high &&   // A makes higher high on candle 2
    a2.close < a1.high &&  // A closes back below candle1 high (sweep & rejection)
    !(b2.high > b1.high && b2.close > b1.high) // B did NOT confirm the higher high

  const bullish_ismt =
    a2.low < a1.low &&     // A makes lower low on candle 2
    a2.close > a1.low &&   // A closes back above candle1 low (sweep & rejection)
    !(b2.low < b1.low && b2.close < b1.low) // B did NOT confirm the lower low

  if (!bearish_ismt && !bullish_ismt) return null

  // Determine leading/lagging asset (whoever moved more leads)
  const aRange = assetA.high - assetA.low
  const bRange = assetB.high - assetB.low
  const leadingAsset = aRange >= bRange ? assetA.asset : assetB.asset
  const entryAsset = aRange >= bRange ? assetB.asset : assetA.asset

  return {
    type: bearish_ismt ? 'bearish_ismt' : 'bullish_ismt',
    asset1: assetA.asset,
    asset2: assetB.asset,
    timeframe: assetA.timeframe,
    time: assetA.time,
    leadingAsset,
    entryAsset,
  }
}

export function getRecentSMTSignals(timeframe: Timeframe, limit = 10): SMTSignal[] {
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM smt_signals WHERE timeframe = ? ORDER BY time DESC LIMIT ?`)
    .all(timeframe, limit) as any[]
  return rows.map(r => ({
    id: r.id,
    timeframe: r.timeframe,
    time: r.time,
    asset1: r.asset1,
    asset2: r.asset2,
    type: r.type,
    asset1Price: r.asset1_price,
    asset2Price: r.asset2_price,
    createdAt: r.created_at,
  } as SMTSignal))
}
