'use client'

import { useApi } from '@/hooks/useApi'
import { useMarketStore } from '@/store/marketStore'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NQ1!', 'ES1!']
const TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1D', '1W']

export default function TabMatrix() {
  const setSymbol = useMarketStore(s => s.setSymbol)
  const setTimeframe = useMarketStore(s => s.setTimeframe)

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">🗂️ תצוגת מטריצה</h2>
      <p className="text-xs text-slate-400">לחץ על תא לפתיחת הגרף באותו נכס ו-TF</p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2 text-right text-slate-400 text-xs">נכס \ TF</th>
              {TIMEFRAMES.map(tf => (
                <th key={tf} className="p-2 text-center text-slate-400 text-xs">{tf}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SYMBOLS.map(symbol => (
              <tr key={symbol} className="border-t border-surface-border">
                <td className="p-2 font-mono font-bold text-sm">{symbol}</td>
                {TIMEFRAMES.map(tf => (
                  <MatrixCell key={tf} symbol={symbol} tf={tf}
                    onClick={() => { setSymbol(symbol); setTimeframe(tf) }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MatrixCell({ symbol, tf, onClick }: { symbol: string; tf: string; onClick: () => void }) {
  const { data } = useApi<any>(`/api/market/${encodeURIComponent(symbol)}/${tf}/state`)

  const struct = data?.structures?.[0]
  const fvgs = data?.fvgs?.filter((f: any) => f.isActive) ?? []
  const hasLiq = (data?.liquidity ?? []).length > 0

  let bg = 'bg-surface hover:bg-surface-raised'
  let label = '⬜'
  let textColor = 'text-slate-500'

  if (struct) {
    if (struct.direction === 'bullish') {
      bg = 'bg-green-950 hover:bg-green-900'
      label = struct.type === 'BOS' ? '🟢 BOS' : '🟢 CHoCH'
      textColor = 'text-green-400'
    } else {
      bg = 'bg-red-950 hover:bg-red-900'
      label = struct.type === 'BOS' ? '🔴 BOS' : '🔴 CHoCH'
      textColor = 'text-red-400'
    }
  }

  return (
    <td className="p-1">
      <button
        onClick={onClick}
        className={`w-full rounded px-2 py-2 text-xs ${bg} ${textColor} transition-colors`}
      >
        <div>{label}</div>
        {fvgs.length > 0 && <div className="text-[10px] text-emerald-400">{fvgs.length} FVG</div>}
        {hasLiq && <div className="text-[10px] text-yellow-600">💧</div>}
      </button>
    </td>
  )
}
