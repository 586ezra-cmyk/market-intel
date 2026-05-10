'use client'

import { useState } from 'react'
import { useApi, apiPost } from '@/hooks/useApi'

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XAUUSD','NQ1!','ES1!','EURUSD','GBPUSD']

interface WatchItem {
  id: string
  symbol: string
  priceAlert: number | null
  alertFired: boolean
  createdAt: number
}

export default function TabWatchlist() {
  const { data, refetch } = useApi<{ items: WatchItem[] }>('/api/watchlist')
  const items = data?.items ?? []
  const [newSymbol, setNewSymbol] = useState('BTCUSDT')
  const [adding, setAdding] = useState(false)

  async function addSymbol() {
    setAdding(true)
    try {
      await apiPost('/api/watchlist', { symbol: newSymbol })
      refetch()
    } finally { setAdding(false) }
  }

  async function removeSymbol(symbol: string) {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    await fetch(`${base}/api/watchlist/${symbol}`, { method: 'DELETE' })
    refetch()
  }

  async function updateAlert(symbol: string, priceAlert: number | null) {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    await fetch(`${base}/api/watchlist/${symbol}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceAlert }),
    })
    refetch()
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">👁️ רשימת מעקב</h2>
        <span className="text-xs text-slate-400">{items.length} נכסים במעקב</span>
      </div>

      {/* Add symbol */}
      <div className="card flex gap-3 items-center">
        <select
          className="select flex-1"
          value={newSymbol}
          onChange={e => setNewSymbol(e.target.value)}
        >
          {SYMBOLS.filter(s => !items.find(i => i.symbol === s)).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={addSymbol} disabled={adding} className="btn-primary whitespace-nowrap">
          {adding ? '...' : '+ הוסף'}
        </button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <div className="text-4xl mb-2">👁️</div>
          <div>אין נכסים במעקב</div>
          <div className="text-xs mt-1">הוסף נכסים כדי לעקוב אחר Dealing Range ומבנה שוק</div>
        </div>
      )}

      {/* Watchlist items */}
      <div className="space-y-3">
        {items.map(item => (
          <WatchRow
            key={item.id}
            item={item}
            onRemove={() => removeSymbol(item.symbol)}
            onUpdateAlert={(p) => updateAlert(item.symbol, p)}
          />
        ))}
      </div>
    </div>
  )
}

function WatchRow({ item, onRemove, onUpdateAlert }: {
  item: WatchItem
  onRemove: () => void
  onUpdateAlert: (price: number | null) => void
}) {
  const { data: state } = useApi<any>(`/api/market/${encodeURIComponent(item.symbol)}/15m/state`)
  const [alertInput, setAlertInput] = useState(item.priceAlert?.toString() ?? '')
  const [editing, setEditing] = useState(false)

  const range = state?.range
  const structs = state?.structures ?? []
  const latestStruct = structs[0]
  const activeFvgs = (state?.fvgs ?? []).filter((f: any) => f.isActive).length
  const activeLiqs = (state?.liquidities ?? []).filter((l: any) => !l.swept).length

  function positionInRange(): { pct: number; label: string; color: string } | null {
    if (!range || !range.midpoint) return null
    // We don't have current price from API — show midpoint position only
    return null
  }

  function saveAlert() {
    const price = alertInput ? parseFloat(alertInput) : null
    onUpdateAlert(price)
    setEditing(false)
  }

  return (
    <div className={`card space-y-3 ${item.alertFired ? 'border-yellow-400/50' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold text-base">{item.symbol}</span>
          {item.alertFired && (
            <span className="text-xs bg-yellow-400/20 text-yellow-400 px-2 py-0.5 rounded-full">🔔 התראה הופעלה</span>
          )}
        </div>
        <button onClick={onRemove} className="text-slate-600 hover:text-red-400 text-sm transition-colors">✕</button>
      </div>

      {/* Market state */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {range ? (
          <>
            <div className="bg-surface rounded p-2">
              <div className="text-slate-400 mb-1">Dealing Range</div>
              <div className="text-blue-400 font-mono">${Number(range.low).toLocaleString()} – ${Number(range.high).toLocaleString()}</div>
              <div className="text-slate-500">Mid: ${Number(range.midpoint).toLocaleString()}</div>
            </div>
            <div className="bg-surface rounded p-2">
              <div className="text-slate-400 mb-1">סשן</div>
              <div className="font-medium">{range.session ?? '—'}</div>
              <div className={`text-xs mt-0.5 ${range.tfClass === 'low' ? 'text-emerald-400' : 'text-purple-400'}`}>
                {range.tfClass === 'low' ? 'Asian Range' : 'Swing Range'}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-surface rounded p-2 text-slate-500">טוען...</div>
        )}

        {latestStruct ? (
          <div className="bg-surface rounded p-2">
            <div className="text-slate-400 mb-1">מבנה שוק</div>
            <div className={`font-medium ${latestStruct.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>
              {latestStruct.type} {latestStruct.direction === 'bullish' ? '▲' : '▼'}
            </div>
          </div>
        ) : (
          <div className="bg-surface rounded p-2">
            <div className="text-slate-400 mb-1">מבנה שוק</div>
            <div className="text-slate-500">ניטרלי</div>
          </div>
        )}

        <div className="bg-surface rounded p-2">
          <div className="text-slate-400 mb-1">אלמנטים פעילים</div>
          <div className="flex gap-2">
            {activeFvgs > 0 && <span className="text-emerald-400">{activeFvgs} FVG</span>}
            {activeLiqs > 0 && <span className="text-yellow-400">{activeLiqs} Liq</span>}
            {activeFvgs === 0 && activeLiqs === 0 && <span className="text-slate-500">—</span>}
          </div>
        </div>
      </div>

      {/* Price alert */}
      <div className="flex items-center gap-3 pt-1 border-t border-surface-border">
        <span className="text-xs text-slate-400">🔔 התראת מחיר:</span>
        {editing ? (
          <>
            <input
              type="number"
              step="any"
              className="input w-36 text-xs py-1"
              value={alertInput}
              onChange={e => setAlertInput(e.target.value)}
              placeholder="הזן מחיר"
              autoFocus
            />
            <button onClick={saveAlert} className="text-xs text-brand-400 hover:text-brand-300">✓ שמור</button>
            <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-300">ביטול</button>
          </>
        ) : (
          <>
            {item.priceAlert ? (
              <span className="text-xs text-yellow-400 font-mono">${Number(item.priceAlert).toLocaleString()}</span>
            ) : (
              <span className="text-xs text-slate-600">לא מוגדר</span>
            )}
            <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-slate-300">
              {item.priceAlert ? '✏️ ערוך' : '+ הגדר'}
            </button>
            {item.priceAlert && (
              <button onClick={() => { setAlertInput(''); onUpdateAlert(null) }} className="text-xs text-slate-600 hover:text-red-400">
                מחק
              </button>
            )}
          </>
        )}
        {item.priceAlert && !item.alertFired && (
          <span className="text-xs text-slate-500 mr-auto">ההתראה תישלח לטלגרם כשהמחיר יגיע לרמה זו</span>
        )}
      </div>
    </div>
  )
}
