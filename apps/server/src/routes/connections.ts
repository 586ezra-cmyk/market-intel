import { Router, Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getDb } from '../db/client'

const router = Router()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSetting(key: string, fallback = ''): string {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? fallback
  } catch { return fallback }
}

function setSetting(key: string, value: string) {
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now)
}

// Effective webhook secret: ENV overrides DB (ENV = production lock-down)
export function getWebhookSecret(): string {
  if (process.env.TV_WEBHOOK_SECRET) return process.env.TV_WEBHOOK_SECRET
  return getSetting('tv_webhook_secret', 'dev-secret')
}

// ─── GET /api/connections ─────────────────────────────────────────────────────
// Returns everything the UI needs — secret is masked but present

router.get('/', (_req: Request, res: Response) => {
  const db = getDb()

  const secret = getWebhookSecret()
  const serverUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : getSetting('server_url', '')

  const webhookUrl = serverUrl
    ? `${serverUrl}/webhook/tradingview`
    : ''

  // Last 20 webhook logs
  const logs = db.prepare(`
    SELECT id, payload, received_at
    FROM webhook_log
    ORDER BY received_at DESC
    LIMIT 20
  `).all() as Array<{ id: string; payload: string; received_at: number }>

  const parsedLogs = logs.map(row => {
    let event = '?'; let symbol = '?'; let ok = true
    try {
      const p = JSON.parse(row.payload)
      event  = p.event  ?? p.type ?? '?'
      symbol = p.symbol ?? '?'
    } catch { ok = false }
    return { id: row.id, event, symbol, receivedAt: row.received_at, ok }
  })

  const telegramOk = !!(getSetting('telegram_token') && getSetting('telegram_chat_id'))

  res.json({
    webhookUrl,
    serverUrl,
    // Show first 6 chars + asterisks so user can confirm it matches
    secretPreview: secret.slice(0, 6) + '••••••••••••••••••',
    secretLength: secret.length,
    envOverride: !!process.env.TV_WEBHOOK_SECRET,
    webhookLogs: parsedLogs,
    telegram: {
      ok: telegramOk,
      token:    getSetting('telegram_token')        ? '••••••••' : '',
      chatId:   getSetting('telegram_chat_id'),
      topics: {
        daily:  getSetting('telegram_topic_daily',  '0'),
        weekly: getSetting('telegram_topic_weekly', '0'),
        high:   getSetting('telegram_topic_high',   '0'),
        news:   getSetting('telegram_topic_news',   '0'),
      },
    },
  })
})

// ─── GET /api/connections/secret ─────────────────────────────────────────────
// Returns the FULL secret (for copy button)

router.get('/secret', (_req: Request, res: Response) => {
  if (process.env.TV_WEBHOOK_SECRET) {
    return res.json({ secret: process.env.TV_WEBHOOK_SECRET, envOverride: true })
  }
  res.json({ secret: getSetting('tv_webhook_secret', 'dev-secret'), envOverride: false })
})

// ─── POST /api/connections/regenerate-secret ──────────────────────────────────

router.post('/regenerate-secret', (_req: Request, res: Response) => {
  if (process.env.TV_WEBHOOK_SECRET) {
    return res.status(400).json({
      ok: false,
      error: 'הסוד מוגדר כמשתנה סביבה (TV_WEBHOOK_SECRET) — שנה אותו ב-Railway',
    })
  }
  const newSecret = randomBytes(16).toString('hex')   // 32-char hex
  setSetting('tv_webhook_secret', newSecret)
  res.json({ ok: true, secret: newSecret })
})

// ─── POST /api/connections/server-url ────────────────────────────────────────

router.post('/server-url', (req: Request, res: Response) => {
  const { url } = req.body as { url?: string }
  if (!url) return res.status(400).json({ ok: false, error: 'url required' })
  setSetting('server_url', url.replace(/\/$/, ''))
  res.json({ ok: true })
})

// ─── POST /api/connections/telegram ──────────────────────────────────────────

router.post('/telegram', (req: Request, res: Response) => {
  const { token, chatId, topicDaily, topicWeekly, topicHigh, topicNews } = req.body as Record<string, string>
  if (token    !== undefined) setSetting('telegram_token',        token)
  if (chatId   !== undefined) setSetting('telegram_chat_id',      chatId)
  if (topicDaily  !== undefined) setSetting('telegram_topic_daily',   topicDaily)
  if (topicWeekly !== undefined) setSetting('telegram_topic_weekly',  topicWeekly)
  if (topicHigh   !== undefined) setSetting('telegram_topic_high',    topicHigh)
  if (topicNews   !== undefined) setSetting('telegram_topic_news',    topicNews)
  res.json({ ok: true })
})

// ─── GET /api/connections/pine-script ────────────────────────────────────────
// Returns the ICT Master Pine Script content

router.get('/pine-script', (_req: Request, res: Response) => {
  // Look for pine/ict_master.pine relative to project root
  const candidates = [
    join(process.cwd(), 'pine', 'ict_master.pine'),
    join(__dirname, '../../../../pine/ict_master.pine'),
    '/app/pine/ict_master.pine',  // Docker path
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8')
      return res.type('text/plain').send(content)
    }
  }
  res.status(404).json({ error: 'Pine Script file not found on server' })
})

// ─── POST /api/connections/test-webhook ──────────────────────────────────────
// Injects a fake webhook_log entry so the user sees the inbox working

router.post('/test-webhook', (_req: Request, res: Response) => {
  const db = getDb()
  const testPayload = JSON.stringify({
    event: 'test_ping',
    symbol: 'BTCUSDT',
    timeframe: '15m',
    secret: '[hidden]',
    time: Math.floor(Date.now() / 1000),
  })
  db.prepare(`INSERT INTO webhook_log (id, payload, received_at) VALUES (?, ?, ?)`)
    .run(randomBytes(8).toString('hex'), testPayload, Date.now())
  res.json({ ok: true, message: 'test entry added to webhook log' })
})

export default router
