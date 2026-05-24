import type Database from 'better-sqlite3'

const BINANCE_BASE = 'https://api.binance.com/api/v3'
const CHECK_INTERVAL_MS = 60 * 60 * 1000  // 1 hour
const EXPIRY_HOURS = 48

async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${BINANCE_BASE}/ticker/price?symbol=${symbol}`)
    if (!res.ok) return null
    const data = await res.json() as { price: string }
    return parseFloat(data.price)
  } catch {
    return null
  }
}

export async function checkOutcomes(db: Database.Database): Promise<void> {
  const nowTs = Date.now()
  const expiryTs = nowTs - EXPIRY_HOURS * 3600 * 1000

  // Fetch all pending alerts within 48h
  const pending = db.prepare(`
    SELECT id, symbol, direction, entry_price, sl_price, tp1_price, tp2_price, tp3_price,
           triggered_at, tp1_hit, tp2_hit, tp3_hit, sl_hit
    FROM alerts
    WHERE outcome = 'pending'
      AND triggered_at > ?
      AND entry_price IS NOT NULL
  `).all(expiryTs) as Array<{
    id: string
    symbol: string
    direction: string
    entry_price: number
    sl_price: number | null
    tp1_price: number | null
    tp2_price: number | null
    tp3_price: number | null
    triggered_at: number
    tp1_hit: number
    tp2_hit: number
    tp3_hit: number
    sl_hit: number
  }>

  // Mark expired alerts (older than 48h still pending)
  db.prepare(`
    UPDATE alerts
    SET outcome = 'expired', outcome_checked_at = ?
    WHERE outcome = 'pending'
      AND triggered_at <= ?
  `).run(nowTs, expiryTs)

  console.log(`[OutcomeTracker] Checking ${pending.length} pending alerts`)

  for (const alert of pending) {
    const currentPrice = await fetchCurrentPrice(alert.symbol)
    if (!currentPrice) continue

    let tp1Hit = alert.tp1_hit === 1
    let tp2Hit = alert.tp2_hit === 1
    let tp3Hit = alert.tp3_hit === 1
    let slHit  = alert.sl_hit === 1

    const isBullish = alert.direction === 'bullish'

    // Check TP/SL hits
    if (!tp1Hit && alert.tp1_price) {
      tp1Hit = isBullish ? currentPrice >= alert.tp1_price : currentPrice <= alert.tp1_price
    }
    if (!tp2Hit && alert.tp2_price) {
      tp2Hit = isBullish ? currentPrice >= alert.tp2_price : currentPrice <= alert.tp2_price
    }
    if (!tp3Hit && alert.tp3_price) {
      tp3Hit = isBullish ? currentPrice >= alert.tp3_price : currentPrice <= alert.tp3_price
    }
    if (!slHit && alert.sl_price) {
      slHit = isBullish ? currentPrice <= alert.sl_price : currentPrice >= alert.sl_price
    }

    // Determine outcome
    let outcome = 'pending'
    if (slHit && !tp1Hit) {
      outcome = 'sl'
    } else if (tp3Hit) {
      outcome = 'tp3'
    } else if (tp2Hit) {
      outcome = 'tp2'
    } else if (tp1Hit) {
      outcome = 'tp1'
    }

    db.prepare(`
      UPDATE alerts
      SET tp1_hit = ?, tp2_hit = ?, tp3_hit = ?, sl_hit = ?,
          outcome = ?, outcome_checked_at = ?
      WHERE id = ?
    `).run(
      tp1Hit ? 1 : 0,
      tp2Hit ? 1 : 0,
      tp3Hit ? 1 : 0,
      slHit  ? 1 : 0,
      outcome,
      nowTs,
      alert.id,
    )
  }

  console.log(`[OutcomeTracker] Done checking outcomes`)
}

export function startOutcomeTracker(db: Database.Database): void {
  console.log('[OutcomeTracker] Started — will check every 60 minutes')

  // Run immediately on startup
  checkOutcomes(db).catch(err => console.error('[OutcomeTracker] Error:', err))

  // Then every hour
  setInterval(() => {
    checkOutcomes(db).catch(err => console.error('[OutcomeTracker] Error:', err))
  }, CHECK_INTERVAL_MS)
}
