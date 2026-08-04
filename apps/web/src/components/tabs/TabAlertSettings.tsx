'use client'

import { useState, useEffect } from 'react'
import { useApi, apiPost } from '@/hooks/useApi'

// ─── Timeframes ───────────────────────────────────────────────────────────────

const ALL_TFS = [
  { id: '1m',  label: '1 דקה'  },
  { id: '5m',  label: '5 דקות' },
  { id: '15m', label: '15 דקות'},
  { id: '30m', label: '30 דקות'},
  { id: '1h',  label: 'שעה'    },
  { id: '4h',  label: '4 שעות' },
  { id: '1D',  label: 'יומי'   },
  { id: '1W',  label: 'שבועי'  },
]

// ─── Signal types ─────────────────────────────────────────────────────────────

const SIGNAL_GROUPS = [
  {
    label: '📐 מבנה שוק',
    signals: [
      { id: 'bos',        label: 'BOS — שבירת מבנה'    },
      { id: 'choch',      label: 'CHoCH — שינוי כיוון'  },
    ],
  },
  {
    label: '💧 נזילות',
    signals: [
      { id: 'liquidity',  label: 'Liquidity Sweep'       },
      { id: 'inducement', label: 'Inducement — פיתוי'    },
    ],
  },
  {
    label: '📦 FVG',
    signals: [
      { id: 'fvg',        label: 'FVG — פער הוגן'        },
      { id: 'ifvg',       label: 'iFVG — הפוך'           },
      { id: 'repricing',  label: 'Repricing — תמחור מחדש'},
    ],
  },
  {
    label: '🔀 דיברגנס',
    signals: [
      { id: 'smt',        label: 'SMT (BTC דיברגנס)'    },
      { id: 'ismt',       label: 'iSMT (2 נרות)'         },
    ],
  },
  {
    label: '🧱 תבניות',
    signals: [
      { id: 'ob',         label: 'Order Block'            },
      { id: 'doubletop',  label: 'Double Top 🔴'          },
      { id: 'doublebottom', label: 'Double Bottom 🟢'    },
    ],
  },
  {
    label: '🕐 סשן',
    signals: [
      { id: 'judas',      label: 'Judas Swing'            },
      { id: 'session',    label: 'Session H/L'            },
      { id: 'wyckoff',    label: 'Wyckoff — פאזה'         },
    ],
  },
]

const DEFAULT_SIGNALS    = SIGNAL_GROUPS.flatMap(g => g.signals.map(s => s.id))
const DEFAULT_TIMEFRAMES = ALL_TFS.map(tf => tf.id)

// ─── Toggle button ────────────────────────────────────────────────────────────

