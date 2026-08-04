'use client'

import { useApi } from './useApi'
import { useMarketStore } from '@/store/marketStore'

export function useComputedLayers() {
  const { symbol, timeframe } = useMarketStore()
  const { data } = useApi<any>(
    `/api/market/${encodeURIComponent(symbol)}/${timeframe}/computed-layers`,
    [symbol, timeframe],
  )
  return data ?? null
}
