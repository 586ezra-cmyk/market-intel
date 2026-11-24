import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let mode: string | undefined
vi.mock('../db/client', () => {
  const fakeDb = { prepare: () => ({ run: vi.fn(), get: vi.fn(() => (mode === undefined ? undefined : { value: mode })), all: vi.fn(() => []) }), exec: vi.fn() }
  return { getDb: () => fakeDb }
})
vi.mock('../services/alertDispatcher', () => ({ sendTelegram: vi.fn(async () => undefined) }))

import { oldEngineTelegramAllowed, queueTelegramAlert, debouncerStats } from '../services/telegramDebouncer'
import { sendTelegram } from '../services/alertDispatcher'

describe('old engine → Telegram switch', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(sendTelegram).mockClear(); mode = undefined })
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers() })

  it('off = nothing, crypto = only real-time crypto, all = everything', () => {
    for (const s of ['BTCUSDT', 'NQ', 'ES']) expect(oldEngineTelegramAllowed(s, 'off')).toBe(false)
    expect(oldEngineTelegramAllowed('BTCUSDT', 'crypto')).toBe(true)
    expect(oldEngineTelegramAllowed('NQ', 'crypto')).toBe(false)          // Yahoo מגיע באיחור
    expect(oldEngineTelegramAllowed('ES', 'all')).toBe(true)
    expect(oldEngineTelegramAllowed('BTCUSDT', 'whatever')).toBe(false)        // ערך לא מוכר = שקט
  })

  it('is silent by default: nothing is queued and nothing reaches Telegram', () => {
    const before = debouncerStats.muted
    queueTelegramAlert('NQ', 'msg', 8, '15m', 'bullish')
    queueTelegramAlert('BTCUSDT', 'msg', 8, '15m', 'bullish')
    vi.advanceTimersByTime(120_000)
    expect(sendTelegram).not.toHaveBeenCalled()
    expect(debouncerStats.muted - before).toBe(2)
  })

  it('with the setting on crypto, the crypto read is sent after the wait and the delayed feed stays silent', () => {
    mode = 'crypto'
    queueTelegramAlert('NQ', 'late', 8, '15m', 'bullish')
    queueTelegramAlert('BTCUSDT', 'live', 8, '15m', 'bullish')
    vi.advanceTimersByTime(120_000)
    expect(sendTelegram).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendTelegram).mock.calls[0]?.[0]).toBe('live')
  })
})
