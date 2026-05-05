CREATE TABLE IF NOT EXISTS alerts (
  id               TEXT PRIMARY KEY,
  symbol           TEXT NOT NULL,
  timeframe        TEXT NOT NULL,
  triggered_at     INTEGER NOT NULL,
  factors          TEXT NOT NULL,
  score            REAL NOT NULL DEFAULT 0,
  direction        TEXT NOT NULL CHECK(direction IN ('bullish','bearish')),
  recommendation   TEXT NOT NULL,
  premium_discount TEXT NOT NULL,
  session          TEXT NOT NULL,
  in_kill_zone     INTEGER NOT NULL DEFAULT 0,
  message_he       TEXT NOT NULL,
  stop_loss        REAL,
  tp1              REAL,
  tp2              REAL,
  tp3              REAL,
  fvg_id           TEXT,
  structure_id     TEXT,
  sent             INTEGER NOT NULL DEFAULT 0,
  user_rating      INTEGER,
  user_outcome     TEXT,
  user_notes       TEXT,
  created_at       INTEGER NOT NULL,
  FOREIGN KEY(fvg_id) REFERENCES fvgs(id),
  FOREIGN KEY(structure_id) REFERENCES structures(id)
);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_score ON alerts(score DESC);
