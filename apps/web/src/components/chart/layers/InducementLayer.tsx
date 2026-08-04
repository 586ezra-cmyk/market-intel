'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { useComputedLayers } from '@/hooks/useComputedLayers'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function InducementLayer({ chart, series }: Props) {
  const visible = useMarketStore(s => s.layers.inducement)
  const data = useComputedLayers()
  const primsRef = useRef<any[]>([])

  useEffect(() => {
    primsRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primsRef.current = []

    if (!visible || !data?.swingPoints) return

    // Show only unswept swing points as inducement targets
    const unswept = data.swingPoints.filter((sp: any) => !sp.isSwept)

    for (const sp of unswept) {
      const isHigh  = sp.type === 'high'
      const color   = isHigh ? '#ef4444' : '#22c55e'
      const label   = isHigh ? '⚡IDM H' : '⚡IDM L'

      const prim = {
        draw(ctx: CanvasRenderingContext2D) {
          try {
            const y = series.priceToCoordinate(sp.price)
            const x = chart.timeScale().timeToCoordinate(sp.time as any)
            if (y == null || x == null) return
            const w = ctx.canvas.width

            ctx.save()
            ctx.strokeStyle = color
            ctx.lineWidth   = 1
            ctx.globalAlpha = 0.6
            ctx.setLineDash([3, 5])
            ctx.beginPath()
            ctx.moveTo(x, y)
            ctx.lineTo(w, y)
            ctx.stroke()
            ctx.setLineDash([])

            // Diamond marker
            ctx.globalAlpha = 0.9
            ctx.fillStyle   = color
            ctx.beginPath()
            ctx.moveTo(x,     y - 5)
            ctx.lineTo(x + 4, y)
            ctx.lineTo(x,     y + 5)
            ctx.lineTo(x - 4, y)
            ctx.closePath()
            ctx.fill()

            ctx.font      = '8px monospace'
            ctx.fillStyle = color
            ctx.fillText(label, x + 6, y + 3)
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
