import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Backend origin — server-side only (BACKEND_URL preferred; NEXT_PUBLIC_API_URL kept for compatibility). */
function target(): string {
  return (process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
}

/** Only backend paths we actually use; blocks path tricks like "..". */
const ALLOWED = /^(api|webhook|health)(\/[A-Za-z0-9_\-.!:%]+)*$/

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const rel = (path ?? []).join('/')
  if (!ALLOWED.test(rel)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const headers: Record<string, string> = { Accept: 'application/json' }
  const ct = req.headers.get('content-type')
  if (ct) headers['Content-Type'] = ct
  const token = process.env.ADMIN_TOKEN
  if (token) headers['x-admin-token'] = token

  const init: RequestInit = { method: req.method, headers, cache: 'no-store', redirect: 'manual' }
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await req.text()

  try {
    const up = await fetch(`${target()}/${rel}${req.nextUrl.search}`, init)
    const body = await up.text()
    return new NextResponse(body, {
      status: up.status,
      headers: {
        'Content-Type': up.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 })
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH }
