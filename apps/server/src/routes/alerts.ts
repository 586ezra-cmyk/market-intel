import { Router, Request, Response } from 'express'
import { getDb } from '../db/client'
import { getRecentAlerts, getAlertById } from '../services/alertDispatcher'

const router = Router()

// GET /api/alerts — recent alerts with filters
router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { symbol, timeframe, limit = '50', offset = '0' } = req.query

  let query = `SELECT * FROM alerts WHERE 1=1`
  const params: any[] = []

  if (symbol) { query += ` AND symbol = ?`; params.push(String(symbol)) }
  if (timeframe) { query += ` AND timeframe = ?`; params.push(String(timeframe)) }

  query += ` ORDER BY triggered_at DESC LIMIT ? OFFSET ?`
  params.push(parseInt(String(limit)), parseInt(String(offset)))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (db.prepare(query) as any).all(...params) as any[]
  const alerts = rows.map(r => ({
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    triggeredAt: r.triggered_at,
    factors: JSON.parse(r.factors ?? '[]'),
    score: r.score,
    direction: r.direction,
    recommendation: r.recommendation,
    premiumDiscount: r.premium_discount,
    session: r.session,
    inKillZone: r.in_kill_zone === 1,
    messageHe: r.message_he,
    stopLoss: r.stop_loss,
    tp1: r.tp1,
    tp2: r.tp2,
    tp3: r.tp3,
  }))

  res.json({ alerts, total: alerts.length })
})

// GET /api/alerts/:id
router.get('/:id', (req: Request, res: Response) => {
  const alert = getAlertById(req.params['id'] as string)
  if (!alert) {
    res.status(404).json({ error: 'Alert not found' })
    return
  }
  res.json(alert)
})

// POST /api/alerts/:id/rate — user feedback
router.post('/:id/rate', (req: Request, res: Response) => {
  const db = getDb()
  const { rating, outcome, notes } = req.body

  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Rating must be 1-5' })
    return
  }

  const existing = db.prepare(`SELECT id FROM alerts WHERE id = ?`).get(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Alert not found' })
    return
  }

  db.prepare(`UPDATE alerts SET user_rating = ?, user_outcome = ?, user_notes = ? WHERE id = ?`)
    .run(rating, outcome ?? null, notes ?? null, req.params.id)

  res.json({ ok: true })
})

export default router
