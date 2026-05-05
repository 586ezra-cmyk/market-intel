'use client'

import { useState } from 'react'
import { useMarketStore } from '@/store/marketStore'
import { useApi, apiPost } from '@/hooks/useApi'
import { formatTime, formatPrice, scoreBadgeClass } from '@/lib/utils'
import type { Alert } from '@market/shared'

const FACTOR_HE: Record<string, string> = {
  BOS: 'BOS', CHoCH: 'CHoCH', LiquiditySweep: 'נזילות', FVG: 'FVG', SMT: 'SMT',
}

export default function TabAlerts() {
  const [filterSymbol, setFilterSymbol] = useState('')
  const [filterTF, setFilterTF] = useState('')
  const [rating, setRating] = useState<Record<string, number>>({})
  const [ratingNote, setRatingNote] = useState<Record<string, string>>({})

  const { data, refetch } = useApi<{ alerts: any[] }>(`/api/alerts?symbol=${filterSymbol}&timeframe=${filterTF}`)
  const liveAlerts = useMarketStore(s => s.alerts)

  const allAlerts = [...liveAlerts, ...(data?.alerts ?? [])]
    .filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i)
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
    <div className="p-4 space-y-3">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          className="input w-40"
          placeholder="נכס (BTCUSDT)"
          value={filterSymbol}
          onChange={e => setFilterSymbol(e.target.value)}
        />
        <select className="select w-24" value={filterTF} onChange={e => setFilterTF(e.target.value)}>
          <option value="">כל TF</option>
          {['1m','5m','15m','30m','1h','4h','1D'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
        </select>
        <button onClick={refetch} className="btn-ghost">🔄 רענן</button>
      </div>

      {/* Alert list */}
      {allAlerts.length === 0 && (
        <div className="text-center text-slate-500 py-12">אין התראות עדיין</div>
      )}

      {allAlerts.map(alert => (
        <div key={alert.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`score-badge ${scoreBadgeClass(alert.score ?? 0)}`}>
                {(alert.score ?? 0).toFixed(1)}
              </span>
              <div>
                <div className="font-bold">{alert.symbol} <span className="text-slate-400 text-sm">{alert.timeframe}</span></div>
                <div className="text-xs text-slate-400">{formatTime(alert.triggeredAt)}</div>
              </div>
            </div>
            <span className={`dir-badge ${alert.direction}`}>
              {alert.direction === 'bullish' ? '▲ לונג' : '▼ שורט'}
            </span>
          </div>

          {/* Factors */}
          <div className="flex flex-wrap gap-1">
            {(alert.factors ?? []).map((f: string) => (
              <span key={f} className="px-1.5 py-0.5 bg-brand-900/30 text-brand-400 text-xs rounded">
                {FACTOR_HE[f] ?? f}
              </span>
            ))}
            {alert.inKillZone && <span className="px-1.5 py-0.5 bg-purple-900/30 text-purple-400 text-xs rounded">Kill Zone</span>}
          </div>

          {/* TP/SL */}
          {alert.stopLoss && (
            <div className="flex gap-4 text-xs text-slate-400">
              <span>SL: <span className="text-red-400">${formatPrice(alert.stopLoss)}</span></span>
              {alert.tp1 && <span>TP1: <span className="text-green-400">${formatPrice(alert.tp1)}</span></span>}
              {alert.tp2 && <span>TP2: <span className="text-green-400">${formatPrice(alert.tp2)}</span></span>}
            </div>
          )}

          {/* Rating */}
          <div className="flex items-center gap-2 pt-1 border-t border-surface-border">
            <span className="text-xs text-slate-400">דירוג:</span>
            {[1,2,3,4,5].map(n => (
              <button
                key={n}
                onClick={() => setRating(r => ({ ...r, [alert.id]: n }))}
                className={`text-lg transition-colors ${rating[alert.id] >= n ? 'text-yellow-400' : 'text-slate-600'}`}
              >★</button>
            ))}
            <input
              className="input flex-1 text-xs"
              placeholder="הערה..."
              value={ratingNote[alert.id] ?? ''}
              onChange={e => setRatingNote(r => ({ ...r, [alert.id]: e.target.value }))}
            />
            {rating[alert.id] && (
              <button onClick={() => submitRating(alert.id)} className="btn-primary text-xs px-3">שלח</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
