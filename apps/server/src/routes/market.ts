import { Router, Request, Response } from 'express'
import { getActiveRange, getRangeHistory } from '../services/rangeEngine'
import { getRecentStructures } from '../services/structureEngine'
import { getActiveFVGs } from '../services/fvgEngine'
import { getActiveLiquidity } from '../services/liquidityEngine'
import { getRecentSMTSignals } from '../services/smtEngine'
import { parseTF } from '../utils/timeframe'
import { cascadeScan } from '../services/confluenceEngine'
import type { Direction } from '@market/shared'
import { analyzeSymbol } from '../services/liveAnalysisEngine'

const router = Router()
const analysisCache = new Map<string, any>()

// GET /api/market/:symbol/:timeframe/state — full current state for chart
router.get('/:symbol/:timeframe/state', (req: Request, res: Response) => {
  try {
    const symbol = req.params['symbol'] as string
    const timeframe = req.params['timeframe'] as string
    const tf = parseTF(timeframe)

    const range = getActiveRange(symbol, tf)
    const structures = getRecentStructures(symbol, tf, 20)
    const fvgs = getActiveFVGs(symbol, tf)
    const liquidity = getActiveLiquidity(symbol, tf)
    const smtSignals = getRecentSMTSignals(tf, 5)

    res.json({ range, structures, fvgs, liquidity, smtSignals })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/market/:symbol/:timeframe/ranges
router.get('/:symbol/:timeframe/ranges', (req: Request, res: Response) => {
  try {
    const symbol = req.params['symbol'] as string
    const timeframe = req.params['timeframe'] as string
    const tf = parseTF(timeframe)
    const limit = parseInt(String(req.query['limit'] ?? '20'))
    const history = getRangeHistory(symbol, tf, limit)
    res.json(history)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/market/:symbol/:timeframe/cascade?direction=bullish
router.get('/:symbol/:timeframe/cascade', (req: Request, res: Response) => {
  try {
    const symbol = req.params['symbol'] as string
    const timeframe = req.params['timeframe'] as string
    const tf = parseTF(timeframe)
    const direction = (req.query['direction'] as Direction) ?? 'bullish'
    const scan = cascadeScan(symbol, tf, direction)
    res.json(scan)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/market/:symbol/analyze
router.get('/:symbol/analyze', async (req: Request, res: Response) => {
  try {
    const symbol = (req.params['symbol'] as string).toUpperCase()
    // Simple 60-second cache
    const cached = analysisCache.get(symbol)
    if (cached && Date.now() - cached.analyzedAt < 60000) {
      return res.json(cached)
    }
    const result = await analyzeSymbol(symbol)
    analysisCache.set(symbol, result)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
