import type { KlineCandle } from './binanceWebSocket'
import { seedCandles, getBufferSize } from './realtimeSignalDetector'

const BYBIT_REST = 'https://api.bybit.com/v5/market/kline'

/**
 * Bybit returns klines newest-first as string tuples:
 * [startMs, open, high, low, close, volume, turnover]
 */
type BybitKline = [string, string, string, string, string, string, string]

/**
 * Fetch recent closed candles for one symbol/interval.
 * `interval` is the Bybit code (1, 5, 15, 30, 60, 240, D, W);
 * `tfLabel` is our internal label (1m, 5m, ... 1D, 1W).
 */
async function fetchKlines(
  symbol: string,
  interval: string,
  tfLabel: string,
  limit = 200,
): Promise<KlineCandle[]> {
  const url = `${BYBIT_REST}?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data: any = await res.json()
  if (data.retCode !== 0) throw new Error(data.retMsg ?? `retCode ${data.retCode}`)

  const list: BybitKline[] = data.result?.list ?? []

  const candles = list.map(k => ({
    symbol,
    timeframe: tfLabel,
    time:   Math.floor(parseInt(k[0], 10) / 1000),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
    isClosed: true,
  }))

  // Bybit sends newest-first; buffers expect oldest-first.
  candles.reverse()

  // The most recent entry is the still-forming candle — drop it.
  candles.pop()

  return candles
}

/**
 * Warm the candle buffers for every tracked symbol/timeframe.
 * Runs once at startup, before/alongside the WebSocket connection.
 */
export async function backfillBybitCandles(
  symbols: string[],
  intervals: Array<[string, string]>,   // [bybitInterval, tfLabel]
): Promise<void> {
  console.log('[BybitBackfill] Warming candle buffers...')

  const jobs = symbols.flatMap(sym =>
    intervals.map(([interval, tfLabel]) => ({ sym, interval, tfLabel }))
  )

  let ok = 0
  let failed = 0

  // Sequential with a small delay — Bybit rate-limits bursts, and this only
  // runs once at boot so latency is not a concern.
  for (const { sym, interval, tfLabel } of jobs) {
    try {
      const candles = await fetchKlines(sym, interval, tfLabel)
      seedCandles(sym, tfLabel, candles)
      ok++
    } catch (err: any) {
      failed++
      console.error(`[BybitBackfill] ${sym} ${tfLabel} failed: ${err.message}`)
    }
    await new Promise(r => setTimeout(r, 120))
  }

  const summary = symbols
    .map(s => `${s}(4h:${getBufferSize(s, '4h')} 1D:${getBufferSize(s, '1D')})`)
    .join(' ')
  console.log(`[BybitBackfill] Done — ${ok} loaded, ${failed} failed. ${summary}`)
}
