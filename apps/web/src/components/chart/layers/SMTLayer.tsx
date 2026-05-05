'use client'

import { useEffect, useRef } from 'react'
import { LineSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function SMTLayer({ chart, series }: Props) {
  const smtSignals = useMarketStore(s => s.smtSignals)
  const visible = useMarketStore(s => s.layers.smt)
  const markersRef = useRef<any[]>([])

  useEffect(() => {
    // Remove old marker series
    markersRef.current.forEach(s2 => { try { chart.removeSeries(s2) } catch {} })
    markersRef.current = []

    if (!visible || smtSignals.length === 0) return

    // LW Charts v5 removed setMarkers from series.
    // Use a separate Line series at the signal price as visual indicator.
    smtSignals.slice(0, 20).forEach(smt => {
      try {
        const isBull = smt.type === 'bullish_smt'
        const s2 = chart.addSeries(LineSeries, {
          color: '#ec4899',
          lineWidth: 1,
          lineStyle: 3,
          priceLineVisible: false,
          lastValueVisible: true,
          title: isBull ? '⚡ SMT Bull' : '⚡ SMT Bear',
          crosshairMarkerVisible: true,
        }) as any

        const t = Math.floor(smt.time / 1000) as any
        const price = isBull ? smt.asset1Price : smt.asset1Price
        s2.setData([{ time: t, value: price }])
        markersRef.current.push(s2)
      } catch {}
    })

    return () => {
      markersRef.current.forEach(s2 => { try { chart.removeSeries(s2) } catch {} })
      markersRef.current = []
    }
  }, [smtSignals, visible, chart])

  return null
}
