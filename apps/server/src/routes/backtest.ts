import { Router, Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db/client'

const router = Router()

// ─── GET /api/backtest — list entries ─────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { symbol, outcome, strategy, limit = '100', offset = '0' } = req.query

  let q = `SELECT * FROM backtest_entries WHERE 1=1`
  const params: any[] = []

  if (symbol) { q += ` AND symbol = ?`; params.push(String(symbol)) }
  if (outcome) { q += ` AND outcome = ?`; params.push(String(outcome)) }
  if (strategy) { q += ` AND strategy = ?`; params.push(String(strategy)) }

  q += ` ORDER BY opened_at DESC LIMIT ? OFFSET ?`
  params.push(parseInt(String(limit)), parseInt(String(offset)))

  const rows = (db.prepare(q) as any).all(...params) as any[]
  const stats = calcStats(rows)
  res.json({ entries: rows.map(rowToEntry), stats })
})

// ─── POST /api/backtest — create entry ────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  const db = getDb()
  const b = req.body as any
  const id = uuid()
  const now = Date.now()

  db.prepare(`
    INSERT INTO backtest_entries
      (id, trade_num, symbol, direction, opened_at, outcome, rr, stop_pct,
       is_continuation, checklist, incubation_days, incubation_hours,
       actual_time_hours, notes, screenshot_url, strategy, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    b.tradeNum ?? null,
    b.symbol,
    b.direction,
    b.openedAt ?? now,
    b.outcome,                                   // 'W'|'L'|'BE'
    b.rr ?? null,                                // 1-10
    b.stopPct ?? null,
    b.isContinuation ? 1 : 0,
    JSON.stringify(b.checklist ?? {}),
    b.incubationDays ?? null,
    b.incubationHours ?? null,
    b.actualTimeHours ?? null,
    b.notes ?? null,
    b.screenshotUrl ?? null,
    b.strategy ?? 'ICT',
    now,
  )

  res.json({ ok: true, id })
})

// ─── PUT /api/backtest/:id — update ──────────────────────────────────────────
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const id = req.params['id']
  const b = req.body as any

  const existing = db.prepare(`SELECT id FROM backtest_entries WHERE id = ?`).get(id)
  if (!existing) { res.status(404).json({ error: 'Not found' }); return }

  db.prepare(`
    UPDATE backtest_entries SET
      outcome = ?, rr = ?, stop_pct = ?, notes = ?, screenshot_url = ?,
      checklist = ?, actual_time_hours = ?, strategy = ?
    WHERE id = ?
  `).run(
    b.outcome, b.rr, b.stopPct, b.notes, b.screenshotUrl,
    JSON.stringify(b.checklist ?? {}), b.actualTimeHours, b.strategy,
    id,
  )

  res.json({ ok: true })
})

// ─── DELETE /api/backtest/:id ─────────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb()
  db.prepare(`DELETE FROM backtest_entries WHERE id = ?`).run(req.params['id'])
  res.json({ ok: true })
})

// ─── GET /api/backtest/stats ──────────────────────────────────────────────────
router.get('/stats', (_req: Request, res: Response) => {
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM backtest_entries ORDER BY opened_at DESC`).all() as any[]
  res.json(calcStats(rows))
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rowToEntry(r: any) {
  return {
    id: r.id,
    tradeNum: r.trade_num,
    symbol: r.symbol,
    direction: r.direction,
    openedAt: r.opened_at,
    outcome: r.outcome,
    rr: r.rr,
    stopPct: r.stop_pct,
    isContinuation: r.is_continuation === 1,
    checklist: (() => { try { return JSON.parse(r.checklist ?? '{}') } catch { return {} } })(),
    incubationDays: r.incubation_days,
    incubationHours: r.incubation_hours,
    actualTimeHours: r.actual_time_hours,
    notes: r.notes,
    screenshotUrl: r.screenshot_url,
    strategy: r.strategy,
    createdAt: r.created_at,
  }
}

function calcStats(rows: any[]) {
  if (rows.length === 0) return { total: 0, wins: 0, losses: 0, be: 0, winRate: 0, avgRR: 0 }
  const wins = rows.filter(r => r.outcome === 'W').length
  const losses = rows.filter(r => r.outcome === 'L').length
  const be = rows.filter(r => r.outcome === 'BE').length
  const rrVals = rows.filter(r => r.outcome === 'W' && r.rr != null).map(r => Number(r.rr))
  const avgRR = rrVals.length ? parseFloat((rrVals.reduce((a, b) => a + b, 0) / rrVals.length).toFixed(2)) : 0

  const byStrategy: Record<string, { wins: number; total: number }> = {}
  rows.forEach(r => {
    const s = r.strategy ?? 'ICT'
    if (!byStrategy[s]) byStrategy[s] = { wins: 0, total: 0 }
    byStrategy[s].total++
    if (r.outcome === 'W') byStrategy[s].wins++
  })

  return {
    total: rows.length,
    wins, losses, be,
    winRate: parseFloat(((wins / rows.length) * 100).toFixed(1)),
    avgRR,
    byStrategy: Object.entries(byStrategy).map(([strategy, v]) => ({
      strategy,
      total: v.total,
      wins: v.wins,
      winRate: parseFloat(((v.wins / v.total) * 100).toFixed(1)),
    })),
  }
}

export default router
