'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { useComputedLayers } from '@/hooks/useComputedLayers'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function ISMTLayer({ chart, series }: Props) {
  const visible = useMarketStore(s => s.layers.ismt)
  const data = useComputedLayers()
  const primsRef = useRef<any[]>([])

  useEffect(() => {
    primsRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primsRef.current = []

    if (!visible || !data?.ismtDivergences) return

    for (const pt of data.ismtDivergences) {
      const isBull = pt.direction === 'bullish'
      const color  = isBull ? '#22c55e' : '#ef4444'
      const label  = isBull ? 'iSMT▲' : 'iSMT▼'

      const prim = {
        draw(ctx: CanvasRenderingContext2D) {
          try {
            const x = chart.timeScale().timeToCoordinate(pt.time as any)
            const y = series.priceToCoordinate(pt.price)
            if (x == null || y == null) return

            ctx.save()
            const offsetY = isBull ? 12 : -12

            // Circle marker
            ctx.globalAlpha = 0.85
            ctx.strokeStyle = color
            ctx.fillStyle   = color + '33'
            ctx.lineWidth   = 1.5
            ctx.beginPath()
            ctx.arc(x, y + offsetY, 6, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()

            ctx.font      = 'bold 8px monospace'
            ctx.fillStyle = color
            ctx.globalAlpha = 1
            ctx.fillText(label, x + 8, y + offsetY + 3)
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
