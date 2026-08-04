-- Default alert signal and timeframe settings
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('alert_signals',    '["bos","choch","fvg","ifvg","liquidity","smt","ismt","ob","doubletop","doublebottom","judas","wyckoff","session","inducement","repricing"]', unixepoch() * 1000),
  ('alert_timeframes', '["1m","5m","15m","30m","1h","4h","1D","1W"]', unixepoch() * 1000);
