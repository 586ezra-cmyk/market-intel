import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { config } from '../config'
import { getDb } from '../db/client'
import { getWebhookSecret } from './connections'
import { broadcastWS } from '../websocket'
import { upsertRange } from '../services/rangeEngine'
import { upsertStructure } from '../services/structureEngine'
import { createFVG, markFVGFilled, checkFVGFills } from '../services/fvgEngine'
import { upsertLiquidity, checkLiquiditySweep } from '../services/liquidityEngine'
import { detectSMT, detectISMT } from '../services/smtEngine'
import { evaluateConfluence } from '../services/confluenceEngine'
import { parseTF } from '../utils/timeframe'
import type { Direction, Timeframe } from '@market/shared'
import { getSetting } from './settings'

const router = Router()

// ─── Zod schemas for each payload type ───────────────────────────────────────

const BaseSchema = z.object({
  secret: z.string().optional(),
  symbol: z.string().min(1),
  timeframe: z.string(),
  time: z.number().int().positive(),
})

const RangeSchema = BaseSchema.extend({
  event: z.literal('range_update'),
  high: z.number(),
  low: z.number(),
  session: z.string().optional(),
})

const StructureSchema = BaseSchema.extend({
  event: z.literal('structure'),
  type: z.enum(['BOS', 'CHoCH']),
  direction: z.enum(['bullish', 'bearish']),
  price: z.number(),
  confirmed: z.boolean().optional(),
})

const FVGSchema = BaseSchema.extend({
  event: z.literal('fvg_created'),
  direction: z.enum(['bullish', 'bearish']),
  topPrice: z.number(),
  bottomPrice: z.number(),
  structureRef: z.string().optional(),
})

const FVGFilledSchema = BaseSchema.extend({
  event: z.literal('fvg_filled'),
  fvgId: z.string(),
})

const LiquiditySchema = BaseSchema.extend({
  event: z.literal('liquidity'),
  type: z.string(),
  price: z.number(),
  firstTime: z.number(),
})

const LiquiditySweepSchema = BaseSchema.extend({
  event: z.literal('liquidity_sweep'),
  high: z.number(),
  low: z.number(),
  close: z.number(),
})

const SMTSchema = BaseSchema.extend({
  event: z.literal('smt'),
  asset1: z.string(),
  asset1Price: z.number(),
  asset1High: z.number().optional(),
  asset1Low: z.number().optional(),
  asset2: z.string(),
  asset2Price: z.number(),
  asset2High: z.number().optional(),
  asset2Low: z.number().optional(),
})

const ConfluenceSchema = BaseSchema.extend({
  event: z.literal('confluence'),
  direction: z.enum(['bullish', 'bearish']),
  currentPrice: z.number(),
  // Pine Script confluence flags
  factorCount: z.number().optional(),
  inKillZone: z.boolean().default(false),   // Pine Script's KZ state (authoritative)
  killZone: z.string().optional(),
  dealingZone: z.string().optional(),
  rangePosition: z.number().optional(),
  hasBOSorCHoCH: z.boolean().default(false),
  hasLiquiditySweep: z.boolean().default(false),
  hasFVG: z.boolean().default(false),
  hasIFVG: z.boolean().default(false),
  hasSMT: z.boolean().default(false),
  hasISMT: z.boolean().default(false),
  hasWyckoff: z.boolean().default(false),
  wyckoffPhase: z.string().optional(),
  hasOB: z.boolean().default(false),
  hasJudas: z.boolean().default(false),
  aboveBBupper: z.boolean().default(false),
  belowBBlower: z.boolean().default(false),
  bbSqueeze: z.boolean().default(false),
  volRank: z.number().optional(),
  hasVolClimax: z.boolean().default(false),
  volType: z.string().optional(),
  higherTFConfirmations: z.array(z.string()).optional(),
})

// ── Extra events Pine Script sends ───────────────────────────────────────────
const IFVGSchema = BaseSchema.extend({
  event: z.literal('ifvg'),
  direction: z.enum(['bullish', 'bearish']),
  price: z.number(),
})

const OrderBlockSchema = BaseSchema.extend({
  event: z.literal('order_block'),
  direction: z.enum(['bullish', 'bearish']),
  price: z.number(),
})

const BBBreakSchema = BaseSchema.extend({
  event: z.literal('bb_break'),
  direction: z.enum(['bullish', 'bearish']),
  bbUpper: z.number(),
  bbLower: z.number(),
  price: z.number(),
})

