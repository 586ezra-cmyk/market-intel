'use client'
import { useState } from 'react'
import { useAnalysis, type FullAnalysis, type TFAnalysis } from '@/hooks/useAnalysis'

const ASSETS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT']
const CUSTOM_ASSETS = ['NQ', 'ES', 'XAUUSD']

export default function AnalysisPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [customSymbol, setCustomSymbol] = useState('')
  const { data, loading, error, analyze } = useAnalysis()
  const [expandedTF, setExpandedTF] = useState<string | null>(null)

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

      {/* Panel - slides from left in RTL = right side visually */}
      <div className="w-96 bg-gray-900 border-r border-gray-700 flex flex-col h-full overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-white font-bold text-lg">🔍 ניתוח שוק</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* Asset selector */}
        <div className="p-4 border-b border-gray-700 space-y-3">
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
            placeholder="נכס מותאם אישית (למשל: AVAXUSDT)"
            value={customSymbol}
            onChange={e => setCustomSymbol(e.target.value)}
            className="w-full bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm placeholder-gray-500"
          />
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2"
          >
            {loading ? (
              <><span className="animate-spin">⏳</span> מנתח...</>
            ) : (
              <>🔍 בחן עכשיו</>
            )}
          </button>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </div>

        {/* Results */}
        {data && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Overall */}
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-white mb-1">
                {data.overallScore.toFixed(1)}
                <span className="text-lg text-gray-400">/10</span>
              </div>
              <div className={`text-lg font-semibold ${directionColor(data.overallDirection)}`}>
                {directionLabel(data.overallDirection)}
              </div>
              <div className="text-2xl font-mono text-white mt-2">
                ${data.currentPrice.toLocaleString()}
              </div>
              <p className="text-gray-300 text-sm mt-3 leading-relaxed">{data.recommendation}</p>
            </div>

            {/* SL/TP */}
            {(data.nextLevels.sl || data.nextLevels.tp1) && (
              <div className="bg-gray-800 rounded-lg p-3 space-y-1 text-sm">
                <div className="text-gray-400 font-semibold mb-2">🎯 רמות</div>
                {data.nextLevels.sl && (
                  <div className="flex justify-between">
                    <span className="text-red-400">SL</span>
                    <span className="text-white font-mono">${data.nextLevels.sl.toLocaleString()}</span>
                  </div>
                )}
                {data.nextLevels.tp1 && (
                  <div className="flex justify-between">
                    <span className="text-green-400">TP1</span>
                    <span className="text-white font-mono">${data.nextLevels.tp1.toLocaleString()}</span>
                  </div>
                )}
                {data.nextLevels.tp2 && (
                  <div className="flex justify-between">
                    <span className="text-green-400">TP2</span>
                    <span className="text-white font-mono">${data.nextLevels.tp2.toLocaleString()}</span>
                  </div>
                )}
                {data.nextLevels.tp3 && (
                  <div className="flex justify-between">
                    <span className="text-green-400">TP3</span>
                    <span className="text-white font-mono">${data.nextLevels.tp3.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            {/* Strategies */}
            {data.strategies.length > 0 && (
              <div className="space-y-2">
                <div className="text-gray-400 text-sm font-semibold">📋 אסטרטגיות מזוהות</div>
                {data.strategies.map((s, i) => (
                  <div key={i} className="bg-gray-800 rounded p-3 flex items-center justify-between">
                    <div>
                      <div className="text-white font-semibold text-sm">{s.name}</div>
                      <div className="text-gray-400 text-xs mt-0.5">{s.details}</div>
                    </div>
                    <div className="text-green-400 font-bold text-sm">{Math.round(s.confidence * 100)}%</div>
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
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono font-bold w-10 text-right">{tf.timeframe}</span>
                      <span className={directionColor(tf.trend)}>{trendIcon(tf.trend)}</span>
                      {tf.killZone?.active && (
                        <span className="bg-yellow-600 text-yellow-100 text-xs px-1.5 py-0.5 rounded">
                          ⏰ {tf.killZone.session}
                        </span>
                      )}
                      {tf.wyckoff && (
                        <span className="bg-purple-800 text-purple-200 text-xs px-1.5 py-0.5 rounded">
                          {tf.wyckoff.phase}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400 font-bold text-sm">{tf.score.toFixed(1)}</span>
                      <span className="text-gray-500">{expandedTF === tf.timeframe ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {expandedTF === tf.timeframe && (
                    <div className="px-3 pb-3 space-y-2 text-xs border-t border-gray-700 pt-2">
                      {tf.structures.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tf.structures.slice(-3).map((s, i) => (
                            <span
                              key={i}
                              className={`px-2 py-0.5 rounded ${s.direction === 'bullish' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}
                            >
                              {s.type} {s.direction === 'bullish' ? '▲' : '▼'}
                            </span>
                          ))}
                        </div>
                      )}
                      {tf.fvgs.length > 0 && (
                        <div className="text-gray-300">📦 FVG: {tf.fvgs.length} פתוח</div>
                      )}
                      {tf.liquiditySweep && <div className="text-yellow-400">⚡ Liquidity Sweep</div>}
                      {tf.iSMT?.detected && (
                        <div className="text-fuchsia-400">
                          ⚡ iSMT {tf.iSMT.direction === 'bullish' ? '▲' : '▼'}
                        </div>
                      )}
                      {tf.wingBreak?.detected && (
                        <div className="text-orange-400">
                          🪶 שבירת כנף {tf.wingBreak.bosConfirmed ? '✅' : '⏳'}
                        </div>
                      )}
                      {tf.wPattern?.detected && (
                        <div className="text-green-400">W תבנית {tf.wPattern.confirmed ? '✅' : '⏳'}</div>
                      )}
                      {tf.mPattern?.detected && (
                        <div className="text-red-400">M תבנית {tf.mPattern.confirmed ? '✅' : '⏳'}</div>
                      )}
                      {tf.doubleBottom?.detected && (
                        <div className="text-green-400">📈 דאבל בוטום</div>
                      )}
                      {tf.doubleTop?.detected && (
                        <div className="text-red-400">📉 דאבל טופ</div>
                      )}
                      {tf.dealingRange && (
                        <div
                          className={`${
                            tf.dealingRange.position === 'premium' ? 'text-red-300' : 'text-green-300'
                          }`}
                        >
                          📍{' '}
                          {tf.dealingRange.position === 'premium'
                            ? 'פרמיום'
                            : tf.dealingRange.position === 'discount'
                            ? 'דיסקאונט'
                            : 'אמצע'}{' '}
                          (
                          {(
                            ((tf.dealingRange.high - tf.currentPrice) /
                              (tf.dealingRange.high - tf.dealingRange.low)) *
                            100
                          ).toFixed(0)}
                          % מהתחתית)
                        </div>
                      )}
                    </div>
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
