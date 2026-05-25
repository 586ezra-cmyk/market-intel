import { NextRequest, NextResponse } from 'next/server'

// Our TF labels → Binance interval strings
const TF_MAP: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m',
  '15m': '15m', '30m': '30m', '1h': '1h',
  '4h': '4h', '6h': '6h', '12h': '12h',
  '1D': '1d', '1W': '1w', '1M': '1M',
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
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '250'), 500)
  const interval = TF_MAP[timeframe] ?? '15m'
  const sym = symbol.toUpperCase()

  // 1. Binance Futures (fapi) — most reliable, works for BTC/ETH/SOL perpetuals
  const futuresUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
  let data = await tryFetch(futuresUrl)

  // 2. Binance Spot — fallback for non-perpetual symbols
  if (!data) {
    const spotUrl = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
    data = await tryFetch(spotUrl)
  }

  // 3. Binance US — final fallback (US-based servers)
  if (!data) {
    const usUrl = `https://api.binance.us/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
    data = await tryFetch(usUrl)
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: `No data for ${sym}` }, { status: 404 })
  }

  return NextResponse.json(
    data.map((k: any) => ({
      time:   Math.floor(Number(k[0]) / 1000), // unix seconds for LW Charts
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })),
    {
      headers: {
        'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
      },
    }
  )
}
