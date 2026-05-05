import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(p: number): string {
  return p.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatUTCTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('he-IL', {
    timeZone: 'UTC',
    hour: '2-digit', minute: '2-digit',
  })
}

export function scoreBadgeClass(score: number): string {
  if (score >= 7) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}

export function calcRR(entry: number, sl: number, tp: number): string {
  const risk = Math.abs(entry - sl)
  if (!risk) return '—'
  const reward = Math.abs(tp - entry)
  return `1:${(reward / risk).toFixed(1)}`
}

export const TF_OPTIONS = [
  '1m','3m','5m','15m','30m','1h','4h','6h','12h','1D','1W','1M'
]

export const SYMBOL_OPTIONS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
  'NQ1!', 'ES1!', 'XAUUSD',
]
