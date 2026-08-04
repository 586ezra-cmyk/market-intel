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
}

export async function saveAlert(payload: AlertPayload): Promise<Alert> {
  const db = getDb()
  const id = uuid()
  const now = Date.now()

  db.prepare(`INSERT INTO alerts
    (id, symbol, timeframe, triggered_at, factors, score, direction,
     recommendation, premium_discount, session, in_kill_zone,
     message_he, stop_loss, tp1, tp2, tp3, fvg_id, structure_id, created_at,
     entry_price, sl_price, tp1_price, tp2_price, tp3_price, factors_json, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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

const TELEGRAM_TOKEN   = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

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
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return

  const body: Record<string, unknown> = {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'Markdown',
  }
  if (topicId) body.message_thread_id = parseInt(topicId, 10)

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
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
export async function sendTelegram(
  text: string,
  score = 0,
  timeframe?: Timeframe,
  topicId?: string,          // explicit override (briefing, economic, etc.)
): Promise<void> {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('[Telegram] BOT_TOKEN or CHAT_ID not configured — skipping')
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

function dbRowToAlert(r: any): Alert {
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
    createdAt: r.created_at,
  }
}
