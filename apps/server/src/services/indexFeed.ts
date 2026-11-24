// שער אחד לנרות של נאסדק ו-S&P אל המנוע של השרת.
// מקור ראשי: הנרות הסגורים ש-TradingView שולח בזמן אמת (HTT Snapshot → live_bars).
// גיבוי: Yahoo, שמאחר בכעשר דקות — נכנס רק כשהנרות החיים של אותה מסגרת נעצרו.
// כל נר נכנס למנוע פעם אחת ובסדר עולה, לא משנה מאיזה מקור הגיע.

import type { KlineCandle } from './binanceWebSocket'
import { runRealtimeDetector, seedCandles } from './realtimeSignalDetector'
import { getBars, type LiveBar } from './liveBoard'

export const INDEX_SYMBOLS = ['NQ', 'ES'] as const
const isIndex = (s: string) => (INDEX_SYMBOLS as readonly string[]).includes(s)
const TF_MS: Record<string, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000, '4h': 14_400_000, '1D': 86_400_000, '1W': 604_800_000 }
/** מסגרות ש-Yahoo לא נותן — ההיסטוריה שלהן מגיעה רק מהנרות החיים */
const LIVE_ONLY_TFS = ['1m', '4h', '1W'] as const

const lastTime = new Map<string, number>()      // symbol:tf → זמן הפתיחה (שניות) של הנר האחרון שנכנס למנוע
const liveAt = new Map<string, number>()        // symbol:tf → מתי הגיע הנר החי האחרון (ms)
export const indexFeedStatus = { live: 0, yahoo: 0, dropped: 0, lastLiveAt: 0, lastLiveKey: null as string | null }

export function resetIndexFeed(): void { lastTime.clear(); liveAt.clear(); Object.assign(indexFeedStatus, { live: 0, yahoo: 0, dropped: 0, lastLiveAt: 0, lastLiveKey: null }) }   // לבדיקות

const toCandle = (symbol: string, tf: string, b: LiveBar): KlineCandle =>
  ({ symbol, timeframe: tf, time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: 0, isClosed: true })

/** נר סגור אחד אל המנוע. מחזיר true אם נכנס. */
export async function forwardCandle(c: KlineCandle, source: 'live' | 'yahoo', now = Date.now()): Promise<boolean> {
  const key = `${c.symbol}:${c.timeframe}`
  if (c.time <= (lastTime.get(key) ?? 0)) { indexFeedStatus.dropped++; return false }
  if (source === 'yahoo') {
    // כל עוד TradingView שולח את המסגרת הזו, Yahoo לא נכנס (גם אם חותמת הזמן שלו שונה, כמו בנר יומי)
    const la = liveAt.get(key)
    if (la != null && now - la < (TF_MS[c.timeframe] ?? 60_000) * 3 + 300_000) { indexFeedStatus.dropped++; return false }
    indexFeedStatus.yahoo++
  } else {
    liveAt.set(key, now)
    indexFeedStatus.live++; indexFeedStatus.lastLiveAt = now; indexFeedStatus.lastLiveKey = key
  }
  lastTime.set(key, c.time)
  await runRealtimeDetector(c)
  return true
}

/**
 * היסטוריה למנוע בעלייה: Yahoo (אותם נתוני CME, עד לפני כעשר דקות) ואחריו הנרות החיים שכבר נשמרו.
 * בלי התראות על נרות ישנים.
 */
export function seedIndexHistory(symbol: string, tf: string, history: KlineCandle[]): void {
  const end = history.length ? history[history.length - 1].time : 0
  const live = getBars(symbol, tf, 300).filter(b => b.time > end).map(b => toCandle(symbol, tf, b))
  const merged = [...history, ...live].slice(-300)
  if (!merged.length) return
  seedCandles(symbol, tf, merged)
  const key = `${symbol}:${tf}`
  lastTime.set(key, Math.max(lastTime.get(key) ?? 0, merged[merged.length - 1].time))
}

/** בעלייה: המסגרות שיש רק מ-TradingView (דקה, 4 שעות, שבועי) */
export function seedLiveOnly(): void {
  for (const symbol of INDEX_SYMBOLS) for (const tf of LIVE_ONLY_TFS) seedIndexHistory(symbol, tf, [])
}

/**
 * נקרא אחרי כל צילום מצב שנשמר. לנאסדק ול-S&P מעביר למנוע את הנר שנסגר,
 * ובונה נר 30 דקות משני נרות של רבע שעה (TradingView לא שולח 30 דקות).
 */
export function onLiveSnapshot(symbol: string, tf: string, timeMs: number, now = Date.now()): Promise<void> {
  if (!isIndex(symbol)) return Promise.resolve()
  const t = Math.floor(timeMs / 1000)
  const bars = getBars(symbol, tf, 3)
  const bar = bars.find(b => b.time === t)
  if (!bar) return Promise.resolve()
  return (async () => {
    await forwardCandle(toCandle(symbol, tf, bar), 'live', now)
    if (tf === '15m' && (bar.time + 900) % 1800 === 0) {
      const prev = bars.find(b => b.time === bar.time - 900)
      if (prev) await forwardCandle({ symbol, timeframe: '30m', time: prev.time, open: prev.open, high: Math.max(prev.high, bar.high), low: Math.min(prev.low, bar.low), close: bar.close, volume: 0, isClosed: true }, 'live', now)
    }
  })().catch(e => { console.warn('[IndexFeed]', String((e as Error)?.message ?? e).slice(0, 200)) })
}
