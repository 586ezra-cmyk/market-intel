'use client'

import { useEffect, useState } from 'react'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { chartFeed } from '../chartFeed'

// ─── הנר החי: הנר שנבנה עכשיו, מהמחיר שהעיניים קוראות מ-Bookmap ───
// TradingView שולח לשרת רק נרות סגורים, ולכן בלי זה הגרף תמיד נר אחד מאחור.
// כשהעיניים דלוקות, המחיר נקרא כאן ישירות מהעוזר המקומי (127.0.0.1) ומצויר בדפדפן בלבד. הוא לא נשלח לשרת.
// הנר החי הוא קירוב (קריאת מסך). כשהנר האמיתי מגיע מ-TradingView הוא מחליף אותו.
interface Props { chart: IChartApi; series: ISeriesApi<'Candlestick'> }
const EYES = 'http://127.0.0.1:8770/state'
const TF_SEC: Record<string, number> = { '1m': 60, '5m': 300 }
// קריאה שרחוקה מדי מהסגירה האחרונה של TradingView נזרקת (למשל תווית המחיר של סמן העכבר ב-Bookmap)
const MAX_FROM_REAL: Record<string, number> = { '1m': 0.004, '5m': 0.008 }
const WAIT_REAL_S = 8          // כמה שניות מחכים בתחילת נר חדש לנר הסגור הקודם מהשרת
const JUMP_PTS = 40            // קפיצה גדולה מזה בין שתי קריאות מתקבלת רק אם הקריאה הבאה מאשרת אותה

export default function LiveCandleLayer({ series }: Props) {
  const { symbol, timeframe } = useMarketStore()
  const [live, setLive] = useState<{ price: number; ageS: number } | null>(null)
  const tf = TF_SEC[timeframe]
  const isNq = /^M?NQ/i.test(symbol)

  useEffect(() => {
    chartFeed.formingTime = 0
    setLive(null)
    if (!isNq || !tf) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    let accepted: number | null = null            // המחיר האחרון שהתקבל
    let candidate: number | null = null           // קפיצה שמחכה לאישור
    let lastTs = 0
    let cur: { bucket: number; open: number; high: number; low: number } | null = null
    let pend: { bucket: number; first: number; high: number; low: number } | null = null

    const accept = (p: number): number | null => {
      if (!(p > 0)) return null
      if (!chartFeed.lastRealClose || Math.abs(p - chartFeed.lastRealClose) / chartFeed.lastRealClose > (MAX_FROM_REAL[timeframe] ?? 0.004)) return null
      if (accepted == null || Math.abs(p - accepted) <= JUMP_PTS) { accepted = p; candidate = null; return p }
      if (candidate != null && Math.abs(p - candidate) <= 10) { accepted = p; candidate = null; return p }
      candidate = p
      return null
    }

    const tick = async () => {
      let delay = 1000
      try {
        const r = await fetch(EYES, { cache: 'no-store', signal: AbortSignal.timeout(900) })
        const s = await r.json() as { running?: boolean; fast?: { price?: number | null; ts?: number; age_s?: number } }
        const f = s.fast
        if (!alive) return
        if (!s.running || !f || typeof f.price !== 'number' || (f.age_s ?? 99) > 5) { setLive(null) }
        else if (f.ts !== lastTs) {
          lastTs = f.ts ?? 0
          const p = accept(f.price)
          const nowS = Date.now() / 1000
          const bucket = Math.floor(nowS / tf) * tf
          if (p != null && chartFeed.lastRealTime > 0 && bucket > chartFeed.lastRealTime) {
            const prevArrived = chartFeed.lastRealTime >= bucket - tf
            if (!prevArrived && nowS - bucket < WAIT_REAL_S) {
              // תחילת נר חדש: הנר הסגור הקודם עוד בדרך מהשרת. אוספים את הקריאות ומציירים כשהוא מגיע
              if (!pend || pend.bucket !== bucket) pend = { bucket, first: p, high: p, low: p }
              else { pend.high = Math.max(pend.high, p); pend.low = Math.min(pend.low, p) }
            } else if (chartFeed.lastRealTime >= bucket - 2 * tf) {            // חסר לכל היותר נר אחד; אחרת הנתונים לא חיים ולא מציירים
              if (!cur || cur.bucket !== bucket) {
                const open = prevArrived ? chartFeed.lastRealClose : (pend && pend.bucket === bucket ? pend.first : p)
                cur = { bucket, open, high: Math.max(open, p), low: Math.min(open, p) }
                if (pend && pend.bucket === bucket) { cur.high = Math.max(cur.high, pend.high); cur.low = Math.min(cur.low, pend.low) }
                pend = null
              }
              cur.high = Math.max(cur.high, p); cur.low = Math.min(cur.low, p)
              try {
                series.update({ time: bucket as UTCTimestamp, open: cur.open, high: cur.high, low: cur.low, close: p })
                chartFeed.formingTime = bucket
              } catch { /* נר ישן יותר מהאחרון בגרף — מדלגים */ }
            }
          }
          setLive(p != null ? { price: p, ageS: Math.round(f.age_s ?? 0) } : null)
        }
      } catch {
        if (alive) setLive(null)
        delay = 10_000                           // העוזר סגור: בודקים שוב רק כל 10 שניות
      }
      if (alive) timer = setTimeout(tick, delay)
    }
    tick()
    return () => { alive = false; clearTimeout(timer); chartFeed.formingTime = 0 }
  }, [symbol, timeframe, series, tf, isNq])

  if (!live) return null
  return (
    <div dir="rtl" className="absolute bottom-8 left-[17rem] z-10 rounded-full border border-sky-700 bg-gray-900/90 px-2.5 py-0.5 text-[10px] text-sky-200 pointer-events-none">
      👁 נר חי מ-Bookmap · {live.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · קירוב, רק במחשב הזה
    </div>
  )
}
