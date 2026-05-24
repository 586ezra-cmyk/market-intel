'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

interface KillZone {
  label: string
  color: string
  startH: number
  endH: number   // exclusive; for Asian that wraps midnight use endH < startH
}

const KILL_ZONES: KillZone[] = [
  { label: 'London KZ',  color: 'rgba(139,92,246,0.08)',  startH: 7,  endH: 11 },
  { label: 'NY KZ',      color: 'rgba(239,68,68,0.08)',   startH: 13, endH: 16 },
  { label: 'Asian KZ',   color: 'rgba(59,130,246,0.06)',  startH: 20, endH: 28 }, // 20-04 → endH=28 (wraps midnight)
]

function isInKillZone(kz: KillZone, utcH: number): boolean {
  if (kz.endH <= 24) return utcH >= kz.startH && utcH < kz.endH
  // Wraps midnight: startH=20, endH=28 → 20-23 or 0-3
  return utcH >= kz.startH || utcH < (kz.endH - 24)
}

function makeKillZonePrimitive(color: string, label: string) {
  return {
    draw(ctx: CanvasRenderingContext2D) {
      try {
        const { width, height } = ctx.canvas
        ctx.save()
        ctx.fillStyle = color
        ctx.fillRect(0, 0, width, height)

        // Label at top-right
        ctx.font = 'bold 10px sans-serif'
        const tw = ctx.measureText(label).width
        const pad = 4
        const bw = tw + pad * 2
        const bh = 16
        const bx = width - bw - 8
        const by = 8
        ctx.globalAlpha = 0.9
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(bx, by, bw, bh)
        ctx.globalAlpha = 0.85
        ctx.fillStyle = '#fff'
        ctx.fillText(label, bx + pad, by + bh - 4)
        ctx.restore()
      } catch {}
    },
    hitTest() { return null },
  }
}

export default function KillZoneLayer({ chart, series }: Props) {
  const visible = useMarketStore(s => s.layers.killZone)
  const primitivesRef = useRef<any[]>([])

  useEffect(() => {
    primitivesRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
    primitivesRef.current = []

    if (!visible) return

    const utcH = new Date().getUTCHours()

    for (const kz of KILL_ZONES) {
      if (isInKillZone(kz, utcH)) {
        const prim = makeKillZonePrimitive(kz.color, kz.label)
        try {
          series.attachPrimitive(prim as any)
          primitivesRef.current.push(prim)
        } catch {}
        break // Only one kill zone at a time
      }
    }

    return () => {
      primitivesRef.current.forEach(p => { try { series.detachPrimitive(p) } catch {} })
      primitivesRef.current = []
    }
  }, [visible, series])

  return null
}
