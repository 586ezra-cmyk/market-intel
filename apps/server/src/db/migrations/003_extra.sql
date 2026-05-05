CREATE TABLE IF NOT EXISTS wyckoff_phases (
  id         TEXT PRIMARY KEY,
  symbol     TEXT NOT NULL,
  timeframe  TEXT NOT NULL,
  phase      TEXT NOT NULL CHECK(phase IN ('accumulation','markup','distribution','markdown')),
  start_time INTEGER NOT NULL,
  end_time   INTEGER,
  confidence REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wyckoff_symbol_tf ON wyckoff_phases(symbol, timeframe);

CREATE TABLE IF NOT EXISTS inducements (
  id          TEXT PRIMARY KEY,
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK(direction IN ('bullish','bearish')),
  trap_price  REAL NOT NULL,
  sweep_price REAL NOT NULL,
  bar_time    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS repricings (
  id          TEXT PRIMARY KEY,
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK(direction IN ('bullish','bearish')),
  zone_top    REAL NOT NULL,
  zone_bottom REAL NOT NULL,
  start_time  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_hls (
  id        TEXT PRIMARY KEY,
  symbol    TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  session   TEXT NOT NULL CHECK(session IN ('asian','london','ny')),
  high      REAL NOT NULL,
  low       REAL NOT NULL,
  date      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_hls_symbol ON session_hls(symbol, timeframe, date DESC);
