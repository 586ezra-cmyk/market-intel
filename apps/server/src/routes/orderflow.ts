import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { OF_SYMBOLS, OF_TFS, BINANCE_SYMBOLS, getOrderflow, getSummary, ingestBars, lastBarTime } from '../services/orderflowService'

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

// POST /api/orderflow/ingest — נרות דקה מתוסף Bookmap (NQ): { symbol, bars: [{ t, o, h, l, c, vol, buy }] }
const IngestSchema = z.object({
  symbol: z.string().min(1).max(12),
  bars: z.array(z.object({ t: z.number(), o: z.number(), h: z.number(), l: z.number(), c: z.number(), vol: z.number(), buy: z.number() })).min(1).max(5000),
})
router.post('/ingest', (req: Request, res: Response) => {
  const parsed = IngestSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() }); return }
  const symbol = parsed.data.symbol.toUpperCase()
  if (!(OF_SYMBOLS as readonly string[]).includes(symbol) || (BINANCE_SYMBOLS as readonly string[]).includes(symbol)) { res.status(400).json({ error: 'symbol not accepted for ingest', accepted: OF_SYMBOLS.filter(s => !(BINANCE_SYMBOLS as readonly string[]).includes(s)) }); return }
  const inserted = ingestBars(symbol, parsed.data.bars)
  res.json({ ok: true, symbol, inserted, lastBar: lastBarTime(symbol) })
})

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
