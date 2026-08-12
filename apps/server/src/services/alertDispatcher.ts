import { v4 as uuid } from 'uuid'
import type { Alert, AlertFactor, Direction, Timeframe, Recommendation, PremiumDiscount } from '@market/shared'
import { getDb } from '../db/client'
import { broadcastWS } from '../websocket'

export interface AlertPayload {
  symbol: string
  timeframe: Timeframe
  triggeredAt: number
  factors: AlertFactor[]
  score: number
  direction: Direction
  recommendation: Recommendation
  premiumDiscount: PremiumDiscount
  session: string
  inKillZone: boolean
  messageHe: string
  entryPrice: number | null
  stopLoss: number | null
  tp1: number | null
  tp2: number | null
  tp3: number | null
  fvgId: string | null
  structureId: string | null
  // Labels and R:R ratios for UI display
  tp1Label?: string | null
  tp2Label?: string | null
  tp3Label?: string | null
  r1?: string | null
  r2?: string | null
  r3?: string | null
  slReason?: string | null
  // Per-factor specific details (prices, levels, TFs)
  factorDetails?: Record<string, any> | null
}

export async function saveAlert(payload: AlertPayload): Promise<Alert> {
  const db = getDb()
  const id = uuid()
  const now = Date.now()

  db.prepare(`INSERT INTO alerts
    (id, symbol, timeframe, triggered_at, factors, score, direction,
     recommendation, premium_discount, session, in_kill_zone,
     message_he, stop_loss, tp1, tp2, tp3, fvg_id, structure_id, created_at,
     entry_price, sl_price, tp1_price, tp2_price, tp3_price, factors_json, outcome,
     tp1_label, tp2_label, tp3_label, r1, r2, r3, sl_reason, factor_details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id, payload.symbol, payload.timeframe, payload.triggeredAt,
      JSON.stringify(payload.factors), payload.score, payload.direction,
      payload.recommendation, payload.premiumDiscount, payload.session,
      payload.inKillZone ? 1 : 0, payload.messageHe,
      payload.stopLoss ?? null, payload.tp1 ?? null, payload.tp2 ?? null, payload.tp3 ?? null,
      payload.fvgId ?? null, payload.structureId ?? null, now,
      payload.entryPrice ?? null,
      payload.stopLoss ?? null,
      payload.tp1 ?? null, payload.tp2 ?? null, payload.tp3 ?? null,
      JSON.stringify(payload.factors),
      'pending',
      payload.tp1Label ?? null, payload.tp2Label ?? null, payload.tp3Label ?? null,
      payload.r1 ?? null, payload.r2 ?? null, payload.r3 ?? null,
      payload.slReason ?? null,
      payload.factorDetails ? JSON.stringify(payload.factorDetails) : null,
    )

  const alert: Alert = {
    id,
    symbol: payload.symbol,
    timeframe: payload.timeframe,
    triggeredAt: payload.triggeredAt,
    factors: payload.factors,
    score: payload.score,
    direction: payload.direction,
    recommendation: payload.recommendation,
    premiumDiscount: payload.premiumDiscount,
    session: payload.session,
    inKillZone: payload.inKillZone,
    messageHe: payload.messageHe,
    stopLoss: payload.stopLoss,
    tp1: payload.tp1,
    tp2: payload.tp2,
    tp3: payload.tp3,
    sent: false,
    fvgId: payload.fvgId,
    structureId: payload.structureId,
    createdAt: now,
  }

  // Broadcast via WebSocket (always)
  broadcastWS({ type: 'alert', payload: alert })

  // Send to Telegram only if score >= minScore setting
  const minScore = getMinScore()
  if (payload.score >= minScore) {
    sendTelegram(payload.messageHe, payload.score, payload.timeframe).catch(err =>
      console.error('[Telegram] Failed to send:', err)
    )
  } else {
    console.log(`[Alert] score ${payload.score} < minScore ${minScore} — skipping Telegram`)
  }

  return alert
}

function getMinScore(): number {
  try {
    const db = getDb()
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'min_score'`).get() as { value: string } | undefined
    return row ? parseFloat(row.value) : 2   // default 2 — if confluence engine approved it, send it
  } catch {
    return 2
  }
}

