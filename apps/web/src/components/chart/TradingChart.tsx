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
import DetailPanel from './DetailPanel'
import DrawingToolbar from './DrawingToolbar'
import ChartDrawingCanvas from './ChartDrawingCanvas'

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

  // ── Fetch candles when symbol / timeframe changes ──────────────────────────
  useEffect(() => {
    if (!chartReady || !chartRef.current) return

    const { candleSeries, chart } = chartRef.current
    candleSeries.setData([])
    setCandlesLoading(true)
    setCandleError(false)

    // /api/candles is a Next.js route that fetches from Binance directly
    const url = `/api/candles/${encodeURIComponent(symbol)}/${timeframe}?limit=300`

    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((candles: Array<{ time: number; open: number; high: number; low: number; close: number }>) => {
        if (!chartRef.current) return
        chartRef.current.candleSeries.setData(
          candles.map(c => ({
            time:  c.time as any,
            open:  c.open,
            high:  c.high,
            low:   c.low,
            close: c.close,
          }))
        )
        // ✅ Scroll chart to show the latest candles
        chartRef.current.chart.timeScale().fitContent()
      })
      .catch((err) => {
        console.warn('candles fetch failed:', err)
        setCandleError(true)
      })
      .finally(() => setCandlesLoading(false))
  }, [symbol, timeframe, chartReady])

  const cs = chartReady ? chartRef.current : null

  return (
    <div className="relative w-full h-full">
      {/* Chart canvas — full size, toolbar floats on top */}
      <div ref={containerRef} className="chart-ltr w-full h-full" />

      {/* Drawing toolbar — floats on left, z-30 so it's above chart */}
      <DrawingToolbar />

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
          <ChartDrawingCanvas  chart={cs.chart} series={cs.candleSeries} />
        </>
      )}

      {selectedAlertId && (
        <DetailPanel alertId={selectedAlertId} onClose={() => setSelectedAlert(null)} />
      )}
    </div>
  )
}
