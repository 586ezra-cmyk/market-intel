import type { AlertFactor } from '@market/shared'

/**
 * The realtime detector emits lowercase internal signal types ('ob', 'ismt',
 * 'doubletop'), while alerts are stored with the canonical AlertFactor names
 * ('OrderBlock', 'SMT', 'DoubleTop') that the website uses to look up its
 * per-factor explanations. Persisting detector output without translating it
 * would write factors the UI cannot resolve.
 */
const DETECTOR_TO_FACTOR: Record<string, AlertFactor> = {
  bos:          'BOS',
  choch:        'CHoCH',
  liquidity:    'LiquiditySweep',
  fvg:          'FVG',
  smt:          'SMT',
  // iSMT is a two-candle divergence within ONE asset. Folding it into SMT
  // claimed a cross-asset divergence that never happened — SOLUSDT is not in
  // any SMT pair yet showed an SMT factor.
  ismt:         'iSMT',
  ifvg:         'iFVG',
  ob:           'OrderBlock',
  doubletop:    'DoubleTop',
  doublebottom: 'DoubleBottom',
  wyckoff:      'Wyckoff',
}

/**
 * Signals with no AlertFactor equivalent. They still contribute to scoring and
 * appear in the Telegram message, but cannot be stored as factors.
 */
export const UNMAPPED_SIGNALS = ['judas', 'session', 'inducement', 'repricing']

export function toAlertFactor(detectorType: string): AlertFactor | null {
  return DETECTOR_TO_FACTOR[detectorType] ?? null
}

/** Translate detector types to canonical factors, de-duplicated. */
export function toAlertFactors(detectorTypes: string[]): AlertFactor[] {
  const out: AlertFactor[] = []
  for (const t of detectorTypes) {
    const f = toAlertFactor(t)
    if (f && !out.includes(f)) out.push(f)
  }
  return out
}
