import { Router, Request, Response } from 'express'
import { latestSnapshot, snapshotHistory, computeSnapshot } from '../services/optionsLevelsService'

const router = Router()
// GET /api/options-levels — הרמות האחרונות (NQ / NDX / QQQ + פרופיל)
router.get('/', (_req: Request, res: Response) => {
  const s = latestSnapshot()
  if (!s) return res.status(404).json({ error: 'no snapshot yet' })
  res.json(s)
})
// GET /api/options-levels/history?days=30
router.get('/history', (req: Request, res: Response) => {
  const days = Math.min(365, Math.max(1, parseInt(String(req.query['days'] ?? '30'), 10) || 30))
  res.json(snapshotHistory(days))
})
// POST /api/options-levels/refresh — חישוב מיידי
router.post('/refresh', async (_req: Request, res: Response) => {
  try { res.json(await computeSnapshot()) } catch (e) { res.status(502).json({ error: String(e).slice(0, 200) }) }
})
export default router
