'use client'
import { useState, useEffect } from 'react'
import { useAnalysis, type TFAnalysis } from '@/hooks/useAnalysis'
import { useMarketStore } from '@/store/marketStore'

const ASSETS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT']
const CUSTOM_ASSETS = ['NQ', 'ES', 'XAUUSD']

const fmt = (n: number | null | undefined) =>
  n != null ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'

export default function AnalysisPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [customSymbol, setCustomSymbol] = useState('')
  const { data, loading, error, analyze } = useAnalysis()
  const [expandedTF, setExpandedTF] = useState<string | null>(null)
  const setAnalysisLayers = useMarketStore(s => s.setAnalysisLayers)

  // Push drawing layers to chart whenever analysis completes
  useEffect(() => {
    if (data?.drawingLayers) {
      setAnalysisLayers(data.drawingLayers)
    }
  }, [data, setAnalysisLayers])

  const handleAnalyze = () => {
    const sym = customSymbol.trim().toUpperCase() || symbol
    analyze(sym)
  }

  const directionColor = (dir: string) =>
    dir === 'bullish' ? 'text-green-400' : dir === 'bearish' ? 'text-red-400' : 'text-gray-400'

  const directionLabel = (dir: string) =>
    dir === 'bullish' ? '🟢 בוליש' : dir === 'bearish' ? '🔴 בארישׁ' : '⚪ ניטרלי'

  const trendIcon = (trend: string) =>
    trend === 'bullish' ? '▲' : trend === 'bearish' ? '▼' : '→'

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="w-[26rem] bg-gray-900 border-r border-gray-700 flex flex-col h-full overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-bold text-lg">🔍 ניתוח שוק</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* Asset selector */}
        <div className="p-4 border-b border-gray-700 space-y-2 shrink-0">
          <select
            value={symbol}
            onChange={e => { setSymbol(e.target.value); setCustomSymbol('') }}
            className="w-full bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm"
          >
            {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
            {CUSTOM_ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            type="text"
            placeholder="נכס מותאם (למשל: AVAXUSDT)"
            value={customSymbol}
            onChange={e => setCustomSymbol(e.target.value)}
            className="w-full bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm placeholder-gray-500"
          />
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2"
          >
            {loading ? <><span className="animate-spin">⏳</span> מנתח...</> : <>🔍 בחן עכשיו</>}
          </button>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </div>

        {/* Results */}
        {data && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Overall score */}
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-white mb-1">
                {data.overallScore.toFixed(1)}
                <span className="text-lg text-gray-400">/10</span>
              </div>
              <div className={`text-lg font-semibold ${directionColor(data.overallDirection)}`}>
                {directionLabel(data.overallDirection)}
              </div>
              <div className="text-2xl font-mono text-white mt-2">
                {fmt(data.currentPrice)}
              </div>
              <p className="text-gray-300 text-sm mt-3 leading-relaxed">{data.recommendation}</p>
            </div>

            {/* SL/TP */}
            {(data.nextLevels.sl || data.nextLevels.tp1) && (
              <div className="bg-gray-800 rounded-lg p-3 space-y-1 text-sm">
                <div className="text-gray-400 font-semibold mb-2">🎯 רמות</div>
                {data.nextLevels.sl  && <LevelRow label="SL"  price={data.nextLevels.sl}  color="text-red-400" />}
                {data.nextLevels.tp1 && <LevelRow label="TP1" price={data.nextLevels.tp1} color="text-green-400" />}
                {data.nextLevels.tp2 && <LevelRow label="TP2" price={data.nextLevels.tp2} color="text-green-400" />}
                {data.nextLevels.tp3 && <LevelRow label="TP3" price={data.nextLevels.tp3} color="text-green-400" />}
              </div>
            )}

            {/* SMT */}
            {data.smtComparison && (
              <div className={`rounded-lg p-4 border ${data.smtComparison.smtDetected ? 'bg-fuchsia-950 border-fuchsia-600' : 'bg-gray-800 border-gray-700'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-white font-bold text-sm">
                    ⚡ SMT — {data.symbol} ↔ {data.smtComparison.correlated}
                  </div>
                  {data.smtComparison.smtDetected && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${data.smtComparison.smtDirection === 'bearish' ? 'bg-red-600' : 'bg-green-600'} text-white`}>
                      {data.smtComparison.smtDirection === 'bearish' ? '🔴 בארישׁ' : '🟢 בוליש'}
                    </span>
                  )}
                </div>
                <div className="flex justify-between mb-3">
                  <div className="text-center">
                    <div className="text-gray-400 text-xs">{data.symbol}</div>
                    <div className="text-white font-mono font-bold">{fmt(data.currentPrice)}</div>
                  </div>
                  <div className="text-gray-500 self-center">↔</div>
                  <div className="text-center">
                    <div className="text-gray-400 text-xs">{data.smtComparison.correlated}</div>
                    <div className="text-white font-mono font-bold">{fmt(data.smtComparison.correlatedPrice)}</div>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed mb-3 ${data.smtComparison.smtDetected ? 'text-fuchsia-200' : 'text-gray-400'}`}>
                  {data.smtComparison.details}
                </p>
                <div className="space-y-1">
                  {data.smtComparison.timeframes.filter(t => t.divergence).map((t, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-fuchsia-900/50 rounded px-2 py-1">
                      <span className="text-gray-300 font-mono w-8">{t.tf}</span>
                      <span className={t.mainTrend === 'bullish' ? 'text-green-400' : 'text-red-400'}>
                        {data.symbol} {t.mainTrend === 'bullish' ? '▲' : '▼'}
                      </span>
                      <span className="text-fuchsia-400">≠</span>
                      <span className={t.corrTrend === 'bullish' ? 'text-green-400' : 'text-red-400'}>
                        {data.smtComparison!.correlated} {t.corrTrend === 'bullish' ? '▲' : '▼'}
                      </span>
                      <span className="text-fuchsia-300 font-bold">⚡ SMT</span>
                    </div>
                  ))}
                  {data.smtComparison.timeframes.filter(t => t.divergence).length === 0 && (
                    <div className="text-gray-500 text-xs text-center">אין דיברגנס SMT כרגע</div>
                  )}
                </div>
              </div>
            )}

            {/* Strategies */}
            {data.strategies.length > 0 && (
              <div className="space-y-2">
                <div className="text-gray-400 text-sm font-semibold">📋 אסטרטגיות מזוהות</div>
                {data.strategies.slice(0, 10).map((s, i) => (
                  <div key={i} className="bg-gray-800 rounded p-3 flex items-center justify-between">
                    <div>
                      <div className="text-white font-semibold text-sm">{s.name}</div>
                      <div className="text-gray-400 text-xs mt-0.5">{s.details}</div>
                    </div>
                    <div className="text-green-400 font-bold text-sm shrink-0 ml-2">{Math.round(s.confidence * 100)}%</div>
                  </div>
                ))}
              </div>
            )}

            {/* Timeframes */}
            <div className="space-y-2">
              <div className="text-gray-400 text-sm font-semibold">📊 טווחי זמן</div>
              {data.timeframes.map(tf => (
                <div key={tf.timeframe} className="bg-gray-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedTF(expandedTF === tf.timeframe ? null : tf.timeframe)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-700"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-mono font-bold w-10 text-right">{tf.timeframe}</span>
                      <span className={directionColor(tf.trend)}>{trendIcon(tf.trend)}</span>
                      {tf.killZone?.active && (
                        <span className="bg-yellow-600 text-yellow-100 text-xs px-1.5 py-0.5 rounded">
                          ⏰ {tf.killZone.session}
                        </span>
                      )}
                      {tf.wyckoff && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          tf.wyckoff.phase === 'Accumulation' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
                        }`}>
                          {tf.wyckoff.phase === 'Accumulation' ? '📈' : '📉'} Phase {tf.wyckoff.phaseDetail}
                        </span>
                      )}
                      {tf.po3?.judas && (
                        <span className="bg-purple-800 text-purple-200 text-xs px-1.5 py-0.5 rounded">
                          Judas {tf.po3.direction === 'bullish' ? '⬆️' : '⬇️'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-blue-400 font-bold text-sm">{tf.score.toFixed(1)}</span>
                      <span className="text-gray-500">{expandedTF === tf.timeframe ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {expandedTF === tf.timeframe && (
                    <TFDetail tf={tf} />
                  )}
                </div>
              ))}
            </div>

            <div className="text-gray-600 text-xs text-center pb-4">
              עודכן: {new Date(data.analyzedAt).toLocaleTimeString('he-IL')}
            </div>
          </div>
        )}

        {!data && !loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-3">🔍</div>
              <div>בחר נכס ולחץ &quot;בחן עכשיו&quot;</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LevelRow({ label, price, color }: { label: string; price: number; color: string }) {
  return (
    <div className="flex justify-between">
      <span className={color}>{label}</span>
      <span className="text-white font-mono">{fmt(price)}</span>
    </div>
  )
}

function TFDetail({ tf }: { tf: TFAnalysis }) {
  return (
    <div className="px-3 pb-3 space-y-2 text-xs border-t border-gray-700 pt-2">

      {/* Structures */}
      {tf.structures.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tf.structures.slice(-3).map((s, i) => (
            <span key={i} className={`px-2 py-0.5 rounded ${s.direction === 'bullish' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
              {s.type} {s.direction === 'bullish' ? '▲' : '▼'}
            </span>
          ))}
        </div>
      )}

      {/* FVG */}
      {tf.fvgs.length > 0 && (
        <div className="text-gray-300">📦 FVG: {tf.fvgs.length} פתוח</div>
      )}

      {/* Liquidity */}
      {tf.liquiditySweep && <div className="text-yellow-400">⚡ Liquidity Sweep</div>}

      {/* iSMT */}
      {tf.iSMT?.detected && (
        <div className="text-fuchsia-400">⚡ iSMT {tf.iSMT.direction === 'bullish' ? '▲' : '▼'}</div>
      )}

      {/* Wyckoff full detail */}
      {tf.wyckoff && (
        <div className={`rounded p-2 space-y-1 ${tf.wyckoff.phase === 'Accumulation' ? 'bg-green-950 border border-green-800' : 'bg-red-950 border border-red-800'}`}>
          <div className={`font-bold ${tf.wyckoff.phase === 'Accumulation' ? 'text-green-300' : 'text-red-300'}`}>
            🏛 Wyckoff {tf.wyckoff.phase === 'Accumulation' ? 'צבירה' : 'הפצה'} — שלב {tf.wyckoff.phaseDetail}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {tf.wyckoff.spring         && <WTag label="🌱 Spring" green />}
            {tf.wyckoff.testAfterSpring && <WTag label="✅ Test after Spring" green />}
            {tf.wyckoff.sos            && <WTag label="💪 SOS" green />}
            {tf.wyckoff.lps            && <WTag label="🎯 LPS" green />}
            {tf.wyckoff.utad           && <WTag label="⚡ UTAD" />}
            {tf.wyckoff.testOfUtad     && <WTag label="✅ Test of UTAD" />}
            {tf.wyckoff.upthrust       && <WTag label="↩️ Upthrust" />}
            {tf.wyckoff.sow            && <WTag label="📉 SOW" />}
            {tf.wyckoff.lpsy           && <WTag label="🎯 LPSY" />}
          </div>
        </div>
      )}

      {/* Wing Break */}
      {tf.wingBreak?.detected && (
        <div className="text-orange-400">🪶 שבירת כנף {tf.wingBreak.bosConfirmed ? '✅' : '⏳'}</div>
      )}

      {/* W/M */}
      {tf.wPattern?.detected && <div className="text-green-400">W תבנית {tf.wPattern.confirmed ? '✅' : '⏳'}</div>}
      {tf.mPattern?.detected && <div className="text-red-400">M תבנית {tf.mPattern.confirmed ? '✅' : '⏳'}</div>}

      {/* Double Top/Bottom */}
      {tf.doubleBottom?.detected && <div className="text-green-400">📈 דאבל בוטום @ {fmt(tf.doubleBottom.price)}</div>}
      {tf.doubleTop?.detected    && <div className="text-red-400">📉 דאבל טופ @ {fmt(tf.doubleTop.price)}</div>}

      {/* Breaker Block */}
      {tf.breakerBlock && (
        <div className={tf.breakerBlock.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}>
          🧱 Breaker Block {tf.breakerBlock.direction === 'bullish' ? '🟢' : '🔴'}
          {' '}({fmt(tf.breakerBlock.bottom)} – {fmt(tf.breakerBlock.top)})
        </div>
      )}

      {/* Po3 / Judas */}
      {tf.po3?.judas && (
        <div className="text-purple-400">
          🎭 Judas Swing — כיוון אמיתי: {tf.po3.direction === 'bullish' ? '🟢 בוליש' : '🔴 בארישׁ'}
        </div>
      )}

      {/* Dealing Range */}
      {tf.dealingRange && (
        <div className={tf.dealingRange.position === 'premium' ? 'text-red-300' : 'text-green-300'}>
          📍 {tf.dealingRange.position === 'premium' ? 'פרמיום' : tf.dealingRange.position === 'discount' ? 'דיסקאונט' : 'אמצע'}
          {' '}({(((tf.dealingRange.high - tf.currentPrice) / (tf.dealingRange.high - tf.dealingRange.low)) * 100).toFixed(0)}% מהתחתית)
        </div>
      )}

      {/* Key levels */}
      <div className="space-y-0.5 mt-1">
        {tf.vwap && (
          <div className="flex justify-between text-cyan-400">
            <span>VWAP</span><span className="font-mono">{fmt(tf.vwap)}</span>
          </div>
        )}
        {tf.pdh && (
          <div className="flex justify-between text-amber-400">
            <span>PDH</span><span className="font-mono">{fmt(tf.pdh)}</span>
          </div>
        )}
        {tf.pdl && (
          <div className="flex justify-between text-amber-400">
            <span>PDL</span><span className="font-mono">{fmt(tf.pdl)}</span>
          </div>
        )}
        {tf.pwh && (
          <div className="flex justify-between text-violet-400">
            <span>PWH</span><span className="font-mono">{fmt(tf.pwh)}</span>
          </div>
        )}
        {tf.pwl && (
          <div className="flex justify-between text-violet-400">
            <span>PWL</span><span className="font-mono">{fmt(tf.pwl)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function WTag({ label, green }: { label: string; green?: boolean }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${green ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
      {label}
    </span>
  )
}
