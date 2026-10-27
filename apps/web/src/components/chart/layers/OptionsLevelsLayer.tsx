'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { API_BASE } from '@/lib/api'

// ─── רמות שוק האופציות (גמא) על גרף הנאסדק: קיר קולים, קיר פוטים, אפס-גמא, מגנט OI, 0DTE — מהשרת (CBOE → NQ) ───
interface Props { chart: IChartApi; series: ISeriesApi<'Candlestick'> }
interface Snap { nq: { callWall: number | null; putWall: number | null; zeroGamma: number | null; magnet: number | null; zdte: number | null; zdteExpiry: string | null; regime: string } }
const STYLE: Array<[keyof Snap['nq'], string, string, number]> = [
  ['callWall', 'קיר קולים', '#ff6b6b', 0], ['putWall', 'קיר פוטים', '#4ade80', 0], ['zeroGamma', 'אפס-גמא', '#e0e0e0', 2], ['magnet', 'מגנט OI', '#c084fc', 1], ['zdte', '0DTE', '#fbbf24', 2],
]

export default function OptionsLevelsLayer({ series }: Props) {
  const { symbol } = useMarketStore()
  const lines = useRef<IPriceLine[]>([])
  useEffect(() => {
    const clear = () => { for (const l of lines.current) { try { series.removePriceLine(l) } catch { /* הסדרה הוסרה */ } } lines.current = [] }
    if (!/^NQ/i.test(symbol)) { clear(); return }
    let alive = true
    const load = () => fetch(`${API_BASE}/api/options-levels`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((s: Snap | null) => {
      if (!alive || !s) return
      clear()
      for (const [k, he, color, style] of STYLE) {
        const v = s.nq[k]
        if (typeof v !== 'number') continue
        lines.current.push(series.createPriceLine({ price: v, color, lineWidth: k === 'callWall' || k === 'putWall' ? 2 : 1, lineStyle: style, axisLabelVisible: true, title: he + (k === 'zdte' && s.nq.zdteExpiry ? ` ${s.nq.zdteExpiry.slice(5)}` : '') }))
      }
    }).catch(() => {})
    load(); const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id); clear() }
  }, [symbol, series])
  return null
}
