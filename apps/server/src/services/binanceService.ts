export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const TF_MAP: Record<string, string> = {
  '1m':  '1m',
  '3m':  '3m',
  '5m':  '5m',
  '15m': '15m',
  '30m': '30m',
  '1h':  '1h',
  '4h':  '4h',
  '6h':  '6h',
  '12h': '12h',
  '1D':  '1d',
  '1W':  '1w',
  '1M':  '1M',
}

const CRYPTO_SUFFIX_REGEX = /USDT$|BUSD$|BTC$|ETH$|BNB$/i

function isCryptoSymbol(symbol: string): boolean {
  return CRYPTO_SUFFIX_REGEX.test(symbol)
}

export async function fetchCandles(
  symbol: string,
  tf: string,
  limit = 200,
): Promise<Candle[]> {
  if (!isCryptoSymbol(symbol)) {
    // Non-crypto symbols (NQ, ES, XAUUSD, etc.) need different data sources
    return []
  }

  const interval = TF_MAP[tf]
  if (!interval) {
    throw new Error(`Unknown timeframe: ${tf}`)
  }

  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${interval}&limit=${limit}`

  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Binance API error ${res.status}: ${text}`)
  }

  const raw = (await res.json()) as any[][]

  return raw.map(k => ({
    time:   Math.floor(Number(k[0]) / 1000),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))
}
