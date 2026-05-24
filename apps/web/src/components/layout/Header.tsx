'use client'

import { useMarketStore } from '@/store/marketStore'
import { TF_OPTIONS, SYMBOL_OPTIONS } from '@/lib/utils'
import { useState, useEffect } from 'react'

function getSession(h: number) {
  if (h >= 20 || h < 4) return { label: 'אסייה 🌏', color: 'text-yellow-400' }
  if (h >= 7 && h < 11) return { label: 'לונדון 🇬🇧', color: 'text-blue-400' }
  if (h >= 13 && h < 16) return { label: 'ניו יורק 🗽', color: 'text-green-400' }
  return { label: 'מחוץ לסשן', color: 'text-slate-500' }
}

export default function Header() {
  const { symbol, timeframe, setSymbol, setTimeframe, wsConnected } = useMarketStore()
  const [utcTime, setUtcTime] = useState('')
  const [ilTime, setILTime] = useState('')
  const [isKillZone, setIsKillZone] = useState(false)
  const [session, setSession] = useState(() => getSession(new Date().getUTCHours()))

  useEffect(() => {
    function tick() {
      const now = new Date()
      const h = now.getUTCHours()
      const m = now.getUTCMinutes()
      const hStr = h.toString().padStart(2, '0')
      const mStr = m.toString().padStart(2, '0')
      setUtcTime(`${hStr}:${mStr}`)
      setILTime(now.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }))
      setIsKillZone((h >= 7 && h < 11) || (h >= 13 && h < 16))
      setSession(getSession(h))
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="flex items-center justify-between gap-4 bg-surface-raised border-b border-surface-border px-4 py-2 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xl font-bold text-brand-500">📊</span>
        <span className="font-bold text-sm hidden sm:block">מסחר חכם</span>
      </div>

      {/* Symbol + TF selectors */}
      <div className="flex items-center gap-2">
        <select
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          className="select text-sm w-32"
        >
          {SYMBOL_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={timeframe}
          onChange={e => setTimeframe(e.target.value)}
          className="select text-sm w-20"
        >
          {TF_OPTIONS.map(tf => <option key={tf} value={tf}>{tf}</option>)}
        </select>
      </div>

      {/* Session + Kill Zone */}
      <div className="flex items-center gap-3 text-xs">
        <span className={session.color}>{session.label}</span>
        {isKillZone && (
          <span className="px-2 py-0.5 bg-purple-900/40 text-purple-400 rounded-full animate-pulse">
            🎯 Kill Zone
          </span>
        )}
      </div>

      {/* Times */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span>UTC {utcTime}</span>
        <span>🇮🇱 {ilTime}</span>
      </div>

      {/* WS status */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-slate-500 hidden sm:block">{wsConnected ? 'מחובר' : 'מנותק'}</span>
      </div>
    </header>
  )
}
