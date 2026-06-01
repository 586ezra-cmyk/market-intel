-- Migration 009: archive column for alerts
ALTER TABLE alerts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_alerts_archived ON alerts (archived);
