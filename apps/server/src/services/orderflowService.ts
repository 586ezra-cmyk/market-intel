import { getDb } from '../db/client'

/**
 * Order Flow (שלב 3): דלתא ו-CVD אמיתיים מ-Binance.
 * מקור: נרות דקה (klines) — השדה "taker buy base volume" = נפח הקונים התוקפים. דלתא = קונים תוקפים − מוכרים תוקפים.
 * נשמר בטבלה orderflow_1m (60 יום אחורה), מתעדכן כל דקה (REST, 5 נרות אחרונים לכל נכס), ומצטבר למסגרות לפי דרישה.
 */
export const OF_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const
export const OF_TFS = [1, 5, 15, 60, 240] as const
const BACKFILL_DAYS = Number(process.env.ORDERFLOW_DAYS ?? 60)
const MIN_MS = 60_000
const REST = 'https://api.binance.com/api/v3/klines'

interface Row1m { t: number; o: number; h: number; l: number; c: number; vol: number; buy: number }

export interface OfBar {
  t: number; o: number; h: number; l: number; c: number
  vol: number; buy: number; sell: number; delta: number
  cvd: number; cvdO: number; cvdH: number; cvdL: number; cvdDay: number
  /** ספיגה: נפח ≥ 2× הממוצע עם טווח ≤ 0.6× הממוצע. −1 = קונים נספגו (דובי), +1 = מוכרים נספגו (שורי) */
  absorb: -1 | 0 | 1
  /** דיברגנס: המחיר שיא/שפל של 20 נרות וה-CVD לא. −1 דובי, +1 שורי */
  div: -1 | 0 | 1
}

async function fetchKlines(symbol: string, startTime: number, limit = 1000): Promise<Row1m[]> {
  const url = `${REST}?symbol=${encodeURIComponent(symbol)}&interval=1m&startTime=${startTime}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Binance ${res.status}`)
  const raw = (await res.json()) as unknown[][]
  return raw.map(k => ({ t: Number(k[0]), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), vol: Number(k[5]), buy: Number(k[9]) }))
}

