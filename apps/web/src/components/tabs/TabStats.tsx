'use client'

import { useApi } from '@/hooks/useApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

export default function TabStats() {
  const { data: alerts } = useApi<{ alerts: any[] }>('/api/alerts?limit=500')
  const rows = alerts?.alerts ?? []

  // Calculate stats
  const byFactor: Record<string, { count: number; wins: number }> = {}
  const byTF: Record<string, { count: number; score: number }> = {}

  rows.forEach(a => {
    // By TF
    if (!byTF[a.timeframe]) byTF[a.timeframe] = { count: 0, score: 0 }
    byTF[a.timeframe].count++
    byTF[a.timeframe].score += a.score ?? 0

    // By factor
    ;(a.factors ?? []).forEach((f: string) => {
      if (!byFactor[f]) byFactor[f] = { count: 0, wins: 0 }
      byFactor[f].count++
    })
  })

  const tfData = Object.entries(byTF).map(([tf, v]) => ({
    tf,
    count: v.count,
    avgScore: v.count > 0 ? parseFloat((v.score / v.count).toFixed(2)) : 0,
  }))

  const factorData = Object.entries(byFactor).map(([factor, v]) => ({
    factor, count: v.count,
  }))

  const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#ec4899']

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-bold">📊 סטטיסטיקות</h2>

      {rows.length === 0 && (
        <div className="text-center text-slate-500 py-12">אין נתונים עדיין</div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'סה״כ התראות', value: rows.length },
          { label: 'ממוצע דירוג', value: rows.length ? (rows.reduce((s: number, a: any) => s + (a.score ?? 0), 0) / rows.length).toFixed(1) : '—' },
          { label: 'התראות גבוהות (7+)', value: rows.filter((a: any) => (a.score ?? 0) >= 7).length },
          { label: 'Kill Zone', value: rows.filter((a: any) => a.inKillZone).length },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <div className="text-2xl font-bold text-brand-400">{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* By TF */}
        <div className="card">
          <h3 className="font-semibold mb-3 text-sm">התראות לפי TF</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tfData}>
              <XAxis dataKey="tf" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#161b27', border: '1px solid #1e2533', color: '#fff' }} />
              <Bar dataKey="count" fill="#6366f1" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Factor */}
        <div className="card">
          <h3 className="font-semibold mb-3 text-sm">אישורים נפוצים</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={factorData} dataKey="count" nameKey="factor" cx="50%" cy="50%" outerRadius={80} label>
                {factorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#161b27', border: '1px solid #1e2533', color: '#fff' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Avg score by TF */}
      <div className="card">
        <h3 className="font-semibold mb-3 text-sm">ממוצע דירוג לפי TF</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={tfData}>
            <XAxis dataKey="tf" stroke="#64748b" fontSize={11} />
            <YAxis stroke="#64748b" fontSize={11} domain={[0, 10]} />
            <Tooltip contentStyle={{ background: '#161b27', border: '1px solid #1e2533', color: '#fff' }} />
            <Bar dataKey="avgScore" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
