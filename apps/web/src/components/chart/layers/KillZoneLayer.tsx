'use client'

import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function KillZoneLayer({ chart, series }: Props) {
  const visible = useMarketStore(s => s.layers.killZone)

  useEffect(() => {
    if (!visible) return
    // Kill Zone is rendered as background shading via chart primitives
    // This is a placeholder — in production, we'd draw time-based bands
    // using the chart's time scale to convert UTC hours to x-coordinates
  }, [visible])

  return null
}
