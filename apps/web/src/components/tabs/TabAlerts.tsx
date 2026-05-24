'use client'

import { useState } from 'react'
import { useMarketStore } from '@/store/marketStore'
import { useApi, apiPost } from '@/hooks/useApi'
import { formatTime, formatPrice, scoreBadgeClass } from '@/lib/utils'

const FACTOR_HE: Record<string, string> = {
  BOS: 'BOS',
  CHoCH: 'CHoCH',
  LiquiditySweep: 'שאיבת נזילות',
  FVG: 'FVG',
  SMT: 'SMT',
  DoubleTop: 'דאבל טופ',
  DoubleBottom: 'דאבל בוטום',
  Wyckoff: 'Wyckoff',
  OrderBlock: 'Order Block',
}

const FACTOR_COLOR: Record<string, string> = {
  BOS: 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/40',
  CHoCH: 'bg-purple-900/40 text-purple-300 border border-purple-700/40',
  LiquiditySweep: 'bg-amber-900/40 text-amber-300 border border-amber-700/40',
  FVG: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40',
  SMT: 'bg-pink-900/40 text-pink-300 border border-pink-700/40',
  DoubleTop: 'bg-red-900/40 text-red-300 border border-red-700/40',
  DoubleBottom: 'bg-green-900/40 text-green-300 border border-green-700/40',
  Wyckoff: 'bg-orange-900/40 text-orange-300 border border-orange-700/40',
  OrderBlock: 'bg-blue-900/40 text-blue-300 border border-blue-700/40',
}

const TF_OPTIONS = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '6h', '12h', '1D', '1W', '1M']

const SYMBOL_OPTIONS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'MATICUSDT',
  'XAUUSD', 'NQ', 'ES',
]

