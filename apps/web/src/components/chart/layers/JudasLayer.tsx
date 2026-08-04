'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { useComputedLayers } from '@/hooks/useComputedLayers'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function JudasLayer({ chart, series }: Props) {
  const visible = useMarketStore(s => s.layers.judas)
  const data = useComputedLayers()
  const primsRef = useRef<any[]>([])

  useEffect(() => {
    primsRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primsRef.current = []

    if (!visible || !data?.judasSwings) return

    for (const js of data.judasSwings) {
      const isBull = js.direction === 'bullish'
      const color  = isBull ? '#f97316' : '#f97316'
      const sessionLabel = js.session === 'london' ? 'LON' : 'NY'

      const prim = {
        draw(ctx: CanvasRenderingContext2D) {
          try {
            const xStart = chart.timeScale().timeToCoordinate(js.startTime as any)
            const xPeak  = chart.timeScale().timeToCoordinate(js.peakTime as any)
            const yPeak  = series.priceToCoordinate(js.peakPrice)
            if (xStart == null || xPeak == null || yPeak == null) return

            ctx.save()
            ctx.strokeStyle = color
            ctx.lineWidth   = 1.5
            ctx.globalAlpha = 0.7
            ctx.setLineDash([4, 3])
            ctx.beginPath()
            ctx.moveTo(xStart, yPeak + (isBull ? 20 : -20))
            ctx.lineTo(xPeak, yPeak)
            ctx.stroke()
            ctx.setLineDash([])

            // Arrow at peak
            const arrowDir = isBull ? 1 : -1
            ctx.fillStyle   = color
            ctx.globalAlpha = 0.9
            ctx.beginPath()
            ctx.moveTo(xPeak,      yPeak)
            ctx.lineTo(xPeak - 5,  yPeak + arrowDir * 10)
            ctx.lineTo(xPeak + 5,  yPeak + arrowDir * 10)
            ctx.closePath()
            ctx.fill()

            // Label
            ctx.font      = 'bold 9px monospace'
            ctx.fillStyle = color
            ctx.fillText(`Judas ${sessionLabel}`, xPeak + 6, yPeak + 4)
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
