'use client'

import { useState, useEffect } from 'react'
import { useMarketStore } from '@/store/marketStore'
import { useApi, apiPost } from '@/hooks/useApi'
import { formatTime, formatPrice, scoreBadgeClass } from '@/lib/utils'

const FACTOR_HE: Record<string, string> = {
  BOS: 'BOS — שבירת מבנה',
  CHoCH: 'CHoCH — היפוך מגמה',
  LiquiditySweep: 'שאיבת נזילות',
  FVG: 'FVG — פער מחיר',
  SMT: 'SMT — דיברגנס',
  DoubleTop: 'דאבל טופ',
  DoubleBottom: 'דאבל בוטום',
  Wyckoff: 'Wyckoff',
  OrderBlock: 'Order Block',
}

const FACTOR_HE_SHORT: Record<string, string> = {
  BOS: 'BOS', CHoCH: 'CHoCH', LiquiditySweep: 'שאיבת נזילות',
  FVG: 'FVG', SMT: 'SMT', DoubleTop: 'דאבל טופ',
  DoubleBottom: 'דאבל בוטום', Wyckoff: 'Wyckoff', OrderBlock: 'OB',
}

const SESSION_HE: Record<string, string> = {
  asian: '🌏 אסיה', london: '🇬🇧 לונדון', ny: '🗽 ניו יורק', 'off-session': '💤 בין סשנים',
}

// Factors that could still appear to strengthen a signal
const BULL_UPCOMING = ['FVG','Wyckoff','OrderBlock','DoubleBottom']
const BEAR_UPCOMING = ['FVG','Wyckoff','OrderBlock','DoubleTop']

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

const NEW_THRESHOLD_MS = 5 * 60 * 1000  // 5 minutes

