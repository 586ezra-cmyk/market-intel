'use client'

import { useEffect, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { API_BASE } from '@/lib/api'

// ─── רמות HTT על הגרף: אותן רמות שהאינדיקטור מחשב ב-TradingView, כפי שהגיעו בצילום המצב האחרון של המסגרת הזאת ───
// מציירים רק צילום טרי. צילום ישן לא מצויר בכלל, כדי שלא ייראו רמות של לפני שעות כאילו הן של עכשיו.
interface Props { chart: IChartApi; series: ISeriesApi<'Candlestick'> }
interface Levels { tf: string | null; exact: boolean; ageSec: number | null; stale: boolean; price: number | null; lv: Record<string, number> }

// [מפתח, תווית, צבע, סגנון קו (0 רציף, 1 מנוקד, 2 מקווקו), עובי]
const STYLE: Array<[string, string, string, number, 1 | 2]> = [
  ['fLt', 'FVG תומך', '#10b981', 0, 2], ['fLb', 'FVG תומך ▁', '#10b981', 2, 1],
  ['fSb', 'FVG מתנגד', '#ef4444', 0, 2], ['fSt', 'FVG מתנגד ▔', '#ef4444', 2, 1],
  ['iLt', 'iFVG תומך', '#14b8a6', 0, 1], ['iLb', 'iFVG תומך ▁', '#14b8a6', 2, 1],
  ['iSb', 'iFVG מתנגד', '#f97316', 0, 1], ['iSt', 'iFVG מתנגד ▔', '#f97316', 2, 1],
  ['obL', 'אורדר בלוק לונג', '#22c55e', 0, 2], ['obLs', 'OB לונג · קצה', '#22c55e', 2, 1],
  ['obS', 'אורדר בלוק שורט', '#f43f5e', 0, 2], ['obSs', 'OB שורט · קצה', '#f43f5e', 2, 1],
  ['pH', 'שיא פיבוט', '#818cf8', 1, 1], ['pL', 'שפל פיבוט', '#818cf8', 1, 1],
  ['rHi', 'קריק', '#3b82f6', 0, 1], ['rLo', 'אייס', '#3b82f6', 0, 1], ['jac', 'קו הקפיצה', '#60a5fa', 2, 1],
  ['plH', 'נזילות ▲', '#f59e0b', 1, 1], ['plL', 'נזילות ▼', '#f59e0b', 1, 1],
  ['sesH', 'שיא סשן קודם', '#94a3b8', 2, 1], ['sesL', 'שפל סשן קודם', '#94a3b8', 2, 1],
  ['asH', 'שיא אסיה', '#64748b', 2, 1], ['asL', 'שפל אסיה', '#64748b', 2, 1],
  ['dH', 'שיא יומי', '#e2e8f0', 0, 1], ['dL', 'שפל יומי', '#e2e8f0', 0, 1],
  ['h4H', 'שיא 4H', '#cbd5e1', 1, 1], ['h4L', 'שפל 4H', '#cbd5e1', 1, 1],
  ['wH', 'שיא שבועי', '#f8fafc', 0, 1], ['wL', 'שפל שבועי', '#f8fafc', 0, 1],
  ['orH', 'שיא טווח הפתיחה', '#0ea5e9', 1, 1], ['orL', 'שפל טווח הפתיחה', '#0ea5e9', 1, 1],
  ['poc', 'POC', '#facc15', 0, 1], ['vah', 'VAH', '#a16207', 2, 1], ['val', 'VAL', '#a16207', 2, 1],
  ['avD', 'AVWAP יומי', '#38bdf8', 1, 1], ['wgU', 'קו הכנף ▲', '#c084fc', 1, 1], ['wgD', 'קו הכנף ▼', '#c084fc', 1, 1],
]
// מסגרות שהשרת שומר להן צילום (שאר המסגרות בגרף מקבלות את הצילום הטרי ביותר)
const BOARD_TF = new Set(['1m', '5m', '15m', '1h', '4h', '1D', '1W'])
const TF_HE: Record<string, string> = { '1m': 'דקה', '5m': '5 דק׳', '15m': '15 דק׳', '1h': 'שעה', '4h': '4 שעות', '1D': 'יומי', '1W': 'שבועי' }

export default function HttLevelsLayer({ series }: Props) {
  const { symbol, timeframe } = useMarketStore()
  const visible = useMarketStore(s => s.layers.htt)
  const lines = useRef<IPriceLine[]>([])
  const [info, setInfo] = useState<{ tf: string | null; exact: boolean; ageSec: number | null; stale: boolean; count: number } | null>(null)

  useEffect(() => {
    const clear = () => { for (const l of lines.current) { try { series.removePriceLine(l) } catch { /* הסדרה הוסרה */ } } lines.current = [] }
    if (!visible) { clear(); setInfo(null); return }
    let alive = true
    let sig = ''
    const tf = BOARD_TF.has(timeframe) ? timeframe : '1m'
    const load = () => fetch(`${API_BASE}/api/live/${encodeURIComponent(symbol)}/levels?tf=${tf}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Levels | null) => {
        if (!alive || !d) return
        // קווים באותו מחיר מתאחדים לקו אחד עם שתי התוויות
        const byPrice = new Map<number, { titles: string[]; color: string; style: number; width: 1 | 2 }>()
        if (!d.stale) {
          for (const [k, he, color, style, width] of STYLE) {
            const v = d.lv[k]
            if (typeof v !== 'number' || !Number.isFinite(v)) continue
            const e = byPrice.get(v)
            if (e) e.titles.push(he); else byPrice.set(v, { titles: [he], color, style, width })
          }
        }
        setInfo({ tf: d.tf, exact: d.exact, ageSec: d.ageSec, stale: d.stale, count: byPrice.size })
        const next = JSON.stringify([...byPrice.entries()])
        if (next === sig) return                       // אותן רמות — לא מציירים מחדש (מונע הבהוב)
        sig = next
        clear()
        for (const [price, e] of byPrice) {
          lines.current.push(series.createPriceLine({ price, color: e.color, lineWidth: e.width, lineStyle: e.style, axisLabelVisible: true, title: e.titles.join(' · ') }))
        }
      })
      .catch(() => {})
    load(); const id = setInterval(load, 5_000)
    return () => { alive = false; clearInterval(id); clear() }
  }, [symbol, timeframe, series, visible])

  if (!visible || !info) return null
  const fresh = info.tf && !info.stale
  return (
    <div className={`absolute bottom-14 left-14 z-10 rounded-full border px-2.5 py-0.5 text-[10px] pointer-events-none
                     ${fresh ? 'bg-gray-900/90 border-yellow-700/60 text-yellow-200' : 'bg-gray-900/90 border-gray-700 text-gray-400'}`}>
      {fresh
        ? `רמות HTT · ${info.count} קווים · מסגרת ${TF_HE[info.tf!] ?? info.tf}${info.exact ? '' : ' (אין צילום למסגרת של הגרף)'} · לפני ${info.ageSec} שנ׳`
        : info.tf
          ? 'רמות HTT: הצילום האחרון ישן — לא מצוירות (התראות HTT Snapshot לא פעילות)'
          : 'רמות HTT: עוד לא הגיע צילום מצב לנכס הזה'}
    </div>
  )
}
