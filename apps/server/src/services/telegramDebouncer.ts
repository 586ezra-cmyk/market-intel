import type { Timeframe } from '@market/shared'
import { sendTelegram } from './alertDispatcher'

/**
 * Holds outgoing alerts briefly so each instrument speaks once.
 *
 * Timeframes are evaluated independently, so one candle close can produce a
 * long from the 15m read and a short from the 30m read in the same second.
 * Both were sent, and two opposite calls a minute apart make the feed
 * unusable no matter which one is right.
 *
 * A direction guard cannot solve this: at equal timestamps there is no
 * "earlier call" to defend, and letting the stronger one through simply means
 * the weaker was already sent. So alerts wait a short window and only the
 * highest-conviction read per symbol is delivered.
 *
 * Everything is still written to the database immediately — the website keeps
 * the complete record, including the reads that lost.
 */
const WINDOW_MS = 90_000

interface Pending {
  message: string
  score: number
  timeframe: Timeframe
  direction: string
  timer: ReturnType<typeof setTimeout>
  /** Reads suppressed in favour of this one, for logging. */
  beaten: Array<{ direction: string; score: number; timeframe: string }>
}

const pending = new Map<string, Pending>()

export const debouncerStats = {
  queued: 0,
  sent: 0,
  superseded: 0,
  lastConflict: null as string | null,
}

export function queueTelegramAlert(
  symbol: string,
  message: string,
  score: number,
  timeframe: Timeframe,
  direction: string,
): void {
  const existing = pending.get(symbol)
  debouncerStats.queued++

  if (existing) {
    if (existing.direction !== direction) {
      debouncerStats.lastConflict =
        `${symbol}: ${existing.direction}(${existing.score}) vs ${direction}(${score}) — הנמוך נחסם`
    }

    // Keep whichever read carries more conviction; the loser is recorded so
    // the conflict is visible rather than silently dropped.
    if (score <= existing.score) {
      debouncerStats.superseded++
      existing.beaten.push({ direction, score, timeframe })
      return
    }

    clearTimeout(existing.timer)
    debouncerStats.superseded++
    existing.beaten.push({
      direction: existing.direction, score: existing.score, timeframe: existing.timeframe,
    })
    pending.set(symbol, {
      message, score, timeframe, direction,
      beaten: existing.beaten,
      timer: setTimeout(() => flush(symbol), WINDOW_MS),
    })
    return
  }

  pending.set(symbol, {
    message, score, timeframe, direction,
    beaten: [],
    timer: setTimeout(() => flush(symbol), WINDOW_MS),
  })
}

function flush(symbol: string): void {
  const p = pending.get(symbol)
  if (!p) return
  pending.delete(symbol)

  if (p.beaten.length > 0) {
    const list = p.beaten.map(b => `${b.direction} ${b.score} (${b.timeframe})`).join(', ')
    console.log(`[Debounce] ${symbol}: sending ${p.direction} ${p.score} (${p.timeframe}); held back ${list}`)
  }

  debouncerStats.sent++
  sendTelegram(p.message, p.score, p.timeframe).catch(err =>
    console.error('[Telegram] send failed:', err.message))
}
