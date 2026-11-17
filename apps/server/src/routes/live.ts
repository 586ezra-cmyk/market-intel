import { Router, Request, Response } from 'express'
import { buildBoard, boardMeta, liveSymbols, liveHealth, normSymbol, getBars, getLevels, BOARD_TFS } from '../services/liveBoard'
import { latestSnapshot } from '../services/optionsLevelsService'
import { getSummary, spotOf, OF_SYMBOLS, BINANCE_SYMBOLS } from '../services/orderflowService'
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
// GET /api/live/health — מה הפסיק להתעדכן (צילומי מצב מ-TradingView, מחיר מ-Binance). האתר מקפיץ לפיו חלון אזהרה
router.get('/health', (_req: Request, res: Response) => {
  const spots: Record<string, { price: number; ts: number } | null> = {}
  for (const s of BINANCE_SYMBOLS) { try { spots[s] = spotOf(s) } catch { spots[s] = null } }
  res.json(liveHealth(Date.now(), spots))
})
const tfOf = (req: Request): string | null => { const tf = String(req.query['tf'] ?? '1m'); return (BOARD_TFS as readonly string[]).includes(tf) ? tf : null }
// GET /api/live/:symbol/bars?tf=1m&limit=500 — נרות בזמן אמת שנבנו מצילומי המצב (לגרף באתר)
router.get('/:symbol/bars', (req: Request, res: Response) => {
  const symbol = normSymbol(String(req.params['symbol'] ?? '')); const tf = tfOf(req)
  if (!/^[A-Z0-9.]{1,20}$/.test(symbol) || !tf) return res.status(400).json({ error: 'bad symbol or tf' })
  const limit = Math.min(Math.max(parseInt(String(req.query['limit'] ?? '500'), 10) || 500, 1), 3000)
  res.json(getBars(symbol, tf, limit))
})
// GET /api/live/:symbol/levels?tf=5m — רמות HTT של המסגרת (לציור על הגרף באתר)
router.get('/:symbol/levels', (req: Request, res: Response) => {
  const symbol = normSymbol(String(req.params['symbol'] ?? '')); const tf = tfOf(req)
  if (!/^[A-Z0-9.]{1,20}$/.test(symbol) || !tf) return res.status(400).json({ error: 'bad symbol or tf' })
  res.json(getLevels(symbol, tf))
})
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
  // קריפטו: המחיר החי מגיע מ-Binance גם בלי התראות ב-TradingView
  let spot = null
  if ((BINANCE_SYMBOLS as readonly string[]).includes(symbol)) { try { spot = spotOf(symbol) } catch { /* אין טבלה עדיין */ } }
  res.json(buildBoard(symbol, { options, orderflow, news: await nextNews(now), riskUsd, spot }, now))
})

export default router
