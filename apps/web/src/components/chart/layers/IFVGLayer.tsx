'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { useComputedLayers } from '@/hooks/useComputedLayers'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function IFVGLayer({ chart, series }: Props) {
  const visible = useMarketStore(s => s.layers.ifvg)
  const data = useComputedLayers()
  const primsRef = useRef<any[]>([])

  useEffect(() => {
    primsRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primsRef.current = []

    if (!visible || !data?.iFVGs) return

    for (const fvg of data.iFVGs) {
      // iFVG flips polarity: a filled bullish FVG becomes resistance (bearish zone)
      const isNowBull = fvg.originalDirection === 'bearish'
      const color  = isNowBull ? 'rgba(20,184,166,0.12)'  : 'rgba(217,70,239,0.12)'
      const border = isNowBull ? 'rgba(20,184,166,0.7)'   : 'rgba(217,70,239,0.7)'
      const label  = isNowBull ? 'iFVG ▲' : 'iFVG ▼'

      const prim = {
        draw(ctx: CanvasRenderingContext2D) {
          try {
            const y1 = series.priceToCoordinate(fvg.high)
            const y2 = series.priceToCoordinate(fvg.low)
            const x  = chart.timeScale().timeToCoordinate(fvg.candleTime as any)
            if (y1 == null || y2 == null) return

            const top = Math.min(y1, y2)
            const h   = Math.abs(y1 - y2)
            const startX = x != null ? Math.max(x, 0) : 0
            const w   = ctx.canvas.width

            ctx.save()
            ctx.setLineDash([4, 3])
            ctx.fillStyle   = color
            ctx.fillRect(startX, top, w - startX, h)
            ctx.strokeStyle = border
            ctx.lineWidth   = 1
            ctx.strokeRect(startX, top, w - startX, h)
            ctx.setLineDash([])

            ctx.font      = 'bold 9px monospace'
            ctx.fillStyle = border
            ctx.globalAlpha = 0.9
            ctx.fillText(label, w - 44, top + h / 2 + 3)
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
