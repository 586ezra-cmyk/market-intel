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

    // Match current timeframe, fallback to 1h
    const layer = analysisLayers.find(l => l.tf === timeframe)
      ?? analysisLayers.find(l => l.tf === '1h')
    if (!layer) return

    const attach = (prim: any) => {
      try { series.attachPrimitive(prim); primitivesRef.current.push(prim) } catch {}
    }

    // ── FVG Boxes ─────────────────────────────────────────────────────────────
    layer.fvgBoxes.slice(0, 6).forEach(fvg => {
      const fill   = fvg.direction === 'bullish' ? 'rgba(34,197,94,0.08)'  : 'rgba(239,68,68,0.08)'
      const border = fvg.direction === 'bullish' ? 'rgba(34,197,94,0.45)'  : 'rgba(239,68,68,0.45)'
      attach(makePriceBand(series, fvg.top, fvg.bottom, fill, border))
    })

    // ── Breaker Block Boxes ────────────────────────────────────────────────────
    layer.breakerBoxes.slice(0, 4).forEach(bb => {
      const fill   = bb.direction === 'bullish' ? 'rgba(34,197,94,0.13)'  : 'rgba(239,68,68,0.13)'
      const border = bb.direction === 'bullish' ? 'rgba(34,197,94,0.65)'  : 'rgba(239,68,68,0.65)'
      attach(makePriceBand(series, bb.top, bb.bottom, fill, border, [6, 3]))
    })

    // ── Order Block Boxes ─────────────────────────────────────────────────────
    layer.obBoxes.slice(0, 6).forEach(ob => {
      // Broken OBs: dimmer, dashed border
      if (ob.broken) {
        const fill   = ob.direction === 'bullish' ? 'rgba(34,197,94,0.04)'  : 'rgba(239,68,68,0.04)'
        const border = ob.direction === 'bullish' ? 'rgba(34,197,94,0.25)'  : 'rgba(239,68,68,0.25)'
        attach(makePriceBand(series, ob.top, ob.bottom, fill, border, [3, 4]))
      } else {
        const fill   = ob.direction === 'bullish' ? 'rgba(34,197,94,0.15)'  : 'rgba(239,68,68,0.15)'
        const border = ob.direction === 'bullish' ? 'rgba(34,197,94,0.75)'  : 'rgba(239,68,68,0.75)'
        attach(makePriceBand(series, ob.top, ob.bottom, fill, border))
      }
    })

    // ── OTE (Fibonacci 62–79% zone) ───────────────────────────────────────────
    if (layer.oteBox) {
      const ote = layer.oteBox
      attach(makePriceBand(series, ote.high, ote.low, 'rgba(245,158,11,0.10)', 'rgba(245,158,11,0.55)', [4, 3]))
      // 0.705 level as a solid amber line
      attach(makeHLine(series, ote.level705, '#f59e0b', 'OTE 0.705', false))
    }

    // ── Horizontal Lines (PDH/PDL/PWH/PWL/VWAP/EQH/EQL/Range) ────────────────
    layer.horizontalLines.forEach(line => {
      attach(makeHLine(series, line.price, line.color, line.label, line.dash))
    })

    // ── Wyckoff / Po3 / W-M / Wing Markers ───────────────────────────────────
    // Draw as floating badges on the right side at the relevant price level
    layer.markers.forEach((m, idx) => {
      attach(makePriceMarker(series, m.price, m.label, m.color, m.position, idx))
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

function makePriceBand(
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

function makeHLine(
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
        ctx.globalAlpha = 0.8
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        if (dash) ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()

        // Label badge on right edge
        ctx.setLineDash([])
        ctx.font = 'bold 9px monospace'
        const tw = ctx.measureText(label).width
        const pad = 3
        const bw = tw + pad * 2
        const bh = 14
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
        ctx.fillText(label, bx + pad, by + bh - 4)
        ctx.restore()
      } catch {}
    },
    hitTest() { return null },
  }
}

// Wyckoff / pattern markers — floating badge on right, offset by index so they don't overlap
function makePriceMarker(
  series: ISeriesApi<'Candlestick'>,
  price: number,
  label: string,
  color: string,
  position: string,
  idx: number,
) {
  return {
    draw(ctx: CanvasRenderingContext2D) {
      try {
        const y = series.priceToCoordinate(price)
        if (y === null) return
        const { width } = ctx.canvas

        ctx.save()
        ctx.font = 'bold 10px sans-serif'
        const tw = ctx.measureText(label).width
        const pad = 5
        const bw = tw + pad * 2
        const bh = 18
        const bx = width - bw - 60 - (idx % 2) * 4   // slight horizontal jitter
        // Stack vertically: above = above price, below = below price
        const offsetY = position === 'above' ? -bh - 4 : 4
        const by = y + offsetY

        // Arrow pointer
        ctx.beginPath()
        if (position === 'above') {
          ctx.moveTo(bx + bw / 2, by + bh)
          ctx.lineTo(bx + bw / 2 - 5, by + bh - 6)
          ctx.lineTo(bx + bw / 2 + 5, by + bh - 6)
        } else {
          ctx.moveTo(bx + bw / 2, by)
          ctx.lineTo(bx + bw / 2 - 5, by + 6)
          ctx.lineTo(bx + bw / 2 + 5, by + 6)
        }
        ctx.closePath()
        ctx.fillStyle = color
        ctx.globalAlpha = 0.85
        ctx.fill()

        // Badge background
        ctx.globalAlpha = 0.92
        ctx.fillStyle = '#0f1117'
        ctx.beginPath()
        ctx.roundRect(bx, by, bw, bh, 4)
        ctx.fill()

        // Badge border
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.9
        ctx.beginPath()
        ctx.roundRect(bx, by, bw, bh, 4)
        ctx.stroke()

        // Text
        ctx.globalAlpha = 1
        ctx.fillStyle = color
        ctx.font = 'bold 10px sans-serif'
        ctx.fillText(label, bx + pad, by + bh - 5)
        ctx.restore()
      } catch {}
    },
    hitTest() { return null },
  }
}
