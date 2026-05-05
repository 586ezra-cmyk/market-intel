'use client'

import { useEffect, useRef } from 'react'
import { LineSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function StructureLayer({ chart, series }: Props) {
  const structures = useMarketStore(s => s.structures)
  const visible = useMarketStore(s => s.layers.structure)
  const linesRef = useRef<any[]>([])

  useEffect(() => {
    // Remove old lines
    linesRef.current.forEach(l => { try { chart.removeSeries(l) } catch {} })
    linesRef.current = []

    if (!visible || structures.length === 0) return

    // LW Charts v5: use line series with price lines for BOS/CHoCH
    structures.slice(0, 30).forEach(st => {
      try {
        const color = st.direction === 'bullish' ? '#22c55e' : '#ef4444'
        const s2 = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: st.type,
          crosshairMarkerVisible: false,
        })

        const t = Math.floor(st.time / 1000) as any
        ;(s2 as any).setData([{ time: t, value: st.price }])
        linesRef.current.push(s2)
      } catch {}
    })

    return () => {
      linesRef.current.forEach(l => { try { chart.removeSeries(l) } catch {} })
      linesRef.current = []
    }
  }, [structures, visible, chart])

  return null
}
