'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { useComputedLayers } from '@/hooks/useComputedLayers'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

const SESSION_COLORS: Record<string, string> = {
  london: '#3b82f6',
  ny:     '#f59e0b',
  asia:   '#a855f7',
}

export default function SessionLayer({ chart: _chart, series }: Props) {
  const visible = useMarketStore(s => s.layers.session)
  const data = useComputedLayers()
  const primsRef = useRef<any[]>([])

  useEffect(() => {
    primsRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primsRef.current = []

    if (!visible || !data?.sessionHL) return

    for (const s of data.sessionHL) {
      const color = SESSION_COLORS[s.session] ?? '#64748b'
      const sessionName = s.session === 'london' ? 'LON' : s.session === 'ny' ? 'NY' : 'ASIA'
      const isCurrent = s.isCurrent

      const makeHLine = (price: number, isHigh: boolean) => ({
        draw(ctx: CanvasRenderingContext2D) {
          try {
            const y = series.priceToCoordinate(price)
            if (y == null) return
            const w = ctx.canvas.width
            ctx.save()
            ctx.strokeStyle = color
            ctx.lineWidth   = isCurrent ? 1.5 : 1
            ctx.globalAlpha = isCurrent ? 0.8 : 0.4
            ctx.setLineDash(isCurrent ? [] : [6, 4])
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(w, y)
            ctx.stroke()
            ctx.setLineDash([])

            // Label
            const lbl = `${sessionName} ${isHigh ? 'H' : 'L'}`
            ctx.font      = '9px monospace'
            ctx.fillStyle = color
            ctx.globalAlpha = 0.85
            ctx.fillText(lbl, 4, y - 3)
            ctx.restore()
          } catch {}
        },
        hitTest() { return null },
      })

      const ph = makeHLine(s.high, true)
      const pl = makeHLine(s.low, false)
      series.attachPrimitive(ph as any)
      series.attachPrimitive(pl as any)
      primsRef.current.push(ph, pl)
    }

    return () => {
      primsRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
      primsRef.current = []
    }
  }, [visible, data, series])

  return null
}
