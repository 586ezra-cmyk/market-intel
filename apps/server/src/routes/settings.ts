import { Router, Request, Response } from 'express'
import { getDb } from '../db/client'

const router = Router()

// ─── POST /api/telegram/test ──────────────────────────────────────────────────
// Exported separately so it can be mounted at /api/telegram/test
export const telegramTestRouter = Router()
telegramTestRouter.post('/test', async (_req: Request, res: Response) => {
  try {
    const db = getDb()
    const get = (key: string) => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
      return row?.value ?? ''
    }
    const token   = process.env.TELEGRAM_BOT_TOKEN ?? get('telegram_token')
    const chatId  = process.env.TELEGRAM_CHAT_ID   ?? get('telegram_chat_id')
    if (!token || !chatId) {
      return res.status(400).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured' })
    }
    const topics: Record<string, number> = {
      'מסחר יומי':   parseInt(get('telegram_topic_daily')    || '6'),
      'מסחר שבועי':  parseInt(get('telegram_topic_weekly')   || '5'),
      'דירוגים 7+':  parseInt(get('telegram_topic_high')     || '4'),
    }
    const results: string[] = []
    for (const [name, id] of Object.entries(topics)) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_thread_id: id, text: `🧪 בדיקה — ${name}` }),
        })
        const d = await r.json() as any
        results.push(`${name}: ${d.ok ? '✅' : '❌'}`)
      } catch {
        results.push(`${name}: ❌`)
      }
    }
    res.json({ ok: true, results })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── GET /api/settings ────────────────────────────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  const db = getDb()
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[]
  const result: Record<string, any> = {}
  rows.forEach(r => {
    // Parse numbers and booleans
    if (r.value === 'true') result[r.key] = true
    else if (r.value === 'false') result[r.key] = false
    else if (!isNaN(Number(r.value))) result[r.key] = Number(r.value)
    else result[r.key] = r.value
  })
  res.json(result)
})

// ─── POST /api/settings ───────────────────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  const db = getDb()
  const now = Date.now()
  const body = req.body as Record<string, any>

  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)

  const upsertAll = db.transaction((entries: [string, any][]) => {
    for (const [k, v] of entries) {
      upsert.run(k, String(v), now)
    }
  })

  upsertAll(Object.entries(body))
  res.json({ ok: true })
})

export function getSetting(key: string, fallback: string): string {
  try {
    const db = getDb()
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
    return row?.value ?? fallback
  } catch {
    return fallback
  }
}

export default router
