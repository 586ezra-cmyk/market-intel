'use client'

import { useMarketStore, LAYER_LABELS, LAYER_COLORS, type LayerId } from '@/store/marketStore'

export default function Sidebar() {
  const { layers, toggleLayer } = useMarketStore()

  return (
    <aside className="w-48 shrink-0 bg-surface-raised border-r border-surface-border overflow-y-auto p-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">שכבות גרף</h3>
      <div className="flex flex-col gap-1.5">
        {(Object.keys(LAYER_LABELS) as LayerId[]).map(id => (
          <button
            key={id}
            onClick={() => toggleLayer(id)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs text-right transition-all ${
              layers[id]
                ? 'bg-surface text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: layers[id] ? LAYER_COLORS[id] : '#2d3748' }}
            />
            <span className="flex-1 text-right">{LAYER_LABELS[id]}</span>
            <span className="text-slate-600">{layers[id] ? '●' : '○'}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
