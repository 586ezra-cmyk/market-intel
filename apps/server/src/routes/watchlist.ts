import { Router, Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db/client'
import { sendTelegram } from '../services/alertDispatcher'

const router = Router()

// ─── GET /api/watchlist ───────────────────────────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM watchlist ORDER BY created_at ASC`).all() as any[]
  res.json({ items: rows.map(rowToItem) })
})

// ─── POST /api/watchlist ──────────────────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  const db = getDb()
  const { symbol, priceAlert } = req.body as { symbol: string; priceAlert?: number }
  if (!symbol) { res.status(400).json({ error: 'symbol required' }); return }

  const id = uuid()
  const now = Date.now()

  db.prepare(`
    INSERT INTO watchlist (id, symbol, price_alert, alert_fired, created_at)
    VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      price_alert = excluded.price_alert,
      alert_fired = 0
  `).run(id, symbol.toUpperCase(), priceAlert ?? null, now)

  res.json({ ok: true, id })
})

// ─── PUT /api/watchlist/:symbol ───────────────────────────────────────────────
router.put('/:symbol', (req: Request, res: Response) => {
  const db = getDb()
  const symbol = String(req.params['symbol']).toUpperCase()
  const { priceAlert } = req.body as { priceAlert: number | null }

  db.prepare(`
    UPDATE watchlist SET price_alert = ?, alert_fired = 0 WHERE symbol = ?
  `).run(priceAlert ?? null, symbol)

  res.json({ ok: true })
})

// ─── DELETE /api/watchlist/:symbol ───────────────────────────────────────────
router.delete('/:symbol', (req: Request, res: Response) => {
  const db = getDb()
  db.prepare(`DELETE FROM watchlist WHERE symbol = ?`).run(String(req.params['symbol']).toUpperCase())
  res.json({ ok: true })
})

// ─── POST /api/watchlist/check-prices ─────────────────────────────────────────
// Called by scheduler every minute to check price alerts
router.post('/check-prices', async (req: Request, res: Response) => {
  const db = getDb()
  const items = db.prepare(`
    SELECT * FROM watchlist WHERE price_alert IS NOT NULL AND alert_fired = 0
  `).all() as any[]

  const prices = req.body as Record<string, number> // { BTCUSDT: 95000, ... }
  const fired: string[] = []

  for (const item of items) {
    const currentPrice = prices[item.symbol]
    if (!currentPrice) continue

    const crossed = currentPrice >= item.price_alert
    if (crossed) {
      // Mark as fired
      db.prepare(`UPDATE watchlist SET alert_fired = 1 WHERE symbol = ?`).run(item.symbol)
      fired.push(item.symbol)

      // Send Telegram
      const msg = `🔔 התראת מחיר!\n\nנכס: ${item.symbol}\nמחיר יעד: $${item.price_alert.toLocaleString()}\nמחיר נוכחי: $${currentPrice.toLocaleString()}`
      sendTelegram(msg, 10).catch(console.error)
    }
  }

  res.json({ ok: true, fired })
})

function rowToItem(r: any) {
  return {
    id: r.id,
    symbol: r.symbol,
    priceAlert: r.price_alert,
    alertFired: r.alert_fired === 1,
    createdAt: r.created_at,
  }
}

export default router
