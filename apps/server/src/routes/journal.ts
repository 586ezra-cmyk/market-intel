import { Router, Request, Response } from 'express'
import { v4 as uuid } from 'uuid'
import { getDb } from '../db/client'

const router = Router()

// ─── GET /api/journal ──────────────────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const db = getDb()
  const { symbol, direction, limit = '100', offset = '0' } = req.query

  let q = `SELECT * FROM journal_entries WHERE 1=1`
  const params: any[] = []

  if (symbol) { q += ` AND symbol = ?`; params.push(String(symbol)) }
  if (direction) { q += ` AND direction = ?`; params.push(String(direction)) }

  q += ` ORDER BY opened_at DESC LIMIT ? OFFSET ?`
  params.push(parseInt(String(limit)), parseInt(String(offset)))

  const rows = (db.prepare(q) as any).all(...params) as any[]

  const stats = calcJournalStats(rows)
  res.json({ entries: rows.map(rowToEntry), stats })
})

// ─── POST /api/journal ─────────────────────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  const db = getDb()
  const b = req.body as any
  const id = uuid()
  const now = Date.now()

  // Auto-calculate PnL if all fields present
  let pnl: number | null = null
  if (b.entryPrice && b.exitPrice && b.sizeUsd) {
    const direction = b.direction === 'LONG' ? 1 : -1
    const pct = direction * (b.exitPrice - b.entryPrice) / b.entryPrice
    pnl = parseFloat((pct * b.sizeUsd - (b.commissionUsd ?? 0)).toFixed(2))
  }

  db.prepare(`
    INSERT INTO journal_entries
      (id, trade_num, symbol, direction, opened_at, closed_at,
       entry_price, stop_price, exit_price, size_usd, commission_usd,
       pnl_usd, notes, screenshot_url, alert_id, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    b.tradeNum ?? null,
    b.symbol,
    b.direction,
    b.openedAt ?? now,
    b.closedAt ?? null,
    b.entryPrice,
    b.stopPrice ?? null,
    b.exitPrice ?? null,
    b.sizeUsd ?? null,
    b.commissionUsd ?? 0,
    pnl,
    b.notes ?? null,
    b.screenshotUrl ?? null,
    b.alertId ?? null,
    now,
  )

  res.json({ ok: true, id, pnl })
})

// ─── PUT /api/journal/:id ──────────────────────────────────────────────────────
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb()
  const id = req.params['id']
  const b = req.body as any

  const existing = db.prepare(`SELECT id, direction, entry_price, size_usd FROM journal_entries WHERE id = ?`).get(id) as any
  if (!existing) { res.status(404).json({ error: 'Not found' }); return }

  // Recalculate PnL on update
  let pnl: number | null = null
  const exitPrice = b.exitPrice ?? null
  const sizeUsd = b.sizeUsd ?? existing.size_usd
  if (exitPrice && sizeUsd && existing.entry_price) {
    const direction = (b.direction ?? existing.direction) === 'LONG' ? 1 : -1
    const pct = direction * (exitPrice - existing.entry_price) / existing.entry_price
    pnl = parseFloat((pct * sizeUsd - (b.commissionUsd ?? 0)).toFixed(2))
  }

  db.prepare(`
    UPDATE journal_entries SET
      closed_at = ?, exit_price = ?, size_usd = ?,
      commission_usd = ?, pnl_usd = ?,
      notes = ?, screenshot_url = ?
    WHERE id = ?
  `).run(
    b.closedAt ?? null,
    exitPrice,
    sizeUsd,
    b.commissionUsd ?? 0,
    pnl,
    b.notes ?? null,
    b.screenshotUrl ?? null,
    id,
  )

  res.json({ ok: true, pnl })
})

// ─── DELETE /api/journal/:id ───────────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb()
  db.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(req.params['id'])
  res.json({ ok: true })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rowToEntry(r: any) {
  return {
    id: r.id,
    tradeNum: r.trade_num,
    symbol: r.symbol,
    direction: r.direction,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    entryPrice: r.entry_price,
    stopPrice: r.stop_price,
    exitPrice: r.exit_price,
    sizeUsd: r.size_usd,
    commissionUsd: r.commission_usd,
    pnlUsd: r.pnl_usd,
    notes: r.notes,
    screenshotUrl: r.screenshot_url,
    alertId: r.alert_id,
    createdAt: r.created_at,
  }
}

function calcJournalStats(rows: any[]) {
  if (rows.length === 0) return { total: 0, totalPnl: 0, avgPnl: 0, wins: 0, losses: 0 }

  const withPnl = rows.filter(r => r.pnl_usd !== null)
  const totalPnl = withPnl.reduce((s, r) => s + r.pnl_usd, 0)
  const wins = withPnl.filter(r => r.pnl_usd > 0).length
  const losses = withPnl.filter(r => r.pnl_usd < 0).length

  return {
    total: rows.length,
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    avgPnl: withPnl.length ? parseFloat((totalPnl / withPnl.length).toFixed(2)) : 0,
    wins,
    losses,
    winRate: withPnl.length ? parseFloat(((wins / withPnl.length) * 100).toFixed(1)) : 0,
  }
}

export default router
