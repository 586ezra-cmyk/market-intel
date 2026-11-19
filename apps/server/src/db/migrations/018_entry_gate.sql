-- רמזור הכניסה: כל פעם שכל התנאים מתקיימים יחד ("ירוק") נרשמת שורה, ואחר כך מה קרה: יעד, סטופ או סוף הסשן.
-- המטרה: אחרי כמה שבועות לדעת אם ה"ירוק" שווה משהו. הכניסה נרשמת במחיר הסגירה של נר האיתות (הנחה).
CREATE TABLE IF NOT EXISTS gate_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  dir TEXT NOT NULL,                     -- long | short
  bar_time INTEGER NOT NULL,             -- זמן פתיחת נר האיתות, מילישניות
  ts INTEGER NOT NULL,                   -- מתי זוהה
  valid_until INTEGER NOT NULL,          -- עד מתי האיתות בתוקף (סוף הנר השני)
  entry REAL NOT NULL, stop REAL NOT NULL, t1 REAL NOT NULL, t2 REAL NOT NULL,
  blocked TEXT,                          -- למה אסור היה להיכנס (חדשות, נעילה יומית). ריק = ירוק מלא
  atr REAL,
  status TEXT NOT NULL DEFAULT 'open',   -- open | target | stop | expired
  hit1_at INTEGER,                       -- מתי נגע ביעד 1:1 (אם נגע)
  resolved_at INTEGER,
  r REAL,                                -- התוצאה ביחידות סיכון: סטופ = ‎-1, יעד = יחס היעד
  mfe REAL, mae REAL,                    -- הכי רחוק לטובה / לרעה, בנקודות
  ambiguous INTEGER NOT NULL DEFAULT 0,  -- 1 = סטופ ויעד באותו נר; נרשם כסטופ
  UNIQUE(symbol, dir, bar_time)
);
-- העסקאות של היום, כפי שהמשתמש מסמן בלוח (המערכת לא רואה פקודות). לפיהן הנעילה היומית.
CREATE TABLE IF NOT EXISTS gate_day_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,                     -- התאריך בניו יורק, YYYY-MM-DD
  symbol TEXT NOT NULL,
  ts INTEGER NOT NULL,
  result TEXT NOT NULL,                  -- win | loss | be
  usd REAL NOT NULL
);
