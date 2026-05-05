'use client'

import { useState } from 'react'
import { formatTime, formatPrice } from '@/lib/utils'
import { useApi, apiPost } from '@/hooks/useApi'
import * as XLSX from 'xlsx'

interface JournalEntry {
  id: string
  tradeNum?: number
  symbol: string
  direction: 'LONG' | 'SHORT'
  openedAt: number
  closedAt?: number | null
  entryPrice: number
  stopPrice?: number | null
  exitPrice?: number | null
  sizeUsd?: number | null
  commissionUsd?: number
  pnlUsd?: number | null
  notes?: string | null
  screenshotUrl?: string | null
  alertId?: string | null
}

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','NQ1!','ES1!','XAUUSD','BNBUSDT']

const EMPTY_FORM = {
  symbol: 'BTCUSDT',
  direction: 'LONG' as const,
  entryPrice: 0,
  stopPrice: 0,
  exitPrice: 0,
  sizeUsd: 0,
  commissionUsd: 0,
  notes: '',
}

function calcPnL(entry: number, exit: number, size: number, dir: 'LONG'|'SHORT', fee: number): number {
  if (!entry || !exit || !size) return 0
  const d = dir === 'LONG' ? 1 : -1
  return parseFloat(((exit - entry) / entry * d * size - fee).toFixed(2))
}

