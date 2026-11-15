import { NextRequest, NextResponse } from 'next/server'

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }
/** כמה זמן המקור נשמר במטמון: במסגרות הקצרות הגרף מתרענן כל כמה שניות, אז המטמון חייב להיות קצר ממנו. */
const fresh = (tf: string): number => (tf === '1m' || tf === '3m' || tf === '5m' ? 4 : tf === '15m' || tf === '30m' ? 10 : 30)

// Our TF labels → Binance interval strings
const TF_MAP: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m',
  '15m': '15m', '30m': '30m', '1h': '1h',
  '4h': '4h', '6h': '6h', '12h': '12h',
  '1D': '1d', '1W': '1w', '1M': '1M',
}

// נאסדק/S&P: אין ב-Binance — נרות מ-Yahoo (NQ=F, ES=F), אותו פורמט
const YAHOO_MAP: Record<string, string> = { 'NQ1!': 'NQ=F', 'NQ': 'NQ=F', 'NQU2026': 'NQ=F', 'NQZ2026': 'NQ=F', 'ES1!': 'ES=F', 'ES': 'ES=F', 'ESU2026': 'ES=F', 'ESZ2026': 'ES=F', 'XAUUSD': 'GC=F' }
const YAHOO_TF: Record<string, [string, string]> = { '1m': ['1m', '5d'], '3m': ['5m', '5d'], '5m': ['5m', '5d'], '15m': ['15m', '1mo'], '30m': ['30m', '1mo'], '1h': ['60m', '3mo'], '4h': ['60m', '6mo'], '6h': ['60m', '6mo'], '12h': ['1d', '2y'], '1D': ['1d', '2y'], '1W': ['1wk', '5y'], '1M': ['1mo', '10y'] }
const TF_SEC: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '60m': 3600 }

// ─── נרות בזמן אמת מצילומי המצב של HTT Snapshot (TradingView → השרת). Yahoo מעוכב ~10 דק'; הנרות האלה סוגרים את הפער. ───
const LIVE_SYMBOL: Record<string, string> = { 'NQ1!': 'NQ', 'NQ': 'NQ', 'NQU2026': 'NQ', 'NQZ2026': 'NQ', 'ES1!': 'ES', 'ES': 'ES', 'ESU2026': 'ES', 'ESZ2026': 'ES' }
// רק מסגרות שנר שלהן מתחיל באותה דקה גם ב-TradingView וגם ב-Yahoo (4 שעות ויומי מתחילים שם בשעות שונות)
const LIVE_TFS = new Set(['1m', '5m', '15m', '1h'])
async function liveBars(sym: string, timeframe: string, limit: number): Promise<Candle[]> {
  const live = LIVE_SYMBOL[sym]
  if (!live || !LIVE_TFS.has(timeframe)) return []
  const base = (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (process.env.ADMIN_TOKEN) headers['x-admin-token'] = process.env.ADMIN_TOKEN
  try {
    const res = await fetch(`${base}/api/live/${live}/bars?tf=${timeframe}&limit=${limit}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(2500) })
    if (!res.ok) return []
    const rows = (await res.json()) as Array<Omit<Candle, 'volume'>>
    return Array.isArray(rows) ? rows.map(b => ({ ...b, volume: 0 })) : []
  } catch { return [] }
}
/** נר חי גובר על נר מעוכב באותו זמן, וממשיך אחריו. */
function mergeLive(base: Candle[], live: Candle[]): Candle[] {
  if (!live.length) return base
  const m = new Map<number, Candle>()
  for (const c of base) m.set(c.time, c)
  for (const c of live) m.set(c.time, { ...c, volume: m.get(c.time)?.volume ?? 0 })
  return [...m.values()].sort((a, b) => a.time - b.time)
}

async function yahooCandles(ySym: string, timeframe: string, limit: number): Promise<Candle[] | null> {
  const [interval, range] = YAHOO_TF[timeframe] ?? ['15m', '1mo']
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=${interval}&range=${range}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: fresh(timeframe) } })
    if (!res.ok) return null
    const j: any = await res.json()
    const r = j?.chart?.result?.[0]; const q = r?.indicators?.quote?.[0]
    if (!r?.timestamp || !q) return null
    const out: Candle[] = []
    // Yahoo מחזיר את הנר האחרון עם זמן "עכשיו" ולא עם זמן פתיחת הנר — מיישרים לתחילת הנר וממזגים כפילויות
    const span = TF_SEC[interval] ?? 0
    for (let i = 0; i < r.timestamp.length; i++) {
      if (q.open[i] == null || q.close[i] == null) continue
      const time = span ? Math.floor(r.timestamp[i] / span) * span : r.timestamp[i]
      const last = out[out.length - 1]
      if (last && last.time === time) { last.high = Math.max(last.high, q.high[i] ?? q.close[i]); last.low = Math.min(last.low, q.low[i] ?? q.close[i]); last.close = q.close[i]; last.volume += q.volume?.[i] ?? 0 }
      else out.push({ time, open: q.open[i], high: q.high[i] ?? q.close[i], low: q.low[i] ?? q.close[i], close: q.close[i], volume: q.volume?.[i] ?? 0 })
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

async function tryFetch(url: string, sec = 30): Promise<any[] | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: sec } })
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
    const lim = Number.isFinite(rawL) ? Math.min(Math.max(rawL, 1), 500) : 250
    const [yc, live] = await Promise.all([yahooCandles(YAHOO_MAP[sym], timeframe, 500), liveBars(sym, timeframe, lim)])
    const merged = mergeLive(yc ?? [], live).slice(-lim)
    if (!merged.length) return NextResponse.json({ error: `No data for ${sym}` }, { status: 404 })
    // המקור של הנר האחרון: 'live' = TradingView בזמן אמת, 'delayed' = Yahoo (~10 דק' איחור). הגרף מציג את זה.
    const lastLive = live.length ? live[live.length - 1].time : 0
    const source = lastLive && lastLive >= merged[merged.length - 1].time ? 'live' : 'delayed'
    return NextResponse.json(merged, { headers: { 'Cache-Control': 'no-store', 'X-Candle-Source': source } })
  }
  const interval = TF_MAP[timeframe]
  if (!interval) return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 })
  const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') ?? '250', 10)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 250

  const sec = fresh(timeframe)
  // 0. מראת הנתונים הציבורית של Binance — אותם מחירי ספוט, ונגישה גם משרתים בארה"ב (api.binance.com חסום שם)
  let data = await tryFetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`, sec)

  // 1. Binance Spot — real market price (what you see on TradingView)
  const spotUrl = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
  if (!data) data = await tryFetch(spotUrl, sec)

  // 2. Binance US — fallback if .com is blocked from server
  if (!data) {
    const usUrl = `https://api.binance.us/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
    data = await tryFetch(usUrl, sec)
  }

  // 3. Binance Futures — last resort (prices may differ slightly from spot)
  if (!data) {
    const futuresUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${interval}&limit=${limit}`
    data = await tryFetch(futuresUrl, sec)
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
        'Cache-Control': 'no-store',
        'X-Candle-Source': 'live',
      },
    }
  )
}
