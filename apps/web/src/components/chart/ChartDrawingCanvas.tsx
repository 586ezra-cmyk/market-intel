'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import type { Drawing, DrawingPt } from '@/types/drawing'

// ─── Fibonacci levels ────────────────────────────────────────────────────────

const FIB_LEVELS: { ratio: number; color: string; label: string }[] = [
  { ratio: 0,     color: '#94a3b8', label: '0%' },
  { ratio: 0.236, color: '#60a5fa', label: '23.6%' },
  { ratio: 0.382, color: '#34d399', label: '38.2%' },
  { ratio: 0.5,   color: '#f9fafb', label: '50%' },
  { ratio: 0.618, color: '#fbbf24', label: '61.8%' },
  { ratio: 0.786, color: '#f472b6', label: '78.6%' },
  { ratio: 1,     color: '#94a3b8', label: '100%' },
]

// ─── Coordinate helpers ───────────────────────────────────────────────────────

function ptToXY(
  pt: DrawingPt,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
): { x: number; y: number } | null {
  const x = chart.timeScale().timeToCoordinate(pt.time as any)
  const y = series.priceToCoordinate(pt.price)
  if (x == null || y == null) return null
  return { x, y }
}

function xyToPt(
  x: number,
  y: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
): DrawingPt | null {
  const time = chart.timeScale().coordinateToTime(x)
  const price = series.coordinateToPrice(y)
  if (time == null || price == null) return null
  return { time: time as number, price }
}

// ─── Distance point → line segment ───────────────────────────────────────────

function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  size = 10,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6))
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6))
  ctx.stroke()
}

function extendToEdge(
  x1: number, y1: number,
  x2: number, y2: number,
  w: number, h: number,
): [number, number] {
  const dx = x2 - x1, dy = y2 - y1
  if (dx === 0 && dy === 0) return [x2, y2]
  let tMax = Infinity
  if (dx > 0) tMax = Math.min(tMax, (w - x1) / dx)
  else if (dx < 0) tMax = Math.min(tMax, (0 - x1) / dx)
  if (dy > 0) tMax = Math.min(tMax, (h - y1) / dy)
  else if (dy < 0) tMax = Math.min(tMax, (0 - y1) / dy)
  return [x1 + dx * tMax, y1 + dy * tMax]
}

// ─── Render a single drawing ──────────────────────────────────────────────────

function renderDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  w: number,
  h: number,
) {
  ctx.strokeStyle = d.color
  ctx.fillStyle = d.color
  ctx.lineWidth = d.width
  ctx.setLineDash(d.dash ? [5, 4] : [])

  const p0 = d.pts[0] ? ptToXY(d.pts[0], chart, series) : null
  const p1 = d.pts[1] ? ptToXY(d.pts[1], chart, series) : null

  switch (d.type) {
    case 'hline': {
      if (!p0) return
      ctx.beginPath()
      ctx.moveTo(0, p0.y)
      ctx.lineTo(w, p0.y)
      ctx.stroke()
      break
    }
    case 'vline': {
      if (!p0) return
      ctx.beginPath()
      ctx.moveTo(p0.x, 0)
      ctx.lineTo(p0.x, h)
      ctx.stroke()
      break
    }
    case 'line': {
      if (!p0 || !p1) return
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
      break
    }
    case 'ray': {
      if (!p0 || !p1) return
      const [ex, ey] = extendToEdge(p0.x, p0.y, p1.x, p1.y, w, h)
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      break
    }
    case 'arrow': {
      if (!p0 || !p1) return
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
      drawArrowHead(ctx, p0.x, p0.y, p1.x, p1.y)
      break
    }
    case 'rect': {
      if (!p0 || !p1) return
      const rx = Math.min(p0.x, p1.x)
      const ry = Math.min(p0.y, p1.y)
      const rw = Math.abs(p1.x - p0.x)
      const rh = Math.abs(p1.y - p0.y)
      ctx.globalAlpha = 0.15
      ctx.fillRect(rx, ry, rw, rh)
      ctx.globalAlpha = 1
      ctx.strokeRect(rx, ry, rw, rh)
      break
    }
    case 'fib': {
      if (!p0 || !p1) return
      const topY = Math.min(p0.y, p1.y)
      const botY = Math.max(p0.y, p1.y)
      const range = botY - topY
      for (const lv of FIB_LEVELS) {
        const ly = topY + range * lv.ratio
        ctx.strokeStyle = lv.color
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(0, ly)
        ctx.lineTo(w, ly)
        ctx.stroke()
        // label
        ctx.font = '11px monospace'
        ctx.fillStyle = lv.color
        const price = series.coordinateToPrice(ly)
        const priceStr = price != null ? `  ${lv.label}  ${price.toFixed(2)}` : `  ${lv.label}`
        ctx.fillText(priceStr, w - 100, ly - 3)
      }
      ctx.strokeStyle = d.color
      break
    }
    case 'text': {
      if (!p0) return
      ctx.font = `${13 + d.width * 2}px sans-serif`
      ctx.fillStyle = d.color
      ctx.fillText(d.text ?? '', p0.x, p0.y)
      break
    }
    case 'measure': {
      if (!p0 || !p1) return
      // Horizontal span
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
      // bracket ticks
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y - 6)
      ctx.lineTo(p0.x, p0.y + 6)
      ctx.moveTo(p1.x, p1.y - 6)
      ctx.lineTo(p1.x, p1.y + 6)
      ctx.stroke()
      // label
      const priceDiff = d.pts[1].price - d.pts[0].price
      const pct = ((priceDiff / d.pts[0].price) * 100).toFixed(2)
      const sign = priceDiff >= 0 ? '+' : ''
      ctx.font = '11px monospace'
      ctx.fillStyle = priceDiff >= 0 ? '#22c55e' : '#ef4444'
      const midX = (p0.x + p1.x) / 2
      const midY = (p0.y + p1.y) / 2 - 10
      ctx.fillText(`${sign}${priceDiff.toFixed(2)} (${sign}${pct}%)`, midX - 40, midY)
      break
    }
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1
}

