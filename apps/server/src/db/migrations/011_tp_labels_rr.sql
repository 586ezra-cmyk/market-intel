-- Migration 011: TP labels, R:R ratios, SL reason for UI display
ALTER TABLE alerts ADD COLUMN tp1_label TEXT;
ALTER TABLE alerts ADD COLUMN tp2_label TEXT;
ALTER TABLE alerts ADD COLUMN tp3_label TEXT;
ALTER TABLE alerts ADD COLUMN r1 TEXT;
ALTER TABLE alerts ADD COLUMN r2 TEXT;
ALTER TABLE alerts ADD COLUMN r3 TEXT;
ALTER TABLE alerts ADD COLUMN sl_reason TEXT;
