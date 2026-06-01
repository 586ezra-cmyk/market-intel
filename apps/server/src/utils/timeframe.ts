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

// TradingView sends bare numbers: "1","3","5","15","30","60","240","D","W","M"
// We normalize them to our format: "1m","3m","5m","15m","30m","1h","4h","1D","1W","1M"
const TV_TF_MAP: Record<string, string> = {
  '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m',
  '60': '1h', '120': '2h', '240': '4h', '360': '6h', '480': '8h', '720': '12h',
  'D': '1D', 'W': '1W', 'M': '1M',
}

export function parseTF(value: unknown): Timeframe {
  if (typeof value !== 'string') throw new Error(`Invalid timeframe: ${value}`)
  const normalized = TV_TF_MAP[value] ?? value
  if (!isValidTimeframe(normalized)) {
    throw new Error(`Invalid timeframe: ${value}`)
  }
  return normalized as Timeframe
}
