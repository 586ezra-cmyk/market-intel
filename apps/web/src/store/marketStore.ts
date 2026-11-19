import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Alert, FVG, Structure, Range, Liquidity, SMTSignal, WyckoffPhase } from '@market/shared'
import type { DrawingLayer } from '@/hooks/useAnalysis'
import type { DrawingTool, Drawing } from '@/types/drawing'

// ─── Layer visibility ─────────────────────────────────────────────────────────
// כל שורה בסרגל השכבות = דבר אחד שאפשר להדליק ולכבות בנפרד. "רמות HTT" פורקה לשכבות לפי נושא (19.11.2026).
export type LayerId =
  | 'gate'
  | 'structure' | 'range' | 'htf' | 'session' | 'po3'
  | 'liquidity' | 'fvg' | 'ifvg' | 'ob' | 'inducement' | 'repricing'
  | 'vp' | 'avwap' | 'ema' | 'bollinger'
  | 'wyckoff' | 'wing' | 'judas' | 'smt' | 'ismt' | 'killZone'
  | 'optCall' | 'optPut' | 'optZero' | 'optMagnet' | 'optZdte'

export const LAYER_LABELS: Record<LayerId, string> = {
  gate:       'רמזור (כניסה / סטופ / יעד)',
  structure:  'מבנה שוק (BOS/CHoCH, פיבוטים)',
  range:      'טווח: קריק / אייס',
  htf:        'גבוה/נמוך: יומי, 4 שעות, שבועי',
  session:    'גבוה/נמוך: סשן קודם ואסיה',
  po3:        'טווח הפתיחה (Opening Range)',
  liquidity:  'נזילות (בריכות נזילות)',
  fvg:        'FVG',
  ifvg:       'iFVG — ריטסט הפוך',
  ob:         'Order Block',
  inducement: 'פיתוי (Inducement)',
  repricing:  'תמחור מחדש',
  vp:         'ווליום: POC + אזור הוגן',
  avwap:      'AVWAP (יומי, שבועי, יום אמיתי)',
  ema:        'EMA 12',
  bollinger:  'Bollinger Bands',
  wyckoff:    'Wyckoff',
  wing:       'קו הכנף',
  judas:      'Judas Swing',
  smt:        'SMT (+ שיא/שפל 20 נרות)',
  ismt:       'iSMT (2 נרות)',
  killZone:   'Kill Zone',
  optCall:    'אופציות: קיר קולים',
  optPut:     'אופציות: קיר פוטים',
  optZero:    'אופציות: אפס-גמא',
  optMagnet:  'אופציות: מגנט OI',
  optZdte:    'אופציות: 0DTE',
}

export const LAYER_COLORS: Record<LayerId, string> = {
  gate:       '#34d399',
  structure:  '#6366f1',
  range:      '#3b82f6',
  htf:        '#e2e8f0',
  session:    '#64748b',
  po3:        '#0ea5e9',
  liquidity:  '#f59e0b',
  fvg:        '#10b981',
  ifvg:       '#14b8a6',
  ob:         '#f43f5e',
  inducement: '#ef4444',
  repricing:  '#06b6d4',
  vp:         '#facc15',
  avwap:      '#38bdf8',
  ema:        '#fb923c',
  bollinger:  '#a855f7',
  wyckoff:    '#f97316',
  wing:       '#c084fc',
  judas:      '#0d9488',
  smt:        '#ec4899',
  ismt:       '#d946ef',
  killZone:   '#8b5cf6',
  optCall:    '#ff6b6b',
  optPut:     '#4ade80',
  optZero:    '#e0e0e0',
  optMagnet:  '#c084fc',
  optZdte:    '#fbbf24',
}

/** סדר התצוגה בסרגל, בקבוצות */
export const LAYER_GROUPS: Array<{ title: string; ids: LayerId[] }> = [
  { title: 'רמזור', ids: ['gate'] },
  { title: 'מבנה ורמות', ids: ['structure', 'range', 'htf', 'session', 'po3'] },
  { title: 'נזילות ואזורים', ids: ['liquidity', 'fvg', 'ifvg', 'ob', 'inducement', 'repricing'] },
  { title: 'ווליום וממוצעים', ids: ['vp', 'avwap', 'ema', 'bollinger'] },
  { title: 'אסטרטגיה', ids: ['wyckoff', 'wing', 'judas', 'smt', 'ismt', 'killZone'] },
  { title: 'אופציות וגמא (נאסד״ק)', ids: ['optCall', 'optPut', 'optZero', 'optMagnet', 'optZdte'] },
]

/** כמה דברים השכבה מציירת עכשיו על הגרף (מכל המקורות). 0 = דלוקה אבל אין לה מה לצייר. */
export function drawnCount(layerDrawn: Record<string, number>, id: LayerId): number {
  let n = 0
  for (const [k, v] of Object.entries(layerDrawn)) if (k.startsWith(id + ':')) n += v
  return n
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
  /** מה מצויר בפועל: "שכבה:מקור" → כמה פריטים. השכבות מדווחות, הסרגל מציג */
  layerDrawn: Record<string, number>
  setLayerDrawn: (key: string, n: number) => void

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
        gate: true,
        structure: true, range: true, htf: true, session: true, po3: true,
        liquidity: true, fvg: true, ifvg: true, ob: true, inducement: true, repricing: true,
        vp: true, avwap: true, ema: false, bollinger: false,
        wyckoff: false, wing: true, judas: true, smt: true, ismt: true, killZone: true,
        optCall: true, optPut: true, optZero: true, optMagnet: true, optZdte: true,
      },
      layerDrawn: {},
      setLayerDrawn: (key, n) => set((state) => (state.layerDrawn[key] === n ? state : { layerDrawn: { ...state.layerDrawn, [key]: n } })),
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
      // שכבה חדשה שעוד לא קיימת בהגדרות השמורות בדפדפן מקבלת את ברירת המחדל שלה (ולא נשארת כבויה)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MarketStore>
        return { ...current, ...p, layers: { ...current.layers, ...(p.layers ?? {}) } }
      },
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
