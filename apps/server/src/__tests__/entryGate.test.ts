import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => {
  const fakeDb = { prepare: () => ({ run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) }), exec: vi.fn() }
  return { getDb: () => fakeDb }
})
vi.mock('../services/forexFactory', () => ({ getCachedCalendar: async () => [] }))

import { saveSnapshot, clearLive, type SnapshotInput } from '../services/liveBoard'
import { buildGate, onMinuteSnapshot, clearGate, addDayTrade, undoDayTrade, dayStatus, gateTelegramText, GATE_RULES } from '../services/entryGate'
import { HTT_FLAG_KEYS } from '../services/httFlagKeys'

const bits = (on: string[]) => HTT_FLAG_KEYS.map(k => (on.includes(k) ? '1' : '0')).join('')
const T0 = Date.UTC(2026, 10, 12, 15, 0, 0)          // יום חמישי 10:00 בניו יורק (שעון חורף) — בתוך שעות המסחר
const MIN = 60_000
const LONG_ON = ['ema12Ok', 'ema12Side', 'cvdOk']
const LV = { vah: 28480, val: 28300, ema: 28485 }
function snap(over: Partial<SnapshotInput>): SnapshotInput {
  return { symbol: 'NQ1!', tf: '1m', time: T0, price: 28500, op: 28490, hi: 28502, lo: 28488, L: bits(LONG_ON), S: bits([]), phase: 4, cBull: 1, ms: 1, htfMs: 1, htfPh: 4, dq: 3, rsi: 55, atr: 20, vix: 17, trL: '', trS: '', stL: 28440, stS: 28560, lv: LV, ...over }
}
/** נר דקה נסגר: נשמר ונבדק ברמזור, כמו שה-Webhook עושה. הצילום מגיע שנייה אחרי סגירת הנר. */
function bar(i: number, over: Partial<SnapshotInput> = {}, news: { title: string; inMin: number } | null = null) {
  const time = T0 + i * MIN; const at = time + MIN + 1000
  const saved = saveSnapshot(snap({ time, ...over }), at)
  return { at, sig: onMinuteSnapshot(saved, { news }, at) }
}

