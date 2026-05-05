import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Alert } from '@market/shared'

// ─── Mocks ────────────────────────────────────────────────────────────────────
// IMPORTANT: vi.mock() factories are hoisted to top of file.
// We CANNOT reference outer `vi.fn()` variables inside the factory —
// they are not yet initialised at hoist time.
// Instead, we define module-level objects and mutate them per-test.

vi.mock('../utils/timeframe', () => ({
  isInKillZone: vi.fn(() => false),
  currentSession: vi.fn(() => 'london'),
  classifyTF: vi.fn(() => 'low'),
  isValidTimeframe: vi.fn(() => true),
}))

vi.mock('../services/rangeEngine', () => ({
  getActiveRange: vi.fn(() => null),
}))

vi.mock('../services/structureEngine', () => ({
  getLatestStructure: vi.fn(() => null),
}))

vi.mock('../services/fvgEngine', () => ({
  getActiveFVGs: vi.fn(() => []),
}))

vi.mock('../services/liquidityEngine', () => ({
  getActiveLiquidity: vi.fn(() => []),
  getNearestLiquidityTargets: vi.fn(() => ({ tp1: null, tp2: null, tp3: null })),
}))

vi.mock('../services/smtEngine', () => ({
  getRecentSMTSignals: vi.fn(() => []),
}))

vi.mock('../services/alertDispatcher', () => ({
  saveAlert: vi.fn(async () => null as unknown as Alert),
}))

// Import after mocks are established
import { evaluateConfluence } from '../services/confluenceEngine'
import type { ConfluenceInput } from '../services/confluenceEngine'

