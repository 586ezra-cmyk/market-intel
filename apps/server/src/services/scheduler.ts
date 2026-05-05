import cron from 'node-cron'
import { sendTelegram } from './alertDispatcher'
import { getCachedCalendar, sendEventReminders } from './forexFactory'
import { getDb } from '../db/client'

// ─── Morning briefing — 08:00 IL (05:00 UTC) ─────────────────────────────────
export async function generateMorningBriefing(): Promise<string> {
  const db = getDb()

  // Recent alerts (last 24h)
  const since = Date.now() - 24 * 3600_000
  const recentAlerts = db.prepare(`SELECT * FROM alerts WHERE triggered_at > ? ORDER BY score DESC LIMIT 5`)
    .all(since) as any[]

  // Upcoming economic events today
  const calendar = await getCachedCalendar()
  const today = new Date().toISOString().slice(0, 10)
  const todayEvents = calendar.filter(e => e.date === today && e.impact === 'high')

  let msg = `🌅 *סקירת בוקר — ${new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}*\n\n`

  // Kill Zone schedule
  msg += `⏰ *Kill Zones היום (UTC):*\n`
  msg += `   🇬🇧 לונדון: 07:00–11:00 (10:00–14:00 🇮🇱)\n`
  msg += `   🗽 ניו יורק: 13:00–16:00 (16:00–19:00 🇮🇱)\n\n`

  // Active alerts
  if (recentAlerts.length > 0) {
    msg += `📊 *איתותים פעילים (24h):*\n`
    recentAlerts.forEach((a, i) => {
      const dir = a.direction === 'bullish' ? '▲ לונג' : '▼ שורט'
      msg += `   ${i + 1}. ${a.symbol} ${a.timeframe} | ${dir} | ⭐ ${(a.score ?? 0).toFixed(1)}\n`
    })
    msg += '\n'
  }

  // Economic calendar
  if (todayEvents.length > 0) {
    msg += `📰 *דוחות High Impact היום:*\n`
    todayEvents.forEach(e => {
      msg += `   🔴 ${e.titleHe} — ${e.timeIL} 🇮🇱\n`
      msg += `      צפי: ${e.forecast || '—'} | קודם: ${e.previous || '—'}\n`
    })
    msg += '\n'
  } else {
    msg += `📰 אין דוחות High Impact היום\n\n`
  }

  msg += `💡 *המלצה:* היה ממוקד ב-Kill Zones ובדוק confluence לפני כל כניסה.\n`
  msg += `\n📊 _מערכת מסחר חכמה | ICT + Wyckoff_`

  return msg
}

export async function generateEveningSummary(): Promise<string> {
  const db = getDb()

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const since = todayStart.getTime()

  const todayAlerts = db.prepare(`SELECT * FROM alerts WHERE triggered_at > ? ORDER BY triggered_at DESC`)
    .all(since) as any[]

  const wins = todayAlerts.filter(a => a.user_outcome === 'worked').length
  const losses = todayAlerts.filter(a => a.user_outcome === 'failed').length
  const pending = todayAlerts.filter(a => !a.user_outcome || a.user_outcome === null).length

  let msg = `🌙 *סיכום יומי — ${new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}*\n\n`

  msg += `📊 *סטטיסטיקת היום:*\n`
  msg += `   סה"כ התראות: ${todayAlerts.length}\n`
  msg += `   ✅ עבד: ${wins} | ❌ לא עבד: ${losses} | ⏳ ממתין: ${pending}\n\n`

  if (todayAlerts.length > 0) {
    msg += `🔔 *התראות היום:*\n`
    todayAlerts.slice(0, 5).forEach((a, i) => {
      const dir = a.direction === 'bullish' ? '▲' : '▼'
      const outcome = a.user_outcome === 'worked' ? '✅' : a.user_outcome === 'failed' ? '❌' : '⏳'
      msg += `   ${i + 1}. ${outcome} ${a.symbol} ${a.timeframe} ${dir} | ⭐${(a.score ?? 0).toFixed(1)}\n`
    })
    msg += '\n'
  }

  // Tomorrow's events
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)
  const calendar = await getCachedCalendar()
  const tomorrowEvents = calendar.filter(e => e.date === tomorrowStr && e.impact === 'high')

  if (tomorrowEvents.length > 0) {
    msg += `📅 *דוחות מחר (High Impact):*\n`
    tomorrowEvents.forEach(e => {
      msg += `   🔴 ${e.titleHe} — ${e.timeIL} 🇮🇱\n`
    })
    msg += '\n'
  }

  msg += `🌅 _סקירת הבוקר תישלח ב-08:00 🇮🇱_`

  return msg
}

