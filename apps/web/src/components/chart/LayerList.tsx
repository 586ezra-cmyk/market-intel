'use client'

import { useMarketStore, LAYER_LABELS, LAYER_COLORS, LAYER_GROUPS, drawnCount } from '@/store/marketStore'

// ─── סרגל השכבות ───
// נקודה צבעונית מלאה = השכבה דלוקה ומציירת עכשיו (המספר = כמה פריטים על הגרף).
// טבעת ריקה = דלוקה, אבל אין לה כרגע מה לצייר בנכס ובמסגרת האלה. נקודה כהה = כבויה.
export default function LayerList() {
  const layers = useMarketStore(s => s.layers)
  const toggleLayer = useMarketStore(s => s.toggleLayer)
  const layerDrawn = useMarketStore(s => s.layerDrawn)
  return (
    <div className="space-y-2">
      {LAYER_GROUPS.map(g => (
        <div key={g.title}>
          <div className="px-1 pb-1 text-[10px] font-semibold text-slate-500">{g.title}</div>
          <div className="space-y-1">
            {g.ids.map(id => {
              const on = layers[id]; const n = on ? drawnCount(layerDrawn, id) : 0
              const drawing = on && n > 0
              return (
                <button
                  key={id}
                  onClick={() => toggleLayer(id)}
                  title={!on ? 'כבויה. לחיצה מדליקה' : drawing ? `דלוקה ומציירת ${n} פריטים. לחיצה מכבה` : 'דלוקה, אבל אין לה כרגע מה לצייר בנכס ובמסגרת האלה'}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-right transition-all ${
                    drawing ? 'bg-surface text-white' : on ? 'bg-surface/50 text-slate-400' : 'text-slate-600 hover:text-slate-300'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 border"
                    style={drawing ? { background: LAYER_COLORS[id], borderColor: LAYER_COLORS[id] } : on ? { background: 'transparent', borderColor: LAYER_COLORS[id] } : { background: '#1f2937', borderColor: '#1f2937' }}
                  />
                  <span className="flex-1 text-right text-[11px]">{LAYER_LABELS[id]}</span>
                  <span className={`text-[10px] tabular-nums ${drawing ? 'text-slate-300' : 'text-slate-600'}`}>{!on ? 'כבוי' : drawing ? n : 'אין מה לצייר'}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="px-1 pt-1 text-[10px] text-slate-500 leading-4">
        ● דלוקה ומציירת · ○ דלוקה, אין כרגע מה לצייר · לחיצה על קו בגרף פותחת הסבר.
      </div>
    </div>
  )
}
