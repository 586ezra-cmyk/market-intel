import { NextRequest, NextResponse } from 'next/server'

// Our TF labels → Binance interval strings
const TF_MAP: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m',
  '15m': '15m', '30m': '30m', '1h': '1h',
  '4h': '4h', '6h': '6h', '12h': '12h',
  '1D': '1d', '1W': '1w', '1M': '1M',
}

// נאסדק/S&P: אין ב-Binance — נרות מ-Yahoo (NQ=F, ES=F), אותו פורמט
const YAHOO_MAP: Record<string, string> = { 'NQ1!': 'NQ=F', 'NQ': 'NQ=F', 'NQU2026': 'NQ=F', 'NQZ2026': 'NQ=F', 'ES1!': 'ES=F', 'ES': 'ES=F', 'ESU2026': 'ES=F', 'ESZ2026': 'ES=F', 'XAUUSD': 'GC=F' }
const YAHOO_TF: Record<string, [string, string]> = { '1m': ['1m', '1d'], '3m': ['5m', '5d'], '5m': ['5m', '5d'], '15m': ['15m', '1mo'], '30m': ['30m', '1mo'], '1h': ['60m', '3mo'], '4h': ['60m', '6mo'], '6h': ['60m', '6mo'], '12h': ['1d', '2y'], '1D': ['1d', '2y'], '1W': ['1wk', '5y'], '1M': ['1mo', '10y'] }
async function yahooCandles(ySym: string, timeframe: string, limit: number): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> | null> {
  const [interval, range] = YAHOO_TF[timeframe] ?? ['15m', '1mo']
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=${interval}&range=${range}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 30 } })
    if (!res.ok) return null
    const j: any = await res.json()
    const r = j?.chart?.result?.[0]; const q = r?.indicators?.quote?.[0]
    if (!r?.timestamp || !q) return null
    const out: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = []
    for (let i = 0; i < r.timestamp.length; i++) {
      if (q.open[i] == null || q.close[i] == null) continue
      out.push({ time: r.timestamp[i], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] ?? 0 })
    }
    // 4h מ-60m: צבירה ל-4 שעות
    if (timeframe === '4h' || timeframe === '6h') {
      const span = timeframe === '4h' ? 4 * 3600 : 6 * 3600
      const agg: typeof out = []
      for (const c of out) {
        const t = Math.floor(c.time / span) * span
        const last = agg[agg.length - 1]
        if (last && last.time === t) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.volume += c.volume }
        else agg.push({ ...c, time: t })
      }
      return agg.slice(-limit)
    }
    return out.slice(-limit)
  } catch { return null }
}

const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; MarketIntel/1.0)',
}

async function tryFetch(url: string): Promise<any[] | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 30 } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string; timeframe: string }> },
) {
  const { symbol, timeframe } = await params
  const sym = String(symbol).toUpperCase()
  // Input validation: symbol and timeframe are interpolated into upstream URLs.
  if (!/^[A-Z0-9!=]{2,20}$/.test(sym)) return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
  if (YAHOO_MAP[sym]) {
    const tfOk = TF_MAP[timeframe]
    if (!tfOk) return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 })
    const rawL = parseInt(req.nextUrl.searchParams.get('limit') ?? '250', 10)
    const yc = await yahooCandles(YAHOO_MAP[sym], timeframe, Number.isFinite(rawL) ? Math.min(Math.max(rawL, 1), 500) : 250)
    if (!yc || !yc.length) return NextResponse.json({ error: `No data for ${sym}` }, { status: 404 })
    return NextResponse.json(yc)
  }
  const interval = TF_MAP[timeframe]
  if (!interval) return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 })
  const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') ?? '250', 10)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 250

  // 1. Binance Spot — real market price (what you see on TradingView)
  const spotUrl = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
  let data = await tryFetch(spotUrl)

  // 2. Binance US — fallback if .com is blocked from server
  if (!data) {
    const usUrl = `https://api.binance.us/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
    data = await tryFetch(usUrl)
  }

  // 3. Binance Futures — last resort (prices may differ slightly from spot)
  if (!data) {
    const futuresUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
    data = await tryFetch(futuresUrl)
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: `No data for ${sym}` }, { status: 404 })
  }

  const candles = data.map((k: any) => ({
    time:   Math.floor(Number(k[0]) / 1000),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))

  // Filter out bad data points (flash spikes where high/low ratio > 2.5x)
  const cleaned = candles.filter((c, i) => {
    if (c.low <= 0) return false
    if (c.high / c.low > 2.5) return false // obvious bad candle
    // Also check vs neighbors: if a candle is 4x the price of prev/next, skip it
    const prev = candles[i - 1]
    const next = candles[i + 1]
    if (prev && c.high > prev.high * 4) return false
    if (next && c.high > next.high * 4) return false
    return true
  })

  return NextResponse.json(
    cleaned,
    {
      headers: {
        'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
      },
    }
  )
}
