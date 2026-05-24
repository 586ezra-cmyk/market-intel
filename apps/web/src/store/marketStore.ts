import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Alert, FVG, Structure, Range, Liquidity, SMTSignal, WyckoffPhase } from '@market/shared'
import type { DrawingLayer } from '@/hooks/useAnalysis'

// ─── Layer visibility ─────────────────────────────────────────────────────────
export type LayerId =
  | 'structure' | 'liquidity' | 'fvg' | 'range' | 'killZone'
  | 'wyckoff' | 'smt' | 'inducement' | 'repricing' | 'session'

export const LAYER_LABELS: Record<LayerId, string> = {
  structure:  'מבנה שוק (BOS/CHoCH)',
  liquidity:  'נזילות',
  fvg:        'FVG',
  range:      'טווח עסקאות',
  killZone:   'Kill Zone',
  wyckoff:    'Wyckoff',
  smt:        'SMT',
  inducement: 'פיתוי',
  repricing:  'תמחור מחדש',
  session:    'גבוה/נמוך סשן',
}

export const LAYER_COLORS: Record<LayerId, string> = {
  structure:  '#6366f1',
  liquidity:  '#f59e0b',
  fvg:        '#10b981',
  range:      '#3b82f6',
  killZone:   '#8b5cf6',
  wyckoff:    '#f97316',
  smt:        '#ec4899',
  inducement: '#ef4444',
  repricing:  '#14b8a6',
  session:    '#64748b',
}

// ─── Selected symbol + timeframe ──────────────────────────────────────────────
interface MarketStore {
  // Chart settings
  symbol: string
  timeframe: string
  setSymbol: (s: string) => void
  setTimeframe: (tf: string) => void

  // Layer visibility
  layers: Record<LayerId, boolean>
  toggleLayer: (id: LayerId) => void

  // Real-time data (updated via WebSocket)
  alerts: Alert[]
  fvgs: FVG[]
  structures: Structure[]
  activeRange: Range | null
  liquidities: Liquidity[]
  smtSignals: SMTSignal[]
  wyckoffPhases: WyckoffPhase[]

  // Push data
  pushAlert: (a: Alert) => void
  pushFVG: (f: FVG) => void
  markFVGFilled: (id: string, filledAt: number) => void
  pushStructure: (s: Structure) => void
  setActiveRange: (r: Range) => void
  pushLiquidity: (l: Liquidity) => void
  pushSMT: (s: SMTSignal) => void
  pushWyckoff: (w: WyckoffPhase) => void

  // Analysis overlay (from "בחן עכשיו")
  analysisLayers: DrawingLayer[]
  setAnalysisLayers: (layers: DrawingLayer[]) => void

  // UI state
  selectedAlertId: string | null
  setSelectedAlert: (id: string | null) => void
  wsConnected: boolean
  setWSConnected: (v: boolean) => void
}

export const useMarketStore = create<MarketStore>()(
  persist(
    (set) => ({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      setSymbol: (s) => set({ symbol: s }),
      setTimeframe: (tf) => set({ timeframe: tf }),

      layers: {
        structure: true,
        liquidity: true,
        fvg: true,
        range: true,
        killZone: true,
        wyckoff: false,
        smt: true,
        inducement: true,
        repricing: true,
        session: true,
      },
      toggleLayer: (id) =>
        set((state) => ({
          layers: { ...state.layers, [id]: !state.layers[id] },
        })),

      alerts: [],
      fvgs: [],
      structures: [],
      activeRange: null,
      liquidities: [],
      smtSignals: [],
      wyckoffPhases: [],

      pushAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts].slice(0, 200) })),
      pushFVG: (f) => set((s) => ({ fvgs: [f, ...s.fvgs.filter(x => x.id !== f.id)] })),
      markFVGFilled: (id, filledAt) =>
        set((s) => ({
          fvgs: s.fvgs.map(f => f.id === id ? { ...f, isActive: false, filledAt } : f),
        })),
      pushStructure: (st) => set((s) => ({ structures: [st, ...s.structures].slice(0, 100) })),
      setActiveRange: (r) => set({ activeRange: r }),
      pushLiquidity: (l) =>
        set((s) => ({ liquidities: [l, ...s.liquidities.filter(x => x.id !== l.id)] })),
      pushSMT: (sm) => set((s) => ({ smtSignals: [sm, ...s.smtSignals].slice(0, 50) })),
      pushWyckoff: (w) =>
        set((s) => ({ wyckoffPhases: [w, ...s.wyckoffPhases.filter(x => x.id !== w.id)] })),

      analysisLayers: [],
      setAnalysisLayers: (layers) => set({ analysisLayers: layers }),

      selectedAlertId: null,
      setSelectedAlert: (id) => set({ selectedAlertId: id }),
      wsConnected: false,
      setWSConnected: (v) => set({ wsConnected: v }),
    }),
    {
      name: 'market-store',
      partialize: (s) => ({ symbol: s.symbol, timeframe: s.timeframe, layers: s.layers }),
    },
  ),
)
