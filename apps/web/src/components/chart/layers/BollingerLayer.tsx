'use client'

import { useEffect, useRef } from 'react'
import { LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { useMarketStore } from '@/store/marketStore'
import { useComputedLayers } from '@/hooks/useComputedLayers'

interface Props {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
}

export default function BollingerLayer({ chart, series: _series }: Props) {
  const visible = useMarketStore(s => s.layers.bollinger)
  const data = useComputedLayers()
  const seriesRef = useRef<{ upper: any; mid: any; lower: any } | null>(null)

  // Create / destroy line series
  useEffect(() => {
    if (!visible) {
      if (seriesRef.current) {
        try { chart.removeSeries(seriesRef.current.upper) } catch {}
        try { chart.removeSeries(seriesRef.current.mid)   } catch {}
        try { chart.removeSeries(seriesRef.current.lower) } catch {}
        seriesRef.current = null
      }
      return
    }

    if (!seriesRef.current) {
      const opts = (color: string, width: number, dash?: number[]) => ({
        color,
        lineWidth: width as 1 | 2 | 3 | 4,
        lastValueVisible: false,
        priceLineVisible: false,
        lineStyle: dash ? 1 : 0,
      })
      seriesRef.current = {
        upper: chart.addSeries(LineSeries, opts('#a855f7', 1, [4])),
        mid:   chart.addSeries(LineSeries, opts('#a855f7', 1)),
        lower: chart.addSeries(LineSeries, opts('#a855f7', 1, [4])),
      }
    }

    return () => {
      if (seriesRef.current) {
        try { chart.removeSeries(seriesRef.current.upper) } catch {}
        try { chart.removeSeries(seriesRef.current.mid)   } catch {}
        try { chart.removeSeries(seriesRef.current.lower) } catch {}
        seriesRef.current = null
      }
    }
  }, [visible, chart])

  // Set data when available
  useEffect(() => {
    if (!visible || !seriesRef.current || !data?.bollinger?.length) return

    const toSeries = (key: 'upper' | 'middle' | 'lower') =>
      data.bollinger.map((p: any) => ({ time: p.time, value: p[key] }))

    try {
      seriesRef.current.upper.setData(toSeries('upper'))
      seriesRef.current.mid.setData(toSeries('middle'))
      seriesRef.current.lower.setData(toSeries('lower'))
    } catch {}
  }, [visible, data])

  return null
}
