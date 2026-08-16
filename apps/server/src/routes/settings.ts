import { Router, Request, Response } from 'express'
import { getDb } from '../db/client'

const router = Router()

// ─── POST /api/telegram/test ──────────────────────────────────────────────────
// Exported separately so it can be mounted at /api/telegram/test
export const telegramTestRouter = Router()
telegramTestRouter.post('/test', async (_req: Request, res: Response) => {
  try {
    const token  = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (!token || !chatId) {
      return res.status(400).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured' })
    }
    // Send ONE test message to General (no topic) to verify connection only
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `🧪 מערכת מסחר — בדיקת חיבור ✅\nהשרת מחובר ופעיל.` }),
    })
    const d = await r.json() as any
    res.json({ ok: d.ok, results: [d.ok ? '✅ חיבור תקין' : `❌ ${d.description}`] })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * Settings that must never leave the server in full.
 *
 * This endpoint is public, so returning the whole table handed the TradingView
 * webhook secret to anyone who knew the URL — enough to post forged alerts into
 * the system. Secrets are reported as a short preview so the value can still be
 * recognised in the UI without being usable.
 */
const SECRET_KEYS = ['tv_webhook_secret', 'telegram_token']

function redact(value: string): string {
  if (!value) return ''
  return value.slice(0, 4) + '••••••••'
}

// ─── GET /api/settings ────────────────────────────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  const db = getDb()
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[]
  const result: Record<string, any> = {}
  rows.forEach(r => {
    if (SECRET_KEYS.includes(r.key)) {
      result[r.key] = redact(r.value)
      return
    }
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