const VolumeClimaxSchema = BaseSchema.extend({
  event: z.literal('volume_climax'),
  type: z.enum(['selling_climax', 'buying_climax']),
  direction: z.enum(['bullish', 'bearish']),
  volRank: z.number(),
  price: z.number(),
  inKillZone: z.boolean().default(false),
  dealingZone: z.string().optional(),
})

const VolumeLowSchema = BaseSchema.extend({
  event: z.literal('volume_low'),
  type: z.enum(['no_supply', 'no_demand']),
  direction: z.enum(['bullish', 'bearish']),
  volRank: z.number(),
  price: z.number(),
})

const WyckoffSchema = BaseSchema.extend({
  event: z.literal('wyckoff'),
  phase: z.enum(['accumulation', 'markup', 'distribution', 'markdown']),
  confidence: z.number().min(0).max(1),
  endTime: z.number().optional(),
})

const AnyEventSchema = z.discriminatedUnion('event', [
  RangeSchema,
  StructureSchema,
  FVGSchema,
  FVGFilledSchema,
  IFVGSchema,
  LiquiditySchema,
  LiquiditySweepSchema,
  SMTSchema,
  ConfluenceSchema,
  WyckoffSchema,
  OrderBlockSchema,
  BBBreakSchema,
  VolumeClimaxSchema,
  VolumeLowSchema,
])

// ─── Auth middleware ──────────────────────────────────────────────────────────

