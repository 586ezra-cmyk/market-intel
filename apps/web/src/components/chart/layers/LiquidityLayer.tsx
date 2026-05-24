'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

function makeHorizontalLine(
  series: ISeriesApi<'Candlestick'>,
  price: number,
  color: string,
  label: string,
) {
  return {
    draw(ctx: CanvasRenderingContext2D) {
      try {
        const y = series.priceToCoordinate(price)
        if (y === null) return
        const { width } = ctx.canvas
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.globalAlpha = 0.7
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()

        // Label on the right edge
        ctx.setLineDash([])
        ctx.font = 'bold 9px monospace'
        const tw = ctx.measureText(label).width
        const pad = 3
        const bw = tw + pad * 2
        const bh = 13
        const bx = width - bw - 2
        const by = y - bh / 2
        ctx.globalAlpha = 0.85
        ctx.fillStyle = '#111827'
        ctx.fillRect(bx, by, bw, bh)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.strokeRect(bx, by, bw, bh)
        ctx.globalAlpha = 1
        ctx.fillStyle = color
        ctx.fillText(label, bx + pad, by + bh - 3)
        ctx.restore()
      } catch {}
    },
    hitTest() { return null },
  }
}

export default function LiquidityLayer({ chart, series }: Props) {
  const liquidities = useMarketStore(s => s.liquidities)
  const visible = useMarketStore(s => s.layers.liquidity)
  const primitivesRef = useRef<Map<string, any>>(new Map())

  useEffect(() => {
    primitivesRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primitivesRef.current.clear()

    if (!visible) return

    const active = liquidities.filter(l => !l.swept).slice(0, 30)

    active.forEach(liq => {
      try {
        const color = '#f59e0b'
        // type is e.g. 'equal_highs' → 'EQH', 'equal_lows' → 'EQL'
        const label = liq.type.includes('high') ? 'EQH' : 'EQL'
        const prim = makeHorizontalLine(series, liq.price, color, label)
        series.attachPrimitive(prim as any)
        primitivesRef.current.set(liq.id, prim)
      } catch {}
    })

    return () => {
      primitivesRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
      primitivesRef.current.clear()
    }
  }, [liquidities, visible, series])

  return null
}
