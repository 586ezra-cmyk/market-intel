'use client'

import { useApi } from '@/hooks/useApi'
import { formatTime } from '@/lib/utils'

export default function TabReports() {
  const { data: morning } = useApi<any>('/api/briefing/morning')
  const { data: evening } = useApi<any>('/api/briefing/evening')

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">📋 דוחות יומיים</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Morning briefing */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌅</span>
            <div>
              <div className="font-bold">סקירה בוקר</div>
              <div className="text-xs text-slate-400">נשלחת כל יום ב-08:00 🇮🇱</div>
            </div>
          </div>

          {morning ? (
            <div className="text-sm text-slate-300 whitespace-pre-line leading-relaxed bg-surface rounded p-3">
              {morning.text ?? JSON.stringify(morning, null, 2)}
            </div>
          ) : (
            <div className="text-sm text-slate-500 text-center py-4">
              הסקירה תופיע כאן אחרי 08:00 🇮🇱
            </div>
          )}
        </div>

        {/* Evening summary */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌙</span>
            <div>
              <div className="font-bold">סיכום ערב</div>
              <div className="text-xs text-slate-400">נשלח כל יום ב-23:00 🇮🇱</div>
            </div>
          </div>

          {evening ? (
            <div className="text-sm text-slate-300 whitespace-pre-line leading-relaxed bg-surface rounded p-3">
              {evening.text ?? JSON.stringify(evening, null, 2)}
            </div>
          ) : (
            <div className="text-sm text-slate-500 text-center py-4">
              הסיכום יופיע כאן אחרי 23:00 🇮🇱
            </div>
          )}
        </div>
      </div>

      {/* Telegram info */}
      <div className="card">
        <h3 className="font-semibold mb-3 text-sm">📬 הגדרת שיגור אוטומטי</h3>
        <div className="text-sm text-slate-400 space-y-2">
          <p>הדוחות נשלחים אוטומטית לערוץ הטלגרם שלך כל יום.</p>
          <div className="bg-surface rounded p-3 space-y-1 font-mono text-xs text-green-400">
            <div># קובץ .env בשרת:</div>
            <div>TELEGRAM_BOT_TOKEN=...</div>
            <div>TELEGRAM_CHAT_ID=-100...</div>
            <div>TELEGRAM_TOPIC_BRIEFING=...</div>
          </div>
          <p>השרת משתמש ב-node-cron כדי לשגר:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>08:00 🇮🇱 (05:00 UTC) — סקירת בוקר + יעדים יומיים</li>
            <li>23:00 🇮🇱 (20:00 UTC) — סיכום יומי + ביצועי התראות</li>
            <li>כל ראשון 08:00 — כל דוחות השבוע</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
