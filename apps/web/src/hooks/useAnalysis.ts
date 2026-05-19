'use client'
import { useState } from 'react'

export interface TFAnalysis {
  timeframe: string
  trend: 'bullish' | 'bearish' | 'neutral'
  currentPrice: number
  structures: Array<{ type: string; direction: string; price: number }>
  fvgs: Array<{ direction: string; top: number; bottom: number }>
  liquiditySweep: boolean
  equalHighs: number[]
  equalLows: number[]
  dealingRange: { high: number; low: number; mid: number; position: string } | null
  killZone: { active: boolean; session: string | null }
  iSMT: { detected: boolean; direction: string } | null
  wyckoff: { phase: string; spring: boolean; upthrust: boolean } | null
  wingBreak: { detected: boolean; inPhaseD: boolean; hasRetest: boolean; bosConfirmed: boolean } | null
  wPattern: { detected: boolean; confirmed: boolean } | null
  mPattern: { detected: boolean; confirmed: boolean } | null
  doubleTop: { detected: boolean; price: number } | null
  doubleBottom: { detected: boolean; price: number } | null
  score: number
}

export interface SMTComparison {
  correlated: string
  correlatedPrice: number
  smtDetected: boolean
  smtDirection: 'bullish' | 'bearish' | null
  details: string
  timeframes: Array<{
    tf: string
    mainTrend: 'bullish' | 'bearish' | 'neutral'
    corrTrend: 'bullish' | 'bearish' | 'neutral'
    divergence: boolean
  }>
}

export interface FullAnalysis {
  symbol: string
  analyzedAt: number
  currentPrice: number
  overallDirection: 'bullish' | 'bearish' | 'neutral'
  overallScore: number
  timeframes: TFAnalysis[]
  strategies: Array<{ name: string; confidence: number; details: string }>
  recommendation: string
  nextLevels: { tp1: number | null; tp2: number | null; tp3: number | null; sl: number | null }
  smtComparison: SMTComparison | null
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function useAnalysis() {
  const [data, setData] = useState<FullAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyze = async (symbol: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/market/${symbol}/analyze`)
      if (!res.ok) throw new Error('שגיאה בניתוח')
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return { data, loading, error, analyze }
}