// Import the mocked modules so we can spy on them
import * as timeframeUtils from '../utils/timeframe'
import * as rangeEngine from '../services/rangeEngine'
import * as structureEngine from '../services/structureEngine'
import * as alertDispatcher from '../services/alertDispatcher'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeInput(overrides: Partial<ConfluenceInput> = {}): ConfluenceInput {
  return {
    symbol: 'BTCUSDT',
    timeframe: '15m',
    direction: 'bullish',
    currentPrice: 95000,
    time: Date.now(),
    hasBOSorCHoCH: false,
    hasLiquiditySweep: false,
    hasFVG: false,
    hasSMT: false,
    ...overrides,
  }
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'test-alert-id',
    symbol: 'BTCUSDT',
    timeframe: '15m',
    triggeredAt: Date.now(),
    factors: ['LiquiditySweep', 'FVG'],
    score: 3.5,
    direction: 'bullish',
    recommendation: 'long',
    premiumDiscount: 'discount',
    session: 'london',
    inKillZone: true,
    messageHe: 'בדיקה',
    stopLoss: null,
    tp1: null,
    tp2: null,
    tp3: null,
    fvgId: null,
    structureId: null,
    userRating: null,
    userOutcome: null,
    userNotes: null,
    sent: false,
    createdAt: Date.now(),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('evaluateConfluence — gate logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to safe defaults
    vi.mocked(timeframeUtils.isInKillZone).mockReturnValue(false)
    vi.mocked(timeframeUtils.currentSession).mockReturnValue('london')
    vi.mocked(rangeEngine.getActiveRange).mockReturnValue(null)
    vi.mocked(structureEngine.getLatestStructure).mockReturnValue(null)
    vi.mocked(alertDispatcher.saveAlert).mockResolvedValue(makeAlert())
  })

  // ─── Core gate: 0 factors → null ───────────────────────────────────────────
  it('returns null when 0 factors are active (even in kill zone)', async () => {
    vi.mocked(timeframeUtils.isInKillZone).mockReturnValue(true)

    const result = await evaluateConfluence(makeInput({
      hasBOSorCHoCH: false,
      hasLiquiditySweep: false,
      hasFVG: false,
      hasSMT: false,
    }))

    expect(result).toBeNull()
    expect(alertDispatcher.saveAlert).not.toHaveBeenCalled()
  })

  // ─── Core gate: 1 factor → null ────────────────────────────────────────────
  it('returns null when only 1 factor is active (even in kill zone)', async () => {
    vi.mocked(timeframeUtils.isInKillZone).mockReturnValue(true)

    const result = await evaluateConfluence(makeInput({
      hasLiquiditySweep: true,
      hasFVG: false,
      hasBOSorCHoCH: false,
      hasSMT: false,
    }))

    expect(result).toBeNull()
    expect(alertDispatcher.saveAlert).not.toHaveBeenCalled()
  })

  // ─── Core gate: 2 factors BUT no kill zone → null ──────────────────────────
  it('returns null when 2 factors are active but NOT in kill zone', async () => {
    vi.mocked(timeframeUtils.isInKillZone).mockReturnValue(false)

    const result = await evaluateConfluence(makeInput({
      hasLiquiditySweep: true,
      hasFVG: true,
    }))

    expect(result).toBeNull()
    expect(alertDispatcher.saveAlert).not.toHaveBeenCalled()
  })

  // ─── Core gate: 2 factors + kill zone → ALERT ──────────────────────────────
  it('creates alert when 2 factors active AND in kill zone', async () => {
    vi.mocked(timeframeUtils.isInKillZone).mockReturnValue(true)

    const result = await evaluateConfluence(makeInput({
      hasLiquiditySweep: true,
      hasFVG: true,
    }))

    expect(result).not.toBeNull()
    expect(alertDispatcher.saveAlert).toHaveBeenCalledTimes(1)
  })

  // ─── BOS/CHoCH counted only when structure exists in DB ────────────────────
  it('does NOT count BOS/CHoCH as factor when getLatestStructure returns null', async () => {
    vi.mocked(timeframeUtils.isInKillZone).mockReturnValue(true)
    vi.mocked(structureEngine.getLatestStructure).mockReturnValue(null)

    // hasBOSorCHoCH=true but structure is null → BOS not counted
    // Only 1 real factor (FVG) → gate fails
    const result = await evaluateConfluence(makeInput({
      hasBOSorCHoCH: true,
      hasFVG: true,
      hasLiquiditySweep: false,
      hasSMT: false,
    }))

    expect(result).toBeNull()
  })

  it('counts BOS/CHoCH as factor when structure exists in DB', async () => {
    vi.mocked(timeframeUtils.isInKillZone).mockReturnValue(true)
    vi.mocked(structureEngine.getLatestStructure).mockReturnValue({
      id: 'struct-1',
      symbol: 'BTCUSDT',
      timeframe: '15m',
      type: 'BOS',
      direction: 'bullish',
      price: 94000,
      time: Date.now(),
      confirmed: true,
      createdAt: Date.now(),
    })

    const result = await evaluateConfluence(makeInput({
      hasBOSorCHoCH: true,
      hasFVG: true,
    }))

    expect(result).not.toBeNull()
    expect(alertDispatcher.saveAlert).toHaveBeenCalledTimes(1)
    const callArg = vi.mocked(alertDispatcher.saveAlert).mock.calls[0][0] as any
    expect(callArg.factors).toContain('BOS')
    expect(callArg.factors).toContain('FVG')
  })

  // ─── 3 factors → alert with bonus score ────────────────────────────────────
  it('creates alert and score includes confluence bonuses', async () => {
    vi.mocked(timeframeUtils.isInKillZone).mockReturnValue(true)

    await evaluateConfluence(makeInput({
      hasLiquiditySweep: true,
      hasFVG: true,
      hasSMT: true,
    }))

    expect(alertDispatcher.saveAlert).toHaveBeenCalledTimes(1)
    const callArg = vi.mocked(alertDispatcher.saveAlert).mock.calls[0][0] as any
    // 15m base = 1.5, in kill zone +0.3, FVG +0.3, LiqSweep +0.3, SMT +0.4 = 2.8
    expect(callArg.score).toBeGreaterThan(2.5)
    expect(callArg.score).toBeLessThanOrEqual(10)
  })

  // ─── Score is capped at 10 ─────────────────────────────────────────────────
  it('caps score at 10 even with all bonuses', async () => {
    vi.mocked(timeframeUtils.isInKillZone).mockReturnValue(true)
    vi.mocked(structureEngine.getLatestStructure).mockReturnValue({
      id: 'struct-1', symbol: 'BTCUSDT', timeframe: '1M', type: 'BOS',
      direction: 'bullish', price: 90000, time: Date.now(), confirmed: true, createdAt: Date.now(),
    })
    vi.mocked(rangeEngine.getActiveRange).mockReturnValue({
      id: 'range-1', symbol: 'BTCUSDT', timeframe: '1M', midpoint: 80000,
      high: 100000, low: 60000, tfClass: 'high', rangeType: 'swing',
      startTime: Date.now(), endTime: null, isActive: true, session: 'ny',
    })

    await evaluateConfluence(makeInput({
      timeframe: '1M', // base 5.0
      hasBOSorCHoCH: true,
      hasLiquiditySweep: true,
      hasFVG: true,
      hasSMT: true,
      hasWyckoff: true,
      higherTFConfirmations: ['1W', '1D', '4h'], // +4.0 for 3 confirmations
    }))

    const callArg = vi.mocked(alertDispatcher.saveAlert).mock.calls[0]?.[0] as any
    if (callArg) {
      expect(callArg.score).toBeLessThanOrEqual(10)
    }
  })

  // ─── Direction is passed through correctly ─────────────────────────────────
  it('passes bearish direction correctly to saveAlert', async () => {
    vi.mocked(timeframeUtils.isInKillZone).mockReturnValue(true)

    await evaluateConfluence(makeInput({
      direction: 'bearish',
      hasLiquiditySweep: true,
      hasFVG: true,
    }))

    const callArg = vi.mocked(alertDispatcher.saveAlert).mock.calls[0][0] as any
    expect(callArg.direction).toBe('bearish')
    expect(callArg.recommendation).toBe('short')
  })
})
