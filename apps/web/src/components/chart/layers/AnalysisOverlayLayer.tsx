'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function AnalysisOverlayLayer({ chart, series }: Props) {
  const analysisLayers = useMarketStore(s => s.analysisLayers)
  const timeframe = useMarketStore(s => s.timeframe)
  const primitivesRef = useRef<any[]>([])

  useEffect(() => {
    // Remove old primitives
    primitivesRef.current.forEach(p => {
      try { series.detachPrimitive(p) } catch {}
    })
    primitivesRef.current = []

    if (!analysisLayers.length) return

    // Find the drawing layer that matches the current timeframe
    const layer = analysisLayers.find(l => l.tf === timeframe)
      ?? analysisLayers.find(l => l.tf === '1h')   // fallback
    if (!layer) return

    // ── FVG Boxes ─────────────────────────────────────────────────────────────
    layer.fvgBoxes.slice(0, 6).forEach(fvg => {
      const fillColor   = fvg.direction === 'bullish' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'
      const borderColor = fvg.direction === 'bullish' ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'

      const prim = makePriceBandPrimitive(series, fvg.top, fvg.bottom, fillColor, borderColor)
      try { series.attachPrimitive(prim as any); primitivesRef.current.push(prim) } catch {}
    })

    // ── Breaker Block Boxes ────────────────────────────────────────────────────
    layer.breakerBoxes.slice(0, 4).forEach(bb => {
      const fillColor   = bb.direction === 'bullish' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'
      const borderColor = bb.direction === 'bullish' ? 'rgba(34,197,94,0.6)'  : 'rgba(239,68,68,0.6)'

      const prim = makePriceBandPrimitive(series, bb.top, bb.bottom, fillColor, borderColor, [6, 3])
      try { series.attachPrimitive(prim as any); primitivesRef.current.push(prim) } catch {}
    })

    // ── Horizontal Lines (PDH/PDL/PWH/PWL/VWAP/EQH/EQL) ──────────────────────
    layer.horizontalLines.forEach(line => {
      const prim = makeHLinePrimitive(series, line.price, line.color, line.label, line.dash)
      try { series.attachPrimitive(prim as any); primitivesRef.current.push(prim) } catch {}
    })

    return () => {
      primitivesRef.current.forEach(p => {
        try { series.detachPrimitive(p) } catch {}
      })
    }
  }, [analysisLayers, timeframe, series])

  return null
}

// ─── Primitive factories ──────────────────────────────────────────────────────

function makePriceBandPrimitive(
  series: ISeriesApi<'Candlestick'>,
  top: number,
  bottom: number,
  fillColor: string,
  borderColor: string,
  dashPattern: number[] = [],
) {
  return {
    draw(ctx: CanvasRenderingContext2D) {
      try {
        const topY = series.priceToCoordinate(top)
        const botY = series.priceToCoordinate(bottom)
        if (topY === null || botY === null) return
        const { width } = ctx.canvas
        ctx.save()
        ctx.fillStyle = fillColor
        ctx.fillRect(0, Math.min(topY, botY), width, Math.abs(topY - botY))
        ctx.strokeStyle = borderColor
        ctx.lineWidth = 1
        if (dashPattern.length) ctx.setLineDash(dashPattern)
        ctx.strokeRect(0, Math.min(topY, botY), width, Math.abs(topY - botY))
        ctx.restore()
      } catch {}
    },
    hitTest() { return null },
  }
}

function makeHLinePrimitive(
  series: ISeriesApi<'Candlestick'>,
  price: number,
  color: string,
  label: string,
  dash: boolean,
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
        ctx.globalAlpha = 0.75
        if (dash) ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()

        // Label
        ctx.globalAlpha = 0.9
        ctx.font = '10px monospace'
        ctx.fillStyle = color
        ctx.fillText(label, width - 44, y - 3)
        ctx.restore()
      } catch {}
    },
    hitTest() { return null },
  }
}