export function getRecentAlerts(limit = 50): any[] {
  const db = getDb()
  const rows = db.prepare(`SELECT * FROM alerts ORDER BY triggered_at DESC LIMIT ?`).all(limit) as any[]
  return rows.map(dbRowToAlert)
}

export function getAlertById(id: string): Alert | null {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(id) as any
  return row ? dbRowToAlert(row) : null
}

// ─── Telegram ────────────────────────────────────────────────────────────────

/**
 * Telegram credentials are read at call time, not module load, so that values
 * saved from the website (settings table) take effect without a restart.
 * DB settings win over env vars; env is the fallback for Railway-only setups.
 */
function getTelegramCreds(): { token: string; chatId: string } {
  let token = ''
  let chatId = ''
  try {
    const db = getDb()
    const rows = db.prepare(
      `SELECT key, value FROM settings WHERE key IN ('telegram_token','telegram_chat_id')`
    ).all() as Array<{ key: string; value: string }>
    for (const r of rows) {
      if (r.key === 'telegram_token')   token  = r.value ?? ''
      if (r.key === 'telegram_chat_id') chatId = r.value ?? ''
    }
  } catch {
    // settings table unavailable — fall through to env
  }
  return {
    token:  token  || process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: chatId || process.env.TELEGRAM_CHAT_ID   || '',
  }
}

// ── Category topics ──────────────────────────────────────────────────────────
// מסחר יומי  (5m / 15m / 30m / 1h)
const TOPIC_DAILY    = process.env.TELEGRAM_TOPIC_DAILY    ?? '2'
// מסחר שבועי (4h / 1D / 1W)
const TOPIC_WEEKLY   = process.env.TELEGRAM_TOPIC_WEEKLY   ?? '3'
// דירוגים 7+ (score ≥ 7, all TFs)
const TOPIC_HIGH     = process.env.TELEGRAM_TOPIC_HIGH     ?? '4'
// סקירה יומית (briefing/summary)
const TOPIC_BRIEFING = process.env.TELEGRAM_TOPIC_BRIEFING ?? '5'
// דוחות כלכליים
const TOPIC_ECONOMIC = process.env.TELEGRAM_TOPIC_ECONOMIC ?? '6'

// ── Per-TF topics ─────────────────────────────────────────────────────────────
const TF_TOPIC: Record<string, string> = {
  '1m':  process.env.TELEGRAM_TOPIC_1M  ?? '191',
  '5m':  process.env.TELEGRAM_TOPIC_5M  ?? '190',
  '15m': process.env.TELEGRAM_TOPIC_15M ?? '33',
  '30m': process.env.TELEGRAM_TOPIC_30M ?? '34',
  '1h':  process.env.TELEGRAM_TOPIC_1H  ?? '35',
  '4h':  process.env.TELEGRAM_TOPIC_4H  ?? '36',
  '1D':  process.env.TELEGRAM_TOPIC_1D  ?? '37',
  '1W':  process.env.TELEGRAM_TOPIC_1W  ?? '38',
}

const DAILY_TFS:  Timeframe[] = ['1m', '5m', '15m', '30m', '1h']
const WEEKLY_TFS: Timeframe[] = ['4h', '1D', '1W', '1M']

/**
 * Returns ALL topic IDs an alert should be sent to:
 * 1. Specific TF topic  (e.g. 15m → topic 33)
 * 2. Category topic     (daily or weekly)
 * 3. High-score topic   (if score ≥ 7)
 */
function getTopicIds(timeframe: Timeframe, score: number): string[] {
  const ids = new Set<string>()

  // Specific TF topic
  const tfTopic = TF_TOPIC[timeframe]
  if (tfTopic) ids.add(tfTopic)

  // Category topic
  if (DAILY_TFS.includes(timeframe))  ids.add(TOPIC_DAILY)
  if (WEEKLY_TFS.includes(timeframe)) ids.add(TOPIC_WEEKLY)

  // High score
  if (score >= 7) ids.add(TOPIC_HIGH)

  return [...ids]
}