// ─── Preview (dotted line from p0 to mouse) ──────────────────────────────────

function renderPreview(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  x0: number, y0: number,
  x1: number, y1: number,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash([5, 4])
  ctx.globalAlpha = 0.7
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function ChartDrawingCanvas({ chart, series }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  // Drawing in-progress state (not in store — ephemeral)
  const pendingPt = useRef<DrawingPt | null>(null)
  const mousePos  = useRef<{ x: number; y: number } | null>(null)

  const {
    activeTool,
    drawingColor,
    drawingLineWidth,
    drawings,
    drawingsVisible,
    addDrawing,
    removeDrawing,
  } = useMarketStore()

  // ── Resize canvas to match container (excluding 44px toolbar) ─────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const TOOLBAR_W = 44
    const sync = () => {
      canvas.width  = Math.max(0, parent.clientWidth  - TOOLBAR_W)
      canvas.height = parent.clientHeight
    }
    const ro = new ResizeObserver(sync)
    ro.observe(parent)
    sync()
    return () => ro.disconnect()
  }, [])

  // ── RAF render loop ─────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height

    ctx.clearRect(0, 0, w, h)

    if (drawingsVisible) {
      for (const d of drawings) {
        renderDrawing(ctx, d, chart, series, w, h)
      }
    }

    // Preview while placing second point
    if (pendingPt.current && mousePos.current) {
      const p0 = ptToXY(pendingPt.current, chart, series)
      if (p0) {
        renderPreview(
          ctx, drawingColor, drawingLineWidth,
          p0.x, p0.y,
          mousePos.current.x, mousePos.current.y,
        )
      }
    }

    rafRef.current = requestAnimationFrame(render)
  }, [chart, series, drawings, drawingsVisible, drawingColor, drawingLineWidth])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [render])

  // ── Mouse handlers ──────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    mousePos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const handleMouseLeave = useCallback(() => {
    mousePos.current = null
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'cursor') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect  = canvas.getBoundingClientRect()
    const mx    = e.clientX - rect.left
    const my    = e.clientY - rect.top
    const pt    = xyToPt(mx, my, chart, series)
    if (!pt) return

    // ── eraser ───────────────────────────────────────────────────────────────
    if (activeTool === 'eraser') {
      const w = canvas.width
      const h = canvas.height
      let bestId: string | null = null
      let bestDist = 12 // px threshold

      for (const d of drawings) {
        const p0 = d.pts[0] ? ptToXY(d.pts[0], chart, series) : null
        const p1 = d.pts[1] ? ptToXY(d.pts[1], chart, series) : null

        let dist = Infinity
        if (d.type === 'hline' && p0) {
          dist = Math.abs(my - p0.y)
        } else if (d.type === 'vline' && p0) {
          dist = Math.abs(mx - p0.x)
        } else if (p0 && p1) {
          if (d.type === 'rect') {
            const rx = Math.min(p0.x, p1.x)
            const ry = Math.min(p0.y, p1.y)
            const rw = Math.abs(p1.x - p0.x)
            const rh = Math.abs(p1.y - p0.y)
            // check proximity to rectangle border
            dist = Math.min(
              distToSegment(mx, my, rx, ry, rx + rw, ry),
              distToSegment(mx, my, rx, ry + rh, rx + rw, ry + rh),
              distToSegment(mx, my, rx, ry, rx, ry + rh),
              distToSegment(mx, my, rx + rw, ry, rx + rw, ry + rh),
            )
          } else {
            let ex = p1.x, ey = p1.y
            if (d.type === 'ray') [ex, ey] = extendToEdge(p0.x, p0.y, p1.x, p1.y, w, h)
            dist = distToSegment(mx, my, p0.x, p0.y, ex, ey)
          }
        } else if (p0 && (d.type === 'text' || d.type === 'measure')) {
          dist = Math.hypot(mx - p0.x, my - p0.y)
        }

        if (dist < bestDist) {
          bestDist = dist
          bestId = d.id
        }
      }
      if (bestId) removeDrawing(bestId)
      return
    }

    // ── single-click tools ────────────────────────────────────────────────────
    if (activeTool === 'hline') {
      addDrawing({
        id: crypto.randomUUID(),
        type: 'hline',
        pts: [pt],
        color: drawingColor,
        width: drawingLineWidth,
        dash: false,
      })
      return
    }

    if (activeTool === 'vline') {
      addDrawing({
        id: crypto.randomUUID(),
        type: 'vline',
        pts: [pt],
        color: drawingColor,
        width: drawingLineWidth,
        dash: false,
      })
      return
    }

    if (activeTool === 'text') {
      const txt = window.prompt('הכנס טקסט:')
      if (!txt) return
      addDrawing({
        id: crypto.randomUUID(),
        type: 'text',
        pts: [pt],
        color: drawingColor,
        width: drawingLineWidth,
        dash: false,
        text: txt,
      })
      return
    }

    // ── two-click tools ───────────────────────────────────────────────────────
    if (!pendingPt.current) {
      pendingPt.current = pt
    } else {
      const type = activeTool as Drawing['type']
      addDrawing({
        id: crypto.randomUUID(),
        type,
        pts: [pendingPt.current, pt],
        color: drawingColor,
        width: drawingLineWidth,
        dash: false,
      })
      pendingPt.current = null
    }
  }, [activeTool, chart, series, drawings, drawingColor, drawingLineWidth, addDrawing, removeDrawing])

  // mousedown/mouseup for rect, fib, measure (drag tools)
  const dragStartPt = useRef<DrawingPt | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!['rect', 'fib', 'measure'].includes(activeTool)) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const pt = xyToPt(e.clientX - rect.left, e.clientY - rect.top, chart, series)
    if (!pt) return
    dragStartPt.current = pt
    pendingPt.current   = pt
  }, [activeTool, chart, series])

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!['rect', 'fib', 'measure'].includes(activeTool)) return
    const canvas = canvasRef.current
    if (!canvas || !dragStartPt.current) return
    const rect = canvas.getBoundingClientRect()
    const pt = xyToPt(e.clientX - rect.left, e.clientY - rect.top, chart, series)
    if (!pt) { dragStartPt.current = null; pendingPt.current = null; return }

    const type = activeTool as Drawing['type']
    addDrawing({
      id: crypto.randomUUID(),
      type,
      pts: [dragStartPt.current, pt],
      color: drawingColor,
      width: drawingLineWidth,
      dash: false,
    })
    dragStartPt.current = null
    pendingPt.current   = null
  }, [activeTool, chart, series, drawingColor, drawingLineWidth, addDrawing])

  // cancel pending on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pendingPt.current   = null
        dragStartPt.current = null
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const isPassive = activeTool === 'cursor'

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 bottom-0 right-0"
      style={{
        left: 44,                                   // start after drawing toolbar
        pointerEvents: isPassive ? 'none' : 'auto',
        cursor: activeTool === 'eraser'
          ? 'crosshair'
          : activeTool === 'cursor'
          ? 'default'
          : 'crosshair',
        zIndex: 15,                                 // above chart, below toolbar (z-20)
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    />
  )
}
