import type { KlineCandle } from './binanceWebSocket'
import { runRealtimeDetector, seedCandles } from './realtimeSignalDetector'

/**
 * Candle feed for index futures.
 *
 * Bybit lists no index products — its SPXUSDT is the SPX6900 memecoin trading
 * near $0.32, not the S&P — so NQ and ES cannot come from the crypto socket.
 * Yahoo serves both and is already reachable from Railway, which is how the
 * outcome tracker prices these same contracts.
 *
 * Without this, NQ↔ES divergence only worked when TradingView happened to have
 * a live alert on both charts.
 */

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart'

/** Yahoo contract → the symbol name already used across the app. */
const SYMBOLS: Array<{ yahoo: string; symbol: string }> = [
  { yahoo: 'NQ=F', symbol: 'NQU2026' },
  { yahoo: 'ES=F', symbol: 'SPX500'  },
]

/** Our timeframe label → [Yahoo interval, Yahoo range]. */
const INTERVALS: Array<[string, string, string]> = [
  ['5m',  '5m',  '5d'],
  ['15m', '15m', '5d'],
  ['30m', '30m', '1mo'],
  ['1h',  '60m', '1mo'],
  ['1D',  '1d',  '1y'],
]

/** Last candle time already forwarded, per symbol+timeframe. */
const lastSeen = new Map<string, number>()

export const yahooStatus = {
  lastPollAt: 0,
  candlesForwarded: 0,
  lastError: null as string | null,
}

async function fetchCandles(
  yahooSymbol: string,
  ourSymbol: string,
  interval: string,
  range: string,
  tf: string,
): Promise<KlineCandle[]> {
  const res = await fetch(
    `${YAHOO}/${yahooSymbol}?interval=${interval}&range=${range}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data: any = await res.json()
  const r = data?.chart?.result?.[0]
  if (!r?.timestamp) throw new Error('no data')

  const q = r.indicators.quote[0]
  const out: KlineCandle[] = []

  for (let i = 0; i < r.timestamp.length; i++) {
    // Yahoo leaves gaps (holidays, halts) as nulls
    if (q.open[i] == null || q.close[i] == null) continue
    out.push({
      symbol: ourSymbol,
      timeframe: tf,
      time: r.timestamp[i],
      open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i],
      volume: q.volume?.[i] ?? 0,
      isClosed: true,
    })
  }

  // The final bar is still forming
  out.pop()
  return out
}

/**
 * One poll cycle: refresh every symbol/timeframe and forward only candles that
 * closed since the previous cycle, so the detector sees each one exactly once.
 */
async function poll(seedOnly = false): Promise<void> {
  for (const { yahoo, symbol } of SYMBOLS) {
    for (const [tf, interval, range] of INTERVALS) {
      const key = `${symbol}:${tf}`
      try {
        const candles = await fetchCandles(yahoo, symbol, interval, range, tf)
        if (candles.length === 0) continue

        if (seedOnly || !lastSeen.has(key)) {
          // Warm the buffer without firing alerts for historical candles
          seedCandles(symbol, tf, candles.slice(-200))
          lastSeen.set(key, candles[candles.length - 1].time)
          continue
        }

        const since = lastSeen.get(key)!
        const fresh = candles.filter(c => c.time > since)
        if (fresh.length === 0) continue

        lastSeen.set(key, fresh[fresh.length - 1].time)
        for (const c of fresh) {
          await runRealtimeDetector(c)
          yahooStatus.candlesForwarded++
        }
      } catch (err: any) {
        yahooStatus.lastError = `${symbol} ${tf}: ${err.message}`
      }
      // Space out requests — Yahoo throttles bursts
      await new Promise(r => setTimeout(r, 250))
    }
  }
  yahooStatus.lastPollAt = Date.now()
}

let timer: ReturnType<typeof setInterval> | null = null

export function startYahooFeed(): void {
  console.log('[YahooFeed] Starting NQ/ES candle feed...')

  // Seed first so detectors have history and no alerts fire for old candles
  poll(true)
    .then(() => console.log('[YahooFeed] Buffers seeded'))
    .catch(err => console.error('[YahooFeed] seed failed:', err.message))

  // 5m is the fastest timeframe tracked, so polling faster adds nothing
  timer = setInterval(() => {
    poll().catch(err => console.error('[YahooFeed] poll failed:', err.message))
  }, 60_000)
}

export function stopYahooFeed(): void {
  if (timer) { clearInterval(timer); timer = null }
}
