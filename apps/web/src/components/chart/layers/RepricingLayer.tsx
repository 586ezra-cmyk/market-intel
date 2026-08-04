'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { useComputedLayers } from '@/hooks/useComputedLayers'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function RepricingLayer({ chart, series }: Props) {
  const visible = useMarketStore(s => s.layers.repricing)
  const data = useComputedLayers()
  const primsRef = useRef<any[]>([])

  useEffect(() => {
    primsRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primsRef.current = []

    if (!visible || !data?.repricingZones) return

    // Show closest 8 repricing zones
    for (const zone of data.repricingZones.slice(0, 8)) {
      const isBull = zone.direction === 'bullish'
      const color  = isBull ? 'rgba(6,182,212,0.12)'  : 'rgba(6,182,212,0.12)'
      const border = 'rgba(6,182,212,0.5)'
      const typeLabel = zone.type === 'ob' ? 'OB' : 'FVG'
      const label  = `↩ ${typeLabel}`

      const prim = {
        draw(ctx: CanvasRenderingContext2D) {
          try {
            const y1 = series.priceToCoordinate(zone.high)
            const y2 = series.priceToCoordinate(zone.low)
            if (y1 == null || y2 == null) return

            const top = Math.min(y1, y2)
            const h   = Math.max(Math.abs(y1 - y2), 2)
            const w   = ctx.canvas.width

            ctx.save()
            ctx.setLineDash([2, 4])
            ctx.fillStyle   = color
            ctx.fillRect(0, top, w, h)
            ctx.strokeStyle = border
            ctx.lineWidth   = 1
            ctx.strokeRect(0, top, w, h)
            ctx.setLineDash([])

            ctx.font      = '8px monospace'
            ctx.fillStyle = border
            ctx.globalAlpha = 0.9
            ctx.fillText(`${label} ${zone.distance.toFixed(1)}%`, 4, top + h / 2 + 3)
            ctx.restore()
          } catch {}
        },
        hitTest() { return null },
      }
      series.attachPrimitive(prim as any)
      primsRef.current.push(prim)
    }

    return () => {
      primsRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
      primsRef.current = []
    }
  }, [visible, data, series, chart])

  return null
}
