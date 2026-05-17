import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'market.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  runMigrations(_db)
  return _db
}

function runMigrations(db: Database.Database): void {
  // In production (dist/db/), go up to find src/db/migrations
  // In development (src/db/), look in same dir
  const migrationsDir = fs.existsSync(path.join(__dirname, 'migrations'))
    ? path.join(__dirname, 'migrations')
    : path.join(__dirname, '../../src/db/migrations')
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    ran_at INTEGER NOT NULL
  )`)

  for (const file of files) {
    const already = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(file)
    if (already) continue
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    db.exec(sql)
    db.prepare('INSERT INTO _migrations (name, ran_at) VALUES (?, ?)').run(file, Date.now())
    console.log(`[DB] migration ran: ${file}`)
  }
}
