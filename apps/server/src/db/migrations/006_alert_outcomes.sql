-- Feature 10: Self-learning feedback loop columns
-- Using safe ALTER TABLE with checks via triggers/defaults

ALTER TABLE alerts ADD COLUMN entry_price REAL;
ALTER TABLE alerts ADD COLUMN sl_price REAL;
ALTER TABLE alerts ADD COLUMN tp1_price REAL;
ALTER TABLE alerts ADD COLUMN tp2_price REAL;
ALTER TABLE alerts ADD COLUMN tp3_price REAL;
ALTER TABLE alerts ADD COLUMN outcome TEXT DEFAULT 'pending';
ALTER TABLE alerts ADD COLUMN tp1_hit INTEGER DEFAULT 0;
ALTER TABLE alerts ADD COLUMN tp2_hit INTEGER DEFAULT 0;
ALTER TABLE alerts ADD COLUMN tp3_hit INTEGER DEFAULT 0;
ALTER TABLE alerts ADD COLUMN sl_hit INTEGER DEFAULT 0;
ALTER TABLE alerts ADD COLUMN outcome_checked_at INTEGER;
ALTER TABLE alerts ADD COLUMN factors_json TEXT;

CREATE INDEX IF NOT EXISTS idx_alerts_outcome ON alerts(outcome, triggered_at DESC);
