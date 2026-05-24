'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatTime } from '@/lib/utils'

interface Note {
  id: string
  content: string
  created_at: number
  updated_at: number
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function TabNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [showForm, setShowForm] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const loadNotes = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/notes`)
      if (r.ok) setNotes(await r.json())
    } catch {}
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  async function addNote() {
    if (!text.trim()) return
    setSaving(true)
    try {
      const id = crypto.randomUUID()
      await fetch(`${API}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: text.trim() }),
      })
      setText('')
      setShowForm(false)
      await loadNotes()
    } catch {}
    finally { setSaving(false) }
  }

  async function deleteNote(id: string) {
    try {
      await fetch(`${API}/api/notes/${id}`, { method: 'DELETE' })
      setNotes(prev => prev.filter(n => n.id !== id))
    } catch {}
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold">✏️ הערות ותיעוד</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs">
          {showForm ? '✕ ביטול' : '+ הערה חדשה'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">הערה</label>
            <textarea
              className="input w-full"
              rows={4}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="כתוב הערה, תצפית, תובנה..."
            />
          </div>
          <button onClick={addNote} disabled={saving || !text.trim()} className="btn-primary">
            {saving ? 'שומר...' : '➕ הוסף הערה'}
          </button>
        </div>
      )}

      {/* Notes list */}
      {notes.length === 0 && (
        <div className="text-center py-8 text-slate-500">אין הערות</div>
      )}
      {notes.map(note => (
        <div key={note.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs text-slate-400">{formatTime(note.created_at)}</span>
            <button
              onClick={() => deleteNote(note.id)}
              className="text-slate-500 hover:text-red-400 text-sm leading-none"
              title="מחק הערה"
            >✕</button>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{note.content}</p>
        </div>
      ))}
    </div>
  )
}
