'use client'

import { useEffect, useRef, useState } from 'react'
import { createSeriesMarkers, type IChartApi, type ISeriesApi, type IPriceLine, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { API_BASE } from '@/lib/api'
import type { Gate, GateSignalRow } from '@/components/live/EntryGate'
import { setLines, type LineInfo } from '../lineRegistry'

// ─── רמזור הכניסה על הגרף ───
// צהוב: קווי כניסה משוערת / סטופ / יעד (מקווקווים). ירוק: אותם קווים מלאים, וחץ על נר האיתות.
// החיצים של היום נשארים על הגרף עם התוצאה (יעד ✓ / סטופ ✗). הכול מגיע מהשרת (services/entryGate.ts).
interface Props { chart: IChartApi; series: ISeriesApi<'Candlestick'> }
const TF_SEC: Record<string, number> = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600 }

export default function GateLayer({ series }: Props) {
  const { symbol, timeframe } = useMarketStore()
  const visible = useMarketStore(s => s.layers.gate)
  const lines = useRef<IPriceLine[]>([])
  const marks = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const [badge, setBadge] = useState<{ state: string; text: string } | null>(null)

  useEffect(() => {
    const clearLines = () => { for (const l of lines.current) { try { series.removePriceLine(l) } catch { /* הסדרה הוסרה */ } } lines.current = [] }
    const clearMarks = () => { try { marks.current?.setMarkers([]) } catch { /* הסדרה הוסרה */ } }
    const report = (n: number, info: LineInfo[]) => { useMarketStore.getState().setLayerDrawn('gate:gate', n); setLines('gate', info) }
    if (!visible) { clearLines(); clearMarks(); setBadge(null); report(0, []); return }
    let alive = true
    let sig = ''
    const load = () => fetch(`${API_BASE}/api/live/${encodeURIComponent(symbol)}/gate`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((g: Gate | null) => {
        if (!alive || !g) return
        if (!g.supported) { clearLines(); clearMarks(); setBadge(null); report(0, []); sig = ''; return }
        const p = g.plan
        setBadge({ state: g.state, text: g.state === 'green' ? g.headline : g.state === 'yellow' ? `${g.headline} · ${g.missing ?? ''}` : g.blocks.length ? `${g.headline} · ${g.blocks[0].text}` : g.headline })
        const tfSec = TF_SEC[timeframe]
        const today: GateSignalRow[] = tfSec ? g.log.today.filter(s => !s.blocked) : []
        const next = JSON.stringify([g.state, p, today.map(s => [s.id, s.status]), timeframe])
        // מה שהרמזור מצייר: 4 קווים כשיש תוכנית, וחץ לכל ירוק של היום. בלי תוכנית ובלי חיצים = אין מה לצייר
        const src = `רמזור הכניסה · נבדק בכל סגירת נר דקה מנתוני TradingView${g.dataAgeSec != null ? ` · עודכן לפני ${g.dataAgeSec} שנ׳` : ''}`
        const dirHe = p ? (p.dir === 'long' ? 'לונג' : 'שורט') : ''
        const size = p ? `${p.contracts} ${p.unit} · סיכון ${p.riskUsd}$ · יעד ${p.rewardUsd}$` : ''
        report((p ? 4 : 0) + today.length, !p ? [] : [
          { price: p.entry, title: `כניסה ${dirHe}${p.estimated ? ' (משוער)' : ''}`, layer: 'gate', source: src, facts: [size, `מצב הרמזור: ${g.headline}${g.missing ? ` · ${g.missing}` : ''}`],
            what: p.estimated ? 'המחיר שבו הכניסה צפויה אם התנאי החסר יתקיים. זה עוד לא איתות.' : 'מחיר הכניסה של הירוק הנוכחי: מחיר הסגירה של נר הדקה שבו כל התנאים התקיימו.' },
          { price: p.stop, title: `סטופ ${p.stopPts} נק׳`, layer: 'gate', source: src, facts: [size], what: `הסטופ הקבוע שלך: ${p.stopPts} נקודות מהכניסה.` },
          { price: p.t1, title: 'יעד 1:1', layer: 'gate', source: src, facts: [size], what: `יעד ראשון: אותו מרחק כמו הסטופ (${p.stopPts} נק׳).` },
          { price: p.t2, title: `יעד 1:${g.rules.rr}`, layer: 'gate', source: src, facts: [size], what: `היעד המלא: פי ${g.rules.rr} מהסטופ (${p.stopPts * g.rules.rr} נק׳).` },
        ])
        if (next === sig) return                       // אין שינוי — לא מציירים מחדש (מונע הבהוב)
        sig = next
        clearLines()
        if (p) {
          const style = p.estimated ? 2 : 0            // משוער = מקווקו
          const tag = p.estimated ? ' (משוער)' : ''
          const add = (price: number, color: string, title: string, width: 1 | 2) =>
            lines.current.push(series.createPriceLine({ price, color, lineWidth: width, lineStyle: style, axisLabelVisible: true, title }))
          add(p.entry, '#e2e8f0', `כניסה ${p.dir === 'long' ? 'לונג' : 'שורט'}${tag}`, 2)
          add(p.stop, '#ef4444', `סטופ ${p.stopPts} נק׳`, 2)
          add(p.t1, '#6ee7b7', 'יעד 1:1', 1)
          add(p.t2, '#10b981', `יעד 1:${g.rules.rr}`, 2)
        }
        const ms: SeriesMarker<Time>[] = today
          .map(s => {
            const long = s.dir === 'long'
            const res = s.status === 'target' ? ' ✓' : s.status === 'stop' ? ' ✗' : ''
            return {
              time: (Math.floor(s.barTime / 1000 / tfSec) * tfSec) as UTCTimestamp,
              position: long ? 'belowBar' as const : 'aboveBar' as const,
              shape: long ? 'arrowUp' as const : 'arrowDown' as const,
              color: s.status === 'stop' ? '#f87171' : s.status === 'target' ? '#34d399' : '#fbbf24',
              text: `${long ? 'לונג' : 'שורט'}${res}`,
            }
          })
          .sort((a, b) => (a.time as number) - (b.time as number))
        try {
          if (!marks.current) marks.current = createSeriesMarkers(series, ms)
          else marks.current.setMarkers(ms)
        } catch { /* הסדרה הוסרה */ }
      })
      .catch(() => {})
    load(); const id = setInterval(load, 4_000)
    return () => { alive = false; clearInterval(id); clearLines(); clearMarks(); report(0, []) }
  }, [symbol, timeframe, series, visible])

  useEffect(() => () => { try { marks.current?.detach() } catch { /* כבר הוסר */ } marks.current = null }, [series])

  if (!visible || !badge) return null
  const cls = badge.state === 'green' ? 'bg-emerald-600 border-emerald-300 text-white animate-pulse'
    : badge.state === 'yellow' ? 'bg-amber-900/90 border-amber-500 text-amber-100'
    : badge.state === 'red' ? 'bg-gray-900/90 border-red-700 text-red-200'
    : 'bg-gray-900/90 border-gray-700 text-gray-400'
  return (
    <div dir="rtl" className={`absolute top-10 left-14 z-10 max-w-[70%] truncate rounded-full border px-3 py-0.5 text-[11px] font-bold pointer-events-none ${cls}`}>
      🚦 {badge.text}
    </div>
  )
}
