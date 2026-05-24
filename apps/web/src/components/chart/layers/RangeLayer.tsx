'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function RangeLayer({ chart, series }: Props) {
  const activeRange = useMarketStore(s => s.activeRange)
  const visible = useMarketStore(s => s.layers.range)
  const primitivesRef = useRef<any[]>([])

  useEffect(() => {
    primitivesRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primitivesRef.current = []

    if (!visible || !activeRange) return

    // Midpoint as horizontal line primitive (dashed gray)
    const midpointPrice = activeRange.midpoint
    const midlinePrim = {
      draw(ctx: CanvasRenderingContext2D) {
        try {
          const y = series.priceToCoordinate(midpointPrice)
          if (y === null) return
          const { width } = ctx.canvas
          ctx.save()
          ctx.strokeStyle = 'rgba(148,163,184,0.5)'
          ctx.lineWidth = 1
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
          ctx.stroke()
          ctx.restore()
        } catch {}
      },
      hitTest() { return null },
    }
    try {
      series.attachPrimitive(midlinePrim as any)
      primitivesRef.current.push(midlinePrim)
    } catch {}

    // Price band primitive for Premium / Discount zones
    const rangeCopy = { ...activeRange } as typeof activeRange
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
      primitivesRef.current.push(priceBand)
    } catch {}

    return () => {
      primitivesRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
      primitivesRef.current = []
    }
  }, [activeRange, visible, series])

  return null
}
