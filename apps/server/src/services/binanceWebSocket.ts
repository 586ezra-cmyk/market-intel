import WebSocket from 'ws'
import { runRealtimeDetector, clearSeededBuffers } from './realtimeSignalDetector'
import { backfillBybitCandles, backfillReport, exchangeOf } from './bybitBackfill'

export interface KlineCandle {
  symbol:    string
  timeframe: string
  time:      number
  open:      number
  high:      number
  low:       number
  close:     number
  volume:    number
  isClosed:  boolean
}

const SYMBOLS = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT']
const TFS     = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W']

/**
 * Live candle feed.
 *
 * Binance is preferred: it is the venue the charts are drawn from, and its
 * public market-data mirror is reachable where the main endpoint returns 451.
 * Bybit remains as a fallback. Whichever connects, the backfill must come from
 * the SAME venue — ETHUSDT's low for one candle reads 1915.87 on Kraken and
 * 1915.49 on Bybit, and every detector decides on "did this exceed that", so a
 * mixed buffer invents sweeps and breaks that never happened.
 */
interface LiveFeed {
  exchange: string
  url: () => string
  /** Sent after the socket opens, if the venue needs an explicit subscribe. */
  subscribeMsgs?: () => string[]
  /** Extract candles from one message; returns [] for control frames. */
  parse: (msg: any) => KlineCandle[]
  keepAlive?: (ws: WebSocket) => void
}

const BINANCE_TF: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1w',
}

const binanceFeed: LiveFeed = {
  exchange: 'binance',
  url: () => {
    const streams = SYMBOLS.flatMap(s =>
      TFS.map(tf => `${s.toLowerCase()}@kline_${BINANCE_TF[tf]}`)
    )
    return `wss://data-stream.binance.vision/stream?streams=${streams.join('/')}`
  },
  parse: msg => {
    const k = msg?.data?.k
    if (!k) return []
    const tf = Object.keys(BINANCE_TF).find(t => BINANCE_TF[t] === k.i) ?? k.i
    return [{
      symbol: k.s, timeframe: tf,
      time: Math.floor(Number(k.t) / 1000),
      open: parseFloat(k.o), high: parseFloat(k.h),
      low: parseFloat(k.l), close: parseFloat(k.c),
      volume: parseFloat(k.v), isClosed: k.x === true,
    }]
  },
}

const BYBIT_TF: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '4h': '240', '1D': 'D', '1W': 'W',
}
const BYBIT_TF_REV: Record<string, string> =
  Object.fromEntries(Object.entries(BYBIT_TF).map(([k, v]) => [v, k]))

const bybitFeed: LiveFeed = {
  exchange: 'bybit',
  url: () => 'wss://stream.bybit.com/v5/public/spot',
  // Bybit rejects a subscribe carrying more than 10 topics ("args size >10")
  // and drops the whole batch, so requests are chunked.
  subscribeMsgs: () => {
    const args = SYMBOLS.flatMap(s => TFS.map(tf => `kline.${BYBIT_TF[tf]}.${s}`))
    const out: string[] = []
    for (let i = 0; i < args.length; i += 10) {
      out.push(JSON.stringify({ op: 'subscribe', args: args.slice(i, i + 10) }))
    }
    return out
  },
  parse: msg => {
    const topic: string = msg?.topic ?? ''
    if (!topic.startsWith('kline.')) return []
    const [, iv, symbol] = topic.split('.')
    const rows: any[] = Array.isArray(msg.data) ? msg.data : []
    return rows.map(k => ({
      symbol, timeframe: BYBIT_TF_REV[iv] ?? iv,
      time: Math.floor(parseInt(k.start) / 1000),
      open: parseFloat(k.open), high: parseFloat(k.high),
      low: parseFloat(k.low), close: parseFloat(k.close),
      volume: parseFloat(k.volume), isClosed: k.confirm === true,
    }))
  },
  keepAlive: ws => {
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }))
    }, 20_000)
  },
}

const FEEDS = [binanceFeed, bybitFeed]

