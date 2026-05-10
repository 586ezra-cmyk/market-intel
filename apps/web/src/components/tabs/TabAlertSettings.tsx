'use client'

import { useState, useEffect } from 'react'
import { useApi, apiPost } from '@/hooks/useApi'

export default function TabAlertSettings() {
  const { data: settings, refetch } = useApi<Record<string, any>>('/api/settings')
  const [minScore, setMinScore] = useState(3)
  const [telegramActive, setTelegramActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setMinScore(settings.min_score ?? 3)
      setTelegramActive(settings.telegram_active ?? true)
    }
  }, [settings])

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await apiPost('/api/settings', { min_score: minScore, telegram_active: telegramActive })
      setSaved(true)
      refetch()
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    setTestResult(null)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
      const topics: Record<string, number> = {
        'מסחר יומי': settings?.TELEGRAM_TOPIC_DAILY ?? 6,
        'מסחר שבועי': settings?.TELEGRAM_TOPIC_WEEKLY ?? 5,
        'דירוגים 7+': settings?.TELEGRAM_TOPIC_HIGH ?? 4,
      }
      const results: string[] = []
      for (const [name, id] of Object.entries(topics)) {
        const r = await fetch(`https://api.telegram.org/bot${settings?.telegram_token ?? ''}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: settings?.telegram_chat_id, message_thread_id: id, text: `🧪 בדיקה — ${name}` }),
        })
        const d = await r.json()
        results.push(`${name}: ${d.ok ? '✅' : '❌'}`)
      }
      setTestResult(results.join(' · '))
    } catch {
      setTestResult('❌ שגיאה בשליחה')
    }
  }

  return (
    <div className="p-4 max-w-2xl space-y-6">
      <h2 className="text-lg font-bold">⚙️ ניהול התראות</h2>

      {/* Score threshold */}
      <div className="card space-y-4">
        <h3 className="font-semibold">📊 דירוג מינימלי לשליחה לטלגרם</h3>
        <div className="flex items-center gap-4">
          <input
            type="range" min={1} max={10} step={0.5}
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            className="flex-1 accent-brand-500"
          />
          <span className={`text-3xl font-bold w-14 text-center ${
            minScore >= 7 ? 'text-green-400' : minScore >= 4 ? 'text-yellow-400' : 'text-red-400'
          }`}>{minScore}</span>
        </div>
        <div className="flex gap-3 text-xs text-slate-400">
          <span className="text-red-400">1-3 — כל התראה</span>
          <span className="text-yellow-400">4-6 — ממוצע</span>
          <span className="text-green-400">7+ — חזקות בלבד</span>
        </div>
        <p className="text-xs text-slate-500">התראות מתחת לדירוג זה יישמרו ב-DB ויוצגו בממשק, אך לא יישלחו לטלגרם</p>
      </div>

      {/* Telegram toggle */}
      <div className="card flex items-center justify-between">
        <div>
          <h3 className="font-semibold">🤖 שליחה לטלגרם</h3>
          <p className="text-xs text-slate-400 mt-1">ניתן לכבות זמנית ללא מחיקת הגדרות</p>
        </div>
        <button
          onClick={() => setTelegramActive(v => !v)}
          className={`relative w-12 h-6 rounded-full transition-colors ${telegramActive ? 'bg-brand-600' : 'bg-slate-600'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${telegramActive ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Telegram channels info */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-sm">📦 מבנה ערוצי הטלגרם</h3>
        <div className="space-y-2">
          {[
            { icon: '📅', name: 'מסחר יומי', desc: '15m, 30m, 1h — התראות real-time', topic: settings?.TELEGRAM_TOPIC_DAILY ?? 6 },
            { icon: '📈', name: 'מסחר שבועי', desc: '4h, יומי, שבועי — התראות real-time', topic: settings?.TELEGRAM_TOPIC_WEEKLY ?? 5 },
            { icon: '⭐', name: 'דירוגים 7+', desc: 'כל הטווחים מעל ציון 7', topic: settings?.TELEGRAM_TOPIC_HIGH ?? 4 },
            { icon: '🌅', name: 'סקירה יומית', desc: '08:00 יעדים · 23:00 סיכום', topic: settings?.TELEGRAM_TOPIC_BRIEFING ?? 3 },
            { icon: '📰', name: 'דוחות כלכליים', desc: 'ForexFactory + הסברים + תזכורות', topic: settings?.TELEGRAM_TOPIC_CALENDAR ?? 2 },
          ].map(ch => (
            <div key={ch.name} className="flex items-center gap-3 p-2 bg-surface rounded-lg">
              <span className="text-lg">{ch.icon}</span>
              <div className="flex-1">
                <div className="font-medium text-sm">{ch.name}</div>
                <div className="text-xs text-slate-400">{ch.desc}</div>
              </div>
              <span className="text-xs text-slate-500 font-mono">#{ch.topic}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scheduled jobs info */}
      <div className="card space-y-2">
        <h3 className="font-semibold text-sm">⏰ משימות אוטומטיות</h3>
        <div className="space-y-1.5 text-xs text-slate-300">
          {[
            ['08:00 🇮🇱', 'סקירה בוקר — מחיר, מבנה, Dealing Range, Kill Zones, יעדים'],
            ['23:00 🇮🇱', 'סיכום יום — מימוש יעדים, ביצוע התראות, המלצה'],
            ['ראשון 08:00', 'דוחות שבועיים — כל אירועי ForexFactory לשבוע'],
            ['24h לפני דוח', 'תזכורת High-Impact — FOMC, NFP, CPI ועוד'],
            ['60 דק׳ לפני', 'אזהרה + השהיית התראות'],
            ['מיד אחרי', 'עדכון בפועל + תגובת שוק'],
          ].map(([time, desc]) => (
            <div key={time} className="flex gap-3">
              <span className="text-brand-400 font-mono w-32 shrink-0">{time}</span>
              <span className="text-slate-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 items-center">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'שומר...' : saved ? '✅ נשמר!' : '💾 שמור הגדרות'}
        </button>
        <button
          onClick={sendTest}
          className="btn-ghost text-xs"
        >
          📨 שלח הודעת בדיקה
        </button>
      </div>
      {testResult && (
        <div className="text-xs text-slate-300 bg-surface rounded p-2">{testResult}</div>
      )}
    </div>
  )
}
