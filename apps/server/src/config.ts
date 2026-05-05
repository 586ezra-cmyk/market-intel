import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../../..', '.env') })

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  webhookSecret: process.env.TV_WEBHOOK_SECRET ?? 'dev-secret',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  dbPath: process.env.DB_PATH ?? './data/market.db',
}
