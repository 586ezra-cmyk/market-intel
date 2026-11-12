import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => {
  const fakeDb = { prepare: () => ({ run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) }), exec: vi.fn() }
  return { getDb: () => fakeDb }
})

import { saveSnapshot, buildBoard, clearLive, normSymbol, type SnapshotInput } from '../services/liveBoard'
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
})
