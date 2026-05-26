import http from 'http'
import express from 'express'
import cors from 'cors'
import { config } from './config'
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

const app = express()

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }))
app.use(express.json({ limit: '1mb' }))

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

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, time: Date.now(), env: config.nodeEnv })
})

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const server = http.createServer(app)
initWebSocket(server)

// Ensure DB is ready (runs migrations)
getDb()

// Start scheduler (cron jobs)
if (config.nodeEnv !== 'test') {
  initScheduler()
  // Start outcome tracker (self-learning feedback loop)
  const db = getDb()
  startOutcomeTracker(db)
}

server.listen(config.port, () => {
  console.log(`[Server] Running on port ${config.port} (${config.nodeEnv})`)
  console.log(`[Server] WebSocket ready`)
  console.log(`[Server] Routes: /api/connections /api/alerts /api/market /webhook`)
})

export default app


