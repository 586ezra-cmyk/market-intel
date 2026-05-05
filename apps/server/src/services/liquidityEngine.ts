import { v4 as uuid } from 'uuid'
import type { Liquidity, LiquidityType, Timeframe, Direction } from '@market/shared'
import { getDb } from '../db/client'

export interface LiquidityPayload {
  symbol: string
  timeframe: Timeframe
  type: LiquidityType | string
  price: number
  firstTime: number
  lastTime?: number
}

export function upsertLiquidity(payload: LiquidityPayload): Liquidity {
  const db = getDb()

  // Check if a similar level already exists within 0.05% tolerance
  const tolerance = payload.price * 0.0005
  const existing = db.prepare(`SELECT * FROM liquidities
    WHERE symbol = ? AND timeframe = ? AND type = ? AND swept = 0
    AND ABS(price - ?) < ?`)
    .get(payload.symbol, payload.timeframe, payload.type, payload.price, tolerance) as any

  if (existing) {
    // Update touch count
    db.prepare(`UPDATE liquidities SET touch_count = touch_count + 1, last_time = ? WHERE id = ?`)
      .run(payload.lastTime ?? payload.firstTime, existing.id)
    return dbRowToLiquidity({ ...existing, touch_count: existing.touch_count + 1 })
  }

  const id = uuid()
  const now = Date.now()
  db.prepare(`INSERT INTO liquidities (id, symbol, timeframe, type, price, touch_count, first_time, last_time, swept, swept_at, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0, NULL, ?)`)
    .run(id, payload.symbol, payload.timeframe, payload.type, payload.price,
         payload.firstTime, payload.lastTime ?? payload.firstTime, now)

  return {
    id,
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    type: payload.type as LiquidityType,
    price: payload.price,
    touchCount: 1,
    firstTime: payload.firstTime,
    lastTime: payload.lastTime ?? payload.firstTime,
    swept: false,
    sweptAt: null,
    createdAt: now,
  }
}

export function markSwept(id: string, sweptAt: number): void {
  const db = getDb()
  db.prepare(`UPDATE liquidities SET swept = 1, swept_at = ? WHERE id = ?`).run(sweptAt, id)
}

/**
 * Check if a price sweeps any active liquidity level.
 * A sweep = price briefly goes beyond the level then returns.
 */
export function checkLiquiditySweep(
  symbol: string,
  timeframe: Timeframe,
  high: number,
  low: number,
  close: number,
  time: number,
): Liquidity[] {
  const db = getDb()
  const active = db.prepare(`SELECT * FROM liquidities WHERE symbol = ? AND timeframe = ? AND swept = 0`)
    .all(symbol, timeframe) as any[]

  const swept: Liquidity[] = []

  for (const liq of active) {
    // Buy-side liquidity swept: price wick above, close below
    if ((liq.type.includes('high') || liq.type === 'equal_highs' || liq.type === 'pdh' || liq.type === 'pwh' || liq.type === 'pmh')
        && high > liq.price && close < liq.price) {
      markSwept(liq.id, time)
      swept.push(dbRowToLiquidity({ ...liq, swept: 1, swept_at: time }))
    }
    // Sell-side liquidity swept: price wick below, close above
    else if ((liq.type.includes('low') || liq.type === 'equal_lows' || liq.type === 'pdl' || liq.type === 'pwl' || liq.type === 'pml')
        && low < liq.price && close > liq.price) {
      markSwept(liq.id, time)
      swept.push(dbRowToLiquidity({ ...liq, swept: 1, swept_at: time }))
    }
  }

  return swept
}

export function getActiveLiquidity(symbol: string, timeframe: Timeframe): Liquidity[] {
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM liquidities WHERE symbol = ? AND timeframe = ? AND swept = 0 ORDER BY first_time DESC`)
    .all(symbol, timeframe) as any[]
  return rows.map(dbRowToLiquidity)
}

/**
 * Find nearest external liquidity levels as TP targets
 */
export function getNearestLiquidityTargets(
  symbol: string,
  timeframe: Timeframe,
  direction: Direction,
  currentPrice: number,
): { tp1: Liquidity | null; tp2: Liquidity | null; tp3: Liquidity | null } {
  const active = getActiveLiquidity(symbol, timeframe)

  let targets: Liquidity[]
  if (direction === 'bullish') {
    targets = active
      .filter(l => l.price > currentPrice)
      .sort((a, b) => a.price - b.price)
  } else {
    targets = active
      .filter(l => l.price < currentPrice)
      .sort((a, b) => b.price - a.price)
  }

  return {
    tp1: targets[0] ?? null,
    tp2: targets[1] ?? null,
    tp3: targets[2] ?? null,
  }
}

function dbRowToLiquidity(r: any): Liquidity {
  return {
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    type: r.type as LiquidityType,
    price: r.price,
    touchCount: r.touch_count,
    firstTime: r.first_time,
    lastTime: r.last_time,
    swept: r.swept === 1,
    sweptAt: r.swept_at ?? null,
    createdAt: r.created_at,
  }
}
