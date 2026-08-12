-- Excludes historical alerts from the statistics without deleting them.
--
-- Every alert recorded before liquidity levels existed had tp1 = null, so SL
-- was the only outcome that could ever be reached. Those rows produce a 100%
-- SL rate that would drown out honest measurements for a long time. They stay
-- in the table for reference and are simply not counted.
ALTER TABLE alerts ADD COLUMN stats_excluded INTEGER DEFAULT 0;

UPDATE alerts SET stats_excluded = 1;
