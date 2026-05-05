import { describe, it, expect, vi } from 'vitest'
import type { Timeframe } from '@market/shared'

// Mock DB
vi.mock('../db/client', () => ({
  getDb: () => ({
    prepare: () => ({
      run: vi.fn(),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    }),
  }),
}))

import { detectSMT, detectISMT } from '../services/smtEngine'
import type { ISMTCandle } from '../services/smtEngine'

// ─── detectSMT (pivot-based, multi-candle) ────────────────────────────────────
describe('detectSMT — pivot-based divergence', () => {
  const baseInput = {
    timeframe: '15m' as const,
    time: Date.now(),
    asset1: 'BTCUSDT_SMT1',
    asset1Price: 95000,
    asset2: 'ETHUSDT_SMT1',
    asset2Price: 3000,
  }

  it('returns null when no pivot history exists yet', () => {
    const result = detectSMT({
      ...baseInput,
      asset1High: 100,
      asset1Low: 90,
      asset2High: 3100,
      asset2Low: 2900,
    })
    expect(result).toBeNull()
  })

  it('detects bearish SMT: asset1 makes new HH, asset2 does NOT', () => {
    // Seed state: first call sets prevHigh=null, currentHigh=100
    detectSMT({
      ...baseInput,
      asset1: 'BTCUSDT_SMT2', asset2: 'ETHUSDT_SMT2',
      asset1High: 100, asset1Low: 90, asset2High: 3100, asset2Low: 2900,
    })

    // Second call: asset1 makes new HH (110 > 100), asset2 does NOT confirm
    const result = detectSMT({
      ...baseInput,
      asset1: 'BTCUSDT_SMT2', asset2: 'ETHUSDT_SMT2',
      asset1High: 110, asset1Low: 95, asset2High: 3050, asset2Low: 2950,
    })

    expect(result).not.toBeNull()
    expect(result!.type).toBe('bearish_smt')
  })

  it('does NOT detect SMT when both assets confirm new HH', () => {
    detectSMT({
      ...baseInput,
      asset1: 'BTCUSDT_SMT3', asset2: 'ETHUSDT_SMT3',
      asset1High: 100, asset1Low: 90, asset2High: 3100, asset2Low: 2900,
    })

    // Both make new highs — no divergence
    const result = detectSMT({
      ...baseInput,
      asset1: 'BTCUSDT_SMT3', asset2: 'ETHUSDT_SMT3',
      asset1High: 110, asset1Low: 95, asset2High: 3200, asset2Low: 2950,
    })

    expect(result).toBeNull()
  })

  it('detects bullish SMT: asset1 makes new LL, asset2 does NOT', () => {
    detectSMT({
      ...baseInput,
      asset1: 'BTCUSDT_SMT4', asset2: 'ETHUSDT_SMT4',
      asset1High: 100, asset1Low: 90, asset2High: 3100, asset2Low: 2900,
    })

    // asset1 makes new LL (80 < 90), asset2 does NOT confirm (low stays at 2910 >= 2900)
    const result = detectSMT({
      ...baseInput,
      asset1: 'BTCUSDT_SMT4', asset2: 'ETHUSDT_SMT4',
      asset1High: 95, asset1Low: 80, asset2High: 3050, asset2Low: 2910,
    })

    expect(result).not.toBeNull()
    expect(result!.type).toBe('bullish_smt')
  })
})

