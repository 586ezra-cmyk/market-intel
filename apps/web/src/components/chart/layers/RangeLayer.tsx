'use client'

import { useEffect, useRef } from 'react'
import { LineSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function RangeLayer({ chart, series }: Props) {
  const activeRange = useMarketStore(s => s.activeRange)
  const visible = useMarketStore(s => s.layers.range)
  const midlineRef = useRef<any>(null)
  const primitiveRef = useRef<any>(null)

  useEffect(() => {
    if (midlineRef.current) {
      try { chart.removeSeries(midlineRef.current) } catch {}
      midlineRef.current = null
    }
    if (primitiveRef.current) {
      try { series.detachPrimitive(primitiveRef.current) } catch {}
      primitiveRef.current = null
    }

    if (!visible || !activeRange) return

    // Midpoint line — LW Charts v5: addSeries with seriesType 'Line'
    try {
      const midline = chart.addSeries(LineSeries, {
        color: 'rgba(59,130,246,0.5)',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }) as any

      const t = Math.floor(activeRange.startTime / 1000) as any
      midline.setData([{ time: t, value: activeRange.midpoint }])
      midlineRef.current = midline
    } catch {}

    // Price band primitive for Premium / Discount zones
    const rangeCopy = { ...activeRange }
    const priceBand = {
      draw(ctx: CanvasRenderingContext2D) {
        try {
          const highY = series.priceToCoordinate(rangeCopy.high)
          const midY  = series.priceToCoordinate(rangeCopy.midpoint)
          const lowY  = series.priceToCoordinate(rangeCopy.low)
          if (highY === null || midY === null || lowY === null) return
          const { width } = ctx.canvas
          ctx.save()
          ctx.fillStyle = 'rgba(220,50,50,0.04)'
          ctx.fillRect(0, Math.min(highY, midY), width, Math.abs(highY - midY))
          ctx.fillStyle = 'rgba(50,180,50,0.04)'
          ctx.fillRect(0, Math.min(midY, lowY), width, Math.abs(midY - lowY))
          ctx.strokeStyle = 'rgba(59,130,246,0.25)'
          ctx.lineWidth = 1
          ctx.strokeRect(0, Math.min(highY, lowY), width, Math.abs(highY - lowY))
          ctx.restore()
        } catch {}
      },
      hitTest() { return null },
    }

    try {
      series.attachPrimitive(priceBand as any)
      primitiveRef.current = priceBand
    } catch {}

    return () => {
      if (midlineRef.current) {
        try { chart.removeSeries(midlineRef.current) } catch {}
        midlineRef.current = null
      }
      if (primitiveRef.current) {
        try { series.detachPrimitive(primitiveRef.current) } catch {}
        primitiveRef.current = null
      }
    }
  }, [activeRange, visible, chart, series])

  return null
}
