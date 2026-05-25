import { NextRequest, NextResponse } from 'next/server'

// TF map: our TF → Binance interval
const TF_MAP: Record<string, string> = {
  '1m':  '1m',  '3m':  '3m',  '5m':  '5m',
  '15m': '15m', '30m': '30m', '1h':  '1h',
  '4h':  '4h',  '6h':  '6h',  '12h': '12h',
  '1D':  '1d',  '1W':  '1w',  '1M':  '1M',
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string; timeframe: string }> },
) {
  const { symbol, timeframe } = await params
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '200'), 500)
  const interval = TF_MAP[timeframe] ?? '15m'

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 30 }, // cache 30s
    })

    if (!res.ok) {
      // Try Binance Futures for perpetuals
      const furl = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`
      const fres = await fetch(furl, { next: { revalidate: 30 } })
      if (!fres.ok) {
        return NextResponse.json({ error: 'Symbol not found on Binance' }, { status: 404 })
      }
      const fdata = await fres.json()
      return NextResponse.json(formatKlines(fdata))
    }

    const data = await res.json()
    return NextResponse.json(formatKlines(data))

  } catch (err) {
    return NextResponse.json({ error: 'Binance fetch failed' }, { status: 502 })
  }
}

function formatKlines(raw: any[]): object[] {
  return raw.map((k: any) => ({
    time:   Math.floor(k[0] / 1000),  // seconds for LW Charts
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))
}
