'use client'

import { useEffect, useState } from 'react'
import type { IChartApi, ISeriesApi, MouseEventParams } from 'lightweight-charts'
import { useMarketStore, LAYER_LABELS, LAYER_COLORS } from '@/store/marketStore'
import { allLines, type LineInfo } from './lineRegistry'

// ─── לחיצה על קו בגרף = הסבר מדויק: מה הקו, המחיר שלו, כמה הוא רחוק מהמחיר עכשיו, מאיפה הנתון ומתי עודכן ───
interface Props { chart: IChartApi; series: ISeriesApi<'Candlestick'> }
const num = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const NEAR_PX = 7

export default function LineInfoPopup({ chart, series }: Props) {
  const activeTool = useMarketStore(s => s.activeTool)
  const [hit, setHit] = useState<{ x: number; y: number; lines: LineInfo[]; last: number | null } | null>(null)

  useEffect(() => {
    const onClick = (param: MouseEventParams) => {
      if (activeTool !== 'cursor' || !param.point) { setHit(null); return }
      const { x, y } = param.point
      const found = allLines()
        .map(l => ({ l, py: series.priceToCoordinate(l.price) }))
        .filter(e => e.py != null && Math.abs((e.py as number) - y) <= NEAR_PX)
        .sort((a, b) => Math.abs((a.py as number) - y) - Math.abs((b.py as number) - y))
        .map(e => e.l)
      if (!found.length) { setHit(null); return }
      const data = series.data()
      const lastBar = data.length ? data[data.length - 1] as { close?: number } : null
      setHit({ x, y, lines: found, last: typeof lastBar?.close === 'number' ? lastBar.close : null })
    }
    chart.subscribeClick(onClick)
    return () => { try { chart.unsubscribeClick(onClick) } catch { /* הגרף הוסר */ } }
  }, [chart, series, activeTool])

  if (!hit) return null
  const paneW = chart.timeScale().width()
  const left = Math.max(8, Math.min(hit.x - 150, paneW - 330))
  const below = hit.y < 260
  return (
    <div dir="rtl" style={{ left, ...(below ? { top: hit.y + 14 } : { bottom: `calc(100% - ${hit.y - 14}px)` }) }}
         className="absolute z-30 w-[320px] max-h-[60%] overflow-y-auto rounded-lg border border-slate-600 bg-gray-900 shadow-xl p-3 text-right">
      <button onClick={() => setHit(null)} className="absolute left-2 top-1.5 text-slate-400 hover:text-white text-sm" aria-label="סגור">✕</button>
      <div className="space-y-3">
        {hit.lines.map((l, i) => {
          const diff = hit.last != null ? l.price - hit.last : null
          return (
            <div key={i} className={i > 0 ? 'pt-3 border-t border-slate-700' : ''}>
              <div className="flex items-center gap-2 pl-5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: LAYER_COLORS[l.layer] }} />
                <b className="text-white text-sm">{l.title}</b>
                <b className="text-white text-sm tabular-nums mr-auto">{num(l.price)}</b>
              </div>
              {diff != null && (
                <div className="mt-1 text-xs text-amber-200 tabular-nums">
                  המחיר עכשיו {num(hit.last!)} · הקו {Math.abs(diff) < 0.005 ? 'בדיוק במחיר' : `${num(Math.abs(diff))} נק׳ ${diff > 0 ? 'מעל' : 'מתחת'} למחיר (${(Math.abs(diff) / hit.last! * 100).toFixed(2)}%)`}
                </div>
              )}
              <div className="mt-1.5 text-xs text-slate-200 leading-5">{l.what}</div>
              {(l.facts ?? []).filter(Boolean).map((f, j) => <div key={j} className="mt-1 text-xs text-slate-300 tabular-nums">{f}</div>)}
              <div className="mt-1.5 text-[10px] text-slate-500 leading-4">{l.source}<br />שכבה בסרגל: {LAYER_LABELS[l.layer]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
