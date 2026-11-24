import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client', () => {
  const fakeDb = { prepare: () => ({ run: vi.fn(), get: vi.fn(() => null), all: vi.fn(() => []) }), exec: vi.fn() }
  return { getDb: () => fakeDb }
})
vi.mock('../services/realtimeSignalDetector', () => ({ runRealtimeDetector: vi.fn(async () => undefined), seedCandles: vi.fn() }))

import { forwardCandle, onLiveSnapshot, seedIndexHistory, resetIndexFeed, indexFeedStatus } from '../services/indexFeed'
import { runRealtimeDetector, seedCandles } from '../services/realtimeSignalDetector'
import { saveSnapshot, clearLive, type SnapshotInput } from '../services/liveBoard'
import { HTT_FLAG_KEYS } from '../services/httFlagKeys'
import type { KlineCandle } from '../services/binanceWebSocket'

const zeros = HTT_FLAG_KEYS.map(() => '0').join('')
const T0 = Date.UTC(2026, 10, 24, 15, 0, 0)                       // שלישי 10:00 בניו יורק
const SEC = Math.floor(T0 / 1000)
function snap(over: Partial<SnapshotInput>): SnapshotInput {
  return { symbol: 'NQ1!', tf: '5m', time: T0, price: 27300, op: 27290, hi: 27310, lo: 27285, L: zeros, S: zeros, phase: 0, cBull: 0, ms: 0, htfMs: 0, htfPh: 0, dq: 0, trL: '', trS: '', lv: {}, ...over }
}
const candle = (over: Partial<KlineCandle>): KlineCandle => ({ symbol: 'NQ', timeframe: '5m', time: SEC, open: 1, high: 2, low: 0, close: 1, volume: 0, isClosed: true, ...over })
const sent = () => vi.mocked(runRealtimeDetector).mock.calls.map(c => `${c[0].symbol}:${c[0].timeframe}:${c[0].time}`)

describe('index feed → server engine', () => {
  beforeEach(() => { clearLive(); resetIndexFeed(); vi.mocked(runRealtimeDetector).mockClear(); vi.mocked(seedCandles).mockClear() })

  it('a Nasdaq snapshot reaches the engine as a closed candle, once', async () => {
    const s = saveSnapshot(snap({}), T0 + 300_000)
    await onLiveSnapshot(s.symbol, '5m', s.time, T0 + 300_000)
    await onLiveSnapshot(s.symbol, '5m', s.time, T0 + 301_000)            // TradingView שלח פעמיים
    expect(runRealtimeDetector).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runRealtimeDetector).mock.calls[0]?.[0]).toMatchObject({ symbol: 'NQ', timeframe: '5m', time: SEC, open: 27290, high: 27310, low: 27285, close: 27300, isClosed: true })
  })

  it('crypto snapshots are not forwarded (the engine already has them from the exchange)', async () => {
    const s = saveSnapshot(snap({ symbol: 'BTCUSDT', price: 64000, op: 63990, hi: 64010, lo: 63980 }), T0)
    await onLiveSnapshot(s.symbol, '5m', s.time, T0)
    expect(runRealtimeDetector).not.toHaveBeenCalled()
  })

  it('builds the 30-minute candle from two quarter-hour candles', async () => {
    const a = saveSnapshot(snap({ tf: '15m', time: T0, op: 100, hi: 110, lo: 95, price: 105 }), T0 + 900_000)
    await onLiveSnapshot(a.symbol, '15m', a.time, T0 + 900_000)
    const b = saveSnapshot(snap({ tf: '15m', time: T0 + 900_000, op: 105, hi: 120, lo: 101, price: 118 }), T0 + 1_800_000)
    await onLiveSnapshot(b.symbol, '15m', b.time, T0 + 1_800_000)
    expect(sent()).toEqual([`NQ:15m:${SEC}`, `NQ:15m:${SEC + 900}`, `NQ:30m:${SEC}`])
    expect(vi.mocked(runRealtimeDetector).mock.calls[2]?.[0]).toMatchObject({ open: 100, high: 120, low: 95, close: 118 })
  })

  it('Yahoo is ignored while TradingView is sending, and takes over when it stops', async () => {
    const now = T0 + 300_000
    expect(await forwardCandle(candle({ time: SEC }), 'live', now)).toBe(true)
    expect(await forwardCandle(candle({ time: SEC - 300 }), 'yahoo', now + 60_000)).toBe(false)        // נר ישן שכבר טופל
    expect(await forwardCandle(candle({ time: SEC + 300 }), 'yahoo', now + 600_000)).toBe(false)       // חי היה לפני 10 דקות — עדיין חי
    expect(await forwardCandle(candle({ time: SEC + 300 }), 'yahoo', now + 1_300_000)).toBe(true)      // 21 דקות בלי נר חי → הגיבוי נכנס
    expect(await forwardCandle(candle({ time: SEC + 600 }), 'live', now + 1_400_000)).toBe(true)       // TradingView חזר
    expect(indexFeedStatus).toMatchObject({ live: 2, yahoo: 1, dropped: 2 })
  })

  it('seeds Yahoo history followed by the live bars that Yahoo does not have yet, without alerts', () => {
    saveSnapshot(snap({ time: T0 - 300_000 }), T0); saveSnapshot(snap({ time: T0 }), T0 + 300_000)
    seedIndexHistory('NQ', '5m', [candle({ time: SEC - 900 }), candle({ time: SEC - 600 })])
    const seeded = vi.mocked(seedCandles).mock.calls[0]?.[2] ?? []
    expect(seeded.map(c => c.time)).toEqual([SEC - 900, SEC - 600, SEC - 300, SEC])
    expect(runRealtimeDetector).not.toHaveBeenCalled()
  })

  it('after seeding, the same bar arriving again is not sent to the engine', async () => {
    const s = saveSnapshot(snap({}), T0 + 300_000)
    seedIndexHistory('NQ', '5m', [])
    await onLiveSnapshot(s.symbol, '5m', s.time, T0 + 300_000)
    expect(runRealtimeDetector).not.toHaveBeenCalled()
  })
  it('the bar volume travels with the candle, and a 30m candle sums its two 15m halves', async () => {
    const a = saveSnapshot(snap({ tf: '15m', time: T0, vol: 1200 }), T0 + 900_000)
    await onLiveSnapshot(a.symbol, '15m', a.time, T0 + 900_000)
    const b = saveSnapshot(snap({ tf: '15m', time: T0 + 900_000, vol: 800 }), T0 + 1_800_000)
    await onLiveSnapshot(b.symbol, '15m', b.time, T0 + 1_800_000)
    const calls = vi.mocked(runRealtimeDetector).mock.calls.map(c => c[0])
    expect(calls.filter(c => c.timeframe === '15m').map(c => c.volume)).toEqual([1200, 800])
    expect(calls.find(c => c.timeframe === '30m')?.volume).toBe(2000)
  })

  it('a snapshot from the old script (no volume) becomes a candle with volume 0', async () => {
    const s = saveSnapshot(snap({}), T0 + 300_000)
    await onLiveSnapshot(s.symbol, '5m', s.time, T0 + 300_000)
    expect(vi.mocked(runRealtimeDetector).mock.calls[0]?.[0].volume).toBe(0)
  })
})
