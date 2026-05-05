import { v4 as uuid } from 'uuid'
import type { Structure, Direction, Timeframe } from '@market/shared'
import { getDb } from '../db/client'

interface CandlePoint {
  time: number
  high: number
  low: number
  close: number
}

// State machine per symbol+TF
// Tracks HH, HL, LH, LL to derive BOS / CHoCH
interface MarketState {
  lastSwingHigh: number | null
  lastSwingLow: number | null
  trend: 'bullish' | 'bearish' | 'neutral'
}

const stateCache = new Map<string, MarketState>()

function getState(symbol: string, timeframe: Timeframe): MarketState {
  const key = `${symbol}:${timeframe}`
  if (!stateCache.has(key)) {
    stateCache.set(key, { lastSwingHigh: null, lastSwingLow: null, trend: 'neutral' })
  }
  return stateCache.get(key)!
}

export interface StructurePayload {
  symbol: string
  timeframe: Timeframe
  type: 'BOS' | 'CHoCH'
  direction: Direction
  price: number
  time: number
  confirmed?: boolean
}

export function upsertStructure(payload: StructurePayload): Structure {
  const db = getDb()
  const id = uuid()
  const now = Date.now()

  db.prepare(`INSERT INTO structures (id, symbol, timeframe, type, direction, price, time, confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, payload.symbol, payload.timeframe, payload.type, payload.direction,
         payload.price, payload.time, payload.confirmed ? 1 : 0, now)

  return {
    id,
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    type: payload.type,
    direction: payload.direction,
    price: payload.price,
    time: payload.time,
    confirmed: payload.confirmed ?? false,
    createdAt: now,
  }
}

/**
 * Feed a new candle into the state machine for a given symbol+TF.
 * Returns a Structure if a BOS or CHoCH was detected, otherwise null.
 */
export function processCandle(
  symbol: string,
  timeframe: Timeframe,
  candle: CandlePoint,
): Structure | null {
  const state = getState(symbol, timeframe)

  let result: Structure | null = null

  // --- Bullish BOS: close above last swing high (trend was already bullish → continuation)
  if (state.lastSwingHigh !== null && candle.close > state.lastSwingHigh) {
    const structType = state.trend === 'bullish' ? 'BOS' : 'CHoCH'
    result = upsertStructure({
      symbol, timeframe,
      type: structType,
      direction: 'bullish',
      price: state.lastSwingHigh,
      time: candle.time,
      confirmed: true,
    })
    state.trend = 'bullish'
    state.lastSwingHigh = candle.high
  }

  // --- Bearish BOS: close below last swing low
  else if (state.lastSwingLow !== null && candle.close < state.lastSwingLow) {
    const structType = state.trend === 'bearish' ? 'BOS' : 'CHoCH'
    result = upsertStructure({
      symbol, timeframe,
      type: structType,
      direction: 'bearish',
      price: state.lastSwingLow,
      time: candle.time,
      confirmed: true,
    })
    state.trend = 'bearish'
    state.lastSwingLow = candle.low
  }

  // Update swing points
  if (state.lastSwingHigh === null || candle.high > state.lastSwingHigh) {
    state.lastSwingHigh = candle.high
  }
  if (state.lastSwingLow === null || candle.low < state.lastSwingLow) {
    state.lastSwingLow = candle.low
  }

  return result
}

export function getRecentStructures(symbol: string, timeframe: Timeframe, limit = 10): Structure[] {
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM structures WHERE symbol = ? AND timeframe = ? ORDER BY time DESC LIMIT ?`)
    .all(symbol, timeframe, limit) as any[]
  return rows.map(dbRowToStructure)
}

export function getLatestStructure(symbol: string, timeframe: Timeframe): Structure | null {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM structures WHERE symbol = ? AND timeframe = ? ORDER BY time DESC LIMIT 1`)
    .get(symbol, timeframe) as any
  return row ? dbRowToStructure(row) : null
}

function dbRowToStructure(r: any): Structure {
  return {
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    type: r.type,
    direction: r.direction,
    price: r.price,
    time: r.time,
    confirmed: r.confirmed === 1,
    createdAt: r.created_at,
  }
}
