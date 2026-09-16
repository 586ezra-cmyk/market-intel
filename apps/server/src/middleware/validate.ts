/** Input validation helpers (OWASP A05 Injection / A06 Insecure Design): every mutation body is checked with zod. */
import { z } from 'zod'
import type { Request, Response } from 'express'

export function parseBody<S extends z.ZodTypeAny>(schema: S, req: Request, res: Response): z.infer<S> | null {
  const r = schema.safeParse(req.body)
  if (!r.success) {
    const issue = r.error.issues[0]
    res.status(400).json({ error: 'Invalid request body', field: issue?.path.join('.') || undefined })
    return null
  }
  return r.data
}

const ID_RE = /^[A-Za-z0-9_\-:.!]{1,64}$/
export function idParam(req: Request, res: Response, name = 'id'): string | null {
  const v = String(req.params[name] ?? '')
  if (!ID_RE.test(v)) {
    res.status(400).json({ error: `Invalid ${name}` })
    return null
  }
  return v
}

/** Accepts a number or a numeric string ('' / null → null) — forms send strings. */
const toNum = (v: unknown) => (v === '' || v === undefined ? undefined : v === null ? null : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v)
const num = z.preprocess(toNum, z.number().finite())
const optNum = z.preprocess(toNum, z.number().finite().nullable().optional())
const optInt = (max: number) => z.preprocess(toNum, z.number().int().min(0).max(max).nullable().optional())
const toTs = (v: unknown) => (typeof v === 'string' && v && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : toNum(v))
const optTs = z.preprocess(toTs, z.number().int().min(0).nullable().optional())
const shortStr = (n: number) => z.string().max(n)
const urlStr = z.string().max(500).regex(/^https?:\/\//).nullable().optional()

export const JournalBody = z.object({
  tradeNum: optInt(1_000_000),
  symbol: shortStr(20).min(1),
  direction: z.enum(['LONG', 'SHORT']),
  openedAt: optTs,
  closedAt: optTs,
  entryPrice: z.preprocess(toNum, z.number().finite().positive()),
  stopPrice: optNum,
  exitPrice: optNum,
  sizeUsd: optNum,
  commissionUsd: z.preprocess(toNum, z.number().finite().min(0).nullable().optional()),
  notes: shortStr(5000).nullable().optional(),
  screenshotUrl: urlStr,
  alertId: shortStr(64).nullable().optional(),
})
export const JournalUpdate = JournalBody.partial()

export const BacktestBody = z.object({
  tradeNum: optInt(1_000_000),
  symbol: shortStr(20).min(1),
  direction: z.enum(['LONG', 'SHORT']),
  openedAt: optTs,
  outcome: z.enum(['W', 'L', 'BE']),
  rr: z.preprocess(toNum, z.number().finite().min(0).max(100).nullable().optional()),
  stopPct: z.preprocess(toNum, z.number().finite().min(0).max(100).nullable().optional()),
  isContinuation: z.boolean().optional(),
  checklist: z.record(z.string().max(40), z.boolean()).nullable().optional(),
  incubationDays: optNum,
  incubationHours: optNum,
  actualTimeHours: optNum,
  notes: shortStr(5000).nullable().optional(),
  screenshotUrl: urlStr,
  strategy: shortStr(40).optional(),
})
export const BacktestUpdate = BacktestBody.partial()

export const NoteBody = z.object({ id: shortStr(64).optional(), content: shortStr(20000) })
export const WatchlistAdd = z.object({ symbol: z.string().regex(/^[A-Za-z0-9!.:_-]{2,24}$/), priceAlert: optNum })
export const WatchlistUpdate = z.object({ priceAlert: optNum })
export const PricesBody = z.record(z.string().max(24), z.number().finite())
export const AlertRate = z.object({
  rating: z.number().int().min(1).max(5).nullable().optional(),
  outcome: z.enum(['win', 'loss', 'be', 'worked', 'failed', 'pending']).nullable().optional(),
  notes: shortStr(2000).nullable().optional(),
})
export const AlertArchive = z.object({ archived: z.boolean().optional() })
export const TelegramBody = z.object({
  token: z.string().max(120).regex(/^[0-9]{6,12}:[A-Za-z0-9_-]{20,60}$|^$/).optional(),
  chatId: z.string().max(24).regex(/^-?\d{1,20}$|^$/).optional(),
  topicDaily: z.string().max(12).regex(/^\d*$/).optional(),
  topicWeekly: z.string().max(12).regex(/^\d*$/).optional(),
  topicHigh: z.string().max(12).regex(/^\d*$/).optional(),
  topicNews: z.string().max(12).regex(/^\d*$/).optional(),
})
export const ServerUrlBody = z.object({ url: z.string().max(300).regex(/^https?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/) })
