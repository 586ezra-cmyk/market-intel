-- רמזור הכניסה: למה נדלק הירוק (התנאים והמספרים ברגע האיתות), ומאיזה מקור נבדק ה-CVD (bookmap / tv).
ALTER TABLE gate_signals ADD COLUMN why TEXT;
ALTER TABLE gate_signals ADD COLUMN cvd_src TEXT;
