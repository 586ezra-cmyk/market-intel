import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE, sessionToken, safeEqual } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Small in-memory limiter: 10 attempts per IP per 10 minutes (per server instance).
const attempts = new Map<string, { n: number; reset: number }>()
const WINDOW_MS = 10 * 60_000
const MAX_ATTEMPTS = 10

function ip(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: NextRequest) {
  const password = process.env.SITE_PASSWORD
  if (!password) return NextResponse.json({ error: 'Login is not configured' }, { status: 503 })

  const key = ip(req)
  const now = Date.now()
  const rec = attempts.get(key)
  if (rec && rec.reset > now && rec.n >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 })
  }

  let given = ''
  try {
    const body = await req.json()
    given = typeof body?.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!safeEqual(given, password)) {
    const next = rec && rec.reset > now ? { n: rec.n + 1, reset: rec.reset } : { n: 1, reset: now + WINDOW_MS }
    attempts.set(key, next)
    console.warn(`[Security] failed site login from ${key}`)
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  attempts.delete(key)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  return res
}

/** Logout: clear the session cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
