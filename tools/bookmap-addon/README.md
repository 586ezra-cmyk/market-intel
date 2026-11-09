# HTT Order Flow Bridge — תוסף Bookmap ל-NQ

תוסף Layer1 של Bookmap ששולח לשרת המסחר נרות דקה עם נפח הקונים התוקפים, כדי שהאתר יציג ל-NQ דלתא, CVD, ספיגה ודיברגנס בדיוק כמו לקריפטו (טאב Order Flow).

## איך זה עובד
- מאזין ל-`onTrade` של כל נכס פתוח ב-Bookmap, וצובר לכל דקה: פתיחה/שיא/שפל/סגירה, נפח, ונפח הקונים התוקפים (`isBidAggressor`).
- כל 10 שניות שולח `POST /api/orderflow/ingest` לשרת (`{ symbol: "NQ", bars: [...] }`). הנר הנוכחי נשלח חלקי ומוחלף בכל שליחה.
- נכסים: רק שורש NQ (למשל `NQZ6.CME@BMD`). עותקי Instrument Copy (`@Copy`) מתעלמים.
- טוקן האדמין נקרא מ-`~/.config/market-intel/secrets.env` (`ADMIN_TOKEN=`), השרת מ-`BACKEND_URL=` או ברירת המחדל Railway. אפשר לעקוף עם `HTT_SERVER` / `HTT_ADMIN_TOKEN`.
- עובד רק כש-Bookmap פתוח ומחובר לנתונים. כשהוא סגור — אין נתוני NQ חדשים (ההיסטוריה נשארת בשרת).

## בנייה
```bash
tools/bookmap-addon/build.sh
```
צריך קומפיילר Java: `javac` (JDK) או `ecj.jar` (Eclipse compiler, קובץ אחד שרץ על ה-JRE של Bookmap) בתיקייה הזו. התוצאה: `dist/htt-orderflow-bridge.jar`.

## התקנה ב-Bookmap (פעם אחת, ידנית)
1. Bookmap ← Settings ← **Configure add-ons** ← **Add** ← לבחור את `dist/htt-orderflow-bridge.jar`.
2. ברשימה מופיע "HTT Order Flow Bridge" — להדליק (Enabled) על הגרף של NQ.
3. ביומן של Bookmap (`~/Library/Application Support/Bookmap/Logs/`) מופיע `[HTT Order Flow Bridge] tracking NQZ6.CME@BMD → NQ`.
4. באתר: טאב Order Flow ← NQ.

## שרת
- `POST /api/orderflow/ingest` (טוקן אדמין) — `apps/server/src/routes/orderflow.ts`.
- `NQ` ברשימת `OF_SYMBOLS` ב-`orderflowService.ts` (לא נמשך מ-Binance), `buildHttContext` ממפה `NQ1!`/`MNQ` ל-`NQ`.