export const feedStatus = {
  exchange: null as string | null,
  sourceMismatch: null as string | null,
  subscribeFailed: 0,
  lastError: null as string | null,
  messages: 0,
}

let ws: WebSocket | null = null
let active: LiveFeed | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

/** Connect to `feed`; on failure to produce data, move to the next one. */
function connect(idx = 0): void {
  const feed = FEEDS[idx % FEEDS.length]
  if (ws) { try { ws.terminate() } catch {} ws = null }

  const sock = new WebSocket(feed.url())
  ws = sock
  let gotData = false

  sock.on('open', () => {
    console.log(`[Feed] connected to ${feed.exchange}`)
    feed.subscribeMsgs?.().forEach(m => sock.send(m))
    feed.keepAlive?.(sock)
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  })

  sock.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString())

      // A rejected subscription means no candles will ever arrive, so it must
      // not be swallowed the way it was when 24 topics were sent as one batch.
      if (msg.op === 'subscribe' && msg.success === false) {
        feedStatus.subscribeFailed++
        feedStatus.lastError = msg.ret_msg ?? 'subscribe rejected'
        console.error(`[Feed] ${feed.exchange} subscribe rejected:`, msg.ret_msg)
        return
      }

      for (const candle of feed.parse(msg)) {
        gotData = true
        feedStatus.messages++
        if (!active) { active = feed; feedStatus.exchange = feed.exchange; checkSourceMatch() }
        if (candle.isClosed) {
          runRealtimeDetector(candle).catch(e =>
            console.error('[Feed] detector error:', e.message))
        }
      }
    } catch {}
  })

  sock.on('error', e => {
    feedStatus.lastError = `${feed.exchange}: ${e.message}`
    console.error(`[Feed] ${feed.exchange} error:`, e.message)
  })

  sock.on('close', () => {
    ws = null
    // Never produced a candle — the venue is unreachable, try the next one
    const next = gotData ? idx : idx + 1
    if (!gotData && idx + 1 < FEEDS.length) {
      console.warn(`[Feed] ${feed.exchange} produced no data — falling back to ${FEEDS[idx + 1].exchange}`)
    }
    reconnectTimer = setTimeout(() => connect(next), 5_000)
  })

  // If nothing arrives within 30s the venue is not serving us; move on.
  setTimeout(() => {
    if (!gotData && ws === sock && idx + 1 < FEEDS.length) {
      console.warn(`[Feed] ${feed.exchange} silent for 30s — trying ${FEEDS[idx + 1].exchange}`)
      try { sock.terminate() } catch {}
    }
  }, 30_000)
}

/** Seeded history is only usable when it came from the venue now streaming. */
function checkSourceMatch(): void {
  const seeded = backfillReport.source ? exchangeOf(backfillReport.source) : null
  if (!seeded || !active) return
  if (seeded === active.exchange) {
    feedStatus.sourceMismatch = null
    return
  }
  const dropped = clearSeededBuffers()
  feedStatus.sourceMismatch = `${seeded} → ${active.exchange}`
  console.warn(`[Feed] backfill from ${seeded} but live is ${active.exchange} — dropped ${dropped} buffers rather than compare across venues`)
}

export function startBinanceWebSocket(): void {
  console.log('[Feed] starting candle stream...')
  backfillBybitCandles(SYMBOLS, TFS)
    .catch(e => console.error('[Backfill] failed:', e.message))
    .finally(() => connect())
}

export function getFeedStatus() {
  return {
    connected: ws?.readyState === WebSocket.OPEN,
    liveExchange: feedStatus.exchange,
    backfillSource: backfillReport.source,
    sourceMismatch: feedStatus.sourceMismatch,
    messages: feedStatus.messages,
    subscribeFailed: feedStatus.subscribeFailed,
    lastError: feedStatus.lastError,
    symbols: SYMBOLS,
    timeframes: TFS,
  }
}

export function stopBinanceWebSocket(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) { try { ws.terminate() } catch {} ws = null }
}
