'use client'

import { useEffect, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts'
import { useMarketStore, type LayerId } from '@/store/marketStore'
import { API_BASE } from '@/lib/api'
import { setLines, type LineInfo } from '../lineRegistry'

// ─── רמות שוק האופציות (גמא) על גרף הנאסדק: כל קו הוא שכבה נפרדת בסרגל ───
// המקור: CBOE (מעוכב 15 דק׳), שרשראות NDX + QQQ, מומר למחיר החוזה NQ לפי הפער ביניהם (basis).
interface Props { chart: IChartApi; series: ISeriesApi<'Candlestick'> }
interface Side { callWall: number | null; putWall: number | null; zeroGamma: number | null; magnet: number | null; zdte: number | null; zdteExpiry: string | null; regime: string; netGex?: number | null; flipPct?: number | null }
interface Snap { ts: number; cboeTs?: string; ndxSpot?: number; nqLast?: number; basis?: number; nq: Side; ndx?: Side; profile?: Array<{ k: number; gex: number; oi: number }> }
type Key = 'callWall' | 'putWall' | 'zeroGamma' | 'magnet' | 'zdte'
const DEFS: Array<{ key: Key; layer: LayerId; title: string; color: string; style: number; width: 1 | 2; what: string }> = [
  { key: 'callWall', layer: 'optCall', title: 'קיר קולים', color: '#ff6b6b', style: 0, width: 2,
    what: 'הסטרייק עם הכי הרבה גמא של אופציות קול. עושי השוק מוכרים כשהמחיר מתקרב אליו, ולכן הוא מתנהג כמו תקרה.' },
  { key: 'putWall', layer: 'optPut', title: 'קיר פוטים', color: '#4ade80', style: 0, width: 2,
    what: 'הסטרייק עם הכי הרבה גמא של אופציות פוט. עושי השוק קונים כשהמחיר מתקרב אליו, ולכן הוא מתנהג כמו רצפה. אם נשבר, הירידה נוטה להאיץ.' },
  { key: 'zeroGamma', layer: 'optZero', title: 'אפס-גמא', color: '#e0e0e0', style: 2, width: 1,
    what: 'המחיר שבו הגמא הכוללת של עושי השוק מתהפכת. מעליו (גמא חיובית) השוק נוטה להירגע ולחזור לממוצע. מתחתיו (גמא שלילית) התנועות נוטות להאיץ.' },
  { key: 'magnet', layer: 'optMagnet', title: 'מגנט OI', color: '#c084fc', style: 1, width: 1,
    what: 'הסטרייק עם הכי הרבה חוזים פתוחים (Open Interest). המחיר נוטה להימשך אליו לקראת פקיעה.' },
  { key: 'zdte', layer: 'optZdte', title: '0DTE', color: '#fbbf24', style: 2, width: 1,
    what: 'הסטרייק הכי פעיל באופציות שפוקעות היום. משפיע בעיקר על המסחר של אותו יום.' },
]
const num = (v: number, d = 2) => v.toLocaleString('en-US', { maximumFractionDigits: d })

export default function OptionsLevelsLayer({ series }: Props) {
  const { symbol } = useMarketStore()
  const layers = useMarketStore(s => s.layers)
  const setLayerDrawn = useMarketStore(s => s.setLayerDrawn)
  const lines = useRef<IPriceLine[]>([])
  const sig = useRef('')
  const [snap, setSnap] = useState<Snap | null>(null)
  const isNq = /^M?NQ/i.test(symbol)

  useEffect(() => {
    if (!isNq) { setSnap(null); return }
    let alive = true
    const load = () => fetch(`${API_BASE}/api/options-levels`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((s: Snap | null) => { if (alive && s?.nq) setSnap(s) }).catch(() => {})
    load(); const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [isNq])

  useEffect(() => {
    const clear = () => { for (const l of lines.current) { try { series.removePriceLine(l) } catch { /* הסדרה הוסרה */ } } lines.current = [] }
    const info: LineInfo[] = []
    const draw: Array<{ price: number; title: string; color: string; style: number; width: 1 | 2 }> = []
    for (const d of DEFS) {
      const v = snap?.nq[d.key]
      const on = isNq && typeof v === 'number' && layers[d.layer]
      setLayerDrawn(`${d.layer}:options`, on ? 1 : 0)
      if (!on || !snap) continue
      const title = d.title + (d.key === 'zdte' && snap.nq.zdteExpiry ? ` ${snap.nq.zdteExpiry.slice(5)}` : '')
      draw.push({ price: v as number, title, color: d.color, style: d.style, width: d.width })
      const facts: string[] = []
      const ndx = snap.ndx?.[d.key]
      if (typeof ndx === 'number' && typeof snap.basis === 'number') facts.push(`במדד NDX: ${num(ndx)} · הפער בין החוזה למדד (basis): ${num(snap.basis)} נק׳`)
      const row = typeof ndx === 'number' ? snap.profile?.find(p => p.k === ndx) : undefined
      if (row) facts.push(`חוזים פתוחים סביב הסטרייק הזה (QQQ ו-NDX יחד): ${num(row.oi, 0)}`)
      if (typeof snap.nq.netGex === 'number') facts.push(`הגמא הכוללת עכשיו: ${num(snap.nq.netGex / 1e9, 1)} מיליארד $ ל-1% (${snap.nq.regime === 'negative' ? 'שלילית: תנועות מואצות' : snap.nq.regime === 'positive' ? 'חיובית: השוק נרגע' : 'לא ידוע'})`)
      if (d.key === 'zeroGamma' && typeof snap.nq.flipPct === 'number') facts.push(`המחיר נמצא ${num(Math.abs(snap.nq.flipPct))}% ${snap.nq.flipPct < 0 ? 'מתחת' : 'מעל'} לאפס-גמא`)
      info.push({ price: v as number, title, layer: d.layer, what: d.what, facts,
        source: `CBOE, מעוכב 15 דק׳${snap.cboeTs ? ` · נתון של ${snap.cboeTs.slice(11, 16)} (שעון ניו יורק)` : ''} · חושב לפני ${Math.max(0, Math.round((Date.now() - snap.ts) / 60_000))} דק׳` })
    }
    setLines('options', info)
    const next = JSON.stringify(draw)
    if (next !== sig.current) {
      sig.current = next
      clear()
      for (const d of draw) lines.current.push(series.createPriceLine({ price: d.price, color: d.color, lineWidth: d.width, lineStyle: d.style, axisLabelVisible: true, title: d.title }))
    }
  }, [snap, layers, series, isNq, setLayerDrawn])

  useEffect(() => () => {
    for (const l of lines.current) { try { series.removePriceLine(l) } catch { /* הסדרה הוסרה */ } }
    lines.current = []; sig.current = ''
    setLines('options', [])
    for (const d of DEFS) useMarketStore.getState().setLayerDrawn(`${d.layer}:options`, 0)
  }, [series])

  // תווית משטר הגמא על הגרף, כשלפחות שכבת אופציות אחת דלוקה
  if (!isNq || !snap || !DEFS.some(d => layers[d.layer])) return null
  const r = snap.nq.regime
  return (
    <div dir="rtl" className={`absolute bottom-20 left-14 z-10 rounded-full border px-2.5 py-0.5 text-[10px] pointer-events-none bg-gray-900/90
                     ${r === 'negative' ? 'border-red-700/70 text-red-200' : r === 'positive' ? 'border-emerald-700/70 text-emerald-200' : 'border-gray-700 text-gray-400'}`}>
      {r === 'negative' ? 'גמא שלילית: תנועות נוטות להאיץ' : r === 'positive' ? 'גמא חיובית: השוק נוטה להירגע' : 'משטר הגמא לא ידוע'}
      {typeof snap.nq.netGex === 'number' ? ` · ${num(snap.nq.netGex / 1e9, 1)} מיליארד $ ל-1%` : ''}
    </div>
  )
}
