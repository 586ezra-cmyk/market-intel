import { Router, Request, Response } from 'express'
import { getDb } from '../db/client'
import { getTopCombinations, getWinRateSummary } from '../services/factorStatsService'

const router = Router()

// GET /api/stats/factors — top factor combinations by win rate
router.get('/factors', (_req: Request, res: Response) => {
  try {
    const db = getDb()
    const combinations = getTopCombinations(db, 20)
    res.json({ combinations })
  } catch (err: any) {
    { console.error('[Error]', err?.message ?? err); res.status(500).json({ error: 'Internal error' }) }
  }
})

// GET /api/stats/summary — overall win rates
router.get('/summary', (_req: Request, res: Response) => {
  try {
    const db = getDb()
    const summary = getWinRateSummary(db)
    res.json(summary)
  } catch (err: any) {
    { console.error('[Error]', err?.message ?? err); res.status(500).json({ error: 'Internal error' }) }
  }
})

export default router
