import { Router, Request, Response } from 'express'
import { getCachedCalendar } from '../services/forexFactory'
import { generateMorningBriefing, generateEveningSummary, runBackup } from '../services/scheduler'

const router = Router()

// GET /api/economic-calendar
router.get('/', async (_req: Request, res: Response) => {
  try {
    const events = await getCachedCalendar()
    res.json(events)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/briefing/morning
router.get('/briefing/morning', async (_req: Request, res: Response) => {
  try {
    const text = await generateMorningBriefing()
    res.json({ text, generatedAt: Date.now() })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/briefing/evening
router.get('/briefing/evening', async (_req: Request, res: Response) => {
  try {
    const text = await generateEveningSummary()
    res.json({ text, generatedAt: Date.now() })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/briefing/backup — manual trigger
router.post('/backup', async (_req: Request, res: Response) => {
  try {
    const dest = await runBackup()
    res.json({ ok: true, file: dest })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
