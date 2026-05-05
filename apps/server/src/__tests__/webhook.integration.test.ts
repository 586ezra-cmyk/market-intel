import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import http from 'http'
import express from 'express'
import cors from 'cors'
import supertest from 'supertest'

// ─── Mocks — must be set up before importing app modules ─────────────────────
vi.mock('../db/client', () => {
  const fakeDb = {
    prepare: () => ({
      run: vi.fn(),
      get: vi.fn(() => null),
      all: vi.fn(() => []),
    }),
    exec: vi.fn(),
  }
  return { getDb: () => fakeDb }
})

vi.mock('../websocket', () => ({
  initWebSocket: vi.fn(),
  broadcastWS: vi.fn(),
}))

vi.mock('../services/scheduler', () => ({
  initScheduler: vi.fn(),
}))

vi.mock('../services/rangeEngine', () => ({
  upsertRange: vi.fn(),
  getActiveRange: vi.fn(() => null),
}))

vi.mock('../services/structureEngine', () => ({
  upsertStructure: vi.fn(),
  getLatestStructure: vi.fn(() => null),
  processCandle: vi.fn(() => null),
}))

vi.mock('../services/fvgEngine', () => ({
  createFVG: vi.fn(),
  markFVGFilled: vi.fn(),
  checkFVGFills: vi.fn(),
  getActiveFVGs: vi.fn(() => []),
}))

vi.mock('../services/liquidityEngine', () => ({
  upsertLiquidity: vi.fn(),
  checkLiquiditySweep: vi.fn(),
  getActiveLiquidity: vi.fn(() => []),
  getNearestLiquidityTargets: vi.fn(() => ({ tp1: null, tp2: null, tp3: null })),
}))

vi.mock('../services/smtEngine', () => ({
  detectSMT: vi.fn(() => null),
  detectISMT: vi.fn(() => null),
  getRecentSMTSignals: vi.fn(() => []),
}))

vi.mock('../services/confluenceEngine', () => ({
  evaluateConfluence: vi.fn(async () => null),
  cascadeScan: vi.fn(() => ({})),
}))

vi.mock('../services/alertDispatcher', () => ({
  saveAlert: vi.fn(async () => ({
    id: 'test-alert',
    symbol: 'BTCUSDT',
    timeframe: '15m',
    triggeredAt: Date.now(),
    factors: [],
    score: 3,
    direction: 'bullish',
    recommendation: 'long',
    premiumDiscount: 'discount',
    session: 'london',
    inKillZone: true,
    messageHe: 'test',
    stopLoss: null, tp1: null, tp2: null, tp3: null,
    fvgId: null, structureId: null,
    userRating: null, userOutcome: null, userNotes: null,
    sent: false, createdAt: Date.now(),
  })),
}))

// ─── Build a minimal test app (mirrors apps/server/src/index.ts) ──────────────
import webhookRouter from '../routes/webhook'
import { config } from '../config'

const app = express()
app.use(cors())
app.use(express.json())
app.use('/webhook', webhookRouter)
app.get('/health', (_req, res) => res.json({ ok: true }))

const VALID_SECRET = config.webhookSecret
const BASE_PAYLOAD = {
  secret: VALID_SECRET,
  symbol: 'BTCUSDT',
  timeframe: '15m',
  time: Date.now(),
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('POST /webhook/tradingview — integration', () => {
  // ─── Auth ──────────────────────────────────────────────────────────────────
  it('rejects with 401 when no secret provided', async () => {
    const res = await supertest(app)
      .post('/webhook/tradingview')
      .send({ ...BASE_PAYLOAD, secret: undefined, event: 'range_update', high: 100, low: 90 })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Unauthorized')
  })

  it('rejects with 401 when wrong secret provided (no body secret, wrong header)', async () => {
    // No body secret, wrong header secret → should reject
    const res = await supertest(app)
      .post('/webhook/tradingview')
      .set('X-TV-Secret', 'wrong-secret')
      .send({
        // Deliberately omit 'secret' field from body so only the header is checked
        symbol: 'BTCUSDT',
        timeframe: '15m',
        time: Date.now(),
        event: 'range_update',
        high: 100,
        low: 90,
      })

    expect(res.status).toBe(401)
  })

  it('accepts valid secret in X-TV-Secret header', async () => {
    const res = await supertest(app)
      .post('/webhook/tradingview')
      .set('X-TV-Secret', VALID_SECRET)
      .send({ symbol: 'BTCUSDT', timeframe: '15m', time: Date.now(), event: 'range_update', high: 100, low: 90 })

    expect(res.status).toBe(200)
  })

  // ─── Validation ────────────────────────────────────────────────────────────
  it('returns 400 for invalid event type', async () => {
    const res = await supertest(app)
      .post('/webhook/tradingview')
      .send({ ...BASE_PAYLOAD, event: 'invalid_event' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await supertest(app)
      .post('/webhook/tradingview')
      .send({ secret: VALID_SECRET, event: 'fvg_created' }) // missing symbol, timeframe, time, direction, etc.

    expect(res.status).toBe(400)
  })

  // ─── Successful payloads ────────────────────────────────────────────────────
  it('accepts valid fvg_created payload → 200', async () => {
    const res = await supertest(app)
      .post('/webhook/tradingview')
      .send({
        ...BASE_PAYLOAD,
        event: 'fvg_created',
        direction: 'bullish',
        topPrice: 95500,
        bottomPrice: 95000,
      })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('accepts valid structure payload → 200', async () => {
    const res = await supertest(app)
      .post('/webhook/tradingview')
      .send({
        ...BASE_PAYLOAD,
        event: 'structure',
        type: 'BOS',
        direction: 'bullish',
        price: 95000,
        confirmed: true,
      })

    expect(res.status).toBe(200)
  })

  it('accepts valid liquidity payload → 200', async () => {
    const res = await supertest(app)
      .post('/webhook/tradingview')
      .send({
        ...BASE_PAYLOAD,
        event: 'liquidity',
        type: 'equal_highs',
        price: 96000,
        firstTime: Date.now() - 3600000,
      })

    expect(res.status).toBe(200)
  })

  it('accepts valid confluence payload → 200', async () => {
    const res = await supertest(app)
      .post('/webhook/tradingview')
      .send({
        ...BASE_PAYLOAD,
        event: 'confluence',
        direction: 'bullish',
        currentPrice: 95000,
        hasBOSorCHoCH: true,
        hasLiquiditySweep: true,
        hasFVG: false,
        hasSMT: false,
      })

    expect(res.status).toBe(200)
  })

  it('accepts valid wyckoff payload → 200', async () => {
    const res = await supertest(app)
      .post('/webhook/tradingview')
      .send({
        ...BASE_PAYLOAD,
        event: 'wyckoff',
        phase: 'accumulation',
        confidence: 0.85,
      })

    expect(res.status).toBe(200)
  })

  // ─── Health check ───────────────────────────────────────────────────────────
  it('GET /health → 200 ok', async () => {
    const res = await supertest(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
