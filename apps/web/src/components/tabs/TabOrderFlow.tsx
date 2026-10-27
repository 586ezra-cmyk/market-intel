'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers, type IChartApi, type UTCTimestamp, type SeriesMarker, type Time } from 'lightweight-charts'
import { API_BASE } from '@/lib/api'

// ─── Order Flow (שלב 3): דלתא ו-CVD אמיתיים מ-Binance, לפי מסגרת, כמו ב-ATAS ───
// השרת צובר נרות דקה עם נפח הקונים התוקפים (taker buy) ומחזיר לכל נר: קונים, מוכרים, דלתא, CVD (פתיחה/שיא/שפל/סגירה של ה-CVD בתוך הנר),
// ספיגה (נפח כפול עם טווח קטן) ודיברגנס (מחיר שיא/שפל חדש בלי CVD).

interface OfBar {
  t: number; o: number; h: number; l: number; c: number
  vol: number; buy: number; sell: number; delta: number
  cvd: number; cvdO: number; cvdH: number; cvdL: number; cvdDay: number
  absorb: -1 | 0 | 1; div: -1 | 0 | 1
}
const SYMS = [['BTCUSDT', 'BTC'], ['ETHUSDT', 'ETH'], ['SOLUSDT', 'SOL']] as const
const TFS = [[1, '1 דק׳'], [5, '5 דק׳'], [15, '15 דק׳'], [60, 'שעה'], [240, '4 שעות']] as const
const fmt = (v: number) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(0))
const sgn = (v: number) => (v > 0 ? '+' : '') + fmt(v)

function useChart(height: number) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = createChart(el, {
      height, layout: { background: { color: 'transparent' }, textColor: '#94a3b8', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(148,163,184,0.08)' }, horzLines: { color: 'rgba(148,163,184,0.08)' } },
      rightPriceScale: { borderColor: 'rgba(148,163,184,0.2)' }, timeScale: { borderColor: 'rgba(148,163,184,0.2)', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    })
    chartRef.current = chart
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }))
    ro.observe(el)
    return () => { ro.disconnect(); chartRef.current = null; try { chart.remove() } catch { /* כבר הוסר */ } }
  }, [height])
  return { ref, chartRef }
}

