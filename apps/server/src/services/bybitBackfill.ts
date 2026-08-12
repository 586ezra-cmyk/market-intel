import type { KlineCandle } from './binanceWebSocket'
import { seedCandles, getBufferSize } from './realtimeSignalDetector'

/**
 * Historical candle backfill.
 *
 * Railway's US egress is blocked by several exchanges (Binance returns 451,
 * api.bybit.com returns a CloudFront 403), so a single source is not reliable.
 * Sources are tried in order until one returns data; the winner is recorded in
 * `backfillReport` so the active source is visible via /api/connections/crypto-status.
 */

// Last backfill outcome, surfaced via /api/connections/crypto-status so the
// cause of an empty buffer is visible without Railway logs.
export const backfillReport = {
  ranAt: 0 as number,
  source: null as string | null,
  loaded: 0,
  failed: 0,
  firstError: null as string | null,
}

interface Source {
  name: string
  /** Map our timeframe label to this source's interval code. */
  interval: (tf: string) => string | null
  fetch: (symbol: string, interval: string, tf: string) => Promise<KlineCandle[]>
}

// ─── Bybit (primary + alternate domain) ──────────────────────────────────────

const BYBIT_TF: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '4h': '240', '1D': 'D', '1W': 'W',
}

/** Bybit klines are newest-first: [startMs, open, high, low, close, volume, turnover] */
function bybitSource(host: string): Source {
  return {
    name: host,
    interval: tf => BYBIT_TF[tf] ?? null,
    fetch: async (symbol, interval, tf) => {
      const url = `https://${host}/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=200`
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${body.replace(/\s+/g, ' ').slice(0, 100)}`)
      }
      const data: any = await res.json()
      if (data.retCode !== 0) throw new Error(data.retMsg ?? `retCode ${data.retCode}`)

      const list: string[][] = data.result?.list ?? []
      const candles = list.map(k => ({
        symbol,
        timeframe: tf,
        time:   Math.floor(parseInt(k[0], 10) / 1000),
        open:   parseFloat(k[1]),
        high:   parseFloat(k[2]),
        low:    parseFloat(k[3]),
        close:  parseFloat(k[4]),
        volume: parseFloat(k[5]),
        isClosed: true,
      }))
      candles.reverse()   // newest-first → oldest-first
      candles.pop()       // drop the still-forming candle
      return candles
    },
  }
}

// ─── Kraken (fallback — reachable from US egress) ────────────────────────────

const KRAKEN_TF: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '4h': '240', '1D': '1440', '1W': '10080',
}

/** Kraken OHLC is oldest-first: [timeSec, open, high, low, close, vwap, volume, count] */
const krakenSource: Source = {
  name: 'api.kraken.com',
  interval: tf => KRAKEN_TF[tf] ?? null,
  fetch: async (symbol, interval, tf) => {
    const url = `https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=${interval}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data: any = await res.json()
    if (data.error?.length) throw new Error(data.error.join(','))

    // Kraken echoes its own pair key (e.g. BTCUSDT → XBTUSDT)
    const result = data.result ?? {}
    const key = Object.keys(result).find(k => k !== 'last')
    if (!key) throw new Error('no pair in response')

    const rows: any[][] = result[key]
    const candles = rows.map(k => ({
      symbol,                       // keep OUR symbol so buffers line up
      timeframe: tf,
      time:   Number(k[0]),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[6]),
      isClosed: true,
    }))
    candles.pop()                   // last row is the still-forming candle
    return candles.slice(-200)
  },
}

const SOURCES: Source[] = [
  bybitSource('api.bytick.com'),   // Bybit's alternate domain
  bybitSource('api.bybit.com'),    // primary (CloudFront-blocked on Railway)
  krakenSource,                    // different exchange, US-reachable
]

/**
 * Warm the candle buffers for every tracked symbol/timeframe.
 * Runs once at startup, before the WebSocket connects.
 */
export async function backfillBybitCandles(
  symbols: string[],
  timeframes: string[],
): Promise<void> {
  console.log('[Backfill] Warming candle buffers...')

  // Probe each source with a single request; use the first that answers.
  let active: Source | null = null
  for (const src of SOURCES) {
    const iv = src.interval(timeframes[0])
    if (!iv) continue
    try {
      const probe = await src.fetch(symbols[0], iv, timeframes[0])
      if (probe.length > 0) {
        active = src
        seedCandles(symbols[0], timeframes[0], probe)
        console.log(`[Backfill] Using source: ${src.name}`)
        break
      }
      throw new Error('empty response')
    } catch (err: any) {
      if (!backfillReport.firstError) {
        backfillReport.firstError = `${src.name}: ${err.message}`
      }
      console.warn(`[Backfill] ${src.name} unavailable: ${err.message}`)
    }
  }

  if (!active) {
    backfillReport.ranAt = Date.now()
    backfillReport.failed = symbols.length * timeframes.length
    console.error('[Backfill] All sources failed — buffers will fill from live candles only')
    return
  }

  let ok = 1   // the probe already seeded one combination
  let failed = 0

  for (const sym of symbols) {
    for (const tf of timeframes) {
      if (sym === symbols[0] && tf === timeframes[0]) continue   // already seeded
      const iv = active.interval(tf)
      if (!iv) { failed++; continue }
      try {
        seedCandles(sym, tf, await active.fetch(sym, iv, tf))
        ok++
      } catch (err: any) {
        failed++
        console.error(`[Backfill] ${sym} ${tf} failed: ${err.message}`)
      }
      // Small gap between requests — this runs once at boot, so latency is fine.
      await new Promise(r => setTimeout(r, 150))
    }
  }

  backfillReport.ranAt  = Date.now()
  backfillReport.source = active.name
  backfillReport.loaded = ok
  backfillReport.failed = failed

  const summary = symbols
    .map(s => `${s}(4h:${getBufferSize(s, '4h')} 1D:${getBufferSize(s, '1D')})`)
    .join(' ')
  console.log(`[Backfill] Done via ${active.name} — ${ok} loaded, ${failed} failed. ${summary}`)
}
