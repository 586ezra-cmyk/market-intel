import { Router, Request, Response } from 'express'
import { getDb } from '../db/client'

const router = Router()

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
