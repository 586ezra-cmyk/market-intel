'use client'

// חלון אזהרה שקופץ בכל לשונית כשהנתונים החיים נעצרים — כדי שלא סוחרים על לוח קפוא.
// שלושה מקרים: צילומי המצב מ-TradingView הפסיקו להגיע, המחיר מ-Binance נעצר, או שאין חיבור לשרת.
// החלון נסגר לבד כשהנתונים חוזרים. "הבנתי" מקטין אותו לתווית בפינה עד שהתקלה הזו נגמרת.

import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '@/lib/api'
import { SYMBOL_HE } from '@/components/tabs/TabLiveBoard'

interface HealthItem { symbol: string; kind: 'snapshots' | 'price'; tfs: string[]; since: number | null; ageSec: number | null }
interface Alarm { key: string; title: string; detail: string; since: number | null }

const POLL_MS = 15_000
const FAILS_FOR_ALARM = 3                       // 45 שניות בלי תשובה מהשרת
const STORE_KEY = 'm3_data_alarm_dismissed'
const TF_HE: Record<string, string> = { '1m': 'דקה', '5m': '5 דק׳', '15m': '15 דק׳', '1h': 'שעה' }

const ilTime = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false })
const ilDay = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' })
function sinceText(since: number | null, now: number): string {
  if (since == null) return 'עוד לא הגיע נתון'
  const min = Math.max(0, Math.round((now - since) / 60_000))
  const ago = min < 90 ? `${min} דק׳` : min < 48 * 60 ? `${Math.round(min / 60)} שע׳` : `${Math.round(min / 1440)} ימים`
  const sameDay = ilDay.format(since) === ilDay.format(now)
  return `הנתון האחרון הגיע ב-${ilTime.format(since)}${sameDay ? '' : ` (${ilDay.format(since)})`} · לפני ${ago}`
}

function toAlarm(it: HealthItem): Alarm {
  const name = SYMBOL_HE[it.symbol] ?? it.symbol
  if (it.kind === 'price') return { key: `${it.symbol}|price|${it.since ?? 0}`, title: `${name} — המחיר וה-Order Flow מ-Binance נעצרו`, detail: 'המחיר בלוח לא מתעדכן.', since: it.since }
  const tfs = it.tfs.map(t => TF_HE[t] ?? t).join(', ')
  return { key: `${it.symbol}|snapshots|${it.since ?? 0}`, title: `${name} — האישורים הפסיקו להגיע מ-TradingView`, detail: `מסגרות שנעצרו: ${tfs}.`, since: it.since }
}

function loadDismissed(): string[] {
  try { const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] }
}

export default function DataAlarm() {
  const [items, setItems] = useState<HealthItem[]>([])
  const [fails, setFails] = useState(0)
  const [downSince, setDownSince] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => { setDismissed(loadDismissed()) }, [])
  useEffect(() => {
    let alive = true
    const load = () => fetch(`${API_BASE}/api/live/health`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { items?: HealthItem[] }) => { if (!alive) return; setItems(Array.isArray(j.items) ? j.items : []); setFails(0); setDownSince(null); setNow(Date.now()) })
      .catch(() => { if (!alive) return; setFails(f => f + 1); setDownSince(s => s ?? Date.now()); setNow(Date.now()) })
    load(); const id = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const alarms = useMemo<Alarm[]>(() => {
    if (fails >= FAILS_FOR_ALARM) return [{ key: `server|${downSince ?? 0}`, title: 'אין חיבור לשרת — כל הלוח קפוא', detail: 'האתר לא מצליח לקבל נתונים מהשרת.', since: downSince }]
    return items.map(toAlarm)
  }, [items, fails, downSince])

  // תקלה שנגמרה נמחקת מרשימת ה"הבנתי", כדי שאם היא תחזור החלון יקפוץ שוב
  useEffect(() => {
    if (fails > 0) return
    const active = new Set(alarms.map(a => a.key))
    setDismissed(d => {
      const keep = d.filter(k => active.has(k))
      if (keep.length === d.length) return d
      try { localStorage.setItem(STORE_KEY, JSON.stringify(keep)) } catch { /* אין אחסון — לא נורא */ }
      return keep
    })
  }, [alarms, fails])

  if (!alarms.length) return null
  const open = alarms.filter(a => !dismissed.includes(a.key))
  const save = (next: string[]) => { setDismissed(next); try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* אין אחסון */ } }

  if (!open.length) {
    // כבר ראה וסגר — נשארת תווית קטנה בפינה כל עוד התקלה נמשכת
    return (
      <button onClick={() => save([])} title="לחץ כדי לראות מה נעצר"
        className="fixed bottom-3 left-3 z-[999] rounded-full border border-red-600 bg-red-950/90 px-3 py-1.5 text-xs font-bold text-red-200 shadow-lg hover:bg-red-900">
        ⚠️ נתונים עצורים ({alarms.length})
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4" role="alertdialog" aria-modal="true" aria-labelledby="data-alarm-title">
      <div className="w-full max-w-lg rounded-xl border-2 border-red-600 bg-surface-raised p-5 shadow-2xl">
        <div id="data-alarm-title" className="text-xl font-black text-red-400">⚠️ הנתונים נעצרו</div>
        <div className="mt-1 text-sm text-slate-300">הלוח לא מעודכן. לא לפתוח עסקה לפי מה שמוצג עד שהנתונים חוזרים.</div>
        <ul className="mt-4 space-y-2">
          {open.map(a => (
            <li key={a.key} className="rounded-lg border border-red-900/70 bg-red-950/40 px-3 py-2">
              <div className="font-bold text-white">{a.title}</div>
              <div className="text-sm text-slate-300">{a.detail}</div>
              <div className="text-xs text-slate-400">{sinceText(a.since, now)}</div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400">החלון נסגר לבד כשהנתונים חוזרים.</div>
          <button onClick={() => save([...new Set([...dismissed, ...open.map(a => a.key)])])}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500">הבנתי</button>
        </div>
      </div>
    </div>
  )
}
