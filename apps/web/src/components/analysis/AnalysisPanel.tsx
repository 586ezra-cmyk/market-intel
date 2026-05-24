'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAnalysis, type TFAnalysis, type ScoreBreakdown } from '@/hooks/useAnalysis'
import { useMarketStore } from '@/store/marketStore'

const ASSETS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT']
const CUSTOM_ASSETS = ['NQ', 'ES', 'XAUUSD']

const fmt = (n: number | null | undefined) =>
  n != null ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'

const fmtPct = (n: number | null | undefined) =>
  n != null ? `${(n * 100).toFixed(2)}%` : '—'

// ─── Traffic light helper ─────────────────────────────────────────────────────
function tfLight(tf: TFAnalysis): '🟢' | '🔴' | '🟡' {
  if (tf.trend === 'bullish' && tf.score >= 5) return '🟢'
  if (tf.trend === 'bearish' && tf.score >= 5) return '🔴'
  return '🟡'
}

export default function AnalysisPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [customSymbol, setCustomSymbol] = useState('')
  const { data, loading, error, analyze } = useAnalysis()
  const [expandedTF, setExpandedTF] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const setAnalysisLayers = useMarketStore(s => s.setAnalysisLayers)

  // Position size calculator state (persisted in localStorage)
  const [accountSize, setAccountSize] = useState<number>(() => {
    if (typeof window === 'undefined') return 10000
    return parseFloat(localStorage.getItem('pos_accountSize') ?? '10000')
  })
  const [riskPct, setRiskPct] = useState<number>(() => {
    if (typeof window === 'undefined') return 1
    return parseFloat(localStorage.getItem('pos_riskPct') ?? '1')
  })

  const saveAccountSize = useCallback((v: number) => {
    setAccountSize(v)
    localStorage.setItem('pos_accountSize', String(v))
  }, [])

  const saveRiskPct = useCallback((v: number) => {
    setRiskPct(v)
    localStorage.setItem('pos_riskPct', String(v))
  }, [])

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

            {/* Feature 6: Bias Summary Line */}
            <div className="bg-gray-800 rounded-lg p-3 overflow-x-auto">
              <div className="flex items-center gap-2 text-sm whitespace-nowrap">
                {data.timeframes.map((tf, i) => (
                  <span key={tf.timeframe} className="flex items-center gap-1">
                    <button
                      onClick={() => setExpandedTF(expandedTF === tf.timeframe ? null : tf.timeframe)}
                      className="flex items-center gap-1 hover:bg-gray-700 rounded px-1 py-0.5"
                    >
                      <span className="text-gray-300 font-mono text-xs">{tf.timeframe}</span>
                      <span>{tfLight(tf)}</span>
                    </button>
                    {i < data.timeframes.length - 1 && <span className="text-gray-600">→</span>}
                  </span>
                ))}
              </div>
            </div>

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

            {/* Feature 9: Go/No-Go Checklist */}
            <GoNoGoChecklist data={data} />

            {/* Feature 7: SL/TP with R:R */}
            {(data.nextLevels.sl || data.nextLevels.tp1) && (
              <div className="bg-gray-800 rounded-lg p-3 space-y-1 text-sm">
                <div className="text-gray-400 font-semibold mb-2">🎯 רמות</div>
                {data.nextLevels.sl && (
                  <LevelRowRR
                    label="SL"
                    price={data.nextLevels.sl}
                    rr={null}
                    color="text-red-400"
                    extra={data.nextLevels.slPct ? `${(data.nextLevels.slPct * 100).toFixed(2)}%` : undefined}
                  />
                )}
                {data.nextLevels.tp1 && (
                  <LevelRowRR label="TP1" price={data.nextLevels.tp1} rr={data.nextLevels.tp1RR} color="text-green-400" />
                )}
                {data.nextLevels.tp2 && (
                  <LevelRowRR label="TP2" price={data.nextLevels.tp2} rr={data.nextLevels.tp2RR} color="text-green-400" />
                )}
                {data.nextLevels.tp3 && (
                  <LevelRowRR label="TP3" price={data.nextLevels.tp3} rr={data.nextLevels.tp3RR} color="text-green-400" />
                )}
              </div>
            )}

            {/* Feature 8: Position Size Calculator */}
            <PositionSizeCalc
              currentPrice={data.currentPrice}
              slPct={data.nextLevels.slPct}
              accountSize={accountSize}
              riskPct={riskPct}
              onAccountSizeChange={saveAccountSize}
              onRiskPctChange={saveRiskPct}
              symbol={data.symbol}
            />

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

            {/* Feature 1: Score Breakdown toggle */}
            <div>
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="text-blue-400 text-xs hover:text-blue-300 mb-2 flex items-center gap-1"
              >
                {showBreakdown ? '▲' : '▼'} למה הציון הזה?
              </button>
            </div>

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
                      {/* Feature 5: Traffic light */}
                      <span>{tfLight(tf)}</span>
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

                  {/* Feature 1: Score breakdown per TF (when showBreakdown is on) */}
                  {showBreakdown && (
                    <ScoreBreakdownBar breakdown={tf.scoreBreakdown} />
                  )}

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

