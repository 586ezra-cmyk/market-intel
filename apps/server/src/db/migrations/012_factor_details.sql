-- Migration 012: per-factor specific details (prices, levels, TFs) for UI display
ALTER TABLE alerts ADD COLUMN factor_details TEXT;
