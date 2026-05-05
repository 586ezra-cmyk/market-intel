'use client'

import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { useApi } from '@/hooks/useApi'
import FVGLayer from './layers/FVGLayer'
import StructureLayer from './layers/StructureLayer'
import RangeLayer from './layers/RangeLayer'
import LiquidityLayer from './layers/LiquidityLayer'
import SMTLayer from './layers/SMTLayer'
import KillZoneLayer from './layers/KillZoneLayer'
import DetailPanel from './DetailPanel'

interface ChartState {
  chart: IChartApi
  candleSeries: ISeriesApi<'Candlestick'>
}

export default function TradingChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ChartState | null>(null)
  const forceRef = useRef(0) // to trigger re-render when chart is ready
  const { symbol, timeframe, selectedAlertId, setSelectedAlert } = useMarketStore()

  useApi<any>(
    `/api/market/${encodeURIComponent(symbol)}/${timeframe}/state`,
    [symbol, timeframe],
  )

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0f1117' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e2533' },
        horzLines: { color: '#1e2533' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#1e2533' },
      timeScale: {
        borderColor: '#1e2533',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })

    // LW Charts v5: addSeries(SeriesDefinition, options)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    chartRef.current = { chart, candleSeries }
    forceRef.current += 1

    chart.subscribeClick((param) => {
      if (!param.time) {
        setSelectedAlert(null)
      }
    })

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.candleSeries.setData([])
  }, [symbol, timeframe])

  const cs = chartRef.current

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="chart-ltr w-full h-full" />

      {cs && (
        <>
          <FVGLayer chart={cs.chart} series={cs.candleSeries} />
          <StructureLayer chart={cs.chart} series={cs.candleSeries} />
          <RangeLayer chart={cs.chart} series={cs.candleSeries} />
          <LiquidityLayer chart={cs.chart} series={cs.candleSeries} />
          <SMTLayer chart={cs.chart} series={cs.candleSeries} />
          <KillZoneLayer chart={cs.chart} series={cs.candleSeries} />
        </>
      )}

      {selectedAlertId && (
        <DetailPanel alertId={selectedAlertId} onClose={() => setSelectedAlert(null)} />
      )}
    </div>
  )
}
