import { v4 as uuid } from 'uuid'
import type { FVG, Direction, Timeframe } from '@market/shared'
import { getDb } from '../db/client'
import { isInKillZone, currentSession } from '../utils/timeframe'

export interface FVGPayload {
  symbol: string
  timeframe: Timeframe
  direction: Direction
  topPrice: number
  bottomPrice: number
  candleTime: number
  structureRef?: string
}

export function createFVG(payload: FVGPayload): FVG {
  const db = getDb()
  const id = uuid()
  const now = Date.now()
  const midPrice = (payload.topPrice + payload.bottomPrice) / 2
  const inKillZone = isInKillZone()
  const session = currentSession()

  db.prepare(`INSERT INTO fvgs
    (id, symbol, timeframe, direction, top_price, bottom_price, mid_price,
     candle_time, is_active, filled_at, in_premium, near_liquidity,
     in_kill_zone, structure_ref, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, 0, 0, ?, ?, ?)`)
    .run(id, payload.symbol, payload.timeframe, payload.direction,
         payload.topPrice, payload.bottomPrice, midPrice,
         payload.candleTime, inKillZone ? 1 : 0, payload.structureRef ?? null, now)

  return {
    id,
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    direction: payload.direction,
    topPrice: payload.topPrice,
    bottomPrice: payload.bottomPrice,
    midPrice,
    candleTime: payload.candleTime,
    isActive: true,
    filledAt: null,
    inPremium: false,
    nearLiquidity: false,
    inKillZone: inKillZone,
    structureRef: payload.structureRef ?? null,
    createdAt: now,
  }
}

export function markFVGFilled(id: string, filledAt: number): void {
  const db = getDb()
  db.prepare(`UPDATE fvgs SET is_active = 0, filled_at = ? WHERE id = ?`)
    .run(filledAt, id)
}

/**
 * Check if a price fills any active FVG for this symbol+TF.
 * A bullish FVG is filled when price goes below its bottomPrice.
 * A bearish FVG is filled when price goes above its topPrice.
 */
export function checkFVGFills(symbol: string, timeframe: Timeframe, price: number, time: number): void {
  const db = getDb()
  const activeFVGs = db.prepare(`SELECT * FROM fvgs WHERE symbol = ? AND timeframe = ? AND is_active = 1`)
    .all(symbol, timeframe) as any[]

  for (const fvg of activeFVGs) {
    const filled =
      (fvg.direction === 'bullish' && price <= fvg.bottom_price) ||
      (fvg.direction === 'bearish' && price >= fvg.top_price)

    if (filled) {
      markFVGFilled(fvg.id, time)
    }
  }
}

export function getActiveFVGs(symbol: string, timeframe: Timeframe): FVG[] {
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM fvgs WHERE symbol = ? AND timeframe = ? AND is_active = 1 ORDER BY candle_time DESC`)
    .all(symbol, timeframe) as any[]
  return rows.map(dbRowToFVG)
}

export function getNearestActiveFVG(symbol: string, timeframe: Timeframe, direction: Direction, currentPrice: number): FVG | null {
  const fvgs = getActiveFVGs(symbol, timeframe).filter(f => f.direction === direction)
  if (fvgs.length === 0) return null

  // Find nearest FVG in the direction of travel
  if (direction === 'bullish') {
    // For bullish, find the nearest FVG above current price (internal) or below (external)
    const above = fvgs.filter(f => f.bottomPrice > currentPrice)
    if (above.length > 0) return above.reduce((a, b) => a.bottomPrice < b.bottomPrice ? a : b)
  } else {
    const below = fvgs.filter(f => f.topPrice < currentPrice)
    if (below.length > 0) return below.reduce((a, b) => a.topPrice > b.topPrice ? a : b)
  }

  return fvgs[0] ?? null
}

function dbRowToFVG(r: any): FVG {
  return {
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    direction: r.direction as Direction,
    topPrice: r.top_price,
    bottomPrice: r.bottom_price,
    midPrice: r.mid_price,
    candleTime: r.candle_time,
    isActive: r.is_active === 1,
    filledAt: r.filled_at ?? null,
    inPremium: r.in_premium === 1,
    nearLiquidity: r.near_liquidity === 1,
    inKillZone: r.in_kill_zone === 1,
    structureRef: r.structure_ref ?? null,
    createdAt: r.created_at,
  }
}