describe('entryGate', () => {
  beforeEach(() => { clearLive(); clearGate() })

  it('is defined only for Nasdaq', () => {
    expect(buildGate('BTCUSDT', {}, T0)).toEqual({ supported: false, symbol: 'BTCUSDT' })
    expect(buildGate('MNQ1!', {}, T0).supported).toBe(true)
  })

  it('turns green when all conditions hold on a closed 1m bar, with a 30-point stop and 1:2 target', () => {
    const { at, sig } = bar(0)
    expect(sig).toMatchObject({ dir: 'long', entry: 28500, stop: 28470, t1: 28530, t2: 28560, blocked: null, status: 'open' })
    const g = buildGate('NQ', {}, at + 5_000)
    expect(g.supported && g.state).toBe('green')
    if (!g.supported) return
    expect(g.dir).toBe('long'); expect(g.headline).toContain('לונג')
    expect(g.conditions.map(c => c.key)).toEqual(['time', 'value', 'ema', 'emaNear', 'candle', 'cvd'])
    expect(g.conditions.every(c => c.ok)).toBe(true)
    expect(g.plan).toMatchObject({ entry: 28500, stop: 28470, t2: 28560, contracts: 5, unit: 'MNQ', riskUsd: 300, rewardUsd: 600, estimated: false })
    expect(g.signal!.secLeft).toBeGreaterThan(40); expect(g.signal!.secLeft).toBeLessThanOrEqual(60)
  })

  it('is green for the second candle only; after that it does not chase', () => {
    const { at } = bar(0)
    expect(buildGate('NQ', {}, at + 58_000).supported && (buildGate('NQ', {}, at + 58_000) as { state: string }).state).toBe('green')
    const g1 = buildGate('NQ', {}, at + 61_000) as { state: string; missing: string | null }
    expect(g1.state).toBe('yellow')                                 // הנר השני נגמר, והצילום הבא עוד לא הגיע
    const next = bar(1, { price: 28510, op: 28500, hi: 28512, lo: 28499 })
    expect(next.sig).toBeNull()                                     // התנאים עדיין מתקיימים — אבל זה אותו מהלך, לא איתות חדש
    const g2 = buildGate('NQ', {}, next.at + 2_000) as { state: string; missing: string | null; plan: unknown }
    expect(g2.state).toBe('yellow'); expect(g2.missing).toContain('לא רודפים'); expect(g2.plan).toBeNull()
  })

  it('fires again after a pullback candle and a new momentum candle', () => {
    bar(0)
    expect(bar(1, { price: 28494, op: 28500, hi: 28501, lo: 28492 }).sig).toBeNull()          // נר אדום = תיקון
    const again = bar(2, { price: 28503, op: 28494, hi: 28504, lo: 28493 })
    expect(again.sig).toMatchObject({ dir: 'long', entry: 28503 })
  })

  it('yellow with exactly one missing condition says what is missing and at which price', () => {
    const { at, sig } = bar(0, { price: 28470, op: 28460, lv: { vah: 28480, val: 28300, ema: 28462 } })       // עוד בתוך האזור ההוגן
    expect(sig).toBeNull()
    const g = buildGate('NQ', {}, at + 2_000) as { state: string; missing: string; plan: { entry: number; estimated: boolean; stop: number } }
    expect(g.state).toBe('yellow')
    expect(g.missing).toContain('חסר רק'); expect(g.missing).toContain('28,480'); expect(g.missing).toContain('10 נק׳')
    expect(g.plan).toMatchObject({ entry: 28480, stop: 28450, estimated: true })
  })

  it('one missing condition that is far away is still red, not yellow', () => {
    const { at } = bar(0, { price: 28400, op: 28390, lv: { vah: 28480, val: 28300, ema: 28392 } })           // 80 נק' מתחת לתקרת האזור
    const g = buildGate('NQ', {}, at + 2_000) as { state: string; headline: string; missing: string; plan: unknown }
    expect(g.state).toBe('red'); expect(g.headline).toBe('אין עסקה'); expect(g.missing).toContain('28,480'); expect(g.plan).toBeNull()
  })

  it('red when two or more conditions are missing', () => {
    const { at } = bar(0, { price: 28470, op: 28475, L: bits(['ema12Side']), lv: { vah: 28480, val: 28300, ema: 28462 } })
    const g = buildGate('NQ', {}, at + 2_000) as { state: string; headline: string; plan: unknown }
    expect(g.state).toBe('red'); expect(g.headline).toBe('אין עסקה'); expect(g.plan).toBeNull()
  })

  it('"far from the EMA" is a missing condition with the pullback price', () => {
    const { at } = bar(0, { lv: { vah: 28400, val: 28300, ema: 28440 } })                     // 60 נק' מעל ה-EMA
    const g = buildGate('NQ', {}, at + 2_000) as { state: string; missing: string }
    expect(g.state).toBe('yellow'); expect(g.missing).toContain('רחוק מה-EMA'); expect(g.missing).toContain('28,470')
  })

  it('works for shorts too', () => {
    const { sig } = bar(0, { price: 28290, op: 28296, hi: 28297, lo: 28288, L: bits([]), S: bits(['ema12Ok', 'ema12Side', 'cvdOk']), lv: { vah: 28480, val: 28300, ema: 28298 } })
    expect(sig).toMatchObject({ dir: 'short', entry: 28290, stop: 28320, t1: 28260, t2: 28230 })
  })

  it('blocks the first 5 minutes after the open, and anything outside the New York session', () => {
    const open = Date.UTC(2026, 10, 12, 14, 30, 0)                                             // 9:30 בניו יורק
    const saved = saveSnapshot(snap({ time: open + MIN }), open + 2 * MIN + 1000)             // נר 9:31, נסגר ב-9:32
    expect(onMinuteSnapshot(saved, {}, open + 2 * MIN + 1000)).toBeNull()                     // לא נרשם ירוק לפני 9:35
    const g = buildGate('NQ', {}, open + 2 * MIN + 3000) as { state: string; headline: string; blocks: Array<{ key: string; text: string }> }
    expect(g.state).toBe('red'); expect(g.headline).toBe('אסור להיכנס')
    expect(g.blocks[0]).toMatchObject({ key: 'time' }); expect(g.blocks[0].text).toContain('5 הדקות הראשונות'); expect(g.blocks[0].text).toContain('16:35')
  })

  it('news inside the window blocks the entry, and the signal is logged as blocked', () => {
    const news = { title: 'CPI', inMin: 3 }
    const { at, sig } = bar(0, {}, news)
    expect(sig!.blocked).toContain('CPI')
    const g = buildGate('NQ', { news }, at + 2_000) as { state: string; blocks: Array<{ key: string }>; missing: string; log: { stats: { n: number; blocked: number } } }
    expect(g.state).toBe('red'); expect(g.blocks.map(b => b.key)).toEqual(['news']); expect(g.missing).toContain('חסימה')
    expect(g.log.stats).toMatchObject({ n: 0, blocked: 1 })
  })

  it('records what happened after each green: target, stop, both in one bar, end of session', () => {
    bar(0)                                                                                     // ירוק: כניסה 28500, סטופ 28470, יעד 28560
    bar(1, { price: 28535, op: 28500, hi: 28540, lo: 28495 })                                 // נגע ב-1:1
    bar(2, { price: 28565, op: 28535, hi: 28570, lo: 28530 })                                 // הגיע ליעד
    let g = buildGate('NQ', {}, T0 + 4 * MIN) as unknown as { log: { stats: Record<string, number | null>; recent: Array<Record<string, unknown>> } }
    const first = g.log.recent.find(s => s['entry'] === 28500)!
    expect(first).toMatchObject({ status: 'target', r: 2, ambiguous: false }); expect(first['hit1At']).not.toBeNull(); expect(first['mfe']).toBe(70)

    clearLive(); clearGate()
    bar(0)
    bar(1, { price: 28465, op: 28500, hi: 28501, lo: 28460 })                                 // פגע בסטופ
    g = buildGate('NQ', {}, T0 + 3 * MIN) as unknown as typeof g
    expect(g.log.recent[0]).toMatchObject({ status: 'stop', r: -1 })
    expect(g.log.stats).toMatchObject({ n: 1, stop: 1, target: 0, winPct: 0, sumR: -1 })

    clearLive(); clearGate()
    bar(0)
    bar(1, { price: 28500, op: 28500, hi: 28565, lo: 28465 })                                 // סטופ ויעד באותו נר → סטופ, מסומן
    g = buildGate('NQ', {}, T0 + 3 * MIN) as unknown as typeof g
    expect(g.log.recent[0]).toMatchObject({ status: 'stop', ambiguous: true })

    clearLive(); clearGate()
    bar(0)
    const close = Date.UTC(2026, 10, 12, 21, 0, 0)                                             // 16:00 בניו יורק
    const saved = saveSnapshot(snap({ time: close, price: 28515, op: 28512, hi: 28516, lo: 28511 }), close + MIN)
    onMinuteSnapshot(saved, {}, close + MIN)
    g = buildGate('NQ', {}, close + 2 * MIN) as unknown as typeof g
    expect(g.log.recent[0]).toMatchObject({ status: 'expired', r: 0.5 })
  })

  it('daily rules: lock after 2 losses, cooldown after a loss, stop at the daily target, undo', () => {
    const rules = GATE_RULES['NQ']
    expect(addDayTrade('NQ', 'loss', 300, T0)).toMatchObject({ usd: -300, result: 'loss' })
    expect(dayStatus(rules, T0 + 2 * MIN).locked).toContain('צינון')
    expect(dayStatus(rules, T0 + 11 * MIN).locked).toBeNull()
    addDayTrade('NQ', 'loss', 300, T0 + 20 * MIN)
    const d = dayStatus(rules, T0 + 40 * MIN)
    expect(d).toMatchObject({ trades: 2, losses: 2, usd: -600 }); expect(d.locked).toContain('נעילה יומית')
    const { at, sig } = bar(45)
    expect(sig!.blocked).toContain('נעילה יומית')                                              // נרשם, אבל לא כ"ירוק מלא"
    expect((buildGate('NQ', {}, at + 2_000) as { state: string }).state).toBe('red')
    expect(undoDayTrade(T0 + 50 * MIN)).toMatchObject({ result: 'loss' })
    expect(dayStatus(rules, T0 + 50 * MIN).locked).toBeNull()

    clearGate()
    addDayTrade('NQ', 'win', 300, T0); addDayTrade('NQ', 'win', 300, T0 + MIN)
    expect(dayStatus(rules, T0 + 2 * MIN)).toMatchObject({ wins: 2, usd: 1200 }); expect(dayStatus(rules, T0 + 2 * MIN).locked).toBeNull()      // היעד היומי 1,500$
    addDayTrade('NQ', 'win', 300, T0 + 2 * MIN)
    expect(dayStatus(rules, T0 + 3 * MIN)).toMatchObject({ wins: 3, usd: 1800 }); expect(dayStatus(rules, T0 + 3 * MIN).locked).toContain('יעד היומי')
    expect(dayStatus(rules, T0 + 26 * 3_600_000).trades).toBe(0)                               // למחרת — דף חדש
  })

  it('telegram text: only for a full green, with entry, stop, target and the expiry time', () => {
    const { sig } = bar(0)
    const text = gateTelegramText(sig!, 300)!
    expect(text).toContain('לונג'); expect(text).toContain('28,500'); expect(text).toContain('28,470'); expect(text).toContain('28,560')
    expect(text).toContain('5 MNQ'); expect(text).toContain('17:02:00')                         // סוף הנר השני, שעון ישראל
    expect(text).not.toMatch(/[*_`\[]/)                                                         // בלי תווים ש-Markdown של טלגרם נשבר מהם
    clearLive(); clearGate()
    const blocked = bar(0, {}, { title: 'CPI', inMin: 2 }).sig!
    expect(gateTelegramText(blocked, 300)).toBeNull()
  })

  it('stale data never shows a colour', () => {
    const { at } = bar(0)
    const g = buildGate('NQ', {}, at + 10 * MIN) as { state: string; headline: string; plan: unknown }
    expect(g.state).toBe('off'); expect(g.headline).toBe('אין נתונים חיים'); expect(g.plan).toBeNull()
  })

  it('warns when a normal 1m bar is bigger than the stop, and when an options level sits before the target', () => {
    const { at } = bar(0, { atr: 73 })
    const g = buildGate('NQ', { optionLevels: [{ name: 'קיר קולים', price: 28540 }, { name: 'קיר פוטים', price: 28000 }] }, at + 2_000) as { warnings: string[] }
    expect(g.warnings.some(w => w.includes('73') && w.includes('להוריד כמות חוזים'))).toBe(true)
    expect(g.warnings.some(w => w.includes('קיר קולים'))).toBe(true)
    expect(g.warnings.some(w => w.includes('קיר פוטים'))).toBe(false)
  })
})
