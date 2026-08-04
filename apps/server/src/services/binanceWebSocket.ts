import WebSocket from 'ws'
import { runRealtimeDetector } from './realtimeSignalDetector'

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

const SYMBOLS    = ['ETHUSDT']
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']

const TF_MAP: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '4h': '4h', '1d': '1D', '1w': '1W',
}

let wsInstance: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function buildStreamUrl(): string {
  const streams = SYMBOLS.flatMap(sym =>
    TIMEFRAMES.map(tf => `${sym.toLowerCase()}@kline_${tf}`)
  )
  return `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`
}

function connect(): void {
  if (wsInstance) {
    try { wsInstance.terminate() } catch {}
    wsInstance = null
  }

  const ws = new WebSocket(buildStreamUrl())
  wsInstance = ws

  ws.on('open', () => {
    console.log('[BinanceWS] Connected — streaming', SYMBOLS.join(', '), TIMEFRAMES.join('/'))
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  })

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString())
      const k = msg?.data?.k
      if (!k) return

      const candle: KlineCandle = {
        symbol:    k.s,
        timeframe: TF_MAP[k.i] ?? k.i,
        time:      Math.floor(k.t / 1000),
        open:      parseFloat(k.o),
        high:      parseFloat(k.h),
        low:       parseFloat(k.l),
        close:     parseFloat(k.c),
        volume:    parseFloat(k.v),
        isClosed:  k.x,
      }

      // Only run detection on closed candles
      if (candle.isClosed) {
        runRealtimeDetector(candle).catch(err =>
          console.error('[BinanceWS] detector error:', err)
        )
      }
    } catch {}
  })

  ws.on('error', err => {
    console.error('[BinanceWS] error:', err.message)
  })

  ws.on('close', () => {
    console.warn('[BinanceWS] Disconnected — reconnecting in 5s')
    wsInstance = null
    reconnectTimer = setTimeout(connect, 5_000)
  })
}

export function startBinanceWebSocket(): void {
  console.log('[BinanceWS] Starting real-time candle stream...')
  connect()
}

export function stopBinanceWebSocket(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (wsInstance) { try { wsInstance.terminate() } catch {} wsInstance = null }
}
