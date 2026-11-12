-- מערכת 3: צילום המצב האחרון של HTT Snapshot לכל נכס ומסגרת (שורה אחת לכל צירוף — נדרסת בכל נר)
CREATE TABLE IF NOT EXISTS live_snapshots (
  symbol TEXT NOT NULL,
  tf TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (symbol, tf)
);