function Toggle({ on, onChange, label, size = 'sm' }: {
  on: boolean; onChange: () => void; label: string; size?: 'sm' | 'lg'
}) {
  const w = size === 'lg' ? 'w-14 h-7' : 'w-10 h-5'
  const dot = size === 'lg' ? 'w-6 h-6 top-0.5' : 'w-4 h-4 top-0.5'
  const on_ = size === 'lg' ? 'translate-x-7' : 'translate-x-5'

  return (
    <button
      onClick={onChange}
      title={label}
      className={`relative ${w} rounded-full transition-colors shrink-0 ${on ? 'bg-brand-600' : 'bg-slate-600'}`}
    >
      <span className={`absolute ${dot} left-0.5 bg-white rounded-full shadow transition-transform ${on ? on_ : 'translate-x-0'}`} />
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TabAlertSettings() {
  const { data: settings, refetch } = useApi<Record<string, any>>('/api/settings')

  const [masterOn,    setMasterOn]    = useState(true)
  const [signals,     setSignals]     = useState<string[]>(DEFAULT_SIGNALS)
  const [timeframes,  setTimeframes]  = useState<string[]>(DEFAULT_TIMEFRAMES)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [testResult,  setTestResult]  = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    setMasterOn(settings.telegram_active ?? true)
    if (settings.alert_signals)    setSignals(JSON.parse(settings.alert_signals))
    if (settings.alert_timeframes) setTimeframes(JSON.parse(settings.alert_timeframes))
  }, [settings])

  function toggleSignal(id: string) {
    setSignals(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  function toggleTF(id: string) {
    setTimeframes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  async function save() {
    setSaving(true); setSaved(false)
    try {
      await apiPost('/api/settings', {
        telegram_active:    masterOn,
        alert_signals:      JSON.stringify(signals),
        alert_timeframes:   JSON.stringify(timeframes),
      })
      setSaved(true); refetch()
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  async function sendTest() {
    setTestResult(null)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
      const r = await fetch(`${base}/api/telegram/test`, { method: 'POST' })
      const d = await r.json()
      setTestResult(d.results ? d.results.join(' · ') : (d.ok ? '✅ נשלח' : '❌ שגיאה'))
    } catch { setTestResult('❌ שגיאה בשליחה') }
  }

  const activeSignalCount   = signals.length
  const totalSignalCount    = DEFAULT_SIGNALS.length
  const activeTimeframeCount = timeframes.length

  return (
    <div className="p-4 max-w-2xl space-y-5" dir="rtl">
      <h2 className="text-lg font-bold">⚙️ ניהול התראות</h2>

      {/* ── Master switch ── */}
      <div className={`card flex items-center justify-between p-4 border-2 transition-colors ${
        masterOn ? 'border-brand-500/40 bg-brand-900/10' : 'border-slate-700'
      }`}>
        <div>
          <h3 className="font-bold text-base">🔔 התראות לטלגרם</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {masterOn
              ? `פעיל — ${activeSignalCount}/${totalSignalCount} איתותים, ${activeTimeframeCount} טווחי זמן`
              : 'כבוי — לא ישלחו התראות'}
          </p>
        </div>
        <Toggle on={masterOn} onChange={() => setMasterOn(v => !v)} label="הדלק/כבה התראות" size="lg" />
      </div>

      {/* ── TF toggles ── */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">⏱️ טווחי זמן</h3>
          <div className="flex gap-2">
            <button onClick={() => setTimeframes(DEFAULT_TIMEFRAMES)} className="text-xs text-brand-400 hover:text-brand-300">הכל</button>
            <span className="text-slate-600">|</span>
            <button onClick={() => setTimeframes([])} className="text-xs text-slate-500 hover:text-slate-300">נקה</button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ALL_TFS.map(tf => {
            const on = timeframes.includes(tf.id)
            return (
              <button
                key={tf.id}
                onClick={() => toggleTF(tf.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                  on
                    ? 'bg-brand-600/20 border-brand-500/50 text-white'
                    : 'bg-surface border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>{tf.label}</span>
                <span className={`w-2 h-2 rounded-full ${on ? 'bg-brand-400' : 'bg-slate-600'}`} />
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Signal toggles ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">🧩 סוגי איתות</h3>
          <div className="flex gap-2">
            <button onClick={() => setSignals(DEFAULT_SIGNALS)} className="text-xs text-brand-400 hover:text-brand-300">הכל</button>
            <span className="text-slate-600">|</span>
            <button onClick={() => setSignals([])} className="text-xs text-slate-500 hover:text-slate-300">נקה</button>
          </div>
        </div>

        {SIGNAL_GROUPS.map(group => (
          <div key={group.label} className="space-y-1.5">
            <p className="text-xs text-slate-500 font-semibold">{group.label}</p>
            <div className="space-y-1">
              {group.signals.map(sig => {
                const on = signals.includes(sig.id)
                return (
                  <div
                    key={sig.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                      on ? 'bg-surface' : 'bg-surface/40'
                    }`}
                  >
                    <span className={`text-sm ${on ? 'text-white' : 'text-slate-500'}`}>{sig.label}</span>
                    <Toggle on={on} onChange={() => toggleSignal(sig.id)} label={sig.label} />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Telegram channels info ── */}
      <div className="card space-y-2">
        <h3 className="font-semibold text-sm">📦 ערוצי טלגרם</h3>
        <div className="text-xs text-slate-500 space-y-1">
          {[
            { emoji: '📅', name: 'מסחר יומי',     desc: '5m–1h' },
            { emoji: '📈', name: 'מסחר שבועי',    desc: '4h, יומי, שבועי' },
            { emoji: '⭐', name: 'דירוג 7+',       desc: 'כל ציון ≥ 7 אוטומטית' },
            { emoji: '🌅', name: 'סקירה יומית',   desc: '08:00 + 23:00' },
            { emoji: '📰', name: 'דוחות כלכליים', desc: 'FMP API' },
          ].map(ch => (
            <div key={ch.name} className="flex gap-2">
              <span>{ch.emoji}</span>
              <span className="text-slate-300 font-medium w-28">{ch.name}</span>
              <span className="text-slate-500">{ch.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-3 items-center flex-wrap">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'שומר...' : saved ? '✅ נשמר!' : '💾 שמור הגדרות'}
        </button>
        <button onClick={sendTest} className="btn-ghost text-xs">
          📨 שלח הודעת בדיקה
        </button>
      </div>
      {testResult && (
        <div className="text-xs text-slate-300 bg-surface rounded p-2">{testResult}</div>
      )}
    </div>
  )
}
