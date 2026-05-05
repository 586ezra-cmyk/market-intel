-- ─── Backtest entries ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backtest_entries (
  id                TEXT PRIMARY KEY,
  trade_num         INTEGER,
  symbol            TEXT NOT NULL,
  direction         TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  opened_at         INTEGER NOT NULL,
  outcome           TEXT CHECK(outcome IN ('W','L','BE')),
  rr                REAL,                -- 1–10 R:R ratio
  stop_pct          REAL,                -- stop distance in %
  is_continuation   INTEGER DEFAULT 0,  -- 1=continuation, 0=reversal
  checklist         TEXT DEFAULT '{}',   -- JSON object
  incubation_days   INTEGER,
  incubation_hours  INTEGER,
  actual_time_hours REAL,
  notes             TEXT,
  screenshot_url    TEXT,
  strategy          TEXT DEFAULT 'ICT',
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backtest_symbol ON backtest_entries(symbol, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtest_outcome ON backtest_entries(outcome);

-- ─── Trade journal entries ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id              TEXT PRIMARY KEY,
  trade_num       INTEGER,
  symbol          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  opened_at       INTEGER NOT NULL,
  closed_at       INTEGER,
  entry_price     REAL NOT NULL,
  stop_price      REAL,
  exit_price      REAL,
  size_usd        REAL,
  commission_usd  REAL DEFAULT 0,
  pnl_usd         REAL,                 -- computed: (exit-entry)*size - commission
  notes           TEXT,
  screenshot_url  TEXT,
  alert_id        TEXT REFERENCES alerts(id),
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_symbol ON journal_entries(symbol, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_direction ON journal_entries(direction);