export default function TabAlerts() {
  const [filterSymbol, setFilterSymbol] = useState('')
  const [filterTF, setFilterTF] = useState('')
  const [filterDir, setFilterDir] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [rating, setRating] = useState<Record<string, number>>({})
  const [ratingNote, setRatingNote] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const params = new URLSearchParams()
  if (filterSymbol) params.set('symbol', filterSymbol)
  if (filterTF) params.set('timeframe', filterTF)
  if (showArchived) params.set('archived', '1')
  params.set('limit', '200')

  const { data, refetch, loading } = useApi<{ alerts: any[] }>(`/api/alerts?${params}`)
  const liveAlerts = useMarketStore(s => s.alerts)
  const wsConnected = useMarketStore(s => s.wsConnected)

  // Auto-refetch every 30s + update "now" for "חדש" badge
  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
      setNow(Date.now())
    }, 30_000)
    return () => clearInterval(interval)
  }, [refetch])

  // בארכיון — רק מה-API (לא חיות מ-WS). בתצוגה רגילה — מיזוג
  const baseAlerts = showArchived
    ? (data?.alerts ?? [])
    : [...liveAlerts, ...(data?.alerts ?? [])].filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i)

  const allAlerts = baseAlerts
    .filter(a => !filterSymbol || a.symbol === filterSymbol)
    .filter(a => !filterTF     || a.timeframe === filterTF)
    .filter(a => !filterDir    || a.direction === filterDir)
    .filter(a => !searchQuery  || a.symbol?.toLowerCase().includes(searchQuery.toLowerCase()) || a.messageHe?.includes(searchQuery))
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

      {/* ── WS status bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs text-slate-400">
            {wsConnected ? 'מחובר — מקבל התראות בזמן אמת' : 'מנותק מהשרת'}
          </span>
        </div>
        <span className="text-xs text-slate-600">{allAlerts.length} התראות</span>
      </div>

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

          <div className="mr-auto flex gap-2">
            <button
              onClick={refetch}
              disabled={loading}
              className="px-3 py-1 rounded-full text-xs border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700 transition-all font-bold disabled:opacity-50"
            >
              {loading ? '⏳ טוען...' : '🔄 רענן'}
            </button>
            <button
              onClick={() => { setShowArchived(v => !v); setSearchQuery(''); setTimeout(refetch, 50) }}
              className={`px-3 py-1 rounded-full text-xs border transition-all font-bold ${
                showArchived
                  ? 'bg-amber-600 border-amber-500 text-white shadow-md shadow-amber-900/40'
                  : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
              }`}
            >
              📦 {showArchived ? '📦 ארכיון פעיל' : 'ארכיון'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Archive search ── */}
      {showArchived && (
        <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-700/30 rounded-lg p-2">
          <span className="text-amber-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="חיפוש בארכיון — לפי סימבול, תוכן..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none text-right"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-white text-xs">✕</button>
          )}
        </div>
      )}

      {/* ── Alert list ── */}
      {allAlerts.length === 0 && (
        <div className="text-center text-slate-500 py-16 flex flex-col items-center gap-2">
          <span className="text-3xl">🔔</span>
          <span>אין התראות עדיין</span>
          <span className="text-xs">
            {wsConnected
              ? 'ממתין ל-signal מ-TradingView — וודא שה-alert מוגדר עם Webhook URL'
              : 'בדוק שהשרת רץ ב-Railway'}
          </span>
        </div>
      )}

      <div className="space-y-2">
        {allAlerts.map(alert => {
          const isExpanded = expandedId === alert.id
          const isBull = alert.direction === 'bullish'
          const isNew = (now - (alert.triggeredAt ?? alert.createdAt ?? 0)) < NEW_THRESHOLD_MS

          return (
            <div
              key={alert.id}
              className={`rounded-lg border transition-all overflow-hidden ${
                isBull
                  ? 'border-green-800/50 bg-green-950/20'
                  : 'border-red-800/50 bg-red-950/20'
              } ${isNew ? 'ring-1 ring-blue-500/40' : ''}`}
            >
              {/* ── Main row ── */}
              <button
                className="w-full text-right p-3 flex items-center gap-3"
                onClick={() => setExpandedId(isExpanded ? null : alert.id)}
              >
                {/* Score badge */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span className={`score-badge ${scoreBadgeClass(alert.score ?? 0)}`}>
                    {(alert.score ?? 0).toFixed(1)}
                  </span>
                  {isNew && (
                    <span className="px-1 py-0.5 text-xs bg-blue-600 text-white rounded-full leading-none font-bold">
                      חדש
                    </span>
                  )}
                </div>

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

                {/* Archive button */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    await apiPost(`/api/alerts/${alert.id}/archive`, { archived: !showArchived })
                    refetch()
                  }}
                  className="shrink-0 px-2 py-1 rounded text-xs border border-slate-600 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-all"
                  title={showArchived ? 'שחזר מארכיון' : 'העבר לארכיון'}
                >
                  {showArchived ? '↩️' : '📦'}
                </button>
              </button>

              {/* ── Expanded detail ── */}
              {isExpanded && (() => {
                const presentFactors: string[] = alert.factors ?? []
                const upcomingPool = isBull ? BULL_UPCOMING : BEAR_UPCOMING
                const upcoming = upcomingPool.filter(f => !presentFactors.includes(f))

                return (
                  <div className="border-t border-white/5 p-4 space-y-4">

                    {/* ── Row 1: context cards ── */}
                    <div className="grid grid-cols-3 gap-3">
                      {/* Session */}
                      <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/30">
                        <div className="text-xs text-slate-400 mb-1 font-medium">סשן</div>
                        <div className="text-base font-bold text-white">{SESSION_HE[alert.session] ?? alert.session}</div>
                      </div>

                      {/* Premium/Discount */}
                      <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/30">
                        <div className="text-xs text-slate-400 mb-1 font-medium">מיקום בטווח</div>
                        <div className={`text-base font-bold ${
                          alert.premiumDiscount === 'premium' ? 'text-red-400'
                          : alert.premiumDiscount === 'discount' ? 'text-green-400'
                          : 'text-slate-300'
                        }`}>
                          {alert.premiumDiscount === 'premium' ? '🔴 Premium'
                           : alert.premiumDiscount === 'discount' ? '🟢 Discount'
                           : '⚪ Midpoint'}
                        </div>
                      </div>

                      {/* Kill Zone */}
                      <div className="bg-slate-800/60 rounded-xl p-3 text-center border border-slate-700/30">
                        <div className="text-xs text-slate-400 mb-1 font-medium">Kill Zone</div>
                        <div className={`text-base font-bold ${alert.inKillZone ? 'text-purple-400' : 'text-slate-500'}`}>
                          {alert.inKillZone ? '🟣 פעיל' : '⬜ לא פעיל'}
                        </div>
                      </div>
                    </div>

                    {/* ── Row 2: SL / TP ── */}
                    <div className={`grid gap-3 ${[alert.tp1, alert.tp2, alert.tp3].filter(Boolean).length === 0 ? 'grid-cols-1' : 'grid-cols-4'}`}>
                      {alert.stopLoss && (
                        <div className="bg-red-950/40 border border-red-800/30 rounded-xl p-3 text-center">
                          <div className="text-sm text-red-400 font-semibold mb-1">🛑 Stop Loss</div>
                          <div className="text-xl font-mono font-bold text-red-300">${formatPrice(alert.stopLoss)}</div>
                          <div className="text-xs text-slate-500 mt-1">מתחת לסווינג</div>
                        </div>
                      )}
                      {alert.tp1 && (
                        <div className="bg-green-950/40 border border-green-800/30 rounded-xl p-3 text-center">
                          <div className="text-sm text-green-400 font-semibold mb-1">🎯 TP1</div>
                          <div className="text-xl font-mono font-bold text-green-300">${formatPrice(alert.tp1)}</div>
                          <div className="text-xs text-slate-500 mt-1">נזילות פנימית</div>
                        </div>
                      )}
                      {alert.tp2 && (
                        <div className="bg-green-950/40 border border-green-800/30 rounded-xl p-3 text-center">
                          <div className="text-sm text-green-400 font-semibold mb-1">🎯 TP2</div>
                          <div className="text-xl font-mono font-bold text-green-300">${formatPrice(alert.tp2)}</div>
                          <div className="text-xs text-slate-500 mt-1">נזילות חיצונית</div>
                        </div>
                      )}
                      {alert.tp3 && (
                        <div className="bg-green-950/40 border border-green-800/30 rounded-xl p-3 text-center">
                          <div className="text-sm text-green-400 font-semibold mb-1">🎯 TP3</div>
                          <div className="text-xl font-mono font-bold text-green-300">${formatPrice(alert.tp3)}</div>
                          <div className="text-xs text-slate-500 mt-1">נזילות רחוקה</div>
                        </div>
                      )}
                    </div>

                    {/* ── Row 3: present factors ── */}
                    <div>
                      <div className="text-xs text-slate-400 font-semibold mb-2">✅ אישורים קיימים</div>
                      <div className="flex flex-wrap gap-2">
                        {presentFactors.map((f: string) => (
                          <span key={f} className={`px-3 py-1.5 text-sm rounded-lg font-medium ${FACTOR_COLOR[f] ?? 'bg-slate-800 text-slate-300'}`}>
                            {FACTOR_HE_SHORT[f] ?? f}
                          </span>
                        ))}
                        {alert.inKillZone && (
                          <span className="px-3 py-1.5 bg-purple-900/40 text-purple-300 border border-purple-700/40 text-sm rounded-lg font-medium">
                            🕐 Kill Zone
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ── Row 4: upcoming confirmations ── */}
                    {upcoming.length > 0 && (
                      <div>
                        <div className="text-xs text-slate-400 font-semibold mb-2">⏳ אישורים שיחזקו את הסיגנל</div>
                        <div className="flex flex-wrap gap-2">
                          {upcoming.map(f => (
                            <span key={f} className="px-3 py-1.5 bg-slate-800/40 border border-slate-600/30 text-slate-400 text-sm rounded-lg">
                              {FACTOR_HE_SHORT[f]}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Row 5: rating ── */}
                    <div className="flex items-center gap-3 pt-1 border-t border-white/5">
                      <span className="text-sm text-slate-400 shrink-0">דרג:</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            onClick={() => setRating(r => ({ ...r, [alert.id]: n }))}
                            className={`text-2xl transition-colors leading-none ${
                              (rating[alert.id] ?? alert.userRating ?? 0) >= n
                                ? 'text-yellow-400' : 'text-slate-700'
                            }`}
                          >★</button>
                        ))}
                      </div>
                      <input
                        className="input flex-1 text-sm py-1.5"
                        placeholder="הערה אישית..."
                        value={ratingNote[alert.id] ?? alert.userNotes ?? ''}
                        onChange={e => setRatingNote(r => ({ ...r, [alert.id]: e.target.value }))}
                      />
                      {rating[alert.id] && (
                        <button onClick={() => submitRating(alert.id)} className="btn-primary text-sm px-4 py-1.5">
                          שמור
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>
    </div>
  )
}
