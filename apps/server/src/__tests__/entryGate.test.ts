import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => {
  const fakeDb = { prepare: () => ({ run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) }), exec: vi.fn() }
  return { getDb: () => fakeDb }
})
vi.mock('../services/forexFactory', () => ({ getCachedCalendar: async () => [] }))

import { saveSnapshot, clearLive, type SnapshotInput } from '../services/liveBoard'
import { buildGate, onMinuteSnapshot, clearGate, addDayTrade, undoDayTrade, dayStatus, gateTelegramText, setFlow, gateScore, GATE_RULES } from '../services/entryGate'
import { HTT_FLAG_KEYS } from '../services/httFlagKeys'

const bits = (on: string[]) => HTT_FLAG_KEYS.map(k => (on.includes(k) ? '1' : '0')).join('')
const T0 = Date.UTC(2026, 10, 12, 15, 0, 0)          // יום חמישי 10:00 בניו יורק (שעון חורף) — בתוך שעות המסחר
const MIN = 60_000
const LONG_ON = ['ema12Ok', 'ema12Side', 'cvdOk']
const LV = { vah: 28480, val: 28300, ema: 28485 }
function snap(over: Partial<SnapshotInput>): SnapshotInput {
  return { symbol: 'NQ1!', tf: '1m', time: T0, price: 28500, op: 28490, hi: 28502, lo: 28488, L: bits(LONG_ON), S: bits([]), phase: 4, cBull: 1, ms: 1, htfMs: 1, htfPh: 4, dq: 3, rsi: 55, atr: 20, vix: 17, trL: '', trS: '', stL: 28440, stS: 28560, lv: LV, ...over }
}
/**
 * נר דקה נסגר: נשמר ונבדק ברמזור, כמו שה-Webhook עושה. הצילום מגיע שנייה אחרי סגירת הנר.
 * הרמזור בודק מלמעלה למטה (15 דק׳ ← 5 דק׳ ← דקה), אז לפני נר הדקה נשמרים גם צילומי 15 ו-5 דקות.
 * ברירת המחדל: הם נראים כמו נר הדקה (אותו כיוון). htf מאפשר לקבוע אותם אחרת, או null כדי לא לשמור בכלל.
 */
