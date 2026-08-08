import { Router, Request, Response } from 'express'
import { getDb } from '../db/client'
import { getRecentAlerts, getAlertById } from '../services/alertDispatcher'

const router = Router()

// GET /api/alerts — recent alerts with filters
router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { symbol, timeframe, limit = '50', offset = '0', archived = '0' } = req.query

  let query = `SELECT * FROM alerts WHERE archived = ?`
  const params: any[] = [archived === '1' ? 1 : 0]

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
    entryPrice: r.entry_price ?? null,
    stopLoss: r.stop_loss ?? null,
    tp1: r.tp1 ?? null,
    tp2: r.tp2 ?? null,
    tp3: r.tp3 ?? null,
    tp1Label: r.tp1_label ?? null,
    tp2Label: r.tp2_label ?? null,
    tp3Label: r.tp3_label ?? null,
    r1: r.r1 ?? null,
    r2: r.r2 ?? null,
    r3: r.r3 ?? null,
    slReason: r.sl_reason ?? null,
    userRating: r.user_rating ?? null,
    userOutcome: r.user_outcome ?? null,
    userNotes: r.user_notes ?? null,
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

// POST /api/alerts/:id/rate — user feedback (rating, outcome, notes — all optional)
router.post('/:id/rate', (req: Request, res: Response) => {
  const db = getDb()
  const { rating, outcome, notes } = req.body

  if (rating !== undefined && (rating < 1 || rating > 5)) {
    res.status(400).json({ error: 'Rating must be 1-5' })
    return
  }

  const existing = db.prepare(`SELECT id, user_rating, user_outcome, user_notes FROM alerts WHERE id = ?`).get(req.params.id) as any
  if (!existing) {
    res.status(404).json({ error: 'Alert not found' })
    return
  }

  const newOutcome = outcome !== undefined ? outcome : (existing.user_outcome ?? null)

  // Sync user_outcome → tp1_hit / sl_hit / outcome so statistics work
  let tp1Hit = 0, tp2Hit = 0, sl_hit = 0
  let systemOutcome = 'pending'
  if (newOutcome === 'win')  { tp1Hit = 1; systemOutcome = 'tp1' }
  if (newOutcome === 'be')   { tp1Hit = 0; systemOutcome = 'be' }
  if (newOutcome === 'loss') { sl_hit  = 1; systemOutcome = 'sl' }

  db.prepare(`UPDATE alerts SET
    user_rating = ?, user_outcome = ?, user_notes = ?,
    tp1_hit = ?, sl_hit = ?,
    outcome = CASE WHEN ? IS NOT NULL THEN ? ELSE outcome END
    WHERE id = ?`)
    .run(
      rating ?? existing.user_rating ?? null,
      newOutcome,
      notes !== undefined ? notes : (existing.user_notes ?? null),
      newOutcome ? tp1Hit : existing.tp1_hit ?? 0,
      newOutcome ? sl_hit  : existing.sl_hit  ?? 0,
      newOutcome, systemOutcome,
      req.params.id,
    )

  res.json({ ok: true })
})

// POST /api/alerts/:id/archive — move to archive
router.post('/:id/archive', (req: Request, res: Response) => {
  const db = getDb()
  const { archived = true } = req.body
  const result = db.prepare(`UPDATE alerts SET archived = ? WHERE id = ?`)
    .run(archived ? 1 : 0, req.params.id)
  if (result.changes === 0) { res.status(404).json({ error: 'Alert not found' }); return }
  res.json({ ok: true, archived })
})

export default router