/** Send one message to a single Telegram topic (or no topic = General) */
async function sendToTopic(text: string, topicId?: string): Promise<void> {
  const { token, chatId } = getTelegramCreds()
  if (!token || !chatId) return

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  }
  if (topicId && topicId !== '0') body.message_thread_id = parseInt(topicId, 10)

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Telegram API error (topic ${topicId ?? 'none'}): ${err}`)
  }
}

/**
 * Main entry point — sends alert to ALL relevant topics.
 * Pass explicit topicId to override routing (e.g. briefing/economic).
 */
export function alertsEnabled(): boolean {
  try {
    const db = getDb()
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'telegram_active'`)
      .get() as { value: string } | undefined
    return row?.value !== 'false'
  } catch {
    return true
  }
}

export async function sendTelegram(
  text: string,
  score = 0,
  timeframe?: Timeframe,
  topicId?: string,          // explicit override (briefing, economic, etc.)
  opts: { ignoreMasterSwitch?: boolean } = {},
): Promise<void> {
  // Master switch from the website. Every Telegram path funnels through here,
  // so turning alerts off in the UI silences Telegram too. Scheduled briefings
  // and economic reports opt out — they are not trade alerts.
  if (!opts.ignoreMasterSwitch && !alertsEnabled()) {
    console.log('[Telegram] alerts disabled from website — skipping')
    return
  }

  const { token, chatId } = getTelegramCreds()
  if (!token || !chatId) {
    console.warn('[Telegram] token or chat_id not configured (neither DB settings nor env) — skipping')
    return
  }

  // Explicit override: send to one specific topic only
  if (topicId) {
    await sendToTopic(text, topicId)
    return
  }

  // Alert routing: send to multiple topics in parallel
  const topics = timeframe ? getTopicIds(timeframe, score) : []
  if (topics.length === 0) {
    await sendToTopic(text)   // fallback: General
    return
  }

  await Promise.allSettled(topics.map(id => sendToTopic(text, id)))
}

// Export topic constants so scheduler can use them
export { TOPIC_BRIEFING, TOPIC_ECONOMIC }

function dbRowToAlert(r: any): Alert & { entryPrice?: number | null; tp1Label?: string | null; tp2Label?: string | null; tp3Label?: string | null; r1?: string | null; r2?: string | null; r3?: string | null; slReason?: string | null } {
  return {
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    triggeredAt: r.triggered_at,
    factors: JSON.parse(r.factors ?? '[]'),
    score: r.score,
    direction: r.direction,
    recommendation: r.recommendation,
    premiumDiscount: r.premium_discount,
    session: r.session,
    inKillZone: r.in_kill_zone === 1,
    messageHe: r.message_he,
    stopLoss: r.stop_loss ?? null,
    tp1: r.tp1 ?? null,
    tp2: r.tp2 ?? null,
    tp3: r.tp3 ?? null,
    sent: r.sent === 1,
    fvgId: r.fvg_id ?? null,
    structureId: r.structure_id ?? null,
    userRating: r.user_rating ?? null,
    userOutcome: r.user_outcome ?? null,
    userNotes: r.user_notes ?? null,
    createdAt: r.created_at,
    // Extended display fields
    entryPrice: r.entry_price ?? null,
    tp1Label: r.tp1_label ?? null,
    tp2Label: r.tp2_label ?? null,
    tp3Label: r.tp3_label ?? null,
    r1: r.r1 ?? null,
    r2: r.r2 ?? null,
    r3: r.r3 ?? null,
    slReason: r.sl_reason ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    factorDetails: r.factor_details ? (() => { try { return JSON.parse(r.factor_details) as Record<string, any> } catch { return null } })() : null,
  } as any
}
