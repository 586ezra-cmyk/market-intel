'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { useApi, apiPost } from '@/hooks/useApi'
import { formatTime } from '@/lib/utils'

interface BtTrade {
  id: string
  tradeNum?: number
  symbol: string
  direction: 'LONG' | 'SHORT'
  openedAt: number
  outcome: 'W' | 'L' | 'BE'
  rr: number
  stopPct: number
  isContinuation: boolean
  checklist: Record<string, boolean>
  incubationDays?: number
  incubationHours?: number
  actualTimeHours?: number
  notes?: string
  strategy: 'ICT' | 'Wyckoff' | 'iSMT' | 'Other'
}

const CHECKLIST_KEYS = [
  { key: 'trigger',  label: 'זיהיתי טריגר?' },
  { key: 'time',     label: 'כניסה לפי זמן?' },
  { key: 'stop',     label: 'סטופ נכון?' },
  { key: 'tf',       label: 'כניסה לפי TF?' },
  { key: 'manage',   label: 'ניהול עסקה?' },
]

const EMPTY_FORM = {
  symbol: 'BTCUSDT',
  direction: 'LONG' as const,
  outcome: 'W' as const,
  rr: 2,
  stopPct: 0.5,
  isContinuation: false,
  checklist: {} as Record<string, boolean>,
  notes: '',
  strategy: 'ICT' as const,
}

