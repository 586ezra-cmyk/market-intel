-- Order Flow (שלב 3, 27.10.2026): נרות דקה מ-Binance עם נפח הקונים התוקפים (taker buy base volume).
-- דלתא לדקה = 2*buy - vol. הצבירה למסגרות (5/15/60/240) והחישובים (CVD, ספיגה, דיברגנס) נעשים בשירות.
CREATE TABLE IF NOT EXISTS orderflow_1m (
  symbol TEXT NOT NULL,
  t INTEGER NOT NULL,
  o REAL NOT NULL, h REAL NOT NULL, l REAL NOT NULL, c REAL NOT NULL,
  vol REAL NOT NULL,
  buy REAL NOT NULL,
  PRIMARY KEY (symbol, t)
);
