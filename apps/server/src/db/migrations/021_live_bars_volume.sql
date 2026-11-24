-- נפח לכל נר חי (HTT Snapshot שולח אותו בשדה vol). נרות ישנים נשארים בלי נפח (NULL).
ALTER TABLE live_bars ADD COLUMN v REAL;
