'use client'

import { useApi } from '@/hooks/useApi'
import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from 'recharts'

interface FactorStat {
  factors: string[]
  tp1Rate: number
  tp2Rate: number
  slRate: number
  count: number
}

interface WinRateSummary {
  totalAlerts: number
  totalOutcomed: number
  tp1Rate: number
  tp2Rate: number
  tp3Rate: number
  slRate: number
  pendingCount: number
  expiredCount: number
}

function useFactorStats() {
  const [combinations, setCombinations] = useState<FactorStat[]>([])
  const [summary, setSummary] = useState<WinRateSummary | null>(null)
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const fetchAll = async () => {
    try {
      const [combRes, sumRes] = await Promise.all([
        fetch(`${API}/api/stats/factors`),
        fetch(`${API}/api/stats/summary`),
      ])
      if (combRes.ok) {
        const d = await combRes.json()
        setCombinations(d.combinations ?? [])
      }
      if (sumRes.ok) {
        const d = await sumRes.json()
        setSummary(d)
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 5 * 60 * 1000)  // refresh every 5 min
    return () => clearInterval(interval)
  }, [])

  return { combinations, summary }
}

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316']
const TF_ORDER = ['1m','3m','5m','15m','30m','1h','4h','6h','12h','1D','1W','1M']

