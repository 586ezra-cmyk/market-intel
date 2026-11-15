'use client'

import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import FVGLayer from './layers/FVGLayer'
import StructureLayer from './layers/StructureLayer'
import RangeLayer from './layers/RangeLayer'
import LiquidityLayer from './layers/LiquidityLayer'
import SMTLayer from './layers/SMTLayer'
import KillZoneLayer from './layers/KillZoneLayer'
import AnalysisOverlayLayer from './layers/AnalysisOverlayLayer'
import OrderBlockLayer from './layers/OrderBlockLayer'
import IFVGLayer from './layers/IFVGLayer'
import BollingerLayer from './layers/BollingerLayer'
import SessionLayer from './layers/SessionLayer'
import InducementLayer from './layers/InducementLayer'
import JudasLayer from './layers/JudasLayer'
import WyckoffLayer from './layers/WyckoffLayer'
import ISMTLayer from './layers/ISMTLayer'
import RepricingLayer from './layers/RepricingLayer'
import OptionsLevelsLayer from './layers/OptionsLevelsLayer'
import HttLevelsLayer from './layers/HttLevelsLayer'
import DetailPanel from './DetailPanel'
import DrawingToolbar from './DrawingToolbar'
import ChartDrawingCanvas from './ChartDrawingCanvas'

interface Bar { time: number; open: number; high: number; low: number; close: number }
const toBar = (c: Bar) => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })

interface ChartState {
  chart: IChartApi
  candleSeries: ISeriesApi<'Candlestick'>
}

