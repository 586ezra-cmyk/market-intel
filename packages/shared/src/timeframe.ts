import type { Timeframe, TFClass } from './types'
import { LOW_TIMEFRAMES } from './constants'

export function classifyTF(tf: Timeframe): TFClass {
  return (LOW_TIMEFRAMES as readonly string[]).includes(tf) ? 'low' : 'high'
}

export function isLowTF(tf: Timeframe): boolean {
  return classifyTF(tf) === 'low'
}

export function isHighTF(tf: Timeframe): boolean {
  return classifyTF(tf) === 'high'
}

export function isValidTimeframe(value: string): value is Timeframe {
  const valid: string[] = [
    '1m','3m','5m','15m','30m','1h','4h','6h','12h','1D','1W','1M'
  ]
  return valid.includes(value)
}
