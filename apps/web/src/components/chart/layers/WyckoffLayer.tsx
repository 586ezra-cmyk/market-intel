'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { useComputedLayers } from '@/hooks/useComputedLayers'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

const PHASE_COLORS: Record<string, string> = {
  accumulation: '#22c55e',
  distribution: '#ef4444',
  markup:       '#3b82f6',
  markdown:     '#f43f5e',
  spring:       '#10b981',
  upthrust:     '#f97316',
}

export default function WyckoffLayer({ chart, series }: Props) {
  const visible = useMarketStore(s => s.layers.wyckoff)
  const data = useComputedLayers()
  const primsRef = useRef<any[]>([])

  useEffect(() => {
    primsRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primsRef.current = []

    if (!visible || !data?.wyckoffLabels) return

    for (const wl of data.wyckoffLabels) {
      const color = PHASE_COLORS[wl.phase] ?? '#94a3b8'

      const prim = {
        draw(ctx: CanvasRenderingContext2D) {
          try {
            const x = chart.timeScale().timeToCoordinate(wl.time as any)
            const y = series.priceToCoordinate(wl.price)
            if (x == null || y == null) return

            ctx.save()
            ctx.font = 'bold 11px sans-serif'
            const tw  = ctx.measureText(wl.label).width
            const pad = 4
            const bw  = tw + pad * 2
            const bh  = 16

            ctx.globalAlpha = 0.85
            ctx.fillStyle   = '#111827'
            ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh)
            ctx.strokeStyle = color
            ctx.lineWidth   = 1.5
            ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh)

            ctx.globalAlpha = 1
            ctx.fillStyle   = color
            ctx.fillText(wl.label, x - bw / 2 + pad, y + 4)
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
