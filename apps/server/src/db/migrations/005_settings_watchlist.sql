-- Settings table (key/value store)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('min_score',       '3',   unixepoch() * 1000),
  ('telegram_active', 'true', unixepoch() * 1000);

-- Watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
  id           TEXT PRIMARY KEY,
  symbol       TEXT NOT NULL UNIQUE,
  price_alert  REAL,
  alert_fired  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_symbol ON watchlist(symbol);