export default function TradingChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef    = useRef<ChartState | null>(null)

  // ✅ useState (not useRef) so re-render fires when chart is ready
  const [chartReady, setChartReady] = useState(false)
  const [candlesLoading, setCandlesLoading] = useState(false)
  const [candleError, setCandleError]       = useState(false)

  const [feed, setFeed] = useState<{ source: 'live' | 'delayed'; barTime: number; at: number } | null>(null)
  const [ohlc, setOhlc] = useState<{ o: number; h: number; l: number; c: number; time: string } | null>(null)
  const { symbol, timeframe, selectedAlertId, setSelectedAlert } = useMarketStore()

  // ── Init chart once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const el = containerRef.current
    const chart = createChart(el, {
      layout: {
        background: { color: '#0f1117' },
        textColor:  '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e2533' },
        horzLines: { color: '#1e2533' },
      },
      crosshair:       { mode: 1 },
      rightPriceScale: { borderColor: '#1e2533' },
      timeScale: {
        borderColor:    '#1e2533',
        timeVisible:    true,
        secondsVisible: false,
      },
      width:  el.clientWidth  || 800,
      height: el.clientHeight || 600,
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:      '#22c55e',
      downColor:    '#ef4444',
      borderVisible: false,
      wickUpColor:  '#22c55e',
      wickDownColor: '#ef4444',
    })

    chartRef.current = { chart, candleSeries }
    setChartReady(true)   // ✅ triggers re-render → layers mount

    chart.subscribeClick((param) => {
      if (!param.time) setSelectedAlert(null)
    })

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setOhlc(null)
        return
      }
      const bar = param.seriesData.get(candleSeries) as any
      if (!bar) { setOhlc(null); return }
      const d = new Date((param.time as number) * 1000)
      const timeStr = d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
      setOhlc({ o: bar.open, h: bar.high, l: bar.low, c: bar.close, time: timeStr })
    })

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      setChartReady(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fetch candles when symbol / timeframe changes, then keep them fresh ─────
  // טעינה מלאה פעם אחת, ואחריה רענון קצר כל כמה שניות: הנר האחרון מתעדכן ונרות חדשים מתווספים בלי להזיז את התצוגה.
  useEffect(() => {
    if (!chartReady || !chartRef.current) return

    const { candleSeries } = chartRef.current
    let alive = true
    let lastTime = 0
    candleSeries.setData([])
    setCandlesLoading(true)
    setCandleError(false)
    setFeed(null)

    // /api/candles is a Next.js route: Binance for crypto, Yahoo + real-time TradingView bars for NQ/ES
    const base = `/api/candles/${encodeURIComponent(symbol)}/${timeframe}`
    const get = (limit: number) => fetch(`${base}?limit=${limit}`, { cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return { candles: (await r.json()) as Bar[], source: r.headers.get('X-Candle-Source') }
    })
    const note = (candles: Bar[], source: string | null) => {
      const last = candles[candles.length - 1]
      if (last) setFeed({ source: source === 'delayed' ? 'delayed' : 'live', barTime: last.time, at: Date.now() })
    }

    get(300)
      .then(({ candles, source }) => {
        if (!alive || !chartRef.current) return
        chartRef.current.candleSeries.setData(candles.map(toBar))
        lastTime = candles.length ? candles[candles.length - 1].time : 0
        // ✅ Scroll chart to show the latest candles
        chartRef.current.chart.timeScale().fitContent()
        note(candles, source)
      })
      .catch((err) => {
        console.warn('candles fetch failed:', err)
        if (alive) setCandleError(true)
      })
      .finally(() => { if (alive) setCandlesLoading(false) })

    const everyMs = ['1m', '3m', '5m'].includes(timeframe) ? 5_000 : ['15m', '30m', '1h'].includes(timeframe) ? 15_000 : 60_000
    const id = setInterval(() => {
      if (document.hidden || !lastTime) return
      get(20)
        .then(({ candles, source }) => {
          if (!alive || !chartRef.current) return
          for (const c of candles) {
            if (c.time < lastTime) continue              // update() מקבל רק את הנר האחרון או נר חדש יותר
            chartRef.current.candleSeries.update(toBar(c))
            lastTime = c.time
          }
          note(candles, source)
          setCandleError(false)
        })
        .catch(() => { /* רענון שנכשל — מנסים שוב בסבב הבא */ })
    }, everyMs)

    return () => { alive = false; clearInterval(id) }
  }, [symbol, timeframe, chartReady])

  // "לפני כמה זמן התעדכן" — מתקתק פעם בשנייה רק כדי שהתווית תהיה נכונה
  const [, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id) }, [])
  const feedAge = feed ? Math.max(0, Math.round((Date.now() - feed.at) / 1000)) : 0
  const barAgeMin = feed ? Math.round((Date.now() / 1000 - feed.barTime) / 60) : 0

  const cs = chartReady ? chartRef.current : null

  return (
    <div className="relative w-full h-full">
      {/* Chart canvas — full size, toolbar floats on top */}
      <div ref={containerRef} className="chart-ltr w-full h-full" />

      {/* Drawing toolbar — floats on left, z-30 so it's above chart */}
      <DrawingToolbar />

      {/* מקור הנתונים ועדכניות: כדי שיהיה ברור אם הגרף חי או מעוכב */}
      {feed && !candlesLoading && (
        <div className={`absolute bottom-8 left-14 z-10 rounded-full border px-2.5 py-0.5 text-[10px] pointer-events-none
                         ${feed.source === 'delayed' ? 'bg-amber-950/90 border-amber-700 text-amber-300' : 'bg-gray-900/90 border-gray-700 text-gray-300'}`}>
          {feed.source === 'delayed'
            ? `⚠️ מקור מעוכב (Yahoo) · הנר האחרון מלפני ${barAgeMin} דק׳ · זמן אמת יגיע כשהתראות HTT Snapshot יפעלו`
            : `🟢 מתעדכן · נבדק לפני ${feedAge} שנ׳`}
        </div>
      )}

      {/* Loading indicator */}
      {candlesLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10
                        bg-gray-900/90 text-xs text-gray-300 px-3 py-1
                        rounded-full pointer-events-none border border-gray-700">
          ⏳ טוען נרות…
        </div>
      )}

      {/* Error — only show if not loading */}
      {candleError && !candlesLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10
                        bg-red-900/80 text-xs text-red-300 px-3 py-1
                        rounded-full pointer-events-none border border-red-700">
          ⚠️ שגיאה בטעינת נרות — בדוק את שם הנכס
        </div>
      )}

      {/* OHLC hover tooltip */}
      {ohlc && (
        <div className="absolute top-2 left-12 z-20 pointer-events-none
                        bg-gray-900/90 border border-gray-700 rounded px-2 py-1
                        text-[11px] font-mono flex gap-3 items-center">
          <span className="text-gray-400">{ohlc.time}</span>
          <span className="text-gray-300">O <span className="text-white">{ohlc.o.toLocaleString()}</span></span>
          <span className="text-gray-300">H <span className="text-green-400">{ohlc.h.toLocaleString()}</span></span>
          <span className="text-gray-300">L <span className="text-red-400">{ohlc.l.toLocaleString()}</span></span>
          <span className="text-gray-300">C <span className={ohlc.c >= ohlc.o ? 'text-green-400' : 'text-red-400'}>{ohlc.c.toLocaleString()}</span></span>
          <span className={`text-[10px] ${ohlc.c >= ohlc.o ? 'text-green-400' : 'text-red-400'}`}>
            {ohlc.c >= ohlc.o ? '▲' : '▼'} {(Math.abs(ohlc.c - ohlc.o) / ohlc.o * 100).toFixed(2)}%
          </span>
        </div>
      )}

      {/* Chart layers — mounted only after chart is ready */}
      {cs && (
        <>
          <FVGLayer            chart={cs.chart} series={cs.candleSeries} />
          <StructureLayer      chart={cs.chart} series={cs.candleSeries} />
          <RangeLayer          chart={cs.chart} series={cs.candleSeries} />
          <LiquidityLayer      chart={cs.chart} series={cs.candleSeries} />
          <SMTLayer            chart={cs.chart} series={cs.candleSeries} />
          <KillZoneLayer       chart={cs.chart} series={cs.candleSeries} />
          <AnalysisOverlayLayer chart={cs.chart} series={cs.candleSeries} />
          <OrderBlockLayer     chart={cs.chart} series={cs.candleSeries} />
          <IFVGLayer           chart={cs.chart} series={cs.candleSeries} />
          <BollingerLayer      chart={cs.chart} series={cs.candleSeries} />
          <SessionLayer        chart={cs.chart} series={cs.candleSeries} />
          <InducementLayer     chart={cs.chart} series={cs.candleSeries} />
          <JudasLayer          chart={cs.chart} series={cs.candleSeries} />
          <WyckoffLayer        chart={cs.chart} series={cs.candleSeries} />
          <ISMTLayer           chart={cs.chart} series={cs.candleSeries} />
          <RepricingLayer      chart={cs.chart} series={cs.candleSeries} />
          <OptionsLevelsLayer  chart={cs.chart} series={cs.candleSeries} />
          <HttLevelsLayer      chart={cs.chart} series={cs.candleSeries} />
          <ChartDrawingCanvas  chart={cs.chart} series={cs.candleSeries} />
        </>
      )}

      {selectedAlertId && (
        <DetailPanel alertId={selectedAlertId} onClose={() => setSelectedAlert(null)} />
      )}
    </div>
  )
}
