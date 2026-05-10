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
     message_he, stop_loss, tp1, tp2, tp3, fvg_id, structure_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id, payload.symbol, payload.timeframe, payload.triggeredAt,
      JSON.stringify(payload.factors), payload.score, payload.direction,
      payload.recommendation, payload.premiumDiscount, payload.session,
      payload.inKillZone ? 1 : 0, payload.messageHe,
      payload.stopLoss ?? null, payload.tp1 ?? null, payload.tp2 ?? null, payload.tp3 ?? null,
      payload.fvgId ?? null, payload.structureId ?? null, now,
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
    return row ? parseFloat(row.value) : 3
  } catch {
    return 3
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

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

// Topic IDs (Telegram supergroup topic thread IDs)
const TOPIC_DAILY = process.env.TELEGRAM_TOPIC_DAILY     // 15m, 30m, 1h
const TOPIC_WEEKLY = process.env.TELEGRAM_TOPIC_WEEKLY   // 4h, 1D, 1W
const TOPIC_HIGH = process.env.TELEGRAM_TOPIC_HIGH       // score ≥ 7
const TOPIC_BRIEFING = process.env.TELEGRAM_TOPIC_BRIEFING // morning/evening

const DAILY_TFS: Timeframe[] = ['15m', '30m', '1h']
const WEEKLY_TFS: Timeframe[] = ['4h', '1D', '1W', '1M']

function getTopicId(timeframe: Timeframe, score: number): string | undefined {
  if (score >= 7) return TOPIC_HIGH
  if (DAILY_TFS.includes(timeframe)) return TOPIC_DAILY
  if (WEEKLY_TFS.includes(timeframe)) return TOPIC_WEEKLY
  return TOPIC_DAILY
}

export async function sendTelegram(
  text: string,
  score = 0,
  timeframe?: Timeframe,
  topicId?: string,
): Promise<void> {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('[Telegram] BOT_TOKEN or CHAT_ID not configured — skipping')
    return
  }

  const thread = topicId ?? (timeframe ? getTopicId(timeframe, score) : undefined)

  const body: Record<string, unknown> = {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'Markdown',
  }
  if (thread) body.message_thread_id = thread

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Telegram API error: ${err}`)
  }
}

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
