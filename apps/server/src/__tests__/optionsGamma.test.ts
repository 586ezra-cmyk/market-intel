import { describe, it, expect, vi } from 'vitest'

vi.mock('../db/client', () => ({ getDb: () => ({ prepare: () => ({ run: vi.fn(), get: vi.fn(() => undefined), all: vi.fn(() => []) }) }) }))
vi.mock('../services/alertDispatcher', () => ({ sendTelegram: vi.fn(), TOPIC_BRIEFING: 1, TOPIC_HIGH: 2 }))

import { bsGamma, flipScan } from '../services/optionsLevelsService'

type Opt = { exp: string; dte: number; cp: 'C' | 'P'; k: number; gamma: number; iv: number; oi: number; vol: number }
const opt = (cp: 'C' | 'P', k: number, oi: number, iv = 0.2, dte = 20): Opt => ({ exp: '2026-12-04', dte, cp, k, gamma: 0, iv, oi, vol: 0 })
const chain = (spot: number, opts: Opt[]) => ({ underlying: 'X', spot, ts: '', opts })

describe('options gamma', () => {
  it('Black-Scholes gamma peaks at the money and matches a known value', () => {
    // S=100, K=100, iv=20%, T=1 שנה, ריבית 0 → d1 = 0.1, gamma = φ(0.1) / (100 × 0.2) = 0.019852
    expect(bsGamma(100, 100, 0.2, 1)).toBeCloseTo(0.019852, 5)
    expect(bsGamma(100, 100, 0.2, 0.1)).toBeGreaterThan(bsGamma(100, 120, 0.2, 0.1))
    expect(bsGamma(100, 100, 0, 1)).toBe(0)
  })

  it('finds zero-gamma between a put-heavy strike below and a call-heavy strike above', () => {
    // פוטים ב-95, קולים ב-105, אותה כמות: מתחת לאמצע שולטים הפוטים (שלילי), מעליו הקולים (חיובי)
    const c = chain(100, [opt('P', 95, 1000), opt('C', 105, 1000)])
    const below = flipScan([{ chain: c, scale: 1 }], 97, 1, 45)
    const above = flipScan([{ chain: c, scale: 1 }], 103, 1, 45)
    expect(below.net).toBeLessThan(0); expect(above.net).toBeGreaterThan(0)
    expect(below.zero).not.toBeNull()
    expect(below.zero!).toBeGreaterThan(98.5); expect(below.zero!).toBeLessThan(101.5)
    expect(above.zero!).toBeCloseTo(below.zero!, 0)                    // אותה רמה, לא משנה מאיפה סורקים
  })

  it('returns no zero-gamma when one side dominates the whole scanned range', () => {
    const r = flipScan([{ chain: chain(100, [opt('C', 100, 1000)]), scale: 1 }], 100, 1, 45)
    expect(r.zero).toBeNull(); expect(r.net).toBeGreaterThan(0)
  })

  it('combines two chains on one scale: a second chain quoted at 1/40 gives the same level', () => {
    const big = chain(4000, [opt('P', 3800, 100), opt('C', 4200, 100)])
    const small = chain(100, [opt('P', 95, 4000), opt('C', 105, 4000)])
    const both = flipScan([{ chain: small, scale: 40 }, { chain: big, scale: 1 }], 3900, 1, 45)
    const one = flipScan([{ chain: big, scale: 1 }], 3900, 1, 45)
    expect(both.zero!).toBeCloseTo(one.zero!, -1)
    expect(both.net).toBeLessThan(0)
  })

  it('ignores options outside the expiry window and options with no open interest', () => {
    const c = chain(100, [opt('P', 95, 1000), opt('C', 105, 1000), opt('C', 100, 0), opt('C', 100, 99999, 0.2, 90)])
    expect(flipScan([{ chain: c, scale: 1 }], 97, 1, 45).net).toBeLessThan(0)
  })
})