// ─── Feature 1: Score Breakdown Bar ──────────────────────────────────────────

function ScoreBreakdownBar({ breakdown }: { breakdown: ScoreBreakdown }) {
  const items: Array<{ label: string; value: number; color: string }> = [
    { label: 'בסיס', value: breakdown.base, color: 'bg-blue-600' },
    { label: 'TF גבוה', value: breakdown.higherTFBonus, color: 'bg-purple-500' },
    { label: 'FVG', value: breakdown.fvg, color: 'bg-green-500' },
    { label: 'BOS/CHoCH', value: breakdown.bosChoch, color: 'bg-teal-500' },
    { label: 'נזילות', value: breakdown.liquiditySweep, color: 'bg-yellow-500' },
    { label: 'Kill Zone', value: breakdown.killZone, color: 'bg-orange-500' },
    { label: 'iSMT', value: breakdown.ismt, color: 'bg-fuchsia-500' },
    { label: 'Wyckoff', value: breakdown.wyckoff, color: 'bg-emerald-500' },
    { label: 'W/M', value: breakdown.wm, color: 'bg-cyan-500' },
    { label: 'OB', value: breakdown.orderBlock, color: 'bg-amber-600' },
    { label: 'OTE', value: breakdown.ote, color: 'bg-yellow-400' },
    { label: 'Po3', value: breakdown.po3, color: 'bg-violet-500' },
    { label: 'Wing', value: breakdown.wingBreak, color: 'bg-red-500' },
    { label: 'BB', value: breakdown.breakerBlock, color: 'bg-pink-500' },
  ].filter(i => i.value > 0)

  if (items.length === 0) return null

  return (
    <div className="px-3 pb-2 border-t border-gray-700">
      <div className="text-gray-400 text-xs mb-1 mt-1">למה הציון הזה?</div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="text-gray-400 text-xs w-16 text-right shrink-0">{item.label}</div>
            <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${item.color}`}
                style={{ width: `${Math.min(100, (item.value / 5) * 100)}%` }}
              />
            </div>
            <div className="text-gray-300 text-xs w-8 text-left shrink-0">+{item.value.toFixed(1)}</div>
          </div>
        ))}
        <div className="flex justify-between text-xs text-gray-400 mt-1 border-t border-gray-700 pt-1">
          <span>סה&quot;כ</span>
          <span className="text-blue-400 font-bold">{breakdown.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Feature 9: Go/No-Go Checklist ───────────────────────────────────────────

function GoNoGoChecklist({ data }: { data: any }) {
  const dir = data.overallDirection
  const tfs = data.timeframes as TFAnalysis[]

  const higherTFs = ['1M', '1W', '1D', '4h', '1h']
  const alignedHigherTFs = tfs.filter(tf =>
    higherTFs.includes(tf.timeframe) && tf.trend === dir && tf.score >= 5
  ).length

  const positionOk = tfs.some((tf: TFAnalysis) => {
    const dr = tf.dealingRange
    if (!dr) return false
    if (dir === 'bullish') return dr.position === 'discount'
    if (dir === 'bearish') return dr.position === 'premium'
    return false
  })

  const killZoneActive = tfs.some((tf: TFAnalysis) => tf.killZone?.active)

  const liquidityCleared = tfs.some((tf: TFAnalysis) => tf.liquiditySweep)

  const hasBosChoch = tfs.some((tf: TFAnalysis) =>
    tf.structures.some(s => s.direction === dir)
  )

  const hasFVGInDir = tfs.some((tf: TFAnalysis) =>
    tf.fvgs.some(f => f.direction === dir)
  )

  const bestRR = Math.max(
    data.nextLevels.tp1RR ?? 0,
    data.nextLevels.tp2RR ?? 0,
    data.nextLevels.tp3RR ?? 0,
  )
  const rrOk = bestRR >= 2

  const checks = [
    { label: 'Bias גבוה מאושר (2+ TF גבוהים מסכימים)', ok: alignedHigherTFs >= 2 },
    { label: dir === 'bullish' ? 'מיקום: Discount (לונג)' : dir === 'bearish' ? 'מיקום: Premium (שורט)' : 'מיקום', ok: positionOk },
    { label: 'Kill Zone פעיל', ok: killZoneActive },
    { label: 'נזילות נוקתה', ok: liquidityCleared },
    { label: 'BOS/CHoCH קיים', ok: hasBosChoch },
    { label: 'FVG קיים בכיוון', ok: hasFVGInDir },
    { label: 'R:R לפחות 1:2', ok: rrOk },
  ]

  const passCount = checks.filter(c => c.ok).length
  const total = checks.length

  const borderColor =
    passCount >= 6 ? 'border-green-600' :
    passCount >= 4 ? 'border-yellow-600' :
    'border-red-600'

  const resultLabel =
    passCount >= 6 ? '🟢 כניסה!' :
    passCount >= 4 ? '🟡 חכה' :
    '🔴 לא כדאי'

  return (
    <div className={`bg-gray-800 rounded-lg p-3 border ${borderColor} space-y-2`}>
      <div className="text-gray-300 font-semibold text-sm">צ&apos;קליסט כניסה</div>
      {checks.map((c, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span>{c.ok ? '✅' : '⚠️'}</span>
          <span className={c.ok ? 'text-gray-200' : 'text-gray-500'}>{c.label}</span>
        </div>
      ))}
      <div className="border-t border-gray-700 pt-2 text-sm font-bold">
        תוצאה: {resultLabel}
        <span className="text-gray-400 font-normal mr-2 text-xs">({passCount}/{total} תנאים)</span>
      </div>
    </div>
  )
}

// ─── Feature 8: Position Size Calculator ─────────────────────────────────────

function PositionSizeCalc({
  currentPrice, slPct, accountSize, riskPct, onAccountSizeChange, onRiskPctChange, symbol,
}: {
  currentPrice: number
  slPct: number | null
  accountSize: number
  riskPct: number
  onAccountSizeChange: (v: number) => void
  onRiskPctChange: (v: number) => void
  symbol: string
}) {
  const riskAmount = accountSize * riskPct / 100
  const positionSize = slPct && slPct > 0 ? riskAmount / slPct : null
  const assetQty = positionSize && currentPrice > 0 ? positionSize / currentPrice : null

  // Extract asset name for display
  const assetName = symbol.replace('USDT', '').replace('USD', '')

  return (
    <div className="bg-gray-800 rounded-lg p-3 space-y-2">
      <div className="text-gray-400 font-semibold text-sm mb-1">🧮 מחשבון פוזיציה</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-gray-500 text-xs block mb-1">גודל חשבון ($)</label>
          <input
            type="number"
            value={accountSize}
            onChange={e => onAccountSizeChange(parseFloat(e.target.value) || 0)}
            className="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm"
            min={0}
          />
        </div>
        <div>
          <label className="text-gray-500 text-xs block mb-1">סיכון (%)</label>
          <input
            type="number"
            value={riskPct}
            onChange={e => onRiskPctChange(parseFloat(e.target.value) || 0)}
            className="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm"
            min={0.1}
            max={100}
            step={0.1}
          />
        </div>
      </div>
      {slPct ? (
        <div className="bg-gray-700 rounded p-2 text-xs text-gray-200 space-y-1">
          <div>
            סיכון: <span className="text-red-400 font-bold">${riskAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            {positionSize && (
              <> | פוזיציה: <span className="text-green-400 font-bold">${positionSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></>
            )}
          </div>
          {assetQty && (
            <div>
              כמות: <span className="text-blue-400 font-bold">{assetQty.toFixed(4)} {assetName}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-gray-600 text-xs">הגדר SL לחישוב אוטומטי</div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LevelRowRR({ label, price, rr, color, extra }: {
  label: string; price: number; rr: number | null; color: string; extra?: string
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={color}>{label}</span>
      <div className="flex items-center gap-2">
        {rr && <span className="text-gray-400 text-xs">R:R 1:{rr}</span>}
        {extra && <span className="text-gray-500 text-xs">{extra}</span>}
        <span className="text-white font-mono">{fmt(price)}</span>
      </div>
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

      {/* Order Blocks */}
      {tf.orderBlocks && tf.orderBlocks.length > 0 && (
        <div className="space-y-0.5">
          {tf.orderBlocks.slice(0, 3).map((ob, i) => (
            <div key={i} className={ob.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}>
              🟫 OB {ob.direction === 'bullish' ? '🟢' : '🔴'}
              {ob.broken ? ' (נשבר)' : ''}
              {' '}({fmt(ob.bottom)} – {fmt(ob.top)})
            </div>
          ))}
        </div>
      )}

      {/* Fibonacci OTE */}
      {tf.ote && (
        <div className={`rounded p-1.5 text-xs ${tf.ote.inZone ? 'bg-yellow-900/50 text-yellow-300' : 'text-gray-400'}`}>
          📐 OTE {tf.ote.inZone ? '✅ מחיר בתוך אזור OTE!' : `(${fmt(tf.ote.low)} – ${fmt(tf.ote.high)})`}
          {' '}0.705: {fmt(tf.ote.level705)}
        </div>
      )}

      {/* Session Open Prices */}
      {tf.sessionOpenPrices && (tf.sessionOpenPrices.nyMidnight || tf.sessionOpenPrices.trueDay) && (
        <div className="space-y-0.5">
          {tf.sessionOpenPrices.nyMidnight && (
            <div className="flex justify-between text-blue-400">
              <span>NY Midnight</span><span className="font-mono">{fmt(tf.sessionOpenPrices.nyMidnight)}</span>
            </div>
          )}
          {tf.sessionOpenPrices.trueDay && (
            <div className="flex justify-between text-gray-400">
              <span>True Day Open</span><span className="font-mono">{fmt(tf.sessionOpenPrices.trueDay)}</span>
            </div>
          )}
        </div>
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
