'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function FVGLayer({ chart, series }: Props) {
  const fvgs = useMarketStore(s => s.fvgs)
  const visible = useMarketStore(s => s.layers.fvg)
  const primitivesRef = useRef<Map<string, any>>(new Map())

  useEffect(() => {
    // Remove old primitives
    primitivesRef.current.forEach((prim) => {
      try { series.detachPrimitive(prim) } catch {}
    })
    primitivesRef.current.clear()

    if (!visible) return

    const activeFVGs = fvgs.filter(f => f.isActive)

    activeFVGs.forEach(fvg => {
      // Create a price band primitive for each FVG
      const color = fvg.direction === 'bullish'
        ? 'rgba(50,205,50,0.07)'
        : 'rgba(220,50,50,0.07)'
      const borderColor = fvg.direction === 'bullish'
        ? 'rgba(50,205,50,0.4)'
        : 'rgba(220,50,50,0.4)'

      // LW Charts v5 primitive (price band)
      const primitive = {
        draw(ctx: CanvasRenderingContext2D, params: any) {
          try {
            const topY = series.priceToCoordinate(fvg.topPrice)
            const botY = series.priceToCoordinate(fvg.bottomPrice)
            if (topY === null || botY === null) return

            const { width } = ctx.canvas
            ctx.save()
            ctx.fillStyle = color
            ctx.fillRect(0, Math.min(topY, botY), width, Math.abs(topY - botY))
            ctx.strokeStyle = borderColor
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.strokeRect(0, Math.min(topY, botY), width, Math.abs(topY - botY))
            ctx.restore()
          } catch {}
        },
        hitTest() { return null },
      }

      try {
        series.attachPrimitive(primitive as any)
        primitivesRef.current.set(fvg.id, primitive)
      } catch {}
    })

    return () => {
      primitivesRef.current.forEach(p => {
        try { series.detachPrimitive(p) } catch {}
      })
    }
  }, [fvgs, visible, chart, series])

  return null
}