// ─── Initialize all scheduled jobs ───────────────────────────────────────────
export function initScheduler(): void {
  // Morning briefing — 05:00 UTC = 08:00 IL
  cron.schedule('0 5 * * *', async () => {
    try {
      const text = await generateMorningBriefing()
      await sendTelegram(text, 0, undefined, process.env.TELEGRAM_TOPIC_BRIEFING)
      console.log('[Scheduler] Morning briefing sent')
    } catch (err) {
      console.error('[Scheduler] Morning briefing failed:', err)
    }
  }, { timezone: 'UTC' })

  // Evening summary — 20:00 UTC = 23:00 IL
  cron.schedule('0 20 * * *', async () => {
    try {
      const text = await generateEveningSummary()
      await sendTelegram(text, 0, undefined, process.env.TELEGRAM_TOPIC_BRIEFING)
      console.log('[Scheduler] Evening summary sent')
    } catch (err) {
      console.error('[Scheduler] Evening summary failed:', err)
    }
  }, { timezone: 'UTC' })

  // Event reminders — every 15 min
  cron.schedule('*/15 * * * *', async () => {
    try {
      await sendEventReminders()
    } catch {}
  })

  // Weekly calendar — Monday 05:00 UTC
  cron.schedule('0 5 * * 1', async () => {
    try {
      const events = await getCachedCalendar()
      const highImpact = events.filter(e => e.impact === 'high')
      if (highImpact.length === 0) return

      let msg = `📅 *דוחות High Impact השבוע:*\n\n`
      highImpact.forEach(e => {
        msg += `🔴 *${e.titleHe}*\n`
        msg += `   📅 ${e.date} · ⏰ ${e.timeIL} 🇮🇱\n`
        msg += `   צפי: ${e.forecast || '—'} | קודם: ${e.previous || '—'}\n`
        msg += `   ${e.explanationHe.slice(0, 80)}...\n\n`
      })

      await sendTelegram(msg, 0, undefined, process.env.TELEGRAM_TOPIC_ECONOMIC)
    } catch (err) {
      console.error('[Scheduler] Weekly calendar failed:', err)
    }
  }, { timezone: 'UTC' })

  // Auto-backup — daily at 02:00 IL (23:00 UTC)
  cron.schedule('0 23 * * *', async () => {
    try {
      await runBackup()
      console.log('[Scheduler] Backup completed')
    } catch (err) {
      console.error('[Scheduler] Backup failed:', err)
    }
  }, { timezone: 'UTC' })

  console.log('[Scheduler] All cron jobs initialized')
}

// ─── Backup ───────────────────────────────────────────────────────────────────
import fs from 'fs'
import path from 'path'

export async function runBackup(): Promise<string> {
  const db = getDb()
  const backupDir = process.env.BACKUP_DIR ?? './data/backups'

  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

  const filename = `backup_${new Date().toISOString().slice(0, 10)}.db`
  const dest = path.join(backupDir, filename)

  // SQLite backup API
  await (db as any).backup(dest)

  // Keep last 30 backups only
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.db'))
    .sort()
    .reverse()

  files.slice(30).forEach(f => {
    fs.unlinkSync(path.join(backupDir, f))
  })

  return dest
}
