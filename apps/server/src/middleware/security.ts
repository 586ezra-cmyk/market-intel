/**
 * Security middleware — OWASP Top 10:2025 hardening for the API.
 *
 * - adminAuth: every /api/* route (and /webhook/logs) requires the ADMIN_TOKEN when it is set.
 *   When ADMIN_TOKEN is not configured the API stays open (backwards compatible) and a warning is
 *   logged once, so an unconfigured deployment never silently breaks — but it is not protected.
 * - rateLimit: small in-memory limiter (per client IP) — protects /webhook and /api from floods.
 * - securityHeaders: browser hardening headers; API responses are never cached.
 * - errorHandler / notFound: generic JSON errors, details only in the server log (A10).
 */
import { timingSafeEqual } from 'crypto'
import type { Request, Response, NextFunction } from 'express'

export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ba = Buffer.from(a), bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

let warnedOpen = false
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) {
    if (!warnedOpen) {
      warnedOpen = true
      console.warn('[Security] ADMIN_TOKEN is not set — /api is OPEN. Set ADMIN_TOKEN to require authentication.')
    }
    return next()
  }
  if (req.method === 'OPTIONS') return next()
  const header = req.headers['x-admin-token']
  const bearer = (req.headers['authorization'] ?? '').toString().replace(/^Bearer\s+/i, '')
  const given = (typeof header === 'string' ? header : bearer) || ''
  if (safeEqual(given, expected)) return next()
  console.warn(`[Security] unauthorized ${req.method} ${req.path} from ${clientIp(req)}`)
  res.status(401).json({ error: 'Unauthorized' })
}

export function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for']
  const first = Array.isArray(xf) ? xf[0] : (xf ?? '').split(',')[0].trim()
  return first || req.socket.remoteAddress || 'unknown'
}

interface Bucket { count: number; reset: number }
export function rateLimit(windowMs: number, max: number, label = 'api') {
  const buckets = new Map<string, Bucket>()
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    const key = clientIp(req)
    let b = buckets.get(key)
    if (!b || b.reset <= now) {
      b = { count: 0, reset: now + windowMs }
      buckets.set(key, b)
    }
    b.count += 1
    if (buckets.size > 10000) buckets.clear()   // מגן זיכרון פשוט
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - b.count)))
    if (b.count > max) {
      console.warn(`[Security] rate limit (${label}) hit by ${key}`)
      res.status(429).json({ error: 'Too many requests' })
      return
    }
    next()
  }
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cache-Control', 'no-store')
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const isBodyParse = err?.type === 'entity.parse.failed' || err instanceof SyntaxError
  const tooLarge = err?.type === 'entity.too.large'
  const status = isBodyParse ? 400 : tooLarge ? 413 : (typeof err?.status === 'number' ? err.status : 500)
  if (status >= 500) console.error(`[Error] ${req.method} ${req.path}:`, err?.message ?? err)
  res.status(status).json({ error: status === 400 ? 'Invalid request body' : status === 413 ? 'Payload too large' : status === 404 ? 'Not found' : 'Internal error' })
}

/** ערכי ה-allow-list של ההגדרות שמותר לשנות דרך POST /api/settings (סודות רק דרך הנתיבים הייעודיים) */
export const SETTING_RULES: Record<string, (v: unknown) => boolean> = {
  min_score: v => typeof v === 'number' && v >= 0 && v <= 10,
  htt_min_score: v => typeof v === 'number' && v >= 0 && v <= 10,
  telegram_active: v => typeof v === 'boolean' || v === 'true' || v === 'false',
  alert_signals: v => typeof v === 'string' && v.length <= 2000 && isJsonArrayOfStrings(v),
  alert_timeframes: v => typeof v === 'string' && v.length <= 500 && isJsonArrayOfStrings(v),
  telegram_chat_id: v => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^-?\d{1,20}$/.test(v)),
  telegram_topic_daily: v => isTopic(v),
  telegram_topic_weekly: v => isTopic(v),
  telegram_topic_high: v => isTopic(v),
  telegram_topic_news: v => isTopic(v),
  server_url: v => typeof v === 'string' && v.length <= 300 && /^https?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(v),
}
function isTopic(v: unknown): boolean {
  return (typeof v === 'number' && Number.isInteger(v) && v >= 0) || (typeof v === 'string' && /^\d{0,12}$/.test(v))
}
function isJsonArrayOfStrings(s: string): boolean {
  try {
    const a = JSON.parse(s)
    return Array.isArray(a) && a.every(x => typeof x === 'string' && x.length <= 40)
  } catch { return false }
}
