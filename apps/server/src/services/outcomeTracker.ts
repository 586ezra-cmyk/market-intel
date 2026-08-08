import type Database from 'better-sqlite3'

const BINANCE_BASE   = 'https://api.binance.com/api/v3'
const YAHOO_BASE     = 'https://query1.finance.yahoo.com/v8/finance/chart'
const CHECK_INTERVAL_MS = 5 * 60 * 1000   // check every 5 minutes
const EXPIRY_HOURS   = 72

// Map our symbol → Yahoo Finance ticker
const YAHOO_SYMBOL_MAP: Record<string, string> = {
  NQ: 'NQ=F', 'NQ1!': 'NQ=F', NQU2026: 'NQ=F', NQU2025: 'NQ=F',
  ES: 'ES=F', 'ES1!': 'ES=F', SPX500: 'ES=F', ESU2026: 'ES=F',
  XAUUSD: 'GC=F', GOLD: 'GC=F',
  SP500: 'ES=F',
}

// Binance symbols (all crypto USDT pairs not in Yahoo map)
function isBinanceSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase()
  return (upper.endsWith('USDT') || upper.endsWith('BTC') || upper.endsWith('ETH')) &&
    !YAHOO_SYMBOL_MAP[upper]
}

async function fetchBinancePrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${BINANCE_BASE}/ticker/price?symbol=${symbol.toUpperCase()}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json() as { price: string }
    return parseFloat(data.price)
  } catch {
    return null
  }
}

async function fetchYahooPrice(yahooTicker: string): Promise<number | null> {
  try {
    const url = `${YAHOO_BASE}/${encodeURIComponent(yahooTicker)}?interval=1m&range=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json() as any
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    return price ? parseFloat(price) : null
  } catch {
    return null
  }
}

async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  const upper = symbol.toUpperCase()

  // Check Yahoo map first (futures/indices)
  const yahooTicker = YAHOO_SYMBOL_MAP[upper] ?? YAHOO_SYMBOL_MAP[upper.replace(/\d+$/, '')]
  if (yahooTicker) {
    const price = await fetchYahooPrice(yahooTicker)
    if (price) console.log(`[OutcomeTracker] ${symbol} = $${price} (Yahoo: ${yahooTicker})`)
    return price
  }

  // Crypto — try Binance
  if (isBinanceSymbol(symbol)) {
    return fetchBinancePrice(symbol)
  }

  // Unknown symbol — try Yahoo with original ticker
  return fetchYahooPrice(upper)
}

export async function checkOutcomes(db: Database.Database): Promise<void> {
  const nowTs  = Date.now()
  const expiryTs = nowTs - EXPIRY_HOURS * 3600 * 1000

  // Expire old pending alerts
  db.prepare(`
    UPDATE alerts
    SET outcome = 'expired', outcome_checked_at = ?
    WHERE outcome = 'pending'
      AND triggered_at <= ?
      AND user_outcome IS NULL
  `).run(nowTs, expiryTs)

  // Fetch pending alerts that have price targets
  const pending = db.prepare(`
    SELECT id, symbol, direction,
           entry_price, sl_price, tp1_price, tp2_price, tp3_price,
           triggered_at, tp1_hit, tp2_hit, tp3_hit, sl_hit, user_outcome
    FROM alerts
    WHERE outcome = 'pending'
      AND triggered_at > ?
      AND (sl_price IS NOT NULL OR tp1_price IS NOT NULL)
  `).all(expiryTs) as Array<{
    id: string
    symbol: string
    direction: string
    entry_price: number | null
    sl_price: number | null
    tp1_price: number | null
    tp2_price: number | null
    tp3_price: number | null
    triggered_at: number
    tp1_hit: number
    tp2_hit: number
    tp3_hit: number
    sl_hit: number
    user_outcome: string | null
  }>

  if (pending.length === 0) return
  console.log(`[OutcomeTracker] Checking ${pending.length} pending alerts`)

  // Fetch prices once per unique symbol
  const symbolPrices = new Map<string, number | null>()
  const uniqueSymbols = [...new Set(pending.map(a => a.symbol.toUpperCase()))]
  await Promise.allSettled(uniqueSymbols.map(async sym => {
    const price = await fetchCurrentPrice(sym)
    symbolPrices.set(sym, price)
  }))

  for (const alert of pending) {
    // Skip if user already manually set outcome
    if (alert.user_outcome) continue

    const currentPrice = symbolPrices.get(alert.symbol.toUpperCase())
    if (currentPrice == null) continue

    const isBullish = alert.direction === 'bullish'
    let tp1Hit = alert.tp1_hit === 1
    let tp2Hit = alert.tp2_hit === 1
    let tp3Hit = alert.tp3_hit === 1
    let slHit  = alert.sl_hit  === 1

    if (!tp1Hit && alert.tp1_price) tp1Hit = isBullish ? currentPrice >= alert.tp1_price : currentPrice <= alert.tp1_price
    if (!tp2Hit && alert.tp2_price) tp2Hit = isBullish ? currentPrice >= alert.tp2_price : currentPrice <= alert.tp2_price
    if (!tp3Hit && alert.tp3_price) tp3Hit = isBullish ? currentPrice >= alert.tp3_price : currentPrice <= alert.tp3_price
    if (!slHit  && alert.sl_price)  slHit  = isBullish ? currentPrice <= alert.sl_price  : currentPrice >= alert.sl_price

    let outcome = 'pending'
    if (slHit && !tp1Hit)  outcome = 'sl'
    else if (tp3Hit)       outcome = 'tp3'
    else if (tp2Hit)       outcome = 'tp2'
    else if (tp1Hit)       outcome = 'tp1'

    if (outcome !== 'pending') {
      console.log(`[OutcomeTracker] ${alert.symbol} → ${outcome} (price: $${currentPrice})`)
    }

    db.prepare(`
      UPDATE alerts
      SET tp1_hit = ?, tp2_hit = ?, tp3_hit = ?, sl_hit = ?,
          outcome = ?, outcome_checked_at = ?
      WHERE id = ?
    `).run(
      tp1Hit ? 1 : 0, tp2Hit ? 1 : 0, tp3Hit ? 1 : 0, slHit ? 1 : 0,
      outcome, nowTs, alert.id,
    )
  }

  console.log(`[OutcomeTracker] Done`)
}

export function startOutcomeTracker(db: Database.Database): void {
  console.log('[OutcomeTracker] Started — checking every 5 minutes, Yahoo Finance for futures/indices')
  checkOutcomes(db).catch(err => console.error('[OutcomeTracker] Error:', err))
  setInterval(() => {
    checkOutcomes(db).catch(err => console.error('[OutcomeTracker] Error:', err))
  }, CHECK_INTERVAL_MS)
}
