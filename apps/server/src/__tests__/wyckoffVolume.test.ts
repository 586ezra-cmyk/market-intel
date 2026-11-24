import { describe, it, expect } from 'vitest'
import { detectWyckoff } from '../services/candlePatternDetectors'
import type { KlineCandle } from '../services/binanceWebSocket'

// טווח של 29 נרות בין 100 ל-110, ואחריו נר שדוקר מתחת ל-100 וסוגר בחזרה בטווח
function buf(rangeVol: (i: number) => number, lastVol: number): KlineCandle[] {
  const c = (i: number, o: Partial<KlineCandle>): KlineCandle => ({ symbol: 'NQ', timeframe: '5m', time: 1000 + i * 300, open: 105, high: 110, low: 100, close: 105, volume: 0, isClosed: true, ...o })
  const range = Array.from({ length: 29 }, (_, i) => c(i, { volume: rangeVol(i) }))
  return [...range, c(29, { low: 98, high: 106, close: 103, volume: lastVol })]
}

describe('Wyckoff spring needs real volume', () => {
  it('fires on a spring with volume well above the average', () => {
    expect(detectWyckoff(buf(() => 1000, 2500))?.label).toContain('Spring')
  })
  it('does not fire when the volume is ordinary', () => {
    expect(detectWyckoff(buf(() => 1000, 1100))).toBeNull()
  })
  it('does not fire when the candles carry no volume at all', () => {
    expect(detectWyckoff(buf(() => 0, 0))).toBeNull()
  })
  it('does not fire while old bars without volume are still mixed into the range', () => {
    // 20 נרות ישנים בלי נפח + 9 חדשים: הממוצע המעורבב היה הופך נר רגיל ל"נפח גבוה"
    expect(detectWyckoff(buf(i => (i < 20 ? 0 : 1000), 1100))).toBeNull()
  })
})
