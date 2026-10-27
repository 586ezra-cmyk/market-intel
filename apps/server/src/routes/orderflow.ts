import { Router, Request, Response } from 'express'
import { OF_SYMBOLS, OF_TFS, getOrderflow, getSummary } from '../services/orderflowService'

const router = Router()

function parseParams(req: Request, res: Response): { symbol: string; tf: number; limit: number } | null {
  const symbol = String(req.params['symbol'] ?? '').toUpperCase()
  if (!(OF_SYMBOLS as readonly string[]).includes(symbol)) { res.status(400).json({ error: 'symbol not supported', supported: OF_SYMBOLS }); return null }
  const tf = parseInt(String(req.query['tf'] ?? '15'), 10)
  if (!(OF_TFS as readonly number[]).includes(tf)) { res.status(400).json({ error: 'tf must be one of ' + OF_TFS.join(',') }); return null }
  const limitRaw = parseInt(String(req.query['limit'] ?? '300'), 10)
  const limit = Math.min(1500, Math.max(20, Number.isFinite(limitRaw) ? limitRaw : 300))
  return { symbol, tf, limit }
}

// GET /api/orderflow/:symbol/summary?tf=15
router.get('/:symbol/summary', (req: Request, res: Response) => {
  const p = parseParams(req, res)
  if (!p) return
  res.json(getSummary(p.symbol, p.tf))
})

// GET /api/orderflow/:symbol?tf=15&limit=300
router.get('/:symbol', (req: Request, res: Response) => {
  const p = parseParams(req, res)
  if (!p) return
  res.json({ symbol: p.symbol, tf: p.tf, bars: getOrderflow(p.symbol, p.tf, p.limit) })
})

export default router
