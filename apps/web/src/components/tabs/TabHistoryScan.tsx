'use client'

import { useState } from 'react'
import { SYMBOL_OPTIONS, TF_OPTIONS } from '@/lib/utils'

export default function TabHistoryScan() {
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [tf, setTf] = useState('15m')
  const [period, setPeriod] = useState('30d')
  const [criteria, setCriteria] = useState({
    requireBOS: false, requireFVG: false, requireLiqSweep: false,
    requireSMT: false, requireKillZone: false, minScore: 3,
  })
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<any>(null)

  async function runScan() {
    setRunning(true)
    // In production this calls /api/scan endpoint
    await new Promise(r => setTimeout(r, 1500))
    setResults({
      totalMatches: 42,
      successRate: 68.5,
      avgRR: 2.4,
      byHour: Array.from({ length: 24 }, (_, h) => ({
        hour: h, count: Math.floor(Math.random() * 8),
      })),
      byKillZone: { inKZ: 28, outKZ: 14 },
    })
    setRunning(false)
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">🔍 סריקה היסטורית אוטומטית</h2>

      <div className="card space-y-4">
        {/* Inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">נכס</label>
            <select className="select" value={symbol} onChange={e => setSymbol(e.target.value)}>
              {SYMBOL_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">TF</label>
            <select className="select" value={tf} onChange={e => setTf(e.target.value)}>
              {TF_OPTIONS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">תקופה</label>
            <select className="select" value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="7d">7 ימים</option>
              <option value="30d">30 ימים</option>
              <option value="90d">90 ימים</option>
              <option value="180d">6 חודשים</option>
            </select>
          </div>
        </div>

        {/* Criteria */}
        <div>
          <label className="text-xs text-slate-400 mb-2 block">קריטריונים:</label>
          <div className="flex flex-wrap gap-3">
            {[
              { key: 'requireBOS' as const, label: 'BOS / CHoCH' },
              { key: 'requireFVG' as const, label: 'FVG' },
              { key: 'requireLiqSweep' as const, label: 'Liquidity Sweep' },
              { key: 'requireSMT' as const, label: 'SMT / iSMT' },
              { key: 'requireKillZone' as const, label: 'Kill Zone' },
            ].map(c => (
              <label key={c.key} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="checkbox" className="w-4 h-4" checked={criteria[c.key]}
                  onChange={e => setCriteria(prev => ({ ...prev, [c.key]: e.target.checked }))} />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="text-xs text-slate-400">דירוג מינימלי: <span className="text-white">{criteria.minScore}</span></label>
          <input type="range" min={1} max={10} value={criteria.minScore} className="flex-1"
            onChange={e => setCriteria(prev => ({ ...prev, minScore: Number(e.target.value) }))} />
        </div>

        <button onClick={runScan} disabled={running} className="btn-primary">
          {running ? '⏳ סורק...' : '🔍 הפעל סריקה'}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="card text-center">
              <div className="text-2xl font-bold text-brand-400">{results.totalMatches}</div>
              <div className="text-xs text-slate-400">התאמות שנמצאו</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-green-400">{results.successRate}%</div>
              <div className="text-xs text-slate-400">אחוז הצלחה</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-yellow-400">1:{results.avgRR}</div>
              <div className="text-xs text-slate-400">ממוצע R:R</div>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3 text-sm">פיזור לפי שעה (UTC)</h3>
            <div className="flex items-end gap-0.5 h-20">
              {results.byHour.map((h: any) => (
                <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-brand-600/60 rounded-t"
                    style={{ height: `${(h.count / 8) * 100}%` }}
                  />
                  {h.hour % 4 === 0 && <span className="text-[9px] text-slate-500">{h.hour}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-2 text-sm">Kill Zone vs מחוץ</h3>
            <div className="flex gap-6 text-sm">
              <div><span className="text-purple-400 font-bold">{results.byKillZone.inKZ}</span> <span className="text-slate-400">בתוך Kill Zone</span></div>
              <div><span className="text-slate-300 font-bold">{results.byKillZone.outKZ}</span> <span className="text-slate-400">מחוץ ל-Kill Zone</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
