import { v4 as uuid } from 'uuid'
import { classifyTF } from '@market/shared'
import type { Timeframe, Range, Session } from '@market/shared'
import { getDb } from '../db/client'

interface RangePayload {
  symbol: string
  timeframe: Timeframe
  high: number
  low: number
  startTime: number
  endTime?: number
  session?: Session
}

export function upsertRange(payload: RangePayload): Range {
  const db = getDb()
  const tfClass = classifyTF(payload.timeframe)
  const rangeType = tfClass === 'low' ? 'session' : 'swing'
  const midpoint = (payload.high + payload.low) / 2

  // deactivate previous active range for this symbol+tf
  db.prepare(`UPDATE ranges SET is_active = 0, end_time = ? WHERE symbol = ? AND timeframe = ? AND is_active = 1`)
    .run(payload.startTime, payload.symbol, payload.timeframe)

  const id = uuid()
  const now = Date.now()

  db.prepare(`INSERT INTO ranges
    (id, symbol, timeframe, tf_class, range_type, high, low, midpoint, start_time, end_time, is_active, session, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(id, payload.symbol, payload.timeframe, tfClass, rangeType,
         payload.high, payload.low, midpoint,
         payload.startTime, payload.endTime ?? null,
         payload.session ?? null, now)

  return {
    id, symbol: payload.symbol, timeframe: payload.timeframe,
    tfClass, rangeType, high: payload.high, low: payload.low,
    midpoint, startTime: payload.startTime,
    endTime: payload.endTime ?? null, isActive: true,
    session: payload.session ?? null,
  }
}

export function getActiveRange(symbol: string, timeframe: Timeframe): Range | null {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM ranges WHERE symbol = ? AND timeframe = ? AND is_active = 1`).get(symbol, timeframe) as any
  if (!row) return null
  return dbRowToRange(row)
}

export function getRangeHistory(symbol: string, timeframe: Timeframe, limit = 20): Range[] {
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM ranges WHERE symbol = ? AND timeframe = ? ORDER BY start_time DESC LIMIT ?`).all(symbol, timeframe, limit) as any[]
  return rows.map(dbRowToRange)
}

function dbRowToRange(r: any): Range {
  return {
    id: r.id, symbol: r.symbol, timeframe: r.timeframe,
    tfClass: r.tf_class, rangeType: r.range_type,
    high: r.high, low: r.low, midpoint: r.midpoint,
    startTime: r.start_time, endTime: r.end_time ?? null,
    isActive: r.is_active === 1, session: r.session ?? null,
  }
}
