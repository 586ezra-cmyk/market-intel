import { classifyTF, isValidTimeframe } from '@market/shared'
import type { Timeframe } from '@market/shared'

export { classifyTF, isValidTimeframe }

export function nowMs(): number {
  return Date.now()
}

export function utcHour(): number {
  return new Date().getUTCHours()
}

export function isInKillZone(): boolean {
  const h = utcHour()
  return (h >= 7 && h < 11) || (h >= 13 && h < 16)
}

export function currentSession(): string {
  const h = utcHour()
  if (h >= 20 || h < 4) return 'asian'
  if (h >= 7 && h < 11) return 'london'
  if (h >= 13 && h < 16) return 'ny'
  return 'off-session'
}

export function parseTF(value: unknown): Timeframe {
  if (typeof value !== 'string' || !isValidTimeframe(value)) {
    throw new Error(`Invalid timeframe: ${value}`)
  }
  return value
}