function upsert(symbol: string, rows: Row1m[]): void {
  if (!rows.length) return
  const db = getDb()
  const stmt = db.prepare('INSERT OR REPLACE INTO orderflow_1m (symbol, t, o, h, l, c, vol, buy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const tx = db.transaction((rs: Row1m[]) => { for (const r of rs) stmt.run(symbol, r.t, r.o, r.h, r.l, r.c, r.vol, r.buy) })
  tx(rows)
}

function lastT(symbol: string): number | null {
  const r = getDb().prepare('SELECT MAX(t) AS t FROM orderflow_1m WHERE symbol = ?').get(symbol) as { t: number | null } | undefined
  return r?.t ?? null
}

export async function backfill(symbol: string): Promise<number> {
  const floor = Date.now() - BACKFILL_DAYS * 86_400_000
  let cur = Math.max((lastT(symbol) ?? floor) - MIN_MS, floor)
  let total = 0
  for (let i = 0; i < 2000; i++) {
    const rows = await fetchKlines(symbol, cur, 1000)
    if (!rows.length) break
    upsert(symbol, rows)
    total += rows.length
    cur = rows[rows.length - 1].t + MIN_MS
    if (rows.length < 1000) break
    await new Promise(r => setTimeout(r, 150))
  }
  console.log(`[orderflow] ${symbol}: +${total} נרות דקה`)
  return total
}

let timer: NodeJS.Timeout | null = null
export function startOrderflow(): void {
  void (async () => {
    for (const s of OF_SYMBOLS) {
      try { await backfill(s) } catch (e) { console.warn('[orderflow] backfill failed', s, String(e).slice(0, 120)) }
    }
  })()
  timer = setInterval(() => {
    void (async () => {
      for (const s of OF_SYMBOLS) {
        try { upsert(s, await fetchKlines(s, Date.now() - 4 * MIN_MS, 5)) } catch { /* הניסיון הבא בעוד דקה */ }
      }
    })()
  }, MIN_MS)
}
export function stopOrderflow(): void { if (timer) clearInterval(timer); timer = null }

export function getOrderflow(symbol: string, tfMin: number, limit: number): OfBar[] {
  const span = tfMin * MIN_MS
  const need = (limit + 25) * tfMin
  const rows = (getDb().prepare('SELECT t, o, h, l, c, vol, buy FROM orderflow_1m WHERE symbol = ? ORDER BY t DESC LIMIT ?').all(symbol, need) as Row1m[]).reverse()
  const bars: OfBar[] = []
  let cvd = 0, dayKey = -1, cvdDay = 0
  for (const r of rows) {
    const bt = Math.floor(r.t / span) * span
    const d = 2 * r.buy - r.vol
    const dk = Math.floor(r.t / 86_400_000)
    if (dk !== dayKey) { dayKey = dk; cvdDay = 0 }
    let b = bars[bars.length - 1]
    if (!b || b.t !== bt) {
      b = { t: bt, o: r.o, h: r.h, l: r.l, c: r.c, vol: 0, buy: 0, sell: 0, delta: 0, cvd, cvdO: cvd, cvdH: cvd, cvdL: cvd, cvdDay, absorb: 0, div: 0 }
      bars.push(b)
    }
    cvd += d; cvdDay += d
    b.h = Math.max(b.h, r.h); b.l = Math.min(b.l, r.l); b.c = r.c
    b.vol += r.vol; b.buy += r.buy; b.sell += r.vol - r.buy; b.delta += d
    b.cvd = cvd; b.cvdH = Math.max(b.cvdH, cvd); b.cvdL = Math.min(b.cvdL, cvd); b.cvdDay = cvdDay
  }
  for (let i = 10; i < bars.length; i++) {
    const w = bars.slice(Math.max(0, i - 20), i)
    const b = bars[i]
    const avgV = w.reduce((s, x) => s + x.vol, 0) / w.length
    const avgR = w.reduce((s, x) => s + (x.h - x.l), 0) / w.length
    if (avgV > 0 && avgR > 0 && b.vol >= 2 * avgV && (b.h - b.l) <= 0.6 * avgR) b.absorb = b.delta >= 0 ? -1 : 1
    const hi = Math.max(...w.map(x => x.h)), lo = Math.min(...w.map(x => x.l))
    const cvdHi = Math.max(...w.map(x => x.cvd)), cvdLo = Math.min(...w.map(x => x.cvd))
    // דיברגנס מסומן רק בנר הראשון של הרצף (לא בכל נר של שיא חדש), כדי שהגרף לא יתמלא
    const prev = bars[i - 1]
    if (b.h > hi && b.cvd < cvdHi) b.div = prev.div === -1 ? 0 : -1
    else if (b.l < lo && b.cvd > cvdLo) b.div = prev.div === 1 ? 0 : 1
  }
  return bars.slice(-limit)
}

export interface OfSummary {
  symbol: string; tf: number; updatedAt: number | null
  lastDelta: number | null; cvdSlope5: number | null; cvdDay: number | null
  lastAbsorb: { t: number; side: -1 | 1 } | null; lastDiv: { t: number; side: -1 | 1 } | null
}
export function getSummary(symbol: string, tfMin: number): OfSummary {
  const bars = getOrderflow(symbol, tfMin, 60)
  const last = bars[bars.length - 1]
  const ab = [...bars].reverse().find(b => b.absorb !== 0)
  const dv = [...bars].reverse().find(b => b.div !== 0)
  return {
    symbol, tf: tfMin, updatedAt: last ? last.t : null,
    lastDelta: last ? Math.round(last.delta) : null,
    cvdSlope5: bars.length > 5 ? Math.round(last.cvd - bars[bars.length - 6].cvd) : null,
    cvdDay: last ? Math.round(last.cvdDay) : null,
    lastAbsorb: ab ? { t: ab.t, side: ab.absorb as -1 | 1 } : null,
    lastDiv: dv ? { t: dv.t, side: dv.div as -1 | 1 } : null,
  }
}
