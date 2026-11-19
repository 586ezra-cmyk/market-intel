import { Router, Request, Response } from 'express'
import { buildBoard, boardMeta, liveSymbols, liveHealth, normSymbol, getBars, getLevels, BOARD_TFS } from '../services/liveBoard'
import { latestSnapshot } from '../services/optionsLevelsService'
import { getSummary, spotOf, OF_SYMBOLS, BINANCE_SYMBOLS } from '../services/orderflowService'
import { getSetting } from './settings'
import { buildGate, nextNews, addDayTrade, undoDayTrade } from '../services/entryGate'

const router = Router()

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
/** רמות האופציות (רק לנאסדק) — לאזהרה "רמה בין הכניסה ליעד" */
function optionLevels(symbol: string): Array<{ name: string; price: number }> {
  if (symbol !== 'NQ') return []
  try {
    const o = latestSnapshot()?.nq as Record<string, unknown> | undefined
    if (!o) return []
    const defs: Array<[string, string]> = [['callWall', 'קיר קולים'], ['putWall', 'קיר פוטים'], ['zeroGamma', 'אפס-גמא'], ['magnet', 'מגנט (OI הגדול)'], ['zdte', '0DTE']]
    return defs.filter(([k]) => typeof o[k] === 'number').map(([k, name]) => ({ name, price: o[k] as number }))
  } catch { return [] }
}
const riskOf = (): number => Number(getSetting('m3_risk_usd', '300')) || 300
// GET /api/live/:symbol/gate — רמזור הכניסה לבד (לגרף באתר)
router.get('/:symbol/gate', async (req: Request, res: Response) => {
  const symbol = normSymbol(String(req.params['symbol'] ?? ''))
  if (!/^[A-Z0-9.]{1,20}$/.test(symbol)) return res.status(400).json({ error: 'bad symbol' })
  const now = Date.now()
  res.json(buildGate(symbol, { news: await nextNews(now), riskUsd: riskOf(), optionLevels: optionLevels(symbol) }, now))
})
// POST /api/live/:symbol/day-trade { result: win | loss | be } — המשתמש מסמן עסקה שנסגרה (לחוקי היום). DELETE מבטל את האחרונה
router.post('/:symbol/day-trade', (req: Request, res: Response) => {
  const symbol = normSymbol(String(req.params['symbol'] ?? ''))
  const result = String((req.body as { result?: unknown } | undefined)?.result ?? '')
  if (!/^[A-Z0-9.]{1,20}$/.test(symbol) || !['win', 'loss', 'be'].includes(result)) return res.status(400).json({ error: 'bad symbol or result' })
  const t = addDayTrade(symbol, result as 'win' | 'loss' | 'be', riskOf())
  if (!t) return res.status(400).json({ error: 'no rules for this symbol' })
  res.json({ ok: true, trade: t })
})
router.delete('/:symbol/day-trade', (_req: Request, res: Response) => { res.json({ ok: true, removed: undoDayTrade() }) })
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
  const news = await nextNews(now)
  const board = buildBoard(symbol, { options, orderflow, news, riskUsd, spot }, now)
  res.json({ ...board, gate: buildGate(symbol, { news, riskUsd, optionLevels: board.options?.levels }, now) })
})

export default router