export default function TabBacktest() {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { data, refetch } = useApi<{ entries: BtTrade[]; stats: any }>('/api/backtest?limit=200')
  const trades = data?.entries ?? []
  const stats = data?.stats ?? {}

  async function addTrade() {
    setSubmitting(true)
    try {
      await apiPost('/api/backtest', {
        ...form,
        openedAt: Date.now(),
        tradeNum: trades.length + 1,
      })
      setForm({ ...EMPTY_FORM })
      setShowForm(false)
      refetch()
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteTrade(id: string) {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/backtest/${id}`, {
      method: 'DELETE',
    })
    refetch()
  }

  function exportExcel() {
    const rows = trades.map(t => ({
      '#': t.tradeNum,
      נכס: t.symbol,
      כיוון: t.direction,
      תאריך: formatTime(t.openedAt),
      תוצאה: t.outcome,
      'R:R': t.rr,
      'סטופ %': t.stopPct,
      אסטרטגיה: t.strategy,
      מסקנות: t.notes,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'בק-טסטינג')
    XLSX.writeFile(wb, 'backtest.xlsx')
  }

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold">🔬 יומן בק-טסטינג</h2>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="btn-ghost text-xs">📥 Excel</button>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary text-xs">
            {showForm ? '✕ סגור' : '+ עסקה חדשה'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Win Rate',          value: `${stats.winRate ?? '—'}%`,  color: 'text-green-400' },
          { label: 'Loss Rate',         value: stats.total ? `${((stats.losses / stats.total) * 100).toFixed(1)}%` : '—', color: 'text-red-400' },
          { label: 'ממוצע R:R בנצח',   value: stats.avgRR ?? '—',          color: 'text-brand-400' },
          { label: 'סה״כ עסקאות',      value: stats.total ?? 0,            color: 'text-slate-300' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Strategy breakdown */}
      {(stats.byStrategy ?? []).length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3">אסטרטגיות</h3>
          <div className="flex gap-4 flex-wrap">
            {stats.byStrategy.map((s: any) => (
              <div key={s.strategy} className="text-center">
                <div className="text-lg font-bold text-brand-400">{s.winRate}%</div>
                <div className="text-xs text-slate-400">{s.strategy}</div>
                <div className="text-[10px] text-slate-600">{s.wins}/{s.total}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New trade form */}
      {showForm && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-sm">📝 עסקה חדשה</h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">מטבע</label>
              <select className="select" value={form.symbol}
                onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}>
                {['BTCUSDT','ETHUSDT','SOLUSDT','NQ1!','ES1!','XAUUSD'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">כיוון</label>
              <select className="select" value={form.direction}
                onChange={e => setForm(f => ({ ...f, direction: e.target.value as any }))}>
                <option value="LONG">▲ LONG</option>
                <option value="SHORT">▼ SHORT</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">תוצאה</label>
              <select className="select" value={form.outcome}
                onChange={e => setForm(f => ({ ...f, outcome: e.target.value as any }))}>
                <option value="W">✅ Win</option>
                <option value="L">❌ Loss</option>
                <option value="BE">🤝 Break Even</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">R:R</label>
              <select className="select" value={form.rr}
                onChange={e => setForm(f => ({ ...f, rr: Number(e.target.value) }))}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>1:{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">מרחק סטופ %</label>
              <input type="number" step="0.1" className="input" value={form.stopPct}
                onChange={e => setForm(f => ({ ...f, stopPct: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">אסטרטגיה</label>
              <select className="select" value={form.strategy}
                onChange={e => setForm(f => ({ ...f, strategy: e.target.value as any }))}>
                {['ICT','Wyckoff','iSMT','Other'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={form.isContinuation} className="w-4 h-4"
                  onChange={e => setForm(f => ({ ...f, isContinuation: e.target.checked }))} />
                המשכיות?
              </label>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <label className="text-xs text-slate-400 mb-2 block">צ׳קליסט:</label>
            <div className="flex flex-wrap gap-4">
              {CHECKLIST_KEYS.map(c => (
                <label key={c.key} className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input type="checkbox"
                    checked={!!form.checklist[c.key]}
                    className="w-4 h-4"
                    onChange={e => setForm(f => ({
                      ...f,
                      checklist: { ...f.checklist, [c.key]: e.target.checked }
                    }))} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">מסקנות וחידודים</label>
            <textarea className="input" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <button onClick={addTrade} disabled={submitting} className="btn-primary">
            {submitting ? 'שומר...' : '➕ הוסף עסקה'}
          </button>
        </div>
      )}

      {/* Trade table */}
      {trades.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <div className="text-4xl mb-2">🔬</div>
          <div>אין עסקאות בק-טסטינג עדיין</div>
          <div className="text-xs mt-1">לחץ על ״+ עסקה חדשה״ כדי להתחיל</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead>
              <tr className="text-slate-400 border-b border-surface-border">
                {['#','נכס','כיוון','תוצאה','R:R','אסטרטגיה','צ׳קליסט','מסקנות','פעולות'].map(h => (
                  <th key={h} className="pb-2 px-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => {
                const checks = CHECKLIST_KEYS.map(c => t.checklist?.[c.key])
                const passedChecks = checks.filter(Boolean).length

                return (
                  <tr key={t.id} className="border-b border-surface-border hover:bg-surface-raised group">
                    <td className="py-2 px-2 text-slate-400">{t.tradeNum ?? i+1}</td>
                    <td className="py-2 px-2 font-mono">{t.symbol}</td>
                    <td className="py-2 px-2">
                      <span className={`dir-badge ${t.direction === 'LONG' ? 'bullish' : 'bearish'}`}>
                        {t.direction === 'LONG' ? '▲' : '▼'} {t.direction}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <span className={
                        t.outcome === 'W' ? 'text-green-400' :
                        t.outcome === 'L' ? 'text-red-400' : 'text-slate-400'
                      }>
                        {t.outcome === 'W' ? '✅' : t.outcome === 'L' ? '❌' : '🤝'} {t.outcome}
                      </span>
                    </td>
                    <td className="py-2 px-2">1:{t.rr}</td>
                    <td className="py-2 px-2 text-slate-400">{t.strategy}</td>
                    <td className="py-2 px-2">
                      <span className={passedChecks === 5 ? 'text-green-400' : passedChecks >= 3 ? 'text-yellow-400' : 'text-red-400'}>
                        {passedChecks}/{CHECKLIST_KEYS.length}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-slate-400 max-w-40 truncate">{t.notes}</td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => deleteTrade(t.id)}
                        className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