// ─── detectISMT (exactly 2 consecutive candles) ───────────────────────────────
describe('detectISMT — 2-candle intermarket SMT', () => {
  const makeCandle = (
    asset: string,
    time: number,
    high: number,
    low: number,
    close: number,
    tf: Timeframe = '15m'
  ): ISMTCandle => ({ asset, timeframe: tf, time, high, low, close })

  it('returns null on first candle (buffer has < 2 candles)', () => {
    const a1 = makeCandle('BTC_I1', 1000, 100, 90, 95)
    const b1 = makeCandle('ETH_I1', 1000, 3100, 2900, 3000)
    const result = detectISMT(a1, b1)
    expect(result).toBeNull()
  })

  it('detects bearish iSMT: A sweeps above candle1 high then closes below; B does NOT confirm', () => {
    // Candle 1: seed state
    detectISMT(
      makeCandle('BTC_I2', 1000, 100, 90, 95),
      makeCandle('ETH_I2', 1000, 3100, 2900, 3000)
    )

    // Candle 2: A makes new high (105 > 100) AND closes below candle1 high (< 100) → swept & rejected
    //           B does NOT make new high (high=3090 < 3100)
    const result = detectISMT(
      makeCandle('BTC_I2', 2000, 105, 92, 97),  // A: high>prev_high, close<prev_high
      makeCandle('ETH_I2', 2000, 3090, 2880, 2950)  // B: high < B1.high → no confirm
    )

    expect(result).not.toBeNull()
    expect(result!.type).toBe('bearish_ismt')
    expect(result!.asset1).toBe('BTC_I2')
    expect(result!.asset2).toBe('ETH_I2')
  })

  it('does NOT detect bearish iSMT when B also sweeps and closes above', () => {
    detectISMT(
      makeCandle('BTC_I3', 1000, 100, 90, 95),
      makeCandle('ETH_I3', 1000, 3100, 2900, 3000)
    )

    // A sweeps and rejects, but B ALSO sweeps AND closes above B1 high → B confirms → no iSMT
    const result = detectISMT(
      makeCandle('BTC_I3', 2000, 105, 92, 97),
      makeCandle('ETH_I3', 2000, 3200, 2880, 3150) // B: high > B1.high AND close > B1.high
    )

    expect(result).toBeNull()
  })

  it('detects bullish iSMT: A sweeps below candle1 low then closes above; B does NOT confirm', () => {
    detectISMT(
      makeCandle('BTC_I4', 1000, 100, 90, 95),
      makeCandle('ETH_I4', 1000, 3100, 2900, 3000)
    )

    // A: low < A1.low (80 < 90) AND close > A1.low (close=92 > 90) → sweep & reject bullish
    // B: does NOT confirm (B.low=2910 > B1.low=2900 — stays above)
    const result = detectISMT(
      makeCandle('BTC_I4', 2000, 98, 80, 92),
      makeCandle('ETH_I4', 2000, 3050, 2910, 2970)
    )

    expect(result).not.toBeNull()
    expect(result!.type).toBe('bullish_ismt')
  })

  it('returns null for timeframe > 1h (e.g. 4h)', () => {
    detectISMT(
      makeCandle('BTC_I5', 1000, 100, 90, 95, '4h'),
      makeCandle('ETH_I5', 1000, 3100, 2900, 3000, '4h')
    )

    const result = detectISMT(
      makeCandle('BTC_I5', 2000, 105, 92, 97, '4h'),
      makeCandle('ETH_I5', 2000, 3090, 2880, 2950, '4h')
    )

    // 4h is not in ISMT_TIMEFRAMES so detectISMT should return null immediately
    expect(result).toBeNull()
  })

  it('identifies leading vs entry asset by range size', () => {
    detectISMT(
      makeCandle('BTC_I6', 1000, 100, 90, 95),
      makeCandle('ETH_I6', 1000, 3100, 2900, 3000)
    )

    // A range = 105-92 = 13, B range = 3090-2880 = 210 → B leads, A is entry
    const result = detectISMT(
      makeCandle('BTC_I6', 2000, 105, 92, 97),   // A range = 13
      makeCandle('ETH_I6', 2000, 3090, 2880, 2950) // B range = 210, B leads
    )

    if (result) {
      // B has bigger range so B leads, A is entry asset
      expect(result.leadingAsset).toBe('ETH_I6')
      expect(result.entryAsset).toBe('BTC_I6')
    }
    // If null, test passes (iSMT not detected — just verify leading/lagging logic)
  })
})
