import http from 'http'
import express from 'express'
import cors from 'cors'
import { config } from './config'
import { adminAuth, rateLimit, securityHeaders, notFound, errorHandler } from './middleware/security'
// Pine Script version: v2 (Volume Climax + BB + iFVG + semicolon fixes)
import { getDb } from './db/client'
import { initWebSocket } from './websocket'
import webhookRouter from './routes/webhook'
import alertsRouter from './routes/alerts'
import marketRouter from './routes/market'
import economicRouter from './routes/economic'
import backtestRouter from './routes/backtest'
import journalRouter from './routes/journal'
import settingsRouter, { telegramTestRouter } from './routes/settings'
import connectionsRouter from './routes/connections'
import watchlistRouter from './routes/watchlist'
import statsRouter from './routes/stats'
import notesRouter from './routes/notes'
import { initScheduler } from './services/scheduler'
import { startOutcomeTracker } from './services/outcomeTracker'
import { startBinanceWebSocket } from './services/binanceWebSocket'
import { startYahooFeed } from './services/yahooFeed'

const app = express()

// ─── Middleware ───────────────────────────────────────────────────────────────
// Railway/Vercel sit behind a proxy — needed for the real client IP (rate limit, logs)
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(securityHeaders)

// CORS: exact origin allow-list. Production origin + anything listed in CORS_ORIGINS (comma separated);
// localhost only outside production. No more "any vercel.app" wildcard.
const ALLOWED_ORIGINS = new Set<string>([
  'https://market-intel-web-henna.vercel.app',
  ...(process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? '').split(',').map(s => s.trim()).filter(Boolean),
])
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)                       // curl / server-to-server / same-origin
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, true)
    if (config.nodeEnv !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true)
    callback(null, false)
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-admin-token', 'Authorization', 'x-tv-secret'],
}))
app.use(express.json({ limit: '256kb' }))

// Rate limits: the webhook is public (TradingView), the API is admin-only
app.use('/webhook', rateLimit(60_000, 240, 'webhook'))
app.use('/api', rateLimit(60_000, 900, 'api'))
// Authentication for everything under /api (ADMIN_TOKEN); /webhook/tradingview keeps its own secret
app.use('/api', adminAuth)

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/webhook', webhookRouter)
app.use('/api/alerts', alertsRouter)
app.use('/api/market', marketRouter)
app.use('/api/economic-calendar', economicRouter)
app.use('/api/briefing', economicRouter)
app.use('/api/backtest', backtestRouter)
app.use('/api/journal', journalRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/connections', connectionsRouter)
app.use('/api/telegram', telegramTestRouter)
app.use('/api/watchlist', watchlistRouter)
app.use('/api/stats', statsRouter)
app.use('/api/notes', notesRouter)

// Health check (public, no details)
app.get('/health', (_req, res) => {
  res.json({ ok: true, time: Date.now(), env: config.nodeEnv })
})

app.use(notFound)
app.use(errorHandler)

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const server = http.createServer(app)
initWebSocket(server)

// Ensure DB is ready (runs migrations)
getDb()

// Start scheduler (cron jobs)
if (config.nodeEnv !== 'test') {
  initScheduler()
  const db = getDb()
  startOutcomeTracker(db)
  startBinanceWebSocket()
  startYahooFeed()
}

server.listen(config.port, () => {
  console.log(`[Server] Running on port ${config.port} (${config.nodeEnv})`)
  console.log(`[Server] WebSocket ready`)
  console.log(`[Server] Routes: /api/connections /api/alerts /api/market /webhook`)
})

export default app


