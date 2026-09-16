import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import supertest from 'supertest'
import { adminAuth, rateLimit, securityHeaders, notFound, errorHandler, safeEqual, SETTING_RULES } from '../middleware/security'
import { JournalBody, BacktestBody, WatchlistAdd, AlertRate, TelegramBody, ServerUrlBody, NoteBody } from '../middleware/validate'

function makeApp(opts: { rate?: { max: number } } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(securityHeaders)
  app.use(express.json({ limit: '1kb' }))
  if (opts.rate) app.use('/api', rateLimit(60_000, opts.rate.max, 'test'))
  app.use('/api', adminAuth)
  app.get('/health', (_req, res) => { res.json({ ok: true }) })
  app.get('/api/ping', (_req, res) => { res.json({ pong: true }) })
  app.post('/api/echo', (req, res) => { res.json(req.body) })
  app.get('/api/boom', () => { throw new Error('secret internal detail') })
  app.use(notFound)
  app.use(errorHandler)
  return app
}

const saved = process.env.ADMIN_TOKEN
afterEach(() => { if (saved === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = saved })

describe('A01/A07 – admin token on /api', () => {
  beforeEach(() => { process.env.ADMIN_TOKEN = 'test-token-123' })

  it('rejects /api without a token (401) and never leaks the reason', async () => {
    const r = await supertest(makeApp()).get('/api/ping')
    expect(r.status).toBe(401)
    expect(r.body).toEqual({ error: 'Unauthorized' })
  })
  it('rejects a wrong token', async () => {
    const r = await supertest(makeApp()).get('/api/ping').set('x-admin-token', 'wrong')
    expect(r.status).toBe(401)
  })
  it('accepts the right token via header and via Bearer', async () => {
    const app = makeApp()
    expect((await supertest(app).get('/api/ping').set('x-admin-token', 'test-token-123')).status).toBe(200)
    expect((await supertest(app).get('/api/ping').set('Authorization', 'Bearer test-token-123')).status).toBe(200)
  })
  it('leaves /health open and CORS preflight through', async () => {
    const app = makeApp()
    expect((await supertest(app).get('/health')).status).toBe(200)
    expect((await supertest(app).options('/api/ping')).status).not.toBe(401)
  })
  it('is open only when ADMIN_TOKEN is unset (documented, logged)', async () => {
    delete process.env.ADMIN_TOKEN
    expect((await supertest(makeApp()).get('/api/ping')).status).toBe(200)
  })
  it('safeEqual is constant-time safe on different lengths and non-strings', () => {
    expect(safeEqual('a', 'ab')).toBe(false)
    expect(safeEqual(undefined, 'x')).toBe(false)
    expect(safeEqual('same', 'same')).toBe(true)
  })
})

describe('A02 – security headers, generic errors, 404 JSON', () => {
  it('sets hardening headers and hides x-powered-by', async () => {
    const r = await supertest(makeApp()).get('/health')
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    expect(r.headers['x-frame-options']).toBe('DENY')
    expect(r.headers['referrer-policy']).toBe('no-referrer')
    expect(r.headers['x-powered-by']).toBeUndefined()
  })
  it('returns a generic 500 without the internal message (A10)', async () => {
    process.env.ADMIN_TOKEN = 't'
    const r = await supertest(makeApp()).get('/api/boom').set('x-admin-token', 't')
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.body)).not.toContain('secret internal detail')
  })
  it('turns malformed JSON into 400, oversized body into 413 (A10)', async () => {
    process.env.ADMIN_TOKEN = 't'
    const app = makeApp()
    const bad = await supertest(app).post('/api/echo').set('x-admin-token', 't').set('Content-Type', 'application/json').send('{"a":')
    expect(bad.status).toBe(400)
    const big = await supertest(app).post('/api/echo').set('x-admin-token', 't').send({ a: 'x'.repeat(5000) })
    expect(big.status).toBe(413)
  })
  it('unknown routes give JSON 404', async () => {
    const r = await supertest(makeApp()).get('/nope')
    expect(r.status).toBe(404)
    expect(r.body.error).toBeDefined()
  })
})

