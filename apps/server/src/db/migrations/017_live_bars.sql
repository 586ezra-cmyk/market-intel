-- מערכת 3: נרות בזמן אמת שנבנים מצילומי המצב של HTT Snapshot (נר אחד לכל סגירת נר ב-TradingView).
-- הגרף באתר משלים איתם את הדקות האחרונות שחסרות במקור המעוכב (Yahoo, ~10 דק').
CREATE TABLE IF NOT EXISTS live_bars (
  symbol TEXT NOT NULL,
  tf TEXT NOT NULL,
  time INTEGER NOT NULL,          -- זמן פתיחת הנר, שניות
  o REAL NOT NULL, h REAL NOT NULL, l REAL NOT NULL, c REAL NOT NULL,
  PRIMARY KEY (symbol, tf, time)
);
