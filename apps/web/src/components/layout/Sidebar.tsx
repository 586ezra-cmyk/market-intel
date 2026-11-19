'use client'

// Reserved for future use — not yet rendered
import LayerList from '@/components/chart/LayerList'

export default function Sidebar() {
  return (
    <aside className="w-48 shrink-0 bg-surface-raised border-r border-surface-border overflow-y-auto p-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">שכבות גרף</h3>
      <LayerList />
    </aside>
  )
}
