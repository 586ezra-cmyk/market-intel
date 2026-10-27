-- רמות שוק האופציות (גמא/GEX) לנאסדק — נשמרות בכל חישוב (תדריך 15:30 IL + כל 15 דק' בסשן ארה"ב) לצורך מדידה קדימה
CREATE TABLE IF NOT EXISTS options_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_options_levels_ts ON options_levels(ts);
