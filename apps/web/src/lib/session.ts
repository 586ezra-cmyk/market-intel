/**
 * Site login session — shared by the Edge middleware and the Node login route.
 * The cookie holds a SHA-256 of the password plus a salt, so the password itself is never stored client-side.
 * Works in both runtimes (Web Crypto is global in Edge and in Node 18+).
 */
export const SESSION_COOKIE = 'site_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export async function sessionToken(password: string): Promise<string> {
  const salt = process.env.SITE_SESSION_SALT ?? 'htt-site-v1'
  const data = new TextEncoder().encode(`${password}|${salt}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string compare (no early exit on the first mismatch). */
export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const n = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}
