'use client'

import { useState } from 'react'

export default function TabAlertSettings() {
  const [minScore, setMinScore] = useState(3)
  const [telegramToken, setTelegramToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [topicDaily, setTopicDaily] = useState('')
  const [topicWeekly, setTopicWeekly] = useState('')
  const [topicHigh, setTopicHigh] = useState('')

  function save() {
    // In production this would POST to server /api/settings
    alert('הגדרות נשמרו (יש לקנפג משתני סביבה בשרת)')
  }

  return (
    <div className="p-4 max-w-2xl space-y-6">
      <h2 className="text-lg font-bold">⚙️ ניהול התראות</h2>

      {/* Score threshold */}
      <div className="card space-y-3">
        <h3 className="font-semibold">דירוג מינימלי לשליחה</h3>
        <div className="flex items-center gap-4">
          <input
            type="range" min={1} max={10} step={0.5}
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-2xl font-bold text-brand-400 w-12 text-center">{minScore}</span>
        </div>
        <p className="text-xs text-slate-400">התראות מתחת לדירוג זה יישמרו בDB אך לא יישלחו לטלגרם</p>
      </div>

      {/* Telegram config */}
      <div className="card space-y-3">
        <h3 className="font-semibold">🤖 טלגרם Bot</h3>
        <p className="text-xs text-slate-400">
          הגדר את מפתחות הטלגרם בקובץ <code className="bg-surface px-1 rounded">.env</code> בשרת:
        </p>
        <div className="space-y-2 font-mono text-xs bg-surface rounded p-3 text-green-400">
          <div>TELEGRAM_BOT_TOKEN=your_token</div>
          <div>TELEGRAM_CHAT_ID=-100xxxxxxxxxx</div>
          <div>TELEGRAM_TOPIC_DAILY=thread_id</div>
          <div>TELEGRAM_TOPIC_WEEKLY=thread_id</div>
          <div>TELEGRAM_TOPIC_HIGH=thread_id</div>
          <div>TELEGRAM_TOPIC_BRIEFING=thread_id</div>
        </div>

        <div className="space-y-2">
          {[
            { label: '📅 Topic — מסחר יומי (15m, 30m, 1h)', value: topicDaily, set: setTopicDaily },
            { label: '📈 Topic — מסחר שבועי (4h, 1D, 1W)', value: topicWeekly, set: setTopicWeekly },
            { label: '⭐ Topic — דירוגים 7+', value: topicHigh, set: setTopicHigh },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-slate-400 mb-1 block">{f.label}</label>
              <input
                className="input"
                placeholder="Thread ID"
                value={f.value}
                onChange={e => f.set(e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Topics explanation */}
      <div className="card space-y-2">
        <h3 className="font-semibold text-sm">📦 מבנה Supergroup</h3>
        <div className="space-y-1.5 text-xs text-slate-300">
          {[
            ['📅', 'מסחר יומי', '15m, 30m, 1h — התראות real-time'],
            ['📈', 'מסחר שבועי', '4h, יומי, שבועי — התראות real-time'],
            ['⭐', 'דירוגים 7+', 'כל הטווחים מעל ציון 7'],
            ['🌅', 'סקירה יומית', '08:00 יעדים יומיים · 23:00 סיכום'],
            ['📰', 'דוחות כלכליים', 'ForexFactory + הסברים + תזכורות'],
          ].map(([icon, name, desc]) => (
            <div key={name} className="flex gap-2">
              <span>{icon}</span>
              <span className="font-medium w-28">{name}</span>
              <span className="text-slate-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={save} className="btn-primary">💾 שמור הגדרות</button>
    </div>
  )
}
