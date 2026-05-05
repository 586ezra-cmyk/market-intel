'use client'

import { useApi } from '@/hooks/useApi'
import { formatTime } from '@/lib/utils'

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
}

const IMPACT_COLORS = { high: 'text-red-400', medium: 'text-yellow-400', low: 'text-green-400' }
const IMPACT_BG = { high: 'bg-red-950', medium: 'bg-yellow-950', low: 'bg-green-950' }
const IMPACT_LABEL = { high: '🔴 גבוה', medium: '🟡 בינוני', low: '🟢 נמוך' }

export default function TabEconomicCalendar() {
  const { data: events, loading } = useApi<EconEvent[]>('/api/economic-calendar')

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">📰 דוחות כלכליים</h2>
      <p className="text-xs text-slate-400">מקור: ForexFactory · שעות בשעון ישראל (IL)</p>

      {loading && <div className="text-center py-12 text-slate-500">⏳ טוען...</div>}

      {!loading && (!events || events.length === 0) && (
        <div className="card text-center py-8 text-slate-500">
          <div className="text-3xl mb-2">📰</div>
          <div>אין דוחות כלכליים לשבוע זה</div>
          <div className="text-xs mt-1">שרת ForexFactory לא מוגדר או לא נגיש</div>
        </div>
      )}

      {(events ?? []).map(ev => (
        <div key={ev.id} className={`card border-r-4 ${ev.impact === 'high' ? 'border-red-500' : ev.impact === 'medium' ? 'border-yellow-500' : 'border-green-600'}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${IMPACT_COLORS[ev.impact]}`}>
                  {IMPACT_LABEL[ev.impact]}
                </span>
                <span className="text-xs text-slate-500">{ev.currency} · {ev.country}</span>
              </div>
              <div className="font-bold">{ev.titleHe}</div>
              <div className="text-xs text-slate-400">{ev.title}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono text-brand-400">{ev.timeIL} 🇮🇱</div>
              <div className="text-xs text-slate-500">{ev.time} UTC</div>
            </div>
          </div>

          {/* Values */}
          <div className="flex gap-6 mt-3 text-xs">
            <div><span className="text-slate-400">צפי: </span><span className="font-mono">{ev.forecast || '—'}</span></div>
            <div><span className="text-slate-400">קודם: </span><span className="font-mono">{ev.previous || '—'}</span></div>
            {ev.actual && <div><span className="text-slate-400">בפועל: </span>
              <span className={`font-mono font-bold ${Number(ev.actual) > Number(ev.forecast) ? 'text-green-400' : 'text-red-400'}`}>
                {ev.actual}
              </span>
            </div>}
          </div>

          {/* Explanation */}
          {ev.explanationHe && (
            <div className="mt-3 p-3 bg-surface rounded text-xs space-y-1.5">
              <div className="text-slate-300">{ev.explanationHe}</div>
              {ev.bullishHe && <div className="text-green-400">📈 <strong>חיובי:</strong> {ev.bullishHe}</div>}
              {ev.bearishHe && <div className="text-red-400">📉 <strong>שלילי:</strong> {ev.bearishHe}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
