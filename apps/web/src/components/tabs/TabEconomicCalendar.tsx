'use client'

import { useMemo } from 'react'
import { useApi } from '@/hooks/useApi'

interface EconEvent {
  id: string
  title: string
  titleHe: string
  country: string
  currency: string
  impact: 'high' | 'medium' | 'low'
  date: string
  time: string
  timeIL: string
  forecast: string
  previous: string
  actual: string
  explanationHe: string
  bullishHe: string
  bearishHe: string
  ts?: number
  dateIL?: string
  noTrade?: boolean
  noTradeHe?: string
  allDay?: boolean
}

const IMPACT_COLORS = { high: 'text-red-400', medium: 'text-yellow-400', low: 'text-slate-400' }
const IMPACT_LABEL = { high: '🔴 גבוה', medium: '🟡 בינוני', low: '⚪ חג / מידע' }
const CUR_FLAG: Record<string, string> = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿', CHF: '🇨🇭', CNY: '🇨🇳', All: '🌍' }

function dayLabel(dateIL: string, todayIL: string): string {
  if (dateIL === todayIL) return 'היום'
  const d = new Date(dateIL + 'T12:00:00')
  const t = new Date(todayIL + 'T12:00:00')
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (diff === 1) return 'מחר'
  if (diff === -1) return 'אתמול'
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' })
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'עכשיו'
  const m = Math.round(ms / 60000)
  if (m < 60) return `בעוד ${m} דק'`
  const h = Math.floor(m / 60)
  if (h < 24) return `בעוד ${h} ש' ו-${m % 60} דק'`
  return `בעוד ${Math.round(h / 24)} ימים`
}

function num(s: string): number | null {
  const v = parseFloat(String(s).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(v) ? v : null
}

export default function TabEconomicCalendar() {
  const { data: events, loading, error } = useApi<EconEvent[]>('/api/economic-calendar')
  const todayIL = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const now = Date.now()

  const { groups, nextRed } = useMemo(() => {
    const list = (events ?? []).filter(e => (e.ts ?? 0) >= now - 12 * 3600000)
    const byDay = new Map<string, EconEvent[]>()
    for (const e of list) {
      const k = e.dateIL ?? e.date
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k)!.push(e)
    }
    const nextRed = list.find(e => e.noTrade && (e.ts ?? 0) > now) ?? null
    return { groups: [...byDay.entries()], nextRed }
  }, [events, now])

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">📰 דוחות כלכליים</h2>
        <p className="text-xs text-slate-400">מקור: הפיד הרשמי של ForexFactory · השבוע והשבוע הבא · שעון ישראל</p>
      </div>

      {nextRed && (
        <div className="card border-r-4 border-red-500 bg-red-950/40 p-3">
          <div className="text-xs text-red-300 font-bold">הדוח האדום הבא בדולר</div>
          <div className="font-bold">{nextRed.titleHe} · {nextRed.timeIL} 🇮🇱 · {fmtCountdown((nextRed.ts ?? 0) - now)}</div>
          <div className="text-xs text-red-200 mt-1">{nextRed.noTradeHe}</div>
        </div>
      )}

      {loading && <div className="text-center py-12 text-slate-500">⏳ טוען...</div>}
      {error && <div className="card text-center py-6 text-red-400 text-sm">השרת לא החזיר דוחות ({error})</div>}

      {!loading && !error && groups.length === 0 && (
        <div className="card text-center py-8 text-slate-500">
          <div className="text-3xl mb-2">📰</div>
          <div>אין דוחות בינוניים או גבוהים בשבועיים הקרובים</div>
        </div>
      )}

      {groups.map(([day, list]) => (
        <div key={day} className="space-y-2">
          <div className="text-sm font-bold text-slate-300 border-b border-surface-border pb-1 sticky top-0 bg-surface">{dayLabel(day, todayIL)} <span className="text-xs text-slate-500 font-normal">· {day}</span></div>
          {list.map(ev => {
            const past = (ev.ts ?? 0) < now
            const a = num(ev.actual), f = num(ev.forecast)
            return (
              <div key={ev.id} className={`card border-r-4 ${ev.impact === 'high' ? 'border-red-500' : ev.impact === 'medium' ? 'border-yellow-500' : 'border-slate-600'} ${past ? 'opacity-60' : ''} ${ev.noTrade ? 'bg-red-950/20' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-bold ${IMPACT_COLORS[ev.impact]}`}>{IMPACT_LABEL[ev.impact]}</span>
                      <span className="text-xs text-slate-400">{CUR_FLAG[ev.currency] ?? ''} {ev.currency}</span>
                      {ev.noTrade && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-800 text-white">🚫 חלון חדשות — חשבון ממומן</span>}
                    </div>
                    <div className="font-bold">{ev.titleHe}</div>
                    {ev.titleHe !== ev.title && <div className="text-xs text-slate-400">{ev.title}</div>}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-mono text-brand-400">{ev.allDay ? 'כל היום' : ev.timeIL + ' 🇮🇱'}</div>
                    {!ev.allDay && <div className="text-xs text-slate-500">{ev.time} UTC{ev.ts && !past ? ' · ' + fmtCountdown(ev.ts - now) : ''}</div>}
                  </div>
                </div>
                {!ev.allDay && (
                  <div className="flex gap-6 mt-3 text-xs">
                    <div><span className="text-slate-400">צפי: </span><span className="font-mono">{ev.forecast || '—'}</span></div>
                    <div><span className="text-slate-400">קודם: </span><span className="font-mono">{ev.previous || '—'}</span></div>
                    {ev.actual && <div><span className="text-slate-400">בפועל: </span>
                      <span className={`font-mono font-bold ${a !== null && f !== null ? (a > f ? 'text-green-400' : a < f ? 'text-red-400' : '') : ''}`}>{ev.actual}</span>
                    </div>}
                  </div>
                )}
                {ev.explanationHe && (
                  <div className="mt-3 p-3 bg-surface rounded text-xs space-y-1.5">
                    <div className="text-slate-300">{ev.explanationHe}</div>
                    {ev.bullishHe && <div className="text-green-400">📈 <strong>חיובי:</strong> {ev.bullishHe}</div>}
                    {ev.bearishHe && <div className="text-red-400">📉 <strong>שלילי:</strong> {ev.bearishHe}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
      <p className="text-[11px] text-slate-500">חלון החדשות לחשבון הממומן מסומן לפי דוחות אדומים בדולר, 5 דקות לפני ואחרי (ניתן לשינוי ב-NEWS_WINDOW_MIN). חוקי MFFU המדויקים: לאשר.</p>
    </div>
  )
}
