'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) { window.location.href = '/'; return }
      if (res.status === 429) setError('יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.')
      else if (res.status === 503) setError('הכניסה לא מוגדרת בשרת (SITE_PASSWORD חסר).')
      else setError('סיסמה שגויה.')
    } catch {
      setError('אין חיבור לשרת.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6" dir="rtl">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold">מערכת מסחר חכמה</h1>
          <p className="text-sm text-slate-400 mt-1">האתר פרטי. הזן סיסמה כדי להיכנס.</p>
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="סיסמה"
          className="w-full rounded-lg bg-surface border border-surface-border px-3 py-2 text-white outline-none focus:border-blue-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-2 font-bold"
        >{busy ? 'בודק…' : 'כניסה'}</button>
      </form>
    </main>
  )
}
