'use client'

import { useApi } from '@/hooks/useApi'
import { useMarketStore } from '@/store/marketStore'
import { scoreBadgeClass } from '@/lib/utils'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NQ1!', 'ES1!', 'XAUUSD']
const TIMEFRAMES = ['5m', '15m', '1h', '4h']

export default function TabQuickConfluence() {
  const setSymbol = useMarketStore(s => s.setSymbol)
  const setTimeframe = useMarketStore(s => s.setTimeframe)
  const { data: alerts } = useApi<{ alerts: any[] }>('/api/alerts?limit=200')

  const rows = SYMBOLS.map(symbol => {
    const best = TIMEFRAMES.map(tf => {
      const a = (alerts?.alerts ?? []).find(a => a.symbol === symbol && a.timeframe === tf)
      return { tf, alert: a }
    }).filter(x => x.alert).sort((a, b) => (b.alert?.score ?? 0) - (a.alert?.score ?? 0))[0]

    return { symbol, best }
  }).filter(r => r.best).sort((a, b) => (b.best?.alert?.score ?? 0) - (a.best?.alert?.score ?? 0))

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">⚡ קונפלואנס מהיר</h2>
      <p className="text-xs text-slate-400">נכסים פעילים — מסודרים לפי עוצמת האיתות האחרון</p>

      {rows.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <div className="text-3xl mb-2">⚡</div>
          <div>אין איתותים פעילים כרגע</div>
        </div>
      )}

      <div className="space-y-2">
        {rows.map(({ symbol, best }) => {
          const alert = best?.alert
          if (!alert) return null
          const score = alert.score ?? 0

          return (
            <button
              key={symbol}
              onClick={() => { setSymbol(symbol); setTimeframe(best.tf) }}
              className="w-full card hover:border-brand-600/50 text-right transition-all"
            >
              <div className="flex items-center gap-4">
                <span className={`score-badge ${scoreBadgeClass(score)}`}>{score.toFixed(1)}</span>

                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{symbol}</span>
                    <span className="text-xs text-slate-400">{best.tf}</span>
                    <span className={`dir-badge ${alert.direction}`}>
                      {alert.direction === 'bullish' ? '▲ לונג' : '▼ שורט'}
                    </span>
                    {alert.inKillZone && (
                      <span className="text-xs text-purple-400">🎯 KZ</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1">
                    {(alert.factors ?? []).map((f: string) => (
                      <span key={f} className="text-[10px] px-1 bg-brand-900/20 text-brand-400 rounded">{f}</span>
                    ))}
                  </div>
                </div>

                <span className="text-slate-600 text-sm">→</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* All assets status */}
      <div className="card mt-4">
        <h3 className="font-semibold text-sm mb-3">מצב כל הנכסים</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {SYMBOLS.map(symbol => (
            <AllAssetCell key={symbol} symbol={symbol} onClick={() => setSymbol(symbol)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AllAssetCell({ symbol, onClick }: { symbol: string; onClick: () => void }) {
  const { data } = useApi<any>(`/api/market/${encodeURIComponent(symbol)}/15m/state`)
  const struct = data?.structures?.[0]

  return (
    <button onClick={onClick} className="p-3 bg-surface rounded-lg text-right hover:bg-surface-raised transition-colors">
      <div className="font-bold text-sm">{symbol}</div>
      {struct ? (
        <div className={`text-xs mt-1 ${struct.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
          {struct.type} {struct.direction === 'bullish' ? '▲' : '▼'}
        </div>
      ) : (
        <div className="text-xs text-slate-500 mt-1">ניטרלי</div>
      )}
      {data?.fvgs?.filter((f: any) => f.isActive).length > 0 && (
        <div className="text-[10px] text-emerald-400">{data.fvgs.filter((f: any) => f.isActive).length} FVG</div>
      )}
    </button>
  )
}
