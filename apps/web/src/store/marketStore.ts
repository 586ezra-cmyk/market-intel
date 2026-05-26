import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Alert, FVG, Structure, Range, Liquidity, SMTSignal, WyckoffPhase } from '@market/shared'
import type { DrawingLayer } from '@/hooks/useAnalysis'
import type { DrawingTool, Drawing } from '@/types/drawing'

// ─── Layer visibility ─────────────────────────────────────────────────────────
export type LayerId =
  | 'structure' | 'liquidity' | 'fvg' | 'ifvg' | 'range' | 'killZone'
  | 'wyckoff' | 'smt' | 'ismt' | 'ob' | 'bollinger'
  | 'inducement' | 'repricing' | 'session' | 'judas' | 'po3'

export const LAYER_LABELS: Record<LayerId, string> = {
  structure:  'מבנה שוק (BOS/CHoCH)',
  liquidity:  'נזילות',
  fvg:        'FVG',
  ifvg:       'iFVG — ריטסט הפוך',
  range:      'טווח עסקאות',
  killZone:   'Kill Zone',
  wyckoff:    'Wyckoff',
  smt:        'SMT',
  ismt:       'iSMT (2 נרות)',
  ob:         'Order Block',
  bollinger:  'Bollinger Bands',
  inducement: 'פיתוי (Inducement)',
  repricing:  'תמחור מחדש',
  session:    'גבוה/נמוך סשן',
  judas:      'Judas Swing',
  po3:        'Power of 3 / Opening Range',
}

export const LAYER_COLORS: Record<LayerId, string> = {
  structure:  '#6366f1',
  liquidity:  '#f59e0b',
  fvg:        '#10b981',
  ifvg:       '#14b8a6',
  range:      '#3b82f6',
  killZone:   '#8b5cf6',
  wyckoff:    '#f97316',
  smt:        '#ec4899',
  ismt:       '#d946ef',
  ob:         '#f43f5e',
  bollinger:  '#a855f7',
  inducement: '#ef4444',
  repricing:  '#06b6d4',
  session:    '#64748b',
  judas:      '#0d9488',
  po3:        '#0ea5e9',
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

  // Drawing state
  activeTool: DrawingTool
  drawingColor: string
  drawingLineWidth: number
  drawings: Drawing[]
  drawingsVisible: boolean
  setActiveTool: (t: DrawingTool) => void
  setDrawingColor: (c: string) => void
  setDrawingLineWidth: (w: number) => void
  addDrawing: (d: Drawing) => void
  removeDrawing: (id: string) => void
  clearDrawings: () => void
  toggleDrawingsVisible: () => void

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
        structure:  true,
        liquidity:  true,
        fvg:        true,
        ifvg:       true,
        range:      true,
        killZone:   true,
        wyckoff:    false,
        smt:        true,
        ismt:       true,
        ob:         true,
        bollinger:  false,
        inducement: true,
        repricing:  true,
        session:    true,
        judas:      true,
        po3:        false,
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

      // Drawing state
      activeTool: 'cursor',
      drawingColor: '#ffffff',
      drawingLineWidth: 1,
      drawings: [],
      drawingsVisible: true,
      setActiveTool: (t) => set({ activeTool: t }),
      setDrawingColor: (c) => set({ drawingColor: c }),
      setDrawingLineWidth: (w) => set({ drawingLineWidth: w }),
      addDrawing: (d) => set((s) => ({ drawings: [...s.drawings, d] })),
      removeDrawing: (id) => set((s) => ({ drawings: s.drawings.filter(d => d.id !== id) })),
      clearDrawings: () => set({ drawings: [] }),
      toggleDrawingsVisible: () => set((s) => ({ drawingsVisible: !s.drawingsVisible })),

      selectedAlertId: null,
      setSelectedAlert: (id) => set({ selectedAlertId: id }),
      wsConnected: false,
      setWSConnected: (v) => set({ wsConnected: v }),
    }),
    {
      name: 'market-store',
      partialize: (s) => ({
        symbol: s.symbol,
        timeframe: s.timeframe,
        layers: s.layers,
        drawings: s.drawings,
        drawingColor: s.drawingColor,
        drawingLineWidth: s.drawingLineWidth,
      }),
    },
  ),
)
