'use client'

import { useState, useEffect } from 'react'
import { formatTime } from '@/lib/utils'
import { useApi } from '@/hooks/useApi'

interface Note {
  id: string
  alertId: string | null
  symbol: string
  timeframe: string
  rating: 1 | 2 | 3 | 4 | 5
  outcome: 'worked' | 'failed' | 'pending'
  text: string
  createdAt: number
}

const OUTCOME_LABEL = {
  worked: '✅ עבד',
  failed: '❌ לא עבד',
  pending: '⏳ ממתין',
}
const OUTCOME_COLOR = {
  worked: 'text-green-400',
  failed: 'text-red-400',
  pending: 'text-yellow-400',
}

export default function TabNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [filterOutcome, setFilterOutcome] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ alertId: '', symbol: '', timeframe: '', rating: 3, outcome: 'pending' as Note['outcome'], text: '' })

  useEffect(() => {
    const saved = localStorage.getItem('trade_notes')
    if (saved) setNotes(JSON.parse(saved))
  }, [])

  function save(list: Note[]) {
    setNotes(list)
    localStorage.setItem('trade_notes', JSON.stringify(list))
  }

  function addNote() {
    const note: Note = {
      id: crypto.randomUUID(),
      alertId: form.alertId || null,
      symbol: form.symbol,
      timeframe: form.timeframe,
      rating: form.rating as Note['rating'],
      outcome: form.outcome,
      text: form.text,
      createdAt: Date.now(),
    }
    save([note, ...notes])
    setForm({ alertId: '', symbol: '', timeframe: '', rating: 3, outcome: 'pending', text: '' })
    setShowForm(false)
  }

  function updateOutcome(id: string, outcome: Note['outcome']) {
    save(notes.map(n => n.id === id ? { ...n, outcome } : n))
  }

  const filtered = notes.filter(n => filterOutcome === 'all' || n.outcome === filterOutcome)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold">✏️ הערות ותיעוד</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs">
          {showForm ? '✕ ביטול' : '+ הערה חדשה'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[['all', 'הכל'], ['worked', '✅ עבד'], ['failed', '❌ לא עבד'], ['pending', '⏳ ממתין']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilterOutcome(v)}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filterOutcome === v ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">נכס</label>
              <input className="input" value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} placeholder="BTCUSDT" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">TF</label>
              <input className="input" value={form.timeframe} onChange={e => setForm(f => ({ ...f, timeframe: e.target.value }))} placeholder="15m" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">תוצאה</label>
              <select className="select" value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value as Note['outcome'] }))}>
                <option value="worked">✅ עבד</option>
                <option value="failed">❌ לא עבד</option>
                <option value="pending">⏳ ממתין</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">דירוג איכות:</span>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setForm(f => ({ ...f, rating: n }))}
                className={`text-xl ${form.rating >= n ? 'text-yellow-400' : 'text-slate-600'}`}>★</button>
            ))}
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">הערות</label>
            <textarea className="input" rows={3} value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} />
          </div>
          <button onClick={addNote} className="btn-primary">➕ הוסף הערה</button>
        </div>
      )}

      {/* Notes list */}
      {filtered.length === 0 && <div className="text-center py-8 text-slate-500">אין הערות</div>}
      {filtered.map(note => (
        <div key={note.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="font-bold">{note.symbol} {note.timeframe}</span>
              <span className="text-xs text-slate-400 mr-2">{formatTime(note.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-sm">{'★'.repeat(note.rating)}<span className="text-slate-600">{'★'.repeat(5 - note.rating)}</span></span>
              <select
                value={note.outcome}
                onChange={e => updateOutcome(note.id, e.target.value as Note['outcome'])}
                className={`text-xs bg-surface border border-surface-border rounded px-2 py-0.5 ${OUTCOME_COLOR[note.outcome]}`}
              >
                <option value="worked">✅ עבד</option>
                <option value="failed">❌ לא עבד</option>
                <option value="pending">⏳ ממתין</option>
              </select>
            </div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{note.text}</p>
        </div>
      ))}
    </div>
  )
}
