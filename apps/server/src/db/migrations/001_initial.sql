CREATE TABLE IF NOT EXISTS ranges (
  id          TEXT PRIMARY KEY,
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL,
  tf_class    TEXT NOT NULL CHECK(tf_class IN ('low','high')),
  range_type  TEXT NOT NULL CHECK(range_type IN ('session','swing')),
  high        REAL NOT NULL,
  low         REAL NOT NULL,
  midpoint    REAL NOT NULL,
  start_time  INTEGER NOT NULL,
  end_time    INTEGER,
  is_active   INTEGER NOT NULL DEFAULT 1,
  session     TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ranges_symbol_tf ON ranges(symbol, timeframe, is_active);

CREATE TABLE IF NOT EXISTS structures (
  id          TEXT PRIMARY KEY,
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('BOS','CHoCH')),
  direction   TEXT NOT NULL CHECK(direction IN ('bullish','bearish')),
  price       REAL NOT NULL,
  time        INTEGER NOT NULL,
  confirmed   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_structures_symbol_tf ON structures(symbol, timeframe, time);

CREATE TABLE IF NOT EXISTS fvgs (
  id            TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL,
  timeframe     TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK(direction IN ('bullish','bearish')),
  top_price     REAL NOT NULL,
  bottom_price  REAL NOT NULL,
  mid_price     REAL NOT NULL,
  candle_time   INTEGER NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  filled_at     INTEGER,
  in_premium    INTEGER NOT NULL DEFAULT 0,
  near_liquidity INTEGER NOT NULL DEFAULT 0,
  in_kill_zone  INTEGER NOT NULL DEFAULT 0,
  structure_ref TEXT,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY(structure_ref) REFERENCES structures(id)
);
CREATE INDEX IF NOT EXISTS idx_fvgs_symbol_tf_active ON fvgs(symbol, timeframe, is_active);

CREATE TABLE IF NOT EXISTS liquidities (
  id          TEXT PRIMARY KEY,
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL,
  type        TEXT NOT NULL,
  price       REAL NOT NULL,
  touch_count INTEGER NOT NULL DEFAULT 1,
  first_time  INTEGER NOT NULL,
  last_time   INTEGER NOT NULL,
  swept       INTEGER NOT NULL DEFAULT 0,
  swept_at    INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_liquidities_symbol_tf ON liquidities(symbol, timeframe, swept);

CREATE TABLE IF NOT EXISTS smt_signals (
  id           TEXT PRIMARY KEY,
  timeframe    TEXT NOT NULL,
  time         INTEGER NOT NULL,
  asset1       TEXT NOT NULL,
  asset2       TEXT NOT NULL,
  type         TEXT NOT NULL CHECK(type IN ('bearish_smt','bullish_smt')),
  asset1_price REAL NOT NULL,
  asset2_price REAL NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_smt_timeframe ON smt_signals(timeframe, time);

CREATE TABLE IF NOT EXISTS webhook_log (
  id          TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_log_time ON webhook_log(received_at DESC);
