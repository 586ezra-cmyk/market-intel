import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => {
  const fakeDb = { prepare: () => ({ run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) }), exec: vi.fn() }
  return { getDb: () => fakeDb }
})

import { saveSnapshot, buildBoard, clearLive, normSymbol, getBars, getLevels, liveHealth, marketState, type SnapshotInput } from '../services/liveBoard'
import { HTT_FLAG_KEYS } from '../services/httFlagKeys'

const N = HTT_FLAG_KEYS.length
const bits = (on: string[]) => HTT_FLAG_KEYS.map(k => (on.includes(k) ? '1' : '0')).join('')
const T0 = Date.UTC(2026, 10, 12, 15, 0, 0)          // יום חמישי 10:00 בניו יורק (שעון חורף) — בתוך הסשן
function snap(over: Partial<SnapshotInput>): SnapshotInput {
  return { symbol: 'NQ1!', tf: '1m', time: T0, price: 28500, L: bits([]), S: bits([]), phase: 4, cBull: 1, ms: 1, htfMs: 1, htfPh: 4, dq: 3, rsi: 55, atr: 20, vix: 17, trL: '', trS: '', stL: 28440, stS: 28560, lv: {}, ...over }
}

describe('liveBoard', () => {
  beforeEach(() => clearLive())

  it('normalizes futures symbols', () => {
    expect(normSymbol('NQ1!')).toBe('NQ'); expect(normSymbol('CME_MINI:MNQ1!')).toBe('NQ'); expect(normSymbol('NQZ2026')).toBe('NQ')
    expect(normSymbol('ES1!')).toBe('ES'); expect(normSymbol('BTCUSDT')).toBe('BTCUSDT'); expect(normSymbol('ETHUSDT')).toBe('ETHUSDT')
  })

  it('never keeps the webhook secret that arrives inside the payload', () => {
    const saved = saveSnapshot({ ...snap({}), secret: 'top-secret' } as SnapshotInput, T0)
    expect(JSON.stringify(saved)).not.toContain('top-secret')
    expect('secret' in saved).toBe(false)
  })

  it('rejects a flags string of the wrong length', () => {
    expect(() => saveSnapshot(snap({ L: '0101' }))).toThrow(/flags length/)
  })

  it('splits confirmations into long / short / neutral and counts exec vs context', () => {
    saveSnapshot(snap({ tf: '1m', L: bits(['bos', 'fvgAt', 'sesNY']), S: bits(['sweep', 'sesNY']) }), T0)
    saveSnapshot(snap({ tf: '15m', L: bits(['ob', 'htfMs']), S: bits([]), trL: 'O' }), T0)
    const b = buildBoard('NQ', {}, T0 + 10_000)
    const m1 = b.tfs.find(t => t.tf === '1m')!
    expect(m1.missing).toBe(false)
    if (!m1.missing) { expect(m1.long).toEqual(['bos', 'fvgAt']); expect(m1.short).toEqual(['sweep']); expect(m1.neutral).toEqual(['sesNY']) }
    expect(b.summary.long).toMatchObject({ exec: 2, context: 2, total: 4 })
    expect(b.summary.short).toMatchObject({ exec: 1, context: 0, total: 1 })
    expect(b.summary.long.entries).toEqual([{ tf: '15m', code: 'O', name: 'כניסת אורדר בלוק' }])
    expect(b.tfs.find(t => t.tf === '4h')!.missing).toBe(true)
    expect(b.price).toBe(28500); expect(b.guard.live).toBe(true); expect(b.session.inRth).toBe(true)
  })

  it('computes how far each missing confirmation is, in points', () => {
    saveSnapshot(snap({ lv: { pH: 28530, pL: 28470, fLt: 28480, fLb: 28460, lo20: 28465, p2: 7650, p2lo: 7640, orH: 28490 } }), T0)
    const b = buildBoard('NQ', {}, T0 + 5_000)
    const get = (key: string, dir: string) => b.near.find(n => n.key === key && n.dir === dir)
    expect(get('bos', 'long')).toMatchObject({ level: 28530, dist: 30, tfs: ['1m'] })          // צריך לעלות 30 נק'
    expect(get('bos', 'short')).toMatchObject({ level: 28470, dist: 30 })                       // צריך לרדת 30 נק'
    expect(get('fvgAt', 'long')).toMatchObject({ level: 28480, dist: 20, inZone: false })       // חזרה לראש האזור
    expect(get('smt', 'long')!.note).toContain('הצמד מחזיק')
    expect(get('orBrk', 'long')).toBeUndefined()                                                // המחיר כבר מעל שיא טווח הפתיחה — הרמה מאחורינו
    expect(b.near[0].pct).toBeLessThanOrEqual(b.near[1].pct)                                    // ממוין מהקרוב לרחוק
  })

  it('marks price inside a zone as distance 0 and skips active confirmations', () => {
    saveSnapshot(snap({ price: 28470, L: bits(['bos']), lv: { pH: 28530, fLt: 28480, fLb: 28460 } }), T0)
    const b = buildBoard('NQ', {}, T0)
    expect(b.near.find(n => n.key === 'fvgAt' && n.dir === 'long')).toMatchObject({ dist: 0, inZone: true })
    expect(b.near.find(n => n.key === 'bos' && n.dir === 'long')).toBeUndefined()
  })

  it('sizes the trade card: 300$ risk, micro contracts = floor(150 / stop points), max 5', () => {
    saveSnapshot(snap({ lv: { pL: 28460, pH: 28520 }, stL: 28431.5, stS: 28548.5 }), T0)
    const b = buildBoard('NQ', { riskUsd: 300 }, T0)
    const [pivot, course] = b.card.long!.options as any[]
    expect(pivot).toMatchObject({ pts: 40, contracts: 3, unit: 'MNQ', riskUsd: 240, t1: 28540, t2: 28580, r2Usd: 480, fits: true })
    expect(course).toMatchObject({ pts: 68.5, contracts: 2, riskUsd: 274 })
    expect((b.card.short!.options as any[])[0]).toMatchObject({ pts: 20, contracts: 5, riskUsd: 200 })  // 150/20 = 7 → תקרה של 5
  })

  it('flags stale data and does not count it', () => {
    saveSnapshot(snap({ tf: '1m', L: bits(['bos']) }), T0)
    const b = buildBoard('NQ', {}, T0 + 10 * 60_000)
    const m1 = b.tfs.find(t => t.tf === '1m')!
    expect(!m1.missing && m1.stale).toBe(true)
    expect(b.summary.long.total).toBe(0); expect(b.guard.live).toBe(false); expect(b.card.long).toBeNull()
  })

  it('adds option levels with distance for NQ', () => {
    saveSnapshot(snap({}), T0)
    const b = buildBoard('NQ', { options: { ts: T0 - 600_000, nq: { callWall: 28888, putWall: 28063, zeroGamma: null, regime: 'positive' } } }, T0)
    expect(b.options).toMatchObject({ regime: 'positive', ageMin: 10 })
    expect(b.options!.levels).toEqual([{ key: 'callWall', name: 'קיר קולים', price: 28888, dist: 388 }, { key: 'putWall', name: 'קיר פוטים', price: 28063, dist: -437 }])
    expect(N).toBe(84)
  })

  it('flags the regime as unstable when price sits on zero-gamma, and reports strength', () => {
    saveSnapshot(snap({}), T0)
    const b = buildBoard('NQ', { options: { ts: T0, nq: { zeroGamma: 28540, regime: 'negative', netGex: -5.06e9 } } }, T0)
    expect(b.options).toMatchObject({ regime: 'negative', netGexB: -5.1, nearFlip: true })
    const far = buildBoard('NQ', { options: { ts: T0, nq: { zeroGamma: 29200, regime: 'negative', netGex: -5.06e9 } } }, T0)
    expect(far.options!.nearFlip).toBe(false)
  })

  it('builds real-time bars from snapshots, one per bar close, per timeframe', () => {
    saveSnapshot(snap({ time: T0, price: 28500, op: 28490, hi: 28510, lo: 28485 }), T0 + 60_000)
    saveSnapshot(snap({ time: T0 + 60_000, price: 28520, op: 28500, hi: 28525, lo: 28498 }), T0 + 120_000)
    saveSnapshot(snap({ tf: '5m', time: T0, price: 28520, op: 28490, hi: 28525, lo: 28485 }), T0 + 300_000)
    expect(getBars('NQ1!', '1m')).toEqual([
      { time: T0 / 1000, open: 28490, high: 28510, low: 28485, close: 28500 },
      { time: T0 / 1000 + 60, open: 28500, high: 28525, low: 28498, close: 28520 },
    ])
    expect(getBars('NQ', '5m')).toHaveLength(1)
    expect(getBars('NQ', '15m')).toEqual([])
  })

  it('a repeated snapshot for the same bar replaces it, and a script without an open price uses the previous close', () => {
    saveSnapshot(snap({ time: T0, price: 28500, op: 28490, hi: 28510, lo: 28485 }), T0)
    saveSnapshot(snap({ time: T0, price: 28505, op: 28490, hi: 28512, lo: 28485 }), T0 + 1000)
    saveSnapshot(snap({ time: T0 + 60_000, price: 28530, hi: 28531, lo: 28504 }), T0 + 60_000)          // בלי op
    const bars = getBars('NQ', '1m')
    expect(bars).toHaveLength(2)
    expect(bars[0]).toMatchObject({ close: 28505, high: 28512 })
    expect(bars[1]).toMatchObject({ open: 28505, high: 28531, low: 28504, close: 28530 })
  })

  it('serves chart levels for the requested timeframe and marks an old snapshot as stale', () => {
    expect(getLevels('NQ', '5m', T0)).toMatchObject({ tf: null, stale: true, lv: {} })
    saveSnapshot(snap({ tf: '5m', lv: { pH: 28560, fLt: 28480, fLb: 28470, bad: null } }), T0)
    expect(getLevels('NQ1!', '5m', T0 + 30_000)).toMatchObject({ tf: '5m', exact: true, stale: false, ageSec: 30, lv: { pH: 28560, fLt: 28480, fLb: 28470 } })
    expect(getLevels('NQ', '1m', T0 + 30_000)).toMatchObject({ tf: '5m', exact: false })                 // אין צילום דקה → הטרי ביותר
    expect(getLevels('NQ', '5m', T0 + 3_600_000).stale).toBe(true)
  })

  it('crypto without any snapshot: live price from the exchange, 24/7 session, confirmations not live yet', () => {
    const night = Date.UTC(2026, 10, 15, 3, 0, 0)                      // יום ראשון בלילה — מחוץ לסשן ניו יורק
    const b = buildBoard('BTCUSDT', { spot: { price: 64800, ts: night - 20_000 } }, night)
    expect(b).toMatchObject({ price: 64800, priceAgeSec: 20, priceSource: 'spot' })
    expect(b.guard).toMatchObject({ live: true, snapshots: false, inSession: true })
    expect(b.session).toMatchObject({ allDay: true, inRth: false })
    expect(b.summary.long.total).toBe(0); expect(b.near).toHaveLength(0)
    expect(buildBoard('NQ', {}, night).guard.inSession).toBe(false)     // נאסדק נשאר תלוי בסשן
  })

  it('uses the exchange price only when it is newer than the last snapshot, and keeps distances on it', () => {
    saveSnapshot(snap({ symbol: 'BTCUSDT', tf: '1m', price: 64000, lv: { pH: 64500 } }), T0)
    const older = buildBoard('BTCUSDT', { spot: { price: 63900, ts: T0 - 5_000 } }, T0 + 10_000)
    expect(older).toMatchObject({ price: 64000, priceSource: 'snapshot' })
    const newer = buildBoard('BTCUSDT', { spot: { price: 64400, ts: T0 + 25_000 } }, T0 + 30_000)
    expect(newer).toMatchObject({ price: 64400, priceSource: 'spot', priceAgeSec: 5 })
    expect(newer.guard.snapshots).toBe(true)
    const brk = newer.near.find(n => n.levelName && n.level === 64500)
    expect(brk?.dist).toBe(100)                                           // 64,500 − 64,400, לא מהמחיר הישן של הצילום
  })

  it('health: nothing to report while snapshots and the exchange price keep arriving', () => {
    saveSnapshot(snap({ tf: '1m' }), T0); saveSnapshot(snap({ tf: '5m' }), T0)
    saveSnapshot(snap({ symbol: 'BTCUSDT', tf: '1m', price: 64000 }), T0)
    const h = liveHealth(T0 + 60_000, { BTCUSDT: { price: 64010, ts: T0 + 20_000 } })
    expect(h).toMatchObject({ ok: true, items: [] })
  })

  it('health: reports the timeframes that stopped, per asset, and since when', () => {
    saveSnapshot(snap({ tf: '1m' }), T0); saveSnapshot(snap({ tf: '5m' }), T0 - 60_000); saveSnapshot(snap({ tf: '1h' }), T0)
    const h = liveHealth(T0 + 4 * 60_000)                                // 4 דקות בלי נר דקה; 5 דק׳ ושעה עדיין בזמן
    expect(h.ok).toBe(false)
    expect(h.items).toEqual([{ symbol: 'NQ', kind: 'snapshots', tfs: ['1m'], since: T0, ageSec: 240 }])
    const later = liveHealth(T0 + 13 * 60_000)
    expect(later.items[0]).toMatchObject({ symbol: 'NQ', tfs: ['1m', '5m'], since: T0 })
  })

  it('health: the exchange price counts as stopped after two and a half minutes, or when there is none', () => {
    const h = liveHealth(T0, { BTCUSDT: { price: 64000, ts: T0 - 200_000 }, ETHUSDT: null, SOLUSDT: { price: 70, ts: T0 - 30_000 } })
    expect(h.items).toEqual([
      { symbol: 'BTCUSDT', kind: 'price', tfs: [], since: T0 - 200_000, ageSec: 200 },
      { symbol: 'ETHUSDT', kind: 'price', tfs: [], since: null, ageSec: null },
    ])
  })

  it('health: futures are not reported during the daily break, the weekend, or right after the reopen', () => {
    const lastBar = Date.UTC(2026, 10, 17, 21, 59, 0)                   // שלישי 16:59 בניו יורק — הנר האחרון לפני ההפסקה
    saveSnapshot(snap({ tf: '1m' }), lastBar)
    const at = (h: number, m: number, day = 17) => Date.UTC(2026, 10, day, h, m, 0)
    expect(marketState('NQ', at(22, 30))).toMatchObject({ open: false })                       // 17:30 — בהפסקה
    expect(liveHealth(at(22, 30)).ok).toBe(true)
    expect(marketState('NQ', at(23, 2))).toEqual({ open: true, openedAt: at(23, 0) })           // 18:02 — נפתח ב-18:00
    expect(liveHealth(at(23, 2)).ok).toBe(true)                                                 // עוד לא עברו שני נרות מהפתיחה
    expect(liveHealth(at(23, 5)).items).toEqual([{ symbol: 'NQ', kind: 'snapshots', tfs: ['1m'], since: lastBar, ageSec: 3960 }])
    expect(marketState('NQ', at(15, 0, 21)).open).toBe(false)                                   // שבת
    expect(marketState('NQ', at(22, 30, 22)).open).toBe(false)                                  // ראשון 17:30 — לפני הפתיחה
    expect(marketState('NQ', at(23, 30, 22)).open).toBe(true)                                   // ראשון 18:30
    expect(marketState('NQ', at(22, 30, 20)).open).toBe(false)                                  // שישי אחרי 17:00
    expect(marketState('BTCUSDT', at(15, 0, 21))).toEqual({ open: true, openedAt: null })       // קריפטו — תמיד
  })
})