describe('A06 – rate limit', () => {
  it('returns 429 after the window budget is used', async () => {
    process.env.ADMIN_TOKEN = 't'
    const app = makeApp({ rate: { max: 3 } })
    const codes: number[] = []
    for (let i = 0; i < 5; i++) codes.push((await supertest(app).get('/api/ping').set('x-admin-token', 't')).status)
    expect(codes).toEqual([200, 200, 200, 429, 429])
  })
})

describe('A05 – input validation schemas', () => {
  it('journal: accepts the real form payload (numeric strings, extra keys) and rejects garbage', () => {
    const ok = JournalBody.safeParse({ symbol: 'BTCUSDT', direction: 'LONG', entryPrice: '100.5', sizeUsd: '', tradeNum: 3, openedAtStr: '2026-09-16T10:00', notes: 'x' })
    expect(ok.success).toBe(true)
    if (ok.success) { expect(ok.data.entryPrice).toBe(100.5); expect((ok.data as any).openedAtStr).toBeUndefined() }
    expect(JournalBody.safeParse({ symbol: 'BTCUSDT', direction: 'UP', entryPrice: 1 }).success).toBe(false)
    expect(JournalBody.safeParse({ symbol: 'x'.repeat(50), direction: 'LONG', entryPrice: 1 }).success).toBe(false)
    expect(JournalBody.safeParse({ symbol: 'BTCUSDT', direction: 'LONG', entryPrice: -5 }).success).toBe(false)
  })
  it('backtest: outcome must be W/L/BE, checklist booleans only', () => {
    expect(BacktestBody.safeParse({ symbol: 'ETHUSDT', direction: 'SHORT', outcome: 'W', rr: '2.5', checklist: { a: true } }).success).toBe(true)
    expect(BacktestBody.safeParse({ symbol: 'ETHUSDT', direction: 'SHORT', outcome: 'WIN' }).success).toBe(false)
    expect(BacktestBody.safeParse({ symbol: 'ETHUSDT', direction: 'SHORT', outcome: 'W', checklist: { a: 'yes' } }).success).toBe(false)
  })
  it('watchlist: symbol whitelist blocks injection-shaped input', () => {
    expect(WatchlistAdd.safeParse({ symbol: 'NQ1!' }).success).toBe(true)
    expect(WatchlistAdd.safeParse({ symbol: "BTC'; DROP TABLE watchlist;--" }).success).toBe(false)
    expect(WatchlistAdd.safeParse({ symbol: '<script>' }).success).toBe(false)
  })
  it('alerts rating: 1..5 and known outcomes only', () => {
    expect(AlertRate.safeParse({ rating: 5, outcome: 'win' }).success).toBe(true)
    expect(AlertRate.safeParse({ rating: 9 }).success).toBe(false)
    expect(AlertRate.safeParse({ outcome: 'maybe' }).success).toBe(false)
  })
  it('telegram/server-url/notes shapes', () => {
    expect(TelegramBody.safeParse({ chatId: '-1001234567890', topicHigh: '12' }).success).toBe(true)
    expect(TelegramBody.safeParse({ chatId: 'abc' }).success).toBe(false)
    expect(ServerUrlBody.safeParse({ url: 'https://marketserver-production.up.railway.app' }).success).toBe(true)
    expect(ServerUrlBody.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false)
    expect(NoteBody.safeParse({ id: 'daily', content: 'hello' }).success).toBe(true)
    expect(NoteBody.safeParse({ content: 'x'.repeat(30000) }).success).toBe(false)
  })
  it('settings allow-list: unknown key rejected, known keys typed', () => {
    expect(SETTING_RULES['telegram_token']).toBeUndefined()
    expect(SETTING_RULES['min_score']!(7)).toBe(true)
    expect(SETTING_RULES['min_score']!('7; DROP')).toBe(false)
    expect(SETTING_RULES['telegram_active']!(true)).toBe(true)
    expect(SETTING_RULES['server_url']!('ftp://x')).toBe(false)
  })
})