export default function TabOrderFlow() {
  const [sym, setSym] = useState<string>('ETHUSDT')
  const [tf, setTf] = useState<number>(15)
  const [bars, setBars] = useState<OfBar[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<number | null>(null)
  const price = useChart(300)
  const cvd = useChart(200)
  const delta = useChart(140)

  useEffect(() => {
    let alive = true
    const load = () => {
      fetch(`${API_BASE}/api/orderflow/${sym}?tf=${tf}&limit=300`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(j => { if (alive) { setBars(j.bars ?? []); setError(null); setLoadedAt(Date.now()) } })
        .catch(e => { if (alive) setError(String(e.message ?? e)) })
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(id) }
  }, [sym, tf])

  useEffect(() => {
    const pc = price.chartRef.current, cc = cvd.chartRef.current, dc = delta.chartRef.current
    if (!pc || !cc || !dc || !bars.length) return
    const ts = (t: number) => Math.floor(t / 1000) as UTCTimestamp
    const candles = pc.addSeries(CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350', borderVisible: false })
    candles.setData(bars.map(b => ({ time: ts(b.t), open: b.o, high: b.h, low: b.l, close: b.c })))
    const marks: SeriesMarker<Time>[] = []
    for (const b of bars) {
      if (b.absorb === -1) marks.push({ time: ts(b.t), position: 'aboveBar', color: '#ef5350', shape: 'arrowDown', text: 'ספיגת קונים' })
      if (b.absorb === 1) marks.push({ time: ts(b.t), position: 'belowBar', color: '#26a69a', shape: 'arrowUp', text: 'ספיגת מוכרים' })
      if (b.div === -1) marks.push({ time: ts(b.t), position: 'aboveBar', color: '#f59e0b', shape: 'circle', text: 'דיב׳ דובי' })
      if (b.div === 1) marks.push({ time: ts(b.t), position: 'belowBar', color: '#f59e0b', shape: 'circle', text: 'דיב׳ שורי' })
    }
    createSeriesMarkers(candles, marks)
    const cvdS = cc.addSeries(CandlestickSeries, { upColor: '#45c4ff', downColor: '#c084fc', wickUpColor: '#45c4ff', wickDownColor: '#c084fc', borderVisible: false, priceFormat: { type: 'volume' } })
    cvdS.setData(bars.map(b => ({ time: ts(b.t), open: b.cvdO, high: b.cvdH, low: b.cvdL, close: b.cvd })))
    const dS = dc.addSeries(HistogramSeries, { priceFormat: { type: 'volume' } })
    dS.setData(bars.map(b => ({ time: ts(b.t), value: b.delta, color: b.delta >= 0 ? 'rgba(38,166,154,0.8)' : 'rgba(239,83,80,0.8)' })))
    pc.timeScale().fitContent(); cc.timeScale().fitContent(); dc.timeScale().fitContent()
    return () => { try { pc.removeSeries(candles); cc.removeSeries(cvdS); dc.removeSeries(dS) } catch { /* הגרף כבר הוסר (StrictMode / החלפת טאב) */ } }
  }, [bars, price.chartRef, cvd.chartRef, delta.chartRef])

  const sum = useMemo(() => {
    if (!bars.length) return null
    const last = bars[bars.length - 1]
    const slope = bars.length > 5 ? last.cvd - bars[bars.length - 6].cvd : 0
    const ab = [...bars].reverse().find(b => b.absorb !== 0)
    const dv = [...bars].reverse().find(b => b.div !== 0)
    return { last, slope, ab, dv }
  }, [bars])
  const when = (t: number) => new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto" dir="rtl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">🌊 Order Flow — דלתא ו-CVD אמיתיים (Binance)</h2>
        <div className="text-xs text-slate-500">{loadedAt ? `עודכן ${when(loadedAt)} · רענון כל 30 שניות` : 'טוען…'} · נאסדק יגיע מ-Bookmap</div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1">{SYMS.map(([id, nm]) => <button key={id} onClick={() => setSym(id)} className={`px-3 py-1 rounded text-sm ${sym === id ? 'bg-blue-600 text-white' : 'bg-surface-border text-slate-300'}`}>{nm}</button>)}</div>
        <div className="flex gap-1">{TFS.map(([id, nm]) => <button key={id} onClick={() => setTf(id)} className={`px-3 py-1 rounded text-sm ${tf === id ? 'bg-blue-600 text-white' : 'bg-surface-border text-slate-300'}`}>{nm}</button>)}</div>
      </div>
      {error && <div className="text-red-400 text-sm">שגיאה: {error}</div>}
      {sum && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="card p-3"><div className="text-slate-400 text-xs">דלתא של הנר האחרון</div><div className={`text-lg font-bold ${sum.last.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{sgn(sum.last.delta)}</div><div className="text-xs text-slate-500">קונים {fmt(sum.last.buy)} · מוכרים {fmt(sum.last.sell)}</div></div>
          <div className="card p-3"><div className="text-slate-400 text-xs">CVD — כיוון (5 נרות)</div><div className={`text-lg font-bold ${sum.slope >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{sum.slope >= 0 ? '▲ עולה' : '▼ יורד'} {sgn(sum.slope)}</div><div className="text-xs text-slate-500">CVD היום {sgn(sum.last.cvdDay)}</div></div>
          <div className="card p-3"><div className="text-slate-400 text-xs">ספיגה אחרונה</div><div className="text-lg font-bold">{sum.ab ? (sum.ab.absorb === 1 ? 'מוכרים נספגו (שורי)' : 'קונים נספגו (דובי)') : '—'}</div><div className="text-xs text-slate-500">{sum.ab ? when(sum.ab.t) : 'אין ב-300 הנרות האחרונים'}</div></div>
          <div className="card p-3"><div className="text-slate-400 text-xs">דיברגנס אחרון</div><div className="text-lg font-bold">{sum.dv ? (sum.dv.div === 1 ? 'שורי: שפל חדש בלי CVD' : 'דובי: שיא חדש בלי CVD') : '—'}</div><div className="text-xs text-slate-500">{sum.dv ? when(sum.dv.t) : 'אין ב-300 הנרות האחרונים'}</div></div>
        </div>
      )}
      <div className="card p-2"><div className="text-xs text-slate-400 mb-1">מחיר · סימונים: ספיגה (חץ), דיברגנס (עיגול)</div><div ref={price.ref} /></div>
      <div className="card p-2"><div className="text-xs text-slate-400 mb-1">נרות CVD (מצטבר על החלון) — כחול עולה, סגול יורד</div><div ref={cvd.ref} /></div>
      <div className="card p-2"><div className="text-xs text-slate-400 mb-1">דלתא לכל נר (קונים תוקפים פחות מוכרים תוקפים)</div><div ref={delta.ref} /></div>
      <div className="card p-3 text-xs text-slate-400 leading-relaxed">
        <b className="text-slate-200">איך קוראים את זה.</b> דלתא = נפח הקונים התוקפים פחות המוכרים התוקפים בנר (מ-Binance, לא הערכה). CVD = הסכום המצטבר של הדלתא; נר CVD מראה את הפתיחה, השיא, השפל והסגירה של ה-CVD בתוך הנר.
        <b className="text-slate-200"> ספיגה</b> = נפח כפול מהממוצע אבל טווח קטן: קונים נספגו (דלתא חיובית בלי התקדמות) = דובי; מוכרים נספגו = שורי.
        <b className="text-slate-200"> דיברגנס</b> = המחיר עשה שיא/שפל של 20 נרות וה-CVD לא. לפני שמשלבים בניקוד: נמדד מול העסקאות של Path Lab (סעיף 2.4 בתוכנית).
      </div>
    </div>
  )
}
