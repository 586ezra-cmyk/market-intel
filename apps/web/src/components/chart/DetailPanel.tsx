'use client'

import { useMarketStore } from '@/store/marketStore'
import { formatPrice, formatTime, scoreBadgeClass } from '@/lib/utils'
import { useApi } from '@/hooks/useApi'
import type { Alert } from '@market/shared'

interface Props {
  alertId: string
  onClose: () => void
}

const FACTOR_HE: Record<string, string> = {
  BOS:             'שבירת מבנה',
  CHoCH:           'שינוי כיוון',
  LiquiditySweep:  'שאיבת נזילות',
  FVG:             'FVG פעיל',
  SMT:             'SMT דיברגנס',
}

export default function DetailPanel({ alertId, onClose }: Props) {
  const { data: alert } = useApi<Alert>(`/api/alerts/${alertId}`)

  if (!alert) return null

  const score = alert.score ?? 0

  return (
    <div className="absolute top-4 right-4 z-50 w-80 card shadow-2xl border-brand-600/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`score-badge ${scoreBadgeClass(score)}`}>{score.toFixed(1)}</span>
          <div>
            <div className="font-bold text-sm">{alert.symbol}</div>
            <div className="text-xs text-slate-400">{alert.timeframe} · {formatTime(alert.triggeredAt)}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none">✕</button>
      </div>

      {/* Direction */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`dir-badge ${alert.direction}`}>
          {alert.direction === 'bullish' ? '▲ לונג' : '▼ שורט'}
        </span>
        <span className="text-xs text-slate-400">{alert.session} · {alert.inKillZone ? '🎯 Kill Zone' : 'מחוץ ל-KZ'}</span>
      </div>

      {/* Factors */}
      <div className="mb-3">
        <div className="text-xs text-slate-400 mb-1">אישורים:</div>
        <div className="flex flex-wrap gap-1">
          {(alert.factors ?? []).map(f => (
            <span key={f} className="px-2 py-0.5 bg-brand-900/30 text-brand-400 text-xs rounded">
              {FACTOR_HE[f] ?? f}
            </span>
          ))}
        </div>
      </div>

      {/* Premium/Discount */}
      <div className="text-xs text-slate-400 mb-3">
        מיקום: <span className={`font-medium ${
          alert.premiumDiscount === 'premium' ? 'text-red-400' : 'text-green-400'
        }`}>
          {alert.premiumDiscount === 'premium' ? 'Premium 🔴' : 'Discount 🟢'}
        </span>
      </div>

      {/* SL / TP */}
      {alert.stopLoss && (
        <div className="border-t border-surface-border pt-3 mt-1">
          <div className="text-xs text-slate-400 mb-2">יעדים:</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-red-400">SL</span>
              <span className="font-mono">${formatPrice(alert.stopLoss)}</span>
            </div>
            {alert.tp1 && <div className="flex justify-between">
              <span className="text-green-400">TP1</span>
              <span className="font-mono">${formatPrice(alert.tp1)}</span>
            </div>}
            {alert.tp2 && <div className="flex justify-between">
              <span className="text-green-400">TP2</span>
              <span className="font-mono">${formatPrice(alert.tp2)}</span>
            </div>}
            {alert.tp3 && <div className="flex justify-between">
              <span className="text-green-400">TP3</span>
              <span className="font-mono">${formatPrice(alert.tp3)}</span>
            </div>}
          </div>
        </div>
      )}

      {/* Hebrew message */}
      <div className="border-t border-surface-border pt-3 mt-3">
        <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
          {alert.messageHe}
        </pre>
      </div>
    </div>
  )
}