export default function TabJournal() {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [showForm, setShowForm] = useState(false)
  const [section, setSection] = useState<'all' | 'daily' | 'swing'>('all')
  const [submitting, setSubmitting] = useState(false)

  const { data, refetch } = useApi<{ entries: JournalEntry[]; stats: any }>('/api/journal?limit=300')
  const trades = data?.entries ?? []
  const stats = data?.stats ?? {}

  // Filter by section
  const filtered = section === 'all' ? trades : trades.filter(t => {
    const duration = t.closedAt ? (t.closedAt - t.openedAt) / 3_600_000 : null
    if (section === 'daily') return duration !== null && duration <= 24
    if (section === 'swing') return duration === null || duration > 24
    return true
  })

  const previewPnL = calcPnL(form.entryPrice, form.exitPrice, form.sizeUsd, form.direction, form.commissionUsd)

  async function addTrade() {
    setSubmitting(true)
    try {
      await apiPost('/api/journal', {
        ...form,
        openedAt: Date.now(),
        closedAt: form.exitPrice ? Date.now() : null,
        tradeNum: trades.length + 1,
      })
      setForm({ ...EMPTY_FORM })
      setShowForm(false)
      refetch()
    } catch (e) { console.error(e) }
    finally { setSubmitting(false) }
  }

  async function deleteTrade(id: string) {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    await fetch(`${base}/api/journal/${id}`, { method: 'DELETE' })
    refetch()
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(filtered.map((t, i) => ({
      '#': t.tradeNum ?? i + 1,
      'תאריך פתיחה': formatTime(t.openedAt),
      'תאריך יציאה': t.closedAt ? formatTime(t.closedAt) : '—',
      'מטבע': t.symbol,
      'כיוון': t.direction,
      'כניסה': t.entryPrice,
      'סטופ': t.stopPrice ?? '—',
      'יציאה': t.exitPrice ?? '—',
      'סכום $': t.sizeUsd ?? '—',
      'עמלה $': t.commissionUsd ?? 0,
      'רווח/הפסד $': t.pnlUsd ?? '—',
      'הערות': t.notes ?? '',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'יומן מסחר')
    XLSX.writeFile(wb, 'journal.xlsx')
  }

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold">📓 יומן מסחר אישי</h2>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="btn-ghost text-xs">📥 ייצוא Excel</button>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary text-xs">
            {showForm ? '✕ ביטול' : '+ עסקה חדשה'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'סה״כ רווח/הפסד',
            value: stats.totalPnl !== undefined ? `${stats.totalPnl >= 0 ? '+' : ''}$${Math.abs(stats.totalPnl).toFixed(0)}` : '—',
            color: (stats.totalPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
          },
          { label: 'Win Rate',     value: `${stats.winRate ?? '—'}%`, color: 'text-brand-400' },
          { label: 'ממוצע P&L',   value: stats.avgPnl !== undefined ? `$${stats.avgPnl}` : '—', color: 'text-slate-300' },
          { label: 'סה״כ עסקאות', value: stats.total ?? 0, color: 'text-white' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1">
        {([
          { id: 'all',   label: '📊 הכל' },
          { id: 'daily', label: '📈 יומי (≤24h)' },
          { id: 'swing', label: '🌊 סווינג (>24h)' },
        ] as const).map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              section === s.id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* New trade form */}
      {showForm && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-sm">📝 עסקה חדשה</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">מטבע</label>
              <select className="select" value={form.symbol}
                onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}>
                {SYMBOLS.map(s => <option key={s}>{s}</option>)}
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
            {[
              { label: 'מחיר כניסה', key: 'entryPrice' },
              { label: 'מחיר סטופ', key: 'stopPrice' },
              { label: 'מחיר יציאה', key: 'exitPrice' },
              { label: 'סכום ($)', key: 'sizeUsd' },
              { label: 'עמלה ($)', key: 'commissionUsd' },
            ].map(field => (
              <div key={field.key}>
                <label className="text-xs text-slate-400 mb-1 block">{field.label}</label>
                <input
                  type="number" step="any" className="input"
                  value={(form as any)[field.key] || ''}
                  onChange={e => setForm(f => ({ ...f, [field.key]: Number(e.target.value) }))}
                />
              </div>
            ))}
            <div className="col-span-2 sm:col-span-3">
              <label className="text-xs text-slate-400 mb-1 block">הערות</label>
              <textarea className="input" rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="text-sm">
              <span className="text-slate-400">רווח/הפסד משוער: </span>
              <span className={previewPnL >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {previewPnL >= 0 ? '+' : ''}${previewPnL.toFixed(2)}
              </span>
              {form.stopPrice > 0 && form.entryPrice > 0 && (
                <span className="text-slate-500 text-xs mr-3">
                  SL: {(Math.abs(form.entryPrice - form.stopPrice) / form.entryPrice * 100).toFixed(2)}%
                </span>
              )}
            </div>
            <button onClick={addTrade} disabled={submitting} className="btn-primary">
              {submitting ? 'שומר...' : '➕ הוסף עסקה'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <div className="text-4xl mb-2">📓</div>
          <div>אין עסקאות ביומן עדיין</div>
          <div className="text-xs mt-1">לחץ ״+ עסקה חדשה״ כדי להתחיל לתעד</div>
        </div>
      )}

      {/* Trades table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead>
              <tr className="text-slate-400 border-b border-surface-border">
                {['#','נכס','כיוון','כניסה','סטופ','יציאה','R:R','P&L','תאריך',''].map(h => (
                  <th key={h} className="pb-2 px-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, idx) => {
                const pnl = t.pnlUsd
                const rr = t.entryPrice && t.stopPrice && t.exitPrice
                  ? ((Math.abs(t.exitPrice - t.entryPrice)) / (Math.abs(t.entryPrice - t.stopPrice))).toFixed(1)
                  : null

                return (
                  <tr key={t.id} className="border-b border-surface-border hover:bg-surface-raised group">
                    <td className="py-2 px-2 text-slate-500">{t.tradeNum ?? idx + 1}</td>
                    <td className="py-2 px-2 font-mono font-bold">{t.symbol}</td>
                    <td className="py-2 px-2">
                      <span className={`dir-badge ${t.direction === 'LONG' ? 'bullish' : 'bearish'}`}>
                        {t.direction === 'LONG' ? '▲' : '▼'} {t.direction}
                      </span>
                    </td>
                    <td className="py-2 px-2">${formatPrice(t.entryPrice)}</td>
                    <td className="py-2 px-2 text-slate-500">{t.stopPrice ? `$${formatPrice(t.stopPrice)}` : '—'}</td>
                    <td className="py-2 px-2">{t.exitPrice ? `$${formatPrice(t.exitPrice)}` : <span className="text-slate-600">פתוח</span>}</td>
                    <td className="py-2 px-2 text-slate-400">{rr ? `1:${rr}` : '—'}</td>
                    <td className={`py-2 px-2 font-bold ${pnl == null ? 'text-slate-500' : pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pnl != null ? `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 px-2 text-slate-500">{formatTime(t.openedAt).slice(0, 10)}</td>
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
            {/* Totals row */}
            <tfoot>
              <tr className="border-t border-surface-border text-sm font-bold">
                <td colSpan={7} className="pt-3 px-2 text-slate-400">סה״כ</td>
                <td className={`pt-3 px-2 ${(stats.totalPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.totalPnl !== undefined ? `${stats.totalPnl >= 0 ? '+' : ''}$${Math.abs(stats.totalPnl).toFixed(2)}` : '—'}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
