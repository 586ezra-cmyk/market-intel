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

// מראת הנתונים הציבורית של Binance נגישה מהשרת ב-Railway; api.binance.com מחזיר שם 451 (חסימה אזורית) — לכן היא ראשונה.
export const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'] as const

/** GET לנתוני שוק ציבוריים של Binance, עם מעבר לכתובת הבאה כשהראשונה חסומה או נופלת. */
export async function binanceGet(path: string, timeoutMs = 8000): Promise<unknown> {
  let lastErr = 'no host'
  for (const host of BINANCE_HOSTS) {
    try {
      const res = await fetch(host + path, { signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return await res.json()
      lastErr = `${host} ${res.status}`
      if (res.status === 400) break            // סימול לא קיים — אין טעם לנסות כתובת אחרת
    } catch (e) { lastErr = `${host} ${String((e as Error).message ?? e).slice(0, 80)}` }
  }
  throw new Error(`Binance API error: ${lastErr}`)
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

  const raw = (await binanceGet(`/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${interval}&limit=${limit}`)) as any[][]

  return raw.map(k => ({
    time:   Math.floor(Number(k[0]) / 1000),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))
}
