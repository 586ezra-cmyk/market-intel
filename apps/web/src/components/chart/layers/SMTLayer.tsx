'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

function makeSmtMarker(
  series: ISeriesApi<'Candlestick'>,
  price: number,
  label: string,
  color: string,
) {
  return {
    draw(ctx: CanvasRenderingContext2D) {
      try {
        const y = series.priceToCoordinate(price)
        if (y === null) return
        const { width } = ctx.canvas
        ctx.save()

        // Dashed horizontal line
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.globalAlpha = 0.65
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()

        // Badge on right
        ctx.setLineDash([])
        ctx.font = 'bold 10px sans-serif'
        const tw = ctx.measureText(label).width
        const pad = 4
        const bw = tw + pad * 2
        const bh = 16
        const bx = width - bw - 60
        const by = y - bh / 2

        ctx.globalAlpha = 0.9
        ctx.fillStyle = '#1a1230'
        ctx.fillRect(bx, by, bw, bh)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.9
        ctx.strokeRect(bx, by, bw, bh)

        ctx.globalAlpha = 1
        ctx.fillStyle = color
        ctx.fillText(label, bx + pad, by + bh - 4)
        ctx.restore()
      } catch {}
    },
    hitTest() { return null },
  }
}

export default function SMTLayer({ chart, series }: Props) {
  const smtSignals = useMarketStore(s => s.smtSignals)
  const visible = useMarketStore(s => s.layers.smt)
  const primitivesRef = useRef<any[]>([])

  useEffect(() => {
    primitivesRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primitivesRef.current = []

    if (!visible || smtSignals.length === 0) return

    smtSignals.slice(0, 20).forEach(smt => {
      try {
        const isBull = smt.type === 'bullish_smt'
        const color = '#ec4899'
        const label = isBull ? '⚡ SMT Bull' : '⚡ SMT Bear'
        // Fix: bullish divergence → use asset1Price; bearish → use asset2Price
        const price = isBull ? smt.asset1Price : (smt.asset2Price ?? smt.asset1Price)
        const prim = makeSmtMarker(series, price, label, color)
        series.attachPrimitive(prim as any)
        primitivesRef.current.push(prim)
      } catch {}
    })

    return () => {
      primitivesRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
      primitivesRef.current = []
    }
  }, [smtSignals, visible, series])

  return null
}