export default function TabStats() {
  const { data: alertsData } = useApi<{ alerts: any[] }>('/api/alerts?limit=500')
  const { data: journalData } = useApi<{ entries: any[]; stats: any }>('/api/journal?limit=500')
  const { data: backtestData } = useApi<{ entries: any[]; stats: any }>('/api/backtest?limit=500')
  const { combinations, summary } = useFactorStats()

  const alerts = alertsData?.alerts ?? []
  const journalEntries = journalData?.entries ?? []
  const journalStats = journalData?.stats ?? {}
  const backtestStats = backtestData?.stats ?? {}

  // ── Alert stats ──────────────────────────────────────────────────────────────
  const byTF: Record<string, { count: number; score: number; kz: number }> = {}
  const byFactor: Record<string, number> = {}
  const byHour: Record<number, number> = {}
  const bySymbol: Record<string, { bullish: number; bearish: number; total: number }> = {}

  alerts.forEach(a => {
    // By TF
    const tf = a.timeframe ?? 'unknown'
    if (!byTF[tf]) byTF[tf] = { count: 0, score: 0, kz: 0 }
    byTF[tf].count++
    byTF[tf].score += a.score ?? 0
    if (a.inKillZone) byTF[tf].kz++

    // By factor
    ;(a.factors ?? []).forEach((f: string) => {
      byFactor[f] = (byFactor[f] ?? 0) + 1
    })

    // By hour (UTC)
    const h = new Date(a.triggeredAt ?? a.createdAt).getUTCHours()
    byHour[h] = (byHour[h] ?? 0) + 1

    // By symbol
    const sym = a.symbol
    if (!bySymbol[sym]) bySymbol[sym] = { bullish: 0, bearish: 0, total: 0 }
    bySymbol[sym].total++
    if (a.direction === 'bullish') bySymbol[sym].bullish++
    else bySymbol[sym].bearish++
  })

  const tfData = Object.entries(byTF)
    .sort((a, b) => TF_ORDER.indexOf(a[0]) - TF_ORDER.indexOf(b[0]))
    .map(([tf, v]) => ({
      tf,
      'כמות': v.count,
      'ממוצע דירוג': v.count > 0 ? parseFloat((v.score / v.count).toFixed(1)) : 0,
      'עם KZ': v.kz,
    }))

  const factorData = Object.entries(byFactor)
    .sort((a, b) => b[1] - a[1])
    .map(([factor, count]) => ({ factor, count }))

  const hourData = Array.from({ length: 24 }, (_, h) => ({
    שעה: `${h}:00`,
    כמות: byHour[h] ?? 0,
  }))

  const symbolData = Object.entries(bySymbol)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([symbol, v]) => ({ symbol, ...v }))

  // ── Journal equity curve ──────────────────────────────────────────────────
  let cumPnl = 0
  const equityCurve = journalEntries
    .filter(e => e.pnlUsd !== null)
    .reverse()
    .map(e => {
      cumPnl += e.pnlUsd
      return { תאריך: new Date(e.openedAt).toLocaleDateString('he-IL'), PnL: parseFloat(cumPnl.toFixed(2)) }
    })

  const tooltipStyle = { background: '#161b27', border: '1px solid #1e2533', color: '#fff', fontSize: 12 }

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      <h2 className="text-lg font-bold">📊 סטטיסטיקות מערכת</h2>

      {/* ── Top KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'סה״כ התראות', value: alerts.length, color: 'text-brand-400' },
          { label: 'ממוצע דירוג', value: alerts.length ? (alerts.reduce((s,a) => s + (a.score ?? 0), 0) / alerts.length).toFixed(1) : '—', color: 'text-blue-400' },
          { label: 'התראות 7+', value: alerts.filter(a => (a.score ?? 0) >= 7).length, color: 'text-green-400' },
          { label: 'עם Kill Zone', value: alerts.filter(a => a.inKillZone).length, color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Journal + Backtest KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Win Rate יומן', value: `${journalStats.winRate ?? '—'}%`, color: journalStats.winRate >= 50 ? 'text-green-400' : 'text-red-400' },
          { label: 'רווח כולל יומן', value: journalStats.totalPnl !== undefined ? `$${journalStats.totalPnl}` : '—', color: (journalStats.totalPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Win Rate בק-טסט', value: `${backtestStats.winRate ?? '—'}%`, color: 'text-brand-400' },
          { label: 'ממוצע R:R בנצח', value: backtestStats.avgRR ?? '—', color: 'text-yellow-400' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Charts row 1 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-3 text-sm">התראות לפי TF</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tfData}>
              <XAxis dataKey="tf" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="כמות" fill="#6366f1" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-3 text-sm">ממוצע דירוג לפי TF</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tfData}>
              <XAxis dataKey="tf" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} domain={[0, 10]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="ממוצע דירוג" fill="#10b981" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Charts row 2 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-3 text-sm">אישורים נפוצים</h3>
          {factorData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={factorData} dataKey="count" nameKey="factor" cx="50%" cy="50%" outerRadius={80} label={({ factor }) => factor}>
                  {factorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="text-center text-slate-500 h-48 flex items-center justify-center">אין נתונים</div>}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-3 text-sm">התראות לפי שעה (UTC)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourData}>
              <XAxis dataKey="שעה" stroke="#64748b" fontSize={9} interval={3} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="כמות" fill="#f59e0b" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Equity curve ── */}
      {equityCurve.length > 1 && (
        <div className="card">
          <h3 className="font-semibold mb-3 text-sm">📈 עקומת הון (יומן מסחר)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2533" />
              <XAxis dataKey="תאריך" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`$${v}`, 'PnL מצטבר']} />
              <Line type="monotone" dataKey="PnL" stroke="#10b981" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── By symbol ── */}
      {symbolData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3 text-sm">התראות לפי נכס</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={symbolData}>
              <XAxis dataKey="symbol" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="bullish" name="לונג" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
              <Bar dataKey="bearish" name="שורט" stackId="a" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Feature 10: Factor Performance Section ── */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-sm">📊 ביצועים לפי גורמים (Self-Learning)</h3>

        {/* Win rate summary */}
        {summary && summary.totalOutcomed > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'TP1 Rate', value: `${summary.tp1Rate}%`, color: summary.tp1Rate >= 65 ? 'text-green-400' : summary.tp1Rate >= 50 ? 'text-yellow-400' : 'text-red-400' },
              { label: 'TP2 Rate', value: `${summary.tp2Rate}%`, color: summary.tp2Rate >= 50 ? 'text-green-400' : 'text-yellow-400' },
              { label: 'SL Rate', value: `${summary.slRate}%`, color: summary.slRate < 30 ? 'text-green-400' : 'text-red-400' },
              { label: 'עסקאות עם תוצאה', value: summary.totalOutcomed, color: 'text-blue-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800 rounded p-2 text-center">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Factor combinations table */}
        {combinations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-right pb-2 font-medium">גורמים</th>
                  <th className="text-center pb-2 font-medium">כמות</th>
                  <th className="text-center pb-2 font-medium">TP1%</th>
                  <th className="text-center pb-2 font-medium">TP2%</th>
                  <th className="text-center pb-2 font-medium">SL%</th>
                </tr>
              </thead>
              <tbody className="space-y-1">
                {combinations.map((stat, i) => {
                  const rowColor =
                    stat.tp1Rate >= 65 ? 'border-r-2 border-r-green-500' :
                    stat.tp1Rate >= 50 ? 'border-r-2 border-r-yellow-500' :
                    'border-r-2 border-r-red-500'
                  return (
                    <tr key={i} className={`border-b border-slate-800 ${rowColor}`}>
                      <td className="py-1.5 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {stat.factors.map((f, fi) => (
                            <span key={fi} className="bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded text-xs">{f}</span>
                          ))}
                        </div>
                      </td>
                      <td className="text-center text-slate-300">{stat.count}</td>
                      <td className={`text-center font-bold ${stat.tp1Rate >= 65 ? 'text-green-400' : stat.tp1Rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {stat.tp1Rate}%
                      </td>
                      <td className="text-center text-slate-300">{stat.tp2Rate}%</td>
                      <td className={`text-center ${stat.slRate > 40 ? 'text-red-400' : 'text-slate-300'}`}>
                        {stat.slRate}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-slate-500 py-6 text-sm">
            אין נתוני ביצועים עדיין — הנתונים יצטברו אוטומטית לאחר סגירת עסקאות
          </div>
        )}

        {summary && (
          <div className="text-xs text-slate-500 text-left">
            מחכים לתוצאה: {summary.pendingCount} | פגו תוקף: {summary.expiredCount}
            {' '}| מתרענן כל 5 דקות
          </div>
        )}
      </div>

      {alerts.length === 0 && journalEntries.length === 0 && (
        <div className="text-center text-slate-500 py-12">
          <div className="text-3xl mb-2">📊</div>
          <div>אין נתונים עדיין — הסטטיסטיקה תתמלא כשיגיעו התראות ועסקאות</div>
        </div>
      )}
    </div>
  )
}
