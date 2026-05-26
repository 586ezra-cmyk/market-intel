'use client'

import { useMarketStore } from '@/store/marketStore'
import type { DrawingTool } from '@/types/drawing'

// ─── Inline SVG icons ────────────────────────────────────────────────────────

const IconCursor = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <path d="M5 3l14 9-7 1-4 7z" />
  </svg>
)

const IconLine = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <line x1="4" y1="20" x2="20" y2="4" />
    <circle cx="4" cy="20" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="20" cy="4" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)

const IconHLine = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <line x1="3" y1="12" x2="21" y2="12" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)

const IconVLine = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <line x1="12" y1="3" x2="12" y2="21" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)

const IconRay = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <circle cx="4" cy="20" r="1.5" fill="currentColor" stroke="none" />
    <line x1="4" y1="20" x2="20" y2="4" />
    <polyline points="14,4 20,4 20,10" />
  </svg>
)

const IconRect = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <rect x="4" y="6" width="16" height="12" rx="1" />
  </svg>
)

const IconFib = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <line x1="4" y1="5" x2="20" y2="5" />
    <line x1="4" y1="9" x2="20" y2="9" strokeOpacity="0.7" />
    <line x1="4" y1="12" x2="20" y2="12" strokeOpacity="0.9" />
    <line x1="4" y1="15" x2="20" y2="15" strokeOpacity="0.7" />
    <line x1="4" y1="19" x2="20" y2="19" />
    <text x="3" y="12.5" fontSize="5" fill="currentColor" stroke="none">φ</text>
  </svg>
)

const IconText = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <path d="M4 7V4h16v3" />
    <line x1="12" y1="4" x2="12" y2="20" />
    <line x1="8" y1="20" x2="16" y2="20" />
  </svg>
)

const IconArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <line x1="5" y1="19" x2="19" y2="5" />
    <polyline points="10,5 19,5 19,14" />
  </svg>
)

const IconMeasure = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <rect x="3" y="9" width="18" height="6" rx="1" />
    <line x1="7" y1="9" x2="7" y2="15" />
    <line x1="12" y1="9" x2="12" y2="15" />
    <line x1="17" y1="9" x2="17" y2="15" />
  </svg>
)

const IconEraser = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <path d="M20 20H7L3 16l10-10 7 7-3 3" />
    <line x1="7" y1="20" x2="20" y2="20" />
  </svg>
)

const IconEye = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
)

const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
)

// ─── Tool definitions ────────────────────────────────────────────────────────

interface ToolDef {
  id: DrawingTool
  label: string
  icon: React.ReactNode
}

const TOOLS: ToolDef[] = [
  { id: 'cursor',  label: 'סמן',        icon: <IconCursor /> },
  { id: 'line',    label: 'קו מגמה',    icon: <IconLine /> },
  { id: 'hline',   label: 'קו אופקי',   icon: <IconHLine /> },
  { id: 'vline',   label: 'קו אנכי',    icon: <IconVLine /> },
  { id: 'ray',     label: 'קרן',        icon: <IconRay /> },
  { id: 'rect',    label: 'מלבן',       icon: <IconRect /> },
  { id: 'fib',     label: 'פיבונאצ׳י',  icon: <IconFib /> },
  { id: 'text',    label: 'טקסט',       icon: <IconText /> },
  { id: 'arrow',   label: 'חץ',         icon: <IconArrow /> },
  { id: 'measure', label: 'מדידה',      icon: <IconMeasure /> },
  { id: 'eraser',  label: 'מחק',        icon: <IconEraser /> },
]

const PRESET_COLORS = [
  '#ffffff', '#fbbf24', '#22c55e', '#ef4444',
  '#3b82f6', '#a855f7', '#22d3ee', '#f97316',
]

const LINE_WIDTHS = [1, 2, 3]

// ─── Component ───────────────────────────────────────────────────────────────

export default function DrawingToolbar() {
  const {
    activeTool, setActiveTool,
    drawingColor, setDrawingColor,
    drawingLineWidth, setDrawingLineWidth,
    drawingsVisible, toggleDrawingsVisible,
    clearDrawings,
  } = useMarketStore()

  return (
    <div
      className="absolute left-0 top-0 h-full z-20 flex flex-col items-center
                 bg-[#161b27] border-r border-[#1e2533] py-1 gap-0.5 overflow-y-auto"
      style={{ width: 44 }}
    >
      {/* Drawing tools */}
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          title={tool.label}
          onClick={() => setActiveTool(tool.id)}
          className={[
            'w-9 h-9 flex items-center justify-center rounded transition-colors',
            activeTool === tool.id
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white',
          ].join(' ')}
        >
          {tool.icon}
        </button>
      ))}

      {/* Separator */}
      <div className="w-7 h-px bg-gray-700 my-1 flex-shrink-0" />

      {/* Color picker */}
      <div className="flex flex-col items-center gap-1 px-1">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            title={color}
            onClick={() => setDrawingColor(color)}
            className="w-5 h-5 rounded-sm transition-transform hover:scale-110 flex-shrink-0"
            style={{
              backgroundColor: color,
              outline: drawingColor === color ? '2px solid #60a5fa' : '1px solid #374151',
              outlineOffset: 1,
            }}
          />
        ))}
      </div>

      {/* Separator */}
      <div className="w-7 h-px bg-gray-700 my-1 flex-shrink-0" />

      {/* Line width */}
      <div className="flex flex-col items-center gap-1.5 px-1">
        {LINE_WIDTHS.map((w) => (
          <button
            key={w}
            title={`עובי ${w}px`}
            onClick={() => setDrawingLineWidth(w)}
            className={[
              'w-8 flex items-center justify-center rounded transition-colors py-1',
              drawingLineWidth === w
                ? 'bg-blue-600'
                : 'hover:bg-gray-800',
            ].join(' ')}
          >
            <div
              className="rounded-full bg-current"
              style={{
                width: 24,
                height: w + 1,
                backgroundColor: drawingLineWidth === w ? '#fff' : '#94a3b8',
              }}
            />
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-7 h-px bg-gray-700 my-1 flex-shrink-0" />

      {/* Hide/show toggle */}
      <button
        title={drawingsVisible ? 'הסתר ציורים' : 'הצג ציורים'}
        onClick={toggleDrawingsVisible}
        className={[
          'w-9 h-9 flex items-center justify-center rounded transition-colors',
          drawingsVisible
            ? 'text-gray-400 hover:bg-gray-800 hover:text-white'
            : 'text-yellow-400 bg-gray-800',
        ].join(' ')}
      >
        <IconEye open={drawingsVisible} />
      </button>

      {/* Clear all */}
      <button
        title="מחק הכל"
        onClick={() => {
          if (confirm('למחוק את כל הציורים?')) clearDrawings()
        }}
        className="w-9 h-9 flex items-center justify-center rounded text-gray-400
                   hover:bg-red-900/60 hover:text-red-300 transition-colors"
      >
        <IconTrash />
      </button>
    </div>
  )
}
