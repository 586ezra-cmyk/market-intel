'use client'

import { useApi } from '@/hooks/useApi'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from 'recharts'

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316']
const TF_ORDER = ['1m','3m','5m','15m','30m','1h','4h','6h','12h','1D','1W','1M']

export default function TabStats() {
  const { data: alertsData } = useApi<{ alerts: any[] }>('/api/alerts?limit=500')
  const { data: journalData } = useApi<{ entries: any[]; stats: any }>('/api/journal?limit=500')
  const { data: backtestData } = useApi<{ entries: any[]; stats: any }>('/api/backtest?limit=500')

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

    // By hour
    const h = new Date(a.triggeredAt ?? a.createdAt).getHours()
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

      {alerts.length === 0 && journalEntries.length === 0 && (
        <div className="text-center text-slate-500 py-12">
          <div className="text-3xl mb-2">📊</div>
          <div>אין נתונים עדיין — הסטטיסטיקה תתמלא כשיגיעו התראות ועסקאות</div>
        </div>
      )}
    </div>
  )
}
