import { Router, Request, Response } from 'express'
import { buildBoard, boardMeta, liveSymbols, normSymbol } from '../services/liveBoard'
import { latestSnapshot } from '../services/optionsLevelsService'
import { getSummary, OF_SYMBOLS } from '../services/orderflowService'
import { getCachedCalendar } from '../services/forexFactory'
import { getSetting } from './settings'

const router = Router()

/** ההודעה הכלכלית החשובה הקרובה (USD, השפעה גבוהה). לא מחכים לרשת יותר משנייה וחצי — הלוח לא נתקע בגללה. */
async function nextNews(now: number): Promise<{ title: string; inMin: number } | null> {
  try {
    const events = await Promise.race([getCachedCalendar(), new Promise<null>(r => setTimeout(() => r(null), 1500))])
    if (!events) return null
    let best: { title: string; inMin: number } | null = null
    for (const e of events) {
      if (e.impact !== 'high' || e.currency !== 'USD') continue
      const ts = Date.parse(`${e.date}T${e.time}:00Z`)
      if (!Number.isFinite(ts)) continue
      const inMin = Math.round((ts - now) / 60_000)
      if (inMin < -5 || inMin > 24 * 60) continue
      if (!best || inMin < best.inMin) best = { title: e.titleHe || e.title, inMin }
    }
    return best
  } catch { return null }
}

// GET /api/live/meta — שמות האישורים, הקבוצות והמסגרות (נטען פעם אחת באתר)
router.get('/meta', (_req: Request, res: Response) => { res.json(boardMeta()) })
// GET /api/live — אילו נכסים שולחים צילום מצב
router.get('/', (_req: Request, res: Response) => { res.json({ symbols: liveSymbols() }) })
// GET /api/live/:symbol — הלוח המלא לנכס
router.get('/:symbol', async (req: Request, res: Response) => {
  const symbol = normSymbol(String(req.params['symbol'] ?? ''))
  if (!/^[A-Z0-9.]{1,20}$/.test(symbol)) return res.status(400).json({ error: 'bad symbol' })
  const now = Date.now()
  const ofSym = (OF_SYMBOLS as readonly string[]).includes(symbol) ? symbol : null
  const orderflow: Record<string, ReturnType<typeof getSummary> | null> = {}
  if (ofSym) for (const tf of [1, 5]) { try { orderflow[String(tf)] = getSummary(ofSym, tf) } catch { orderflow[String(tf)] = null } }
  let options = null
  try { const o = latestSnapshot(); if (o) options = { ts: o.ts, nq: o.nq } } catch { /* אין חישוב עדיין */ }
  const riskUsd = Number(getSetting('m3_risk_usd', '300')) || 300
  res.json(buildBoard(symbol, { options, orderflow, news: await nextNews(now), riskUsd }, now))
})

export default router
