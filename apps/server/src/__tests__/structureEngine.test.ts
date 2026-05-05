import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock DB before any imports that use it
vi.mock('../db/client', () => ({
  getDb: () => ({
    prepare: () => ({
      run: vi.fn(),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    }),
  }),
}))

import { processCandle } from '../services/structureEngine'

// Clear internal state cache between tests
// structureEngine uses a module-level Map — we reset via re-importing
// Instead we use different symbol names per test to isolate state.

describe('structureEngine — state machine BOS/CHoCH', () => {
  it('returns null on first candle (no swing points yet)', () => {
    const result = processCandle('BTCUSDT_T1', '15m', {
      time: 1000,
      high: 100,
      low: 90,
      close: 95,
    })
    expect(result).toBeNull()
  })

  it('detects CHoCH (bullish) when trend was neutral and close breaks above swing high', () => {
    // First candle — establishes swing high
    processCandle('BTCUSDT_T2', '15m', { time: 1000, high: 100, low: 90, close: 95 })

    // Second candle — close above previous swing high → CHoCH (was neutral)
    const result = processCandle('BTCUSDT_T2', '15m', { time: 2000, high: 110, low: 98, close: 105 })

    expect(result).not.toBeNull()
    expect(result!.type).toBe('CHoCH')
    expect(result!.direction).toBe('bullish')
  })

  it('detects BOS (bullish) when trend was already bullish and close breaks above new swing high', () => {
    // Establish bullish trend: candle1 sets swing high, candle2 breaks it (CHoCH)
    processCandle('BTCUSDT_T3', '15m', { time: 1000, high: 100, low: 90, close: 95 })
    processCandle('BTCUSDT_T3', '15m', { time: 2000, high: 110, low: 98, close: 105 })
    // Now trend is bullish, swing high is 110

    // Third candle breaks above 110 → BOS (continuation)
    const result = processCandle('BTCUSDT_T3', '15m', { time: 3000, high: 120, low: 108, close: 115 })

    expect(result).not.toBeNull()
    expect(result!.type).toBe('BOS')
    expect(result!.direction).toBe('bullish')
  })

  it('detects CHoCH (bearish) when trend was bullish and close breaks below swing low', () => {
    // Build bullish trend
    processCandle('BTCUSDT_T4', '15m', { time: 1000, high: 100, low: 90, close: 95 })
    processCandle('BTCUSDT_T4', '15m', { time: 2000, high: 110, low: 98, close: 105 })
    // Trend = bullish, swingLow = 90 (initial)

    // Break below swing low → CHoCH (bearish, reversal)
    const result = processCandle('BTCUSDT_T4', '15m', { time: 3000, high: 95, low: 85, close: 88 })

    expect(result).not.toBeNull()
    expect(result!.type).toBe('CHoCH')
    expect(result!.direction).toBe('bearish')
  })

  it('does NOT detect structure when close stays within range', () => {
    processCandle('BTCUSDT_T5', '15m', { time: 1000, high: 100, low: 90, close: 95 })

    // Candle that doesn't break above swing high or below swing low
    const result = processCandle('BTCUSDT_T5', '15m', { time: 2000, high: 99, low: 91, close: 97 })

    expect(result).toBeNull()
  })

  it('uses separate state per symbol', () => {
    // Establish state for symbol A
    processCandle('BTCA', '15m', { time: 1000, high: 100, low: 90, close: 95 })
    const resultA = processCandle('BTCA', '15m', { time: 2000, high: 110, low: 98, close: 105 })

    // Symbol B is independent — no history, should return null
    const resultB = processCandle('ETHB', '15m', { time: 2000, high: 110, low: 98, close: 105 })

    expect(resultA).not.toBeNull() // A has history, detects CHoCH
    expect(resultB).toBeNull()     // B has no prior swing high, returns null
  })

  it('uses separate state per timeframe for the same symbol', () => {
    // Set up state on 15m
    processCandle('BTCUSDT_T6', '15m', { time: 1000, high: 100, low: 90, close: 95 })

    // 1h timeframe has no state yet — should return null
    const result1h = processCandle('BTCUSDT_T6', '1h', { time: 2000, high: 110, low: 98, close: 105 })

    expect(result1h).toBeNull()
  })
})
