'use client'

import { useEffect, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { API_BASE } from '@/lib/api'
import { LEVEL_DEFS, LEVEL_LAYERS } from './levelDefs'
import { setLines, type LineInfo } from '../lineRegistry'

// ─── הרמות החיות מ-TradingView (HTT Snapshot), מפורקות לשכבות ───
// כל רמה שייכת לשכבה בסרגל (FVG, אורדר בלוק, נזילות, סשנים...). מציירים רק רמות ששכבתן דלוקה.
// מציירים רק צילום טרי. צילום ישן לא מצויר בכלל, כדי שלא ייראו רמות של לפני שעות כאילו הן של עכשיו.
interface Props { chart: IChartApi; series: ISeriesApi<'Candlestick'> }
interface Levels { tf: string | null; exact: boolean; ageSec: number | null; stale: boolean; price: number | null; lv: Record<string, number> }

// מסגרות שהשרת שומר להן צילום (שאר המסגרות בגרף מקבלות את הצילום הטרי ביותר)
const BOARD_TF = new Set(['1m', '5m', '15m', '1h', '4h', '1D', '1W'])
const TF_HE: Record<string, string> = { '1m': 'דקה', '5m': '5 דק׳', '15m': '15 דק׳', '1h': 'שעה', '4h': '4 שעות', '1D': 'יומי', '1W': 'שבועי' }
const num = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })

export default function HttLevelsLayer({ series }: Props) {
  const { symbol, timeframe } = useMarketStore()
  const layers = useMarketStore(s => s.layers)
  const setLayerDrawn = useMarketStore(s => s.setLayerDrawn)
  const lines = useRef<IPriceLine[]>([])
  const sig = useRef('')
  const [data, setData] = useState<Levels | null>(null)

  // טעינה כל 5 שניות
  useEffect(() => {
    let alive = true
    setData(null)
    const tf = BOARD_TF.has(timeframe) ? timeframe : '1m'
    const load = () => fetch(`${API_BASE}/api/live/${encodeURIComponent(symbol)}/levels?tf=${tf}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Levels | null) => { if (alive && d) setData(d) })
      .catch(() => {})
    load(); const id = setInterval(load, 5_000)
    return () => { alive = false; clearInterval(id) }
  }, [symbol, timeframe])

  // ציור: רק הרמות של השכבות הדלוקות
  useEffect(() => {
    const clear = () => { for (const l of lines.current) { try { series.removePriceLine(l) } catch { /* הסדרה הוסרה */ } } lines.current = [] }
    const crypto = /(USDT|USDC|USD)$/.test(symbol)                  // לקריפטו יש ציור בולינגר מלא, אז לא מוסיפים קווים כפולים
    const counts: Record<string, number> = {}
    const info: LineInfo[] = []
    // קווים באותו מחיר מתאחדים לקו אחד עם שתי התוויות
    const byPrice = new Map<number, { titles: string[]; color: string; style: number; width: 1 | 2 }>()
    if (data && !data.stale) {
      const src = `TradingView (HTT Snapshot) · מסגרת ${TF_HE[data.tf ?? ''] ?? data.tf}${data.exact ? '' : ' (אין צילום למסגרת של הגרף)'} · עודכן לפני ${data.ageSec} שנ׳`
      for (const d of LEVEL_DEFS) {
        const v = data.lv[d.key]
        if (typeof v !== 'number' || !Number.isFinite(v)) continue
        if (d.layer === 'bollinger' && crypto) continue
        if (!layers[d.layer]) continue
        counts[d.layer] = (counts[d.layer] ?? 0) + 1
        const facts: string[] = []
        const other = d.pair ? data.lv[d.pair] : undefined
        if (typeof other === 'number') facts.push(`האזור: ${num(Math.min(v, other))} עד ${num(Math.max(v, other))} (רוחב ${num(Math.abs(v - other))})`)
        info.push({ price: v, title: d.title, layer: d.layer, what: d.what, source: src, facts })
        const e = byPrice.get(v)
        if (e) e.titles.push(d.title); else byPrice.set(v, { titles: [d.title], color: d.color, style: d.style, width: d.width })
      }
    }
    for (const id of LEVEL_LAYERS) setLayerDrawn(`${id}:levels`, counts[id] ?? 0)
    setLines('levels', info)
    const next = JSON.stringify([...byPrice.entries()])
    if (next !== sig.current) {                                      // אותן רמות — לא מציירים מחדש (מונע הבהוב)
      sig.current = next
      clear()
      for (const [price, e] of byPrice) {
        lines.current.push(series.createPriceLine({ price, color: e.color, lineWidth: e.width, lineStyle: e.style, axisLabelVisible: true, title: e.titles.join(' · ') }))
      }
    }
  }, [data, layers, series, symbol, setLayerDrawn])

  useEffect(() => () => {
    for (const l of lines.current) { try { series.removePriceLine(l) } catch { /* הסדרה הוסרה */ } }
    lines.current = []; sig.current = ''
    setLines('levels', [])
    for (const id of LEVEL_LAYERS) useMarketStore.getState().setLayerDrawn(`${id}:levels`, 0)
  }, [series])

  if (!data) return null
  const fresh = data.tf && !data.stale
  return (
    <div className={`absolute bottom-14 left-14 z-10 rounded-full border px-2.5 py-0.5 text-[10px] pointer-events-none
                     ${fresh ? 'bg-gray-900/90 border-yellow-700/60 text-yellow-200' : 'bg-gray-900/90 border-gray-700 text-gray-400'}`}>
      {fresh
        ? `רמות חיות מ-TradingView · ${lines.current.length} קווים · מסגרת ${TF_HE[data.tf!] ?? data.tf}${data.exact ? '' : ' (אין צילום למסגרת של הגרף)'} · לפני ${data.ageSec} שנ׳ · לחיצה על קו = הסבר`
        : data.tf
          ? 'רמות TradingView: הצילום האחרון ישן, ולכן לא מצוירות'
          : 'רמות TradingView: עוד לא הגיע צילום מצב לנכס הזה'}
    </div>
  )
}
