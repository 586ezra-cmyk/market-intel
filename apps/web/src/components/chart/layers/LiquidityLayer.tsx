'use client'

import { useEffect, useRef } from 'react'
import { LineSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function LiquidityLayer({ chart, series }: Props) {
  const liquidities = useMarketStore(s => s.liquidities)
  const visible = useMarketStore(s => s.layers.liquidity)
  const linesRef = useRef<Map<string, any>>(new Map())

  useEffect(() => {
    linesRef.current.forEach(line => { try { chart.removeSeries(line) } catch {} })
    linesRef.current.clear()

    if (!visible) return

    const active = liquidities.filter(l => !l.swept).slice(0, 30)

    active.forEach(liq => {
      try {
        // LW Charts v5: addSeries with seriesType 'Line'
        const line = chart.addSeries(LineSeries, {
          color: 'rgba(250,200,50,0.7)',
          lineWidth: 1,
          lineStyle: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          title: liq.type.replace(/_/g, ' ').toUpperCase(),
          crosshairMarkerVisible: false,
        }) as any

        const t = Math.floor(liq.firstTime / 1000) as any
        line.setData([{ time: t, value: liq.price }])
        linesRef.current.set(liq.id, line)
      } catch {}
    })

    return () => {
      linesRef.current.forEach(line => { try { chart.removeSeries(line) } catch {} })
      linesRef.current.clear()
    }
  }, [liquidities, visible, chart])

  return null
}