function verifySecret(req: Request, res: Response): boolean {
  const header     = req.headers['x-tv-secret'] as string | undefined
  const bodySecret = (req.body as any)?.secret   as string | undefined
  const expected   = getWebhookSecret()           // DB first, then ENV, then 'dev-secret'

  if (header !== expected && bodySecret !== expected) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

// ─── POST /webhook/tradingview ────────────────────────────────────────────────

router.post('/tradingview', async (req: Request, res: Response) => {
  if (!verifySecret(req, res)) return

  const db = getDb()
  const rawBody = JSON.stringify(req.body)

  // Log all incoming webhooks
  db.prepare(`INSERT INTO webhook_log (id, payload, received_at) VALUES (?, ?, ?)`)
    .run(require('crypto').randomUUID(), rawBody, Date.now())

  const parsed = AnyEventSchema.safeParse(req.body)
  if (!parsed.success) {
    console.warn('[Webhook] Validation failed:', parsed.error.flatten())
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
    return
  }

  const data = parsed.data
  let tf: Timeframe
  try {
    tf = parseTF(data.timeframe)
  } catch {
    res.status(400).json({ error: `Invalid timeframe: ${data.timeframe}` })
    return
  }

  try {
    switch (data.event) {
      case 'range_update': {
        const range = upsertRange({
          symbol: data.symbol, timeframe: tf,
          high: data.high, low: data.low,
          startTime: data.time,
          session: data.session as any,
        })
        broadcastWS({ type: 'range', payload: range })
        res.json({ ok: true, range })
        break
      }

      case 'structure': {
        const structure = upsertStructure({
          symbol: data.symbol, timeframe: tf,
          type: data.type, direction: data.direction as Direction,
          price: data.price, time: data.time,
          confirmed: data.confirmed,
        })
        broadcastWS({ type: 'structure', payload: structure })
        res.json({ ok: true, structure })
        break
      }

      case 'fvg_created': {
        const fvg = createFVG({
          symbol: data.symbol, timeframe: tf,
          direction: data.direction as Direction,
          topPrice: data.topPrice,
          bottomPrice: data.bottomPrice,
          candleTime: data.time,
          structureRef: data.structureRef,
        })
        broadcastWS({ type: 'fvg' as any, payload: fvg })
        res.json({ ok: true, fvg })
        break
      }

      case 'fvg_filled': {
        markFVGFilled(data.fvgId, data.time)
        broadcastWS({ type: 'fvg_filled', payload: { id: data.fvgId, filledAt: data.time } })
        res.json({ ok: true })
        break
      }

      case 'liquidity': {
        const liq = upsertLiquidity({
          symbol: data.symbol, timeframe: tf,
          type: data.type as any,
          price: data.price,
          firstTime: data.firstTime,
          lastTime: data.time,
        })
        broadcastWS({ type: 'liquidity', payload: liq })
        res.json({ ok: true, liquidity: liq })
        break
      }

      case 'liquidity_sweep': {
        const swept = checkLiquiditySweep(data.symbol, tf, data.high, data.low, data.close, data.time)
        if (swept.length > 0) {
          swept.forEach(l => broadcastWS({ type: 'liquidity', payload: l }))
        }
        res.json({ ok: true, swept: swept.length })
        break
      }

      case 'smt': {
        const smt = detectSMT({
          timeframe: tf,
          time: data.time,
          asset1: data.asset1,
          asset1Price: data.asset1Price,
          asset1High: data.asset1High ?? data.asset1Price,
          asset1Low: data.asset1Low ?? data.asset1Price,
          asset2: data.asset2,
          asset2Price: data.asset2Price,
          asset2High: data.asset2High ?? data.asset2Price,
          asset2Low: data.asset2Low ?? data.asset2Price,
        })
        if (smt) broadcastWS({ type: 'smt', payload: smt })
        res.json({ ok: true, detected: !!smt, signal: smt })
        break
      }

      case 'confluence': {
        // NQ/SPX are now detected server-side from the Yahoo feed, which runs
        // the same detectors as crypto. Leaving the Pine Script confluence
        // enabled would produce a second, differently-scored alert for the same
        // symbol. Raw signal events (fvg_created, structure, ...) are still
        // accepted below — only alert creation is switched off.
        if (getSetting('tv_alerts_enabled', 'false') !== 'true') {
          res.json({ ok: true, alerted: false, skipped: 'tv_alerts_disabled' })
          break
        }

        const alert = await evaluateConfluence({
          symbol: data.symbol,
          timeframe: tf,
          direction: data.direction as Direction,
          currentPrice: data.currentPrice,
          time: data.time,
          inKillZoneOverride: data.inKillZone,  // use Pine Script's KZ state
          hasBOSorCHoCH: data.hasBOSorCHoCH,
          hasLiquiditySweep: data.hasLiquiditySweep,
          hasFVG: data.hasFVG || data.hasIFVG,
          hasSMT: data.hasSMT,
          hasISMT: data.hasISMT,
          hasWyckoff: data.hasWyckoff,
          wyckoffPhase: data.wyckoffPhase,
          hasOrderBlock: data.hasOB,
          higherTFConfirmations: data.higherTFConfirmations as Timeframe[] | undefined,
        })
        res.json({ ok: true, alerted: !!alert, alert })
        break
      }

      case 'ifvg': {
        // Inverse FVG retest — log + broadcast only
        broadcastWS({ type: 'ifvg' as any, payload: { symbol: data.symbol, timeframe: tf, direction: data.direction, price: data.price, time: data.time } })
        res.json({ ok: true })
        break
      }

      case 'order_block': {
        broadcastWS({ type: 'ob' as any, payload: { symbol: data.symbol, timeframe: tf, direction: data.direction, price: data.price, time: data.time } })
        res.json({ ok: true })
        break
      }

      case 'bb_break': {
        broadcastWS({ type: 'bb_break' as any, payload: { symbol: data.symbol, timeframe: tf, direction: data.direction, price: data.price, time: data.time } })
        res.json({ ok: true })
        break
      }

      case 'volume_climax': {
        broadcastWS({ type: 'volume_climax' as any, payload: { symbol: data.symbol, timeframe: tf, type: data.type, direction: data.direction, volRank: data.volRank, price: data.price, time: data.time } as any })
        res.json({ ok: true })
        break
      }

      case 'volume_low': {
        broadcastWS({ type: 'volume_low' as any, payload: { symbol: data.symbol, timeframe: tf, direction: data.direction, volRank: data.volRank, price: data.price, time: data.time } as any })
        res.json({ ok: true })
        break
      }

      case 'wyckoff': {
        const db2 = getDb()
        const id = require('crypto').randomUUID()
        const wyckoffNow = Date.now()
        db2.prepare(`INSERT INTO wyckoff_phases (id, symbol, timeframe, phase, start_time, end_time, confidence, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, data.symbol, tf, data.phase, data.time, data.endTime ?? null, data.confidence, wyckoffNow)
        broadcastWS({ type: 'wyckoff', payload: { id, symbol: data.symbol, timeframe: tf, phase: data.phase, startTime: data.time, endTime: data.endTime ?? null, confidence: data.confidence, createdAt: wyckoffNow } })
        res.json({ ok: true, id })
        break
      }

      default:
        res.status(400).json({ error: 'Unknown event' })
    }
  } catch (err) {
    console.error('[Webhook] Processing error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── GET /webhook/logs ────────────────────────────────────────────────────────

router.get('/logs', (req: Request, res: Response) => {
  const db = getDb()
  const limit = parseInt(String(req.query.limit ?? '50'), 10)
  const rows = db.prepare(`SELECT * FROM webhook_log ORDER BY received_at DESC LIMIT ?`).all(limit)
  res.json(rows)
})

export default router
