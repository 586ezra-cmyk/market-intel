import WebSocket from 'ws'
import { runRealtimeDetector } from './realtimeSignalDetector'
import { backfillBybitCandles } from './bybitBackfill'

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

// Bybit public WebSocket — no geo-restrictions, free to use
const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/spot'

// Symbols & timeframes to track
const SYMBOLS    = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT']
const TIMEFRAMES = ['1', '5', '15', '30', '60', '240', 'D', 'W']

// Bybit interval → our internal TF label
const TF_MAP: Record<string, string> = {
  '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m',
  '60': '1h', '120': '2h', '240': '4h', '360': '6h', '720': '12h',
  'D': '1D', 'W': '1W', 'M': '1M',
}

const subscribeState = {
  expected: 0,
  ok: 0,
  failed: 0,
  lastError: null as string | null,
}

let wsInstance: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null

// Bybit rejects a subscribe request carrying more than 10 topics
// ("args size >10") and drops the whole batch, so requests are chunked.
const MAX_ARGS_PER_SUBSCRIBE = 10

function buildSubscribeMsgs(): string[] {
  const args = SYMBOLS.flatMap(sym =>
    TIMEFRAMES.map(tf => `kline.${tf}.${sym}`)
  )

  const msgs: string[] = []
  for (let i = 0; i < args.length; i += MAX_ARGS_PER_SUBSCRIBE) {
    msgs.push(JSON.stringify({
      op: 'subscribe',
      args: args.slice(i, i + MAX_ARGS_PER_SUBSCRIBE),
    }))
  }
  return msgs
}

function connect(): void {
  if (wsInstance) {
    try { wsInstance.terminate() } catch {}
    wsInstance = null
  }
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null }

  const ws = new WebSocket(BYBIT_WS_URL)
  wsInstance = ws

  ws.on('open', () => {
    const msgs = buildSubscribeMsgs()
    console.log(`[BybitWS] Connected — subscribing ${SYMBOLS.join(', ')} in ${msgs.length} batches`)
    subscribeState.ok = 0
    subscribeState.failed = 0
    subscribeState.lastError = null
    subscribeState.expected = msgs.length
    msgs.forEach(m => ws.send(m))
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }

    // Bybit requires ping every 20s to keep connection alive
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 'ping' }))
      }
    }, 20_000)
  })

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString())

      if (msg.op === 'pong') return

      // Subscription outcome — a rejected batch means no candles will ever
      // arrive for those topics, so it must not be swallowed silently.
      if (msg.op === 'subscribe') {
        if (msg.success === false) {
          subscribeState.failed++
          subscribeState.lastError = msg.ret_msg ?? 'unknown'
          console.error('[BybitWS] SUBSCRIBE REJECTED:', msg.ret_msg)
        } else {
          subscribeState.ok++
        }
        return
      }

      // Bybit kline format: topic = "kline.5.ETHUSDT", data = array of candle objects
      const topic: string = msg.topic ?? ''
      if (!topic.startsWith('kline.')) return

      const parts = topic.split('.')
      const bybitTf = parts[1]
      const rawSymbol = parts[2]

      const klines: any[] = Array.isArray(msg.data) ? msg.data : []
      for (const k of klines) {
        const candle: KlineCandle = {
          symbol:    rawSymbol,
          timeframe: TF_MAP[bybitTf] ?? bybitTf,
          time:      Math.floor(parseInt(k.start) / 1000),
          open:      parseFloat(k.open),
          high:      parseFloat(k.high),
          low:       parseFloat(k.low),
          close:     parseFloat(k.close),
          volume:    parseFloat(k.volume),
          isClosed:  k.confirm === true,
        }

        if (candle.isClosed) {
          runRealtimeDetector(candle).catch(err =>
            console.error('[BybitWS] detector error:', err)
          )
        }
      }
    } catch {}
  })

  ws.on('error', err => {
    console.error('[BybitWS] error:', err.message)
  })

  ws.on('close', () => {
    console.warn('[BybitWS] Disconnected — reconnecting in 5s')
    wsInstance = null
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
    reconnectTimer = setTimeout(connect, 5_000)
  })
}

export function startBinanceWebSocket(): void {
  console.log('[BybitWS] Starting real-time candle stream (Bybit — no geo-restrictions)...')

  // Warm the candle buffers from REST history first. Detectors need a minimum
  // number of candles, and an empty in-memory buffer would otherwise take days
  // to fill on higher timeframes (and reset on every deploy).
  backfillBybitCandles(SYMBOLS, TIMEFRAMES.map(tf => TF_MAP[tf] ?? tf))
    .catch(err => console.error('[Backfill] failed:', err.message))
    .finally(() => connect())
}

export function getFeedStatus(): {
  connected: boolean
  subscription: { expected: number; ok: number; failed: number; lastError: string | null }
  symbols: string[]
  timeframes: string[]
} {
  return {
    connected: wsInstance?.readyState === WebSocket.OPEN,
    subscription: { ...subscribeState },
    symbols: SYMBOLS,
    timeframes: TIMEFRAMES.map(tf => TF_MAP[tf] ?? tf),
  }
}

export function stopBinanceWebSocket(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
  if (wsInstance) { try { wsInstance.terminate() } catch {} wsInstance = null }
}
