import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionToken, safeEqual } from '@/lib/session'

/**
 * Site login gate. Active only when SITE_PASSWORD is set (production).
 * Everything except the login page, the login API, static assets and the health checks requires the session cookie.
 * API calls without a session get 401 JSON; pages get redirected to /login.
 */
export const config = {
  matcher: ['/((?!_next/|icons/|manifest\\.json|sw\\.js|favicon\\.ico|health|api/health|login|api/login).*)'],
}

export async function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD
  if (!password) return NextResponse.next()

  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  if (cookie && safeEqual(cookie, await sessionToken(password))) return NextResponse.next()

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}
