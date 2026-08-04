'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { useComputedLayers } from '@/hooks/useComputedLayers'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function OrderBlockLayer({ chart, series }: Props) {
  const visible = useMarketStore(s => s.layers.ob)
  const data = useComputedLayers()
  const primsRef = useRef<any[]>([])

  useEffect(() => {
    primsRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primsRef.current = []

    if (!visible || !data?.orderBlocks) return

    for (const ob of data.orderBlocks) {
      const isBull = ob.direction === 'bullish'
      const color  = isBull ? 'rgba(34,197,94,0.15)'  : 'rgba(239,68,68,0.15)'
      const border = isBull ? 'rgba(34,197,94,0.6)'   : 'rgba(239,68,68,0.6)'
      const label  = isBull ? 'OB ▲' : 'OB ▼'

      const prim = {
        draw(ctx: CanvasRenderingContext2D) {
          try {
            const y1 = series.priceToCoordinate(ob.high)
            const y2 = series.priceToCoordinate(ob.low)
            const x  = chart.timeScale().timeToCoordinate(ob.time as any)
            if (y1 == null || y2 == null || x == null) return

            const top = Math.min(y1, y2)
            const h   = Math.abs(y1 - y2)
            const w   = ctx.canvas.width

            ctx.save()
            ctx.fillStyle   = color
            ctx.fillRect(x, top, w - x, h)
            ctx.strokeStyle = border
            ctx.lineWidth   = 1
            ctx.strokeRect(x, top, w - x, h)

            ctx.font      = 'bold 9px monospace'
            ctx.fillStyle = border
            ctx.globalAlpha = 0.9
            ctx.fillText(label, w - 36, top + h / 2 + 3)
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
