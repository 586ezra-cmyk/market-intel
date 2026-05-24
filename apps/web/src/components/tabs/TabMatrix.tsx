'use client'

import { useApi } from '@/hooks/useApi'
import { useMarketStore } from '@/store/marketStore'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NQ1!', 'ES1!', 'XAUUSD']
const TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1D', '1W']

export default function TabMatrix() {
  const setSymbol = useMarketStore(s => s.setSymbol)
  const setTimeframe = useMarketStore(s => s.setTimeframe)
  const { data: alertsData } = useApi<{ alerts: any[] }>('/api/alerts?limit=500')
  const alerts = alertsData?.alerts ?? []

  // Build lookup: symbol+tf → most recent alert (by triggeredAt)
  const lookup: Record<string, any> = {}
  alerts.forEach(a => {
    const key = `${a.symbol}:${a.timeframe}`
    const ts = a.triggeredAt ?? a.createdAt ?? 0
    const existing = lookup[key]
    const existingTs = existing ? (existing.triggeredAt ?? existing.createdAt ?? 0) : 0
    if (!existing || ts > existingTs) lookup[key] = a
  })

  function getAlert(symbol: string, tf: string) {
    return lookup[`${symbol}:${tf}`] ?? null
  }

  function cellBg(alert: any | null) {
    if (!alert) return 'bg-surface hover:bg-surface-raised'
    const s = alert.score ?? 0
    if (alert.direction === 'bullish') {
      if (s >= 7) return 'bg-green-900/60 hover:bg-green-900/80 border border-green-700/40'
      if (s >= 4) return 'bg-green-900/30 hover:bg-green-900/50'
      return 'bg-green-900/15 hover:bg-green-900/30'
    } else {
      if (s >= 7) return 'bg-red-900/60 hover:bg-red-900/80 border border-red-700/40'
      if (s >= 4) return 'bg-red-900/30 hover:bg-red-900/50'
      return 'bg-red-900/15 hover:bg-red-900/30'
    }
  }

  function relativeTime(ts: number | undefined): string {
    if (!ts) return ''
    const diffMs = Date.now() - ts
    const diffM = Math.floor(diffMs / 60_000)
    const diffH = Math.floor(diffM / 60)
    const diffD = Math.floor(diffH / 24)
    if (diffD > 0) return `לפני ${diffD}י`
    if (diffH > 0) return `לפני ${diffH}ש`
    if (diffM > 0) return `לפני ${diffM}ד`
    return 'עכשיו'
  }

  function handleClick(symbol: string, tf: string) {
    setSymbol(symbol)
    setTimeframe(tf as any)
    window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'dashboard' }))
  }

  const summaries = SYMBOLS.map(symbol => {
    const cells = TIMEFRAMES.map(tf => getAlert(symbol, tf)).filter(Boolean)
    const bullish = cells.filter(c => c.direction === 'bullish').length
    const bearish = cells.filter(c => c.direction === 'bearish').length
    const maxScore = cells.reduce((m, c) => Math.max(m, c.score ?? 0), 0)
    return { symbol, bullish, bearish, maxScore, total: cells.length }
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold">🗂️ תצוגת מטריצה</h2>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-900/60 inline-block border border-green-700/40" /> לונג 7+</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-900/60 inline-block border border-red-700/40" /> שורט 7+</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-surface inline-block border border-surface-border" /> ניטרלי</span>
        </div>
      </div>
      <p className="text-xs text-slate-400">לחץ על תא → פותח גרף בדשבורד</p>

      <div className="overflow-x-auto">
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr>
              <th className="p-2 text-right text-slate-400 font-medium w-28">נכס \ TF</th>
              {TIMEFRAMES.map(tf => (
                <th key={tf} className="p-2 text-center text-slate-400 font-medium w-20">{tf}</th>
              ))}
              <th className="p-2 text-center text-slate-400 font-medium w-24">סיכום</th>
            </tr>
          </thead>
          <tbody>
            {SYMBOLS.map(symbol => {
              const sum = summaries.find(s => s.symbol === symbol)!
              return (
                <tr key={symbol} className="border-t border-surface-border">
                  <td className="p-2 font-bold font-mono">{symbol}</td>
                  {TIMEFRAMES.map(tf => {
                    const alert = getAlert(symbol, tf)
                    return (
                      <td key={tf} className="p-1">
                        <button
                          onClick={() => handleClick(symbol, tf)}
                          title={alert
                            ? `${alert.direction} · ${(alert.score ?? 0).toFixed(1)} · ${(alert.factors ?? []).join(', ')}`
                            : 'אין איתות'}
                          className={`w-full h-14 rounded-lg transition-all ${cellBg(alert)}`}
                        >
                          {alert ? (
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <span className={`text-sm ${alert.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
                                {alert.direction === 'bullish' ? '▲' : '▼'}
                              </span>
                              <span className={`font-bold text-xs ${
                                alert.score >= 7 ? 'text-white' :
                                alert.direction === 'bullish' ? 'text-green-300' : 'text-red-300'
                              }`}>
                                {(alert.score ?? 0).toFixed(1)}
                              </span>
                                  {alert.inKillZone && <span className="text-[9px] text-purple-400">🎯KZ</span>}
                              <span className="text-[8px] text-slate-500">{relativeTime(alert.triggeredAt ?? alert.createdAt)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-700">—</span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                  <td className="p-1">
                    <div className="h-14 flex flex-col items-center justify-center gap-1">
                      {sum.total > 0 ? (
                        <>
                          <div className="flex gap-2">
                            {sum.bullish > 0 && <span className="text-green-400 font-bold">▲{sum.bullish}</span>}
                            {sum.bearish > 0 && <span className="text-red-400 font-bold">▼{sum.bearish}</span>}
                          </div>
                          <span className={`text-xs ${sum.maxScore >= 7 ? 'text-yellow-400 font-bold' : 'text-slate-400'}`}>
                            {sum.maxScore.toFixed(1)}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {alerts.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-sm">
          <div className="text-3xl mb-2">🗂️</div>
          <div>אין איתותים עדיין — המטריצה תתמלא כשיגיעו התראות מ-TradingView</div>
        </div>
      )}
    </div>
  )
}
