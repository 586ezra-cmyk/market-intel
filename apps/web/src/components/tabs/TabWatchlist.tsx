'use client'

import { useState, useEffect } from 'react'
import { SYMBOL_OPTIONS } from '@/lib/utils'
import { useApi } from '@/hooks/useApi'

interface WatchItem {
  symbol: string
  priceAlert: number | null
  alertFired: boolean
}

export default function TabWatchlist() {
  const [list, setList] = useState<WatchItem[]>([
    { symbol: 'BTCUSDT', priceAlert: null, alertFired: false },
    { symbol: 'ETHUSDT', priceAlert: null, alertFired: false },
  ])
  const [newSymbol, setNewSymbol] = useState('BTCUSDT')

  function addSymbol() {
    if (list.find(l => l.symbol === newSymbol)) return
    setList(l => [...l, { symbol: newSymbol, priceAlert: null, alertFired: false }])
  }

  function removeSymbol(symbol: string) {
    setList(l => l.filter(x => x.symbol !== symbol))
  }

  function setPriceAlert(symbol: string, price: number) {
    setList(l => l.map(x => x.symbol === symbol ? { ...x, priceAlert: price, alertFired: false } : x))
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">👁️ רשימת מעקב</h2>

      {/* Add symbol */}
      <div className="flex gap-3">
        <select className="select w-40" value={newSymbol} onChange={e => setNewSymbol(e.target.value)}>
          {SYMBOL_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={addSymbol} className="btn-primary">+ הוסף</button>
      </div>

      {/* Watchlist */}
      <div className="space-y-2">
        {list.map(item => (
          <WatchRow key={item.symbol} item={item}
            onRemove={() => removeSymbol(item.symbol)}
            onSetAlert={(price) => setPriceAlert(item.symbol, price)} />
        ))}
      </div>
    </div>
  )
}

function WatchRow({ item, onRemove, onSetAlert }: {
  item: WatchItem
  onRemove: () => void
  onSetAlert: (price: number) => void
}) {
  const { data: state } = useApi<any>(`/api/market/${item.symbol}/15m/state`)

  const range = state?.range
  const latestStruct = state?.structures?.[0]

  return (
    <div className="card flex items-center gap-4 flex-wrap">
      <div className="font-bold w-24">{item.symbol}</div>

      {range && (
        <div className="text-xs text-slate-400 flex gap-3">
          <span>Range: <span className="text-blue-400">${range.low} – ${range.high}</span></span>
          <span>Mid: <span className="text-slate-300">${range.midpoint}</span></span>
        </div>
      )}

      {latestStruct && (
        <span className={`text-xs dir-badge ${latestStruct.direction}`}>
          {latestStruct.type} {latestStruct.direction === 'bullish' ? '▲' : '▼'}
        </span>
      )}

      {/* Price alert */}
      <div className="flex items-center gap-2 mr-auto">
        <input
          type="number"
          className="input w-28 text-xs"
          placeholder="התראת מחיר"
          defaultValue={item.priceAlert ?? ''}
          onBlur={e => { if (e.target.value) onSetAlert(Number(e.target.value)) }}
        />
        {item.priceAlert && (
          <span className="text-xs text-yellow-400">🔔 ${item.priceAlert}</span>
        )}
      </div>

      <button onClick={onRemove} className="text-slate-600 hover:text-red-400 text-sm">✕</button>
    </div>
  )
}
