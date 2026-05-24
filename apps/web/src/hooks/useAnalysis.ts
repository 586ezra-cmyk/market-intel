'use client'
import { useState } from 'react'

export interface WyckoffDetail {
  phase: string
  phaseDetail: string  // 'B' | 'C' | 'D' | ''
  spring: boolean
  testAfterSpring: boolean
  sos: boolean
  lps: boolean
  utad: boolean
  testOfUtad: boolean
  upthrust: boolean
  sow: boolean
  lpsy: boolean
}

export interface BreakerBlock {
  direction: 'bullish' | 'bearish'
  top: number
  bottom: number
}

export interface OrderBlock {
  direction: 'bullish' | 'bearish'
  top: number
  bottom: number
  broken: boolean
}

export interface FibOTE {
  high: number
  low: number
  level705: number
  inZone: boolean
}

export interface ScoreBreakdown {
  base: number
  higherTFBonus: number
  fvg: number
  bosChoch: number
  liquiditySweep: number
  killZone: number
  ismt: number
  wyckoff: number
  wm: number
  doublePattern: number
  breakerBlock: number
  po3: number
  wingBreak: number
  orderBlock: number
  ote: number
  total: number
}

export interface Po3Signal {
  detected: boolean
  judas: boolean
  direction: 'bullish' | 'bearish'
}

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
  wyckoff: WyckoffDetail | null
  wingBreak: { detected: boolean; inPhaseD: boolean; hasRetest: boolean; bosConfirmed: boolean } | null
  wPattern: { detected: boolean; confirmed: boolean } | null
  mPattern: { detected: boolean; confirmed: boolean } | null
  doubleTop: { detected: boolean; price: number } | null
  doubleBottom: { detected: boolean; price: number } | null
  breakerBlock: BreakerBlock | null
  pdh: number | null
  pdl: number | null
  pwh: number | null
  pwl: number | null
  vwap: number | null
  po3: Po3Signal | null
  orderBlocks: OrderBlock[]
  ote: FibOTE | null
  sessionOpenPrices: { nyMidnight: number | null; trueDay: number | null }
  scoreBreakdown: ScoreBreakdown
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

export interface DrawingLayer {
  tf: string
  fvgBoxes: Array<{ direction: string; top: number; bottom: number }>
  horizontalLines: Array<{ label: string; price: number; color: string; dash: boolean }>
  markers: Array<{ price: number; label: string; color: string; position: string }>
  vwap: number | null
  breakerBoxes: Array<{ direction: string; top: number; bottom: number }>
  obBoxes: Array<{ direction: string; top: number; bottom: number; broken: boolean }>
  oteBox: { high: number; low: number; level705: number } | null
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
  nextLevels: {
    sl: number | null; slPct: number | null
    tp1: number | null; tp1RR: number | null
    tp2: number | null; tp2RR: number | null
    tp3: number | null; tp3RR: number | null
  }
  smtComparison: SMTComparison | null
  drawingLayers: DrawingLayer[]
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
      const res = await fetch(`${API}/api/market/${symbol}/analyze`)
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
