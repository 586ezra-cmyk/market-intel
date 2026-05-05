'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useMarketStore, LAYER_LABELS, LAYER_COLORS, type LayerId } from '@/store/marketStore'
import { useApi } from '@/hooks/useApi'
import { formatTime, formatPrice, scoreBadgeClass } from '@/lib/utils'

const TradingChart = dynamic(() => import('@/components/chart/TradingChart'), { ssr: false })

export default function TabDashboard() {
  const { symbol, timeframe, activeRange, alerts, structures, layers, toggleLayer } = useMarketStore()
  const [rightPanel, setRightPanel] = useState<'layers' | 'cascade' | 'missed'>('layers')

  const lastAlert = alerts[0]
  const lastStructure = structures[0]

  // Pull current state from server (cascade scan, range, etc.)
  const { data: state } = useApi<any>(
    `/api/market/${encodeURIComponent(symbol)}/${timeframe}/state`,
    [symbol, timeframe],
  )

  const { data: cascadeData } = useApi<any>(
    `/api/market/${encodeURIComponent(symbol)}/${timeframe}/cascade?direction=${lastAlert?.direction ?? 'bullish'}`,
    [symbol, timeframe, lastAlert?.direction],
  )

  // Missed entries: last 3 alerts in same direction
  const missed = alerts.slice(1, 5).filter(a => a.direction === lastAlert?.direction)

  // Premium/Discount context
  const range = activeRange ?? state?.range
  let pdContext = ''
  if (range && lastAlert) {
    const pct = ((lastAlert.triggeredAt && alerts[0]?.direction)
      ? ((Number(state?.structures?.[0]?.price ?? range.midpoint) - range.low) / (range.high - range.low)) * 100
      : 50
    ).toFixed(0)
    pdContext = lastAlert.direction === 'bullish'
      ? `Discount ${pct}% מהתחתית`
      : `Premium ${100 - Number(pct)}% מהתחתית`
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Main Chart Area ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top info bar */}
        <div className="flex items-center gap-3 px-4 py-2 bg-surface-raised border-b border-surface-border text-xs flex-wrap shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">נכס:</span>
            <span className="font-bold text-white">{symbol}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">TF:</span>
            <span className="font-bold text-white">{timeframe}</span>
          </div>

          {range && (
            <>
              <span className="text-surface-border">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Range:</span>
                <span className="text-blue-400">${formatPrice(range.low)} – ${formatPrice(range.high)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Mid:</span>
                <span className="text-slate-300">${formatPrice(range.midpoint)}</span>
              </div>
            </>
          )}

          {lastStructure && (
            <>
              <span className="text-surface-border">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">מבנה:</span>
                <span className={lastStructure.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}>
                  {lastStructure.type} {lastStructure.direction === 'bullish' ? '▲' : '▼'}
                </span>
              </div>
            </>
          )}

          {lastAlert && (
            <>
              <span className="text-surface-border">|</span>
              <div className="flex items-center gap-1.5 mr-auto">
                <span className="text-slate-400">התראה אחרונה:</span>
                <span className={`score-badge ${scoreBadgeClass(lastAlert.score ?? 0)}`}>
                  {(lastAlert.score ?? 0).toFixed(1)}
                </span>
                <span className={`dir-badge ${lastAlert.direction}`}>
                  {lastAlert.direction === 'bullish' ? '▲ לונג' : '▼ שורט'}
                </span>
                <span className="text-slate-500">{formatTime(lastAlert.triggeredAt)}</span>
              </div>
            </>
          )}
        </div>

        {/* Chart */}
        <div className="flex-1 relative overflow-hidden">
          <TradingChart />
        </div>
      </div>

      {/* ─── Right Panel ──────────────────────────────────────────────────── */}
      <div className="w-52 shrink-0 flex flex-col bg-surface-raised border-r border-surface-border overflow-hidden">
        {/* Panel tabs */}
        <div className="flex border-b border-surface-border text-[11px] shrink-0">
          {([
            { id: 'layers',  label: '⚙️ שכבות' },
            { id: 'cascade', label: '📡 Cascade' },
            { id: 'missed',  label: '👁 פספסת' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setRightPanel(t.id)}
              className={`flex-1 py-1.5 transition-colors ${
                rightPanel === t.id
                  ? 'text-white border-b-2 border-brand-500'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* ── Layers panel ── */}
          {rightPanel === 'layers' && (
            <div className="space-y-1">
              {(Object.keys(LAYER_LABELS) as LayerId[]).map(id => (
                <button
                  key={id}
                  onClick={() => toggleLayer(id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-right transition-all ${
                    layers[id] ? 'bg-surface text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: layers[id] ? LAYER_COLORS[id] : '#2d3748' }}
                  />
                  <span className="flex-1 text-right text-[11px]">{LAYER_LABELS[id]}</span>
                  <span className="text-slate-600 text-[10px]">{layers[id] ? '●' : '○'}</span>
                </button>
              ))}

              {/* Active FVGs count */}
              {state?.fvgs && (
                <div className="mt-3 pt-3 border-t border-surface-border text-[11px] space-y-1">
                  <div className="text-slate-400 font-semibold">מצב נוכחי</div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">FVG פעיל</span>
                    <span className="text-emerald-400">{state.fvgs.filter((f: any) => f.isActive).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">נזילות</span>
                    <span className="text-yellow-400">{(state.liquidity ?? []).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">SMT</span>
                    <span className="text-pink-400">{(state.smtSignals ?? []).length}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Cascade Scan panel ── */}
          {rightPanel === 'cascade' && (
            <div className="space-y-2">
              <div className="text-[11px] text-slate-400 mb-2">
                סריקת TF מתחת ל-{timeframe} בכיוון {lastAlert?.direction === 'bullish' ? 'לונג ▲' : 'שורט ▼'}
              </div>

              {!cascadeData && (
                <div className="text-xs text-slate-500 text-center py-4">טוען...</div>
              )}

              {cascadeData && Object.entries(cascadeData).map(([tf, data]: any) => {
                const d = data as { hasFVG: boolean; hasStructure: boolean; hasLiquidity: boolean }
                const score = [d.hasFVG, d.hasStructure, d.hasLiquidity].filter(Boolean).length

                return (
                  <div key={tf} className="bg-surface rounded p-2 text-[11px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white">{tf}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        score === 3 ? 'bg-green-900 text-green-400' :
                        score === 2 ? 'bg-yellow-900 text-yellow-400' :
                        score === 1 ? 'bg-slate-700 text-slate-400' :
                        'bg-surface text-slate-600'
                      }`}>
                        {score}/3
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className={d.hasFVG ? 'text-emerald-400' : 'text-slate-600'}>
                        {d.hasFVG ? '✅' : '⬜'} FVG
                      </span>
                      <span className={d.hasStructure ? 'text-indigo-400' : 'text-slate-600'}>
                        {d.hasStructure ? '✅' : '⬜'} מבנה
                      </span>
                      <span className={d.hasLiquidity ? 'text-yellow-400' : 'text-slate-600'}>
                        {d.hasLiquidity ? '✅' : '⬜'} נזיל
                      </span>
                    </div>
                  </div>
                )
              })}

              {cascadeData && Object.keys(cascadeData).length === 0 && (
                <div className="text-xs text-slate-500 text-center py-4">
                  אין TF נמוכים יותר מ-{timeframe}
                </div>
              )}
            </div>
          )}

          {/* ── Missed Entries panel ── */}
          {rightPanel === 'missed' && (
            <div className="space-y-2">
              <div className="text-[11px] text-slate-400 mb-2">
                כניסות שהיו לך — אותו כיוון, 8–12 שעות אחורה
              </div>

              {missed.length === 0 && (
                <div className="text-xs text-slate-500 text-center py-4">
                  <div className="text-2xl mb-1">👁</div>
                  <div>אין כניסות דומות שפספסת</div>
                </div>
              )}

              {missed.map(a => (
                <div key={a.id} className="bg-surface rounded p-2 text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`dir-badge ${a.direction} text-[10px]`}>
                      {a.direction === 'bullish' ? '▲ לונג' : '▼ שורט'}
                    </span>
                    <span className={`score-badge ${scoreBadgeClass(a.score ?? 0)} text-[10px]`}>
                      {(a.score ?? 0).toFixed(1)}
                    </span>
                  </div>
                  <div className="text-slate-400">{formatTime(a.triggeredAt)}</div>
                  <div className="flex flex-wrap gap-1">
                    {(a.factors ?? []).map((f: string) => (
                      <span key={f} className="px-1 bg-brand-900/30 text-brand-400 rounded text-[9px]">{f}</span>
                    ))}
                  </div>
                  {a.tp1 && (
                    <div className="text-slate-500">
                      TP1: <span className="text-white">${formatPrice(a.tp1)}</span>
                    </div>
                  )}
                </div>
              ))}

              {missed.length > 0 && (
                <div className="text-[10px] text-slate-500 text-center pt-2 border-t border-surface-border">
                  הצלחה ב-TP1 מחושבת בסטטיסטיקה →
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