export default function TabAlerts() {
  const [filterSymbol, setFilterSymbol] = useState('')
  const [filterTF, setFilterTF] = useState('')
  const [filterDir, setFilterDir] = useState('')
  const [rating, setRating] = useState<Record<string, number>>({})
  const [ratingNote, setRatingNote] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const params = new URLSearchParams()
  if (filterSymbol) params.set('symbol', filterSymbol)
  if (filterTF) params.set('timeframe', filterTF)

  const { data, refetch } = useApi<{ alerts: any[] }>(`/api/alerts?${params}`)
  const liveAlerts = useMarketStore(s => s.alerts)

  const allAlerts = [...liveAlerts, ...(data?.alerts ?? [])]
    .filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i)
    .filter(a => !filterDir || a.direction === filterDir)
    .slice(0, 100)

  async function submitRating(alertId: string) {
    try {
      await apiPost(`/api/alerts/${alertId}/rate`, {
        rating: rating[alertId],
        notes: ratingNote[alertId] ?? '',
      })
      refetch()
    } catch {}
  }

  return (
    <div className="p-4 space-y-4">

      {/* ── Symbol filter ── */}
      <div className="space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs text-gray-400 shrink-0">נכס:</span>
          <button
            onClick={() => setFilterSymbol('')}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              filterSymbol === ''
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700'
            }`}
          >
            הכל
          </button>
          {SYMBOL_OPTIONS.map(sym => (
            <button
              key={sym}
              onClick={() => setFilterSymbol(sym === filterSymbol ? '' : sym)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                filterSymbol === sym
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>

        {/* ── TF filter ── */}
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs text-gray-400 shrink-0">TF:</span>
          <button
            onClick={() => setFilterTF('')}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              filterTF === ''
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700'
            }`}
          >
            הכל
          </button>
          {TF_OPTIONS.map(tf => (
            <button
              key={tf}
              onClick={() => setFilterTF(tf === filterTF ? '' : tf)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                filterTF === tf
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* ── Direction + refresh ── */}
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-400 shrink-0">כיוון:</span>
          {[
            { v: '', label: 'הכל' },
            { v: 'bullish', label: '▲ לונג' },
            { v: 'bearish', label: '▼ שורט' },
          ].map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setFilterDir(v)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                filterDir === v
                  ? v === 'bullish'
                    ? 'bg-green-700 border-green-600 text-white'
                    : v === 'bearish'
                    ? 'bg-red-700 border-red-600 text-white'
                    : 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}

          <button
            onClick={refetch}
            className="mr-auto px-3 py-1 rounded-full text-xs border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700 transition-all font-bold"
          >
            🔄 רענן
          </button>
        </div>
      </div>

      {/* ── Alerts count ── */}
      <div className="text-xs text-gray-400">
        {allAlerts.length} התראות{filterSymbol ? ` עבור ${filterSymbol}` : ''}{filterTF ? ` | ${filterTF}` : ''}
      </div>

      {/* ── Alert list ── */}
      {allAlerts.length === 0 && (
        <div className="text-center text-slate-500 py-16 flex flex-col items-center gap-2">
          <span className="text-3xl">🔔</span>
          <span>אין התראות עדיין</span>
          <span className="text-xs">ההתראות יופיעו כאן כשהמערכת תזהה קונפלואנס</span>
        </div>
      )}

      <div className="space-y-2">
        {allAlerts.map(alert => {
          const isExpanded = expandedId === alert.id
          const isBull = alert.direction === 'bullish'

          return (
            <div
              key={alert.id}
              className={`rounded-lg border transition-all overflow-hidden ${
                isBull
                  ? 'border-green-800/50 bg-green-950/20'
                  : 'border-red-800/50 bg-red-950/20'
              }`}
            >
              {/* ── Main row ── */}
              <button
                className="w-full text-right p-3 flex items-center gap-3"
                onClick={() => setExpandedId(isExpanded ? null : alert.id)}
              >
                {/* Score badge */}
                <span className={`score-badge shrink-0 ${scoreBadgeClass(alert.score ?? 0)}`}>
                  {(alert.score ?? 0).toFixed(1)}
                </span>

                {/* Symbol + TF */}
                <div className="flex-1 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-xs text-slate-500">{formatTime(alert.triggeredAt)}</span>
                    <span className="text-sm text-slate-400">{alert.timeframe}</span>
                    <span className="font-bold text-white">{alert.symbol}</span>
                  </div>
                  {/* Factors row */}
                  <div className="flex flex-wrap gap-1 mt-1 justify-end">
                    {(alert.factors ?? []).map((f: string) => (
                      <span key={f} className={`px-1.5 py-0.5 text-xs rounded-full ${FACTOR_COLOR[f] ?? 'bg-slate-800 text-slate-300'}`}>
                        {FACTOR_HE[f] ?? f}
                      </span>
                    ))}
                    {alert.inKillZone && (
                      <span className="px-1.5 py-0.5 bg-purple-900/40 text-purple-300 border border-purple-700/40 text-xs rounded-full">
                        🕐 Kill Zone
                      </span>
                    )}
                  </div>
                </div>

                {/* Direction */}
                <span className={`shrink-0 px-2 py-1 rounded text-xs font-bold ${
                  isBull ? 'bg-green-800/50 text-green-300' : 'bg-red-800/50 text-red-300'
                }`}>
                  {isBull ? '▲ לונג' : '▼ שורט'}
                </span>

                <span className="text-slate-500 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {/* ── Expanded detail ── */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-surface-border/50">

                  {/* SL / TP */}
                  {(alert.stopLoss || alert.tp1) && (
                    <div className="grid grid-cols-4 gap-2 pt-2">
                      {alert.stopLoss && (
                        <div className="bg-red-950/40 border border-red-800/30 rounded p-2 text-center">
                          <div className="text-xs text-red-400 mb-0.5">SL</div>
                          <div className="text-sm font-mono text-red-300">${formatPrice(alert.stopLoss)}</div>
                        </div>
                      )}
                      {alert.tp1 && (
                        <div className="bg-green-950/40 border border-green-800/30 rounded p-2 text-center">
                          <div className="text-xs text-green-400 mb-0.5">TP1</div>
                          <div className="text-sm font-mono text-green-300">${formatPrice(alert.tp1)}</div>
                        </div>
                      )}
                      {alert.tp2 && (
                        <div className="bg-green-950/40 border border-green-800/30 rounded p-2 text-center">
                          <div className="text-xs text-green-400 mb-0.5">TP2</div>
                          <div className="text-sm font-mono text-green-300">${formatPrice(alert.tp2)}</div>
                        </div>
                      )}
                      {alert.tp3 && (
                        <div className="bg-green-950/40 border border-green-800/30 rounded p-2 text-center">
                          <div className="text-xs text-green-400 mb-0.5">TP3</div>
                          <div className="text-sm font-mono text-green-300">${formatPrice(alert.tp3)}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Context */}
                  <div className="flex gap-3 text-xs text-slate-400 flex-wrap">
                    {alert.session && (
                      <span>📍 סשן: <span className="text-slate-300">{alert.session}</span></span>
                    )}
                    {alert.premiumDiscount && (
                      <span>📊 {alert.premiumDiscount === 'premium' ? '🔴 Premium' : alert.premiumDiscount === 'discount' ? '🟢 Discount' : '⚪ Midpoint'}</span>
                    )}
                  </div>

                  {/* Message */}
                  {alert.messageHe && (
                    <div className="bg-surface rounded p-2 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
                      {alert.messageHe}
                    </div>
                  )}

                  {/* Rating */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-slate-400 shrink-0">דרג:</span>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setRating(r => ({ ...r, [alert.id]: n }))}
                        className={`text-xl transition-colors leading-none ${
                          (rating[alert.id] ?? alert.userRating ?? 0) >= n
                            ? 'text-yellow-400'
                            : 'text-slate-700'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                    <input
                      className="input flex-1 text-xs py-1"
                      placeholder="הערה אישית..."
                      value={ratingNote[alert.id] ?? alert.userNotes ?? ''}
                      onChange={e => setRatingNote(r => ({ ...r, [alert.id]: e.target.value }))}
                    />
                    {rating[alert.id] && (
                      <button onClick={() => submitRating(alert.id)} className="btn-primary text-xs px-3 py-1">
                        שמור
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