type Htf = { m15?: Partial<SnapshotInput> | null; m5?: Partial<SnapshotInput> | null }
function bar(i: number, over: Partial<SnapshotInput> = {}, news: { title: string; inMin: number } | null = null, htf: Htf = {}) {
  const time = T0 + i * MIN; const at = time + MIN + 1000
  // ב-15 דקות נדרש אחד האישורים הרגילים של HTT: ברירת המחדל היא BOS בכיוון של נר הדקה (לפי הצד שבו EMA 12 דולק)
  const shortSide = !!over.S && over.S[HTT_FLAG_KEYS.indexOf('ema12Ok')] === '1'
  const conf15 = shortSide ? { L: bits([]), S: bits(['bos']) } : { L: bits(['bos']), S: bits([]) }
  if (htf.m15 !== null) saveSnapshot(snap({ time, ...over, ...conf15, ...htf.m15, tf: '15m' }), at)
  if (htf.m5 !== null) saveSnapshot(snap({ time, ...over, ...htf.m5, tf: '5m' }), at)
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
    expect(g.conditions.map(c => c.key)).toEqual(['time', 'tf15', 'tf5', 'value', 'ema', 'emaNear', 'candle', 'cvd', 'room', 'fresh'])
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

  it('daily rules are a reminder only (lock after 2 losses, cooldown, daily target, undo): greens keep showing and being measured', () => {
    const rules = GATE_RULES['NQ']
    expect(addDayTrade('NQ', 'loss', 300, T0)).toMatchObject({ usd: -300, result: 'loss' })
    expect(dayStatus(rules, T0 + 2 * MIN).locked).toContain('צינון')
    expect(dayStatus(rules, T0 + 11 * MIN).locked).toBeNull()
    addDayTrade('NQ', 'loss', 300, T0 + 20 * MIN)
    const d = dayStatus(rules, T0 + 40 * MIN)
    expect(d).toMatchObject({ trades: 2, losses: 2, usd: -600 }); expect(d.locked).toContain('נעילה יומית')
    const { at, sig } = bar(45)
    expect(sig!.blocked).toBeNull()                                                            // חוקי היום לא חוסמים את המדידה: הירוק נרשם ונספר
    const locked = buildGate('NQ', {}, at + 2_000) as { state: string; warnings: string[]; blocks: unknown[] }
    expect(locked.state).toBe('green'); expect(locked.blocks).toEqual([])
    expect(locked.warnings.some(w => w.includes('נעילה יומית') && w.includes('ממשיך'))).toBe(true)
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

  it('a fresh Bookmap CVD direction replaces the TradingView estimate: it can block a signal and it can allow one', () => {
    // TradingView אומר שה-CVD עולה, Bookmap אומר שיורד → אין לונג
    setFlow('NQ', 'down', T0 + MIN)
    const blocked = bar(0)
    expect(blocked.sig).toBeNull()
    const g = buildGate('NQ', {}, blocked.at + 2_000) as { state: string; missing: string; flow: { source: string; cvd: string }; conditions: Array<{ key: string; ok: boolean; name: string }> }
    expect(g.state).toBe('yellow'); expect(g.missing).toContain('Bookmap'); expect(g.flow).toMatchObject({ source: 'bookmap', cvd: 'down' })
    expect(g.conditions.find(c => c.key === 'cvd')).toMatchObject({ ok: false })

    // TradingView אומר שה-CVD לא עולה, Bookmap אומר שעולה → יש לונג, מסומן כמאושר ב-Bookmap
    clearLive(); clearGate()
    setFlow('NQ', 'up', T0 + MIN)
    const ok = bar(0, { L: bits(['ema12Ok', 'ema12Side']) })
    expect(ok.sig).toMatchObject({ dir: 'long', cvdSrc: 'bookmap' })
    expect(ok.sig!.why.some(w => w.includes('Bookmap') && w.includes('עולה'))).toBe(true)
    expect(gateTelegramText(ok.sig!, 300)).toContain('אושר ב-Bookmap')

    // כיוון ישן (יותר מ-20 שניות) לא נחשב: חוזרים ל-TradingView, וההודעה אומרת את זה
    clearLive(); clearGate()
    setFlow('NQ', 'down', T0 - MIN)
    const stale = bar(0)
    expect(stale.sig).toMatchObject({ dir: 'long', cvdSrc: 'tv' })
    expect(gateTelegramText(stale.sig!, 300)).toContain('בלי אישור Bookmap')
    expect(stale.sig!.why).toHaveLength(10)
  })

  it('score: counts good and bad greens, and what the day gives when taken by the daily rules', () => {
    bar(0)                                                                // ירוק 1: כניסה 28500
    bar(1, { price: 28465, op: 28500, hi: 28501, lo: 28460 })             // ← סטופ. הנר אדום = תיקון
    // ירוק 2 רחוק מהמקום שנכשל (יותר מ-45 נק'), בתוך 10 דקות הצינון: כניסה 28563
    bar(2, { price: 28563, op: 28550, hi: 28564, lo: 28549, lv: { vah: 28480, val: 28300, ema: 28550 } })
    bar(3, { price: 28625, op: 28563, hi: 28630, lo: 28560, lv: { vah: 28480, val: 28300, ema: 28610 } })   // ← יעד (28623). התנאים עדיין מתקיימים = אותו מהלך
    bar(4, { price: 28615, op: 28625, hi: 28626, lo: 28612, lv: { vah: 28480, val: 28300, ema: 28612 } })   // תיקון
    bar(5, { price: 28628, op: 28615, hi: 28629, lo: 28614, lv: { vah: 28480, val: 28300, ema: 28615 } })   // ירוק 3: כניסה 28628, עוד פתוח
    const sc = gateScore('NQ', 300, T0 + 7 * MIN) as { total: Record<string, number | null>; byDay: Array<{ day: string; n: number; byRules: Record<string, unknown> }>; byDir: Array<{ key: string; n: number }>; list: unknown[] }
    expect(sc.total).toMatchObject({ n: 3, good: 1, bad: 1, open: 1, winPct: 50, sumR: 1, usd: 300 })
    expect(sc.byDir).toEqual([expect.objectContaining({ key: 'long', n: 3 })])
    expect(sc.list).toHaveLength(3)
    // לפי החוקים: הראשון נלקח ונגמר בסטופ; השני והשלישי בתוך 10 דקות הצינון שאחרי ההפסד, ולכן מדלגים עליהם
    expect(sc.byDay[0].byRules).toMatchObject({ n: 1, bad: 1, good: 0, usd: -300 })
    expect(gateScore('BTCUSDT')).toEqual({ supported: false, symbol: 'BTCUSDT' })
  })

  it('top-down: the 15m chart must show a regular HTT confirmation in the direction, then the strategy on 5m, and only then the 1m confirms', () => {
    // 15 דקות: חטיפת נזילות לשורט. הדקה נראית כמו לונג מושלם → אין לונג, והכיוון שמוצג הוא שורט
    const a = bar(0, {}, null, { m15: { L: bits([]), S: bits(['sweep']) } })
    expect(a.sig).toBeNull()
    const ga = buildGate('NQ', {}, a.at + 2_000) as { state: string; dir: string }
    expect(ga.state).not.toBe('green'); expect(ga.dir).toBe('short')                         // הכיוון נקבע מגרף 15 הדקות

    // 15 דקות בלי אף אישור רגיל (רק דגלי הקשר ותנאי האסטרטגיה, שלא נספרים בשלב הזה) → אין איתות, וכתוב מה חסר
    clearLive(); clearGate()
    const b = bar(0, {}, null, { m15: { L: bits(['ema12Ok', 'cvdOk', 'htfMs', 'sesNY', 'vixOk']), S: bits(['sesNY']) } })
    expect(b.sig).toBeNull()
    const gb = buildGate('NQ', {}, b.at + 2_000) as { state: string; missing: string; conditions: Array<{ key: string; ok: boolean }> }
    expect(gb.conditions.find(c => c.key === 'tf15')).toMatchObject({ ok: false })
    expect(gb.state).toBe('yellow'); expect(gb.missing).toContain('15 דק׳'); expect(gb.missing).toContain('אישור')

    // אישור אחד לכל כיוון = תמונה מעורבת; אישור שדולק לשני הכיוונים לא קובע כיוון
    clearLive(); clearGate()
    expect(bar(0, {}, null, { m15: { L: bits(['bos']), S: bits(['sweep']) } }).sig).toBeNull()
    clearLive(); clearGate()
    expect(bar(0, {}, null, { m15: { L: bits(['fvgAt']), S: bits(['fvgAt']) } }).sig).toBeNull()

    // סוג כניסה של HTT ב-15 דקות (למשל אורדר בלוק) נחשב אישור
    clearLive(); clearGate()
    const e = bar(0, {}, null, { m15: { L: bits([]), S: bits([]), trL: 'O' } })
    expect(e.sig).toMatchObject({ dir: 'long' }); expect(e.sig!.why[1]).toContain('אורדר בלוק')

    // 15 דקות ללונג, אבל ב-5 דקות האסטרטגיה מצביעה למטה → אין איתות
    clearLive(); clearGate()
    expect(bar(0, {}, null, { m5: { L: bits([]), S: bits(['ema12Ok', 'ema12Side']), price: 28470, lv: { vah: 28480, val: 28300, ema: 28475 } } }).sig).toBeNull()

    // אין בכלל צילום של 15 דקות → אין איתות
    clearLive(); clearGate()
    expect(bar(0, {}, null, { m15: null }).sig).toBeNull()

    // שלושת השלבים באותו כיוון → ירוק, מסומן בשיטה החדשה, וההסבר מתחיל באישור של 15 דקות
    clearLive(); clearGate()
    const ok = bar(0, {}, null, { m15: { L: bits(['bos', 'sweep']), S: bits([]) } })
    expect(ok.sig).toMatchObject({ dir: 'long', method: 'mtf' })
    expect(ok.sig!.why[1]).toContain('15 דק׳'); expect(ok.sig!.why[1]).toContain('BOS'); expect(ok.sig!.why[1]).toContain('חטיפת נזילות')
    expect(ok.sig!.why[2]).toContain('5 דק׳')
    expect(gateTelegramText(ok.sig!, 300)).toContain('15 דק׳ ← 5 דק׳')
    const sc = gateScore('NQ', 300, ok.at + MIN) as { byMethod: Array<{ key: string; n: number }>; current: { n: number } }
    expect(sc.byMethod).toEqual([expect.objectContaining({ key: 'mtf', n: 1 })]); expect(sc.current.n).toBe(1)
  })

  it('a 15m snapshot older than two bars does not count', () => {
    saveSnapshot(snap({ tf: '15m', time: T0 - 40 * MIN }), T0 - 40 * MIN)
    const r = bar(0, {}, null, { m15: null })
    expect(r.sig).toBeNull()
    const g = buildGate('NQ', {}, r.at + 2_000) as { conditions: Array<{ key: string; ok: boolean; detail: string }> }
    expect(g.conditions.find(c => c.key === 'tf15')).toMatchObject({ ok: false }); expect(g.conditions.find(c => c.key === 'tf15')!.detail).toContain('ישן')
  })

  it('room to target: the target must lie inside the last hour range', () => {
    // 40 נרות דקה שבהם השיא של השעה 28,540: רק 40 נק' מעל הכניסה (28,500), והיעד 60 נק' → אין מקום
    const seed = (hi: number) => { for (let i = -40; i < 0; i++) saveSnapshot(snap({ time: T0 + i * MIN, price: 28490, op: 28492, hi, lo: 28480 }), T0 + i * MIN + MIN) }   // נרות אדומים: הנר שלפני האיתות אינו "דרוך"
    seed(28540)
    const a = bar(0)
    expect(a.sig).toBeNull()
    const g = buildGate('NQ', {}, a.at + 2_000) as { state: string; missing: string; conditions: Array<{ key: string; ok: boolean }> }
    expect(g.conditions.find(c => c.key === 'room')).toMatchObject({ ok: false })
    expect(g.state).toBe('yellow'); expect(g.missing).toContain('אין מקום ליעד'); expect(g.missing).toContain('28,540'); expect(g.missing).toContain('40 נק׳')

    // השיא של השעה 28,570: 70 נק' מעל, מעבר ליעד → יש מקום
    clearLive(); clearGate()
    seed(28570)
    const b = bar(0)
    expect(b.sig).toMatchObject({ dir: 'long', entry: 28500 })
    expect(b.sig!.why.some(w => w.includes('יש מקום ליעד') && w.includes('28,570'))).toBe(true)

    // כניסה על שיא חדש (אין שום דבר מעל בשעה האחרונה) → היעד מחוץ לטווח, אין איתות
    clearLive(); clearGate()
    seed(28495)
    expect(bar(0).sig).toBeNull()
  })

  it('no return to a spot that already failed: after a stop, the same direction within 45 points is blocked for an hour', () => {
    bar(0)                                                                // לונג 28500
    bar(1, { price: 28465, op: 28500, hi: 28501, lo: 28460 })             // ← סטופ
    const again = bar(2, { price: 28503, op: 28465, hi: 28504, lo: 28464 })     // כל התנאים שוב מתקיימים, 3 נק' מהמקום שנכשל
    expect(again.sig).toBeNull()
    const g = buildGate('NQ', {}, again.at + 2_000) as { state: string; missing: string }
    expect(g.state).toBe('yellow'); expect(g.missing).toContain('כבר היה סטופ'); expect(g.missing).toContain('28,500')
    // רחוק יותר מ-45 נק' → מותר
    bar(3, { price: 28540, op: 28550, hi: 28551, lo: 28538, lv: { vah: 28480, val: 28300, ema: 28535 } })     // נר אדום: מאפס את "דרוך"
    expect(bar(4, { price: 28555, op: 28540, hi: 28556, lo: 28539, lv: { vah: 28480, val: 28300, ema: 28540 } }).sig).toMatchObject({ dir: 'long', entry: 28555 })
    // באותו מקום, אבל אחרי יותר משעה → מותר שוב
    clearLive()
    expect(bar(70).sig).toMatchObject({ dir: 'long', entry: 28500 })
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
