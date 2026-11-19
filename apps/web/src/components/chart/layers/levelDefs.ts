// כל הרמות שמגיעות מ-HTT Snapshot (TradingView), כל אחת משויכת לשכבה בסרגל ועם הסבר במילים פשוטות.
// ההגדרות המדויקות לקוחות מהסקריפט pine/htt_snapshot.pine.
import type { LayerId } from '@/store/marketStore'

export interface LevelDef {
  key: string; layer: LayerId; title: string; color: string
  style: 0 | 1 | 2          // 0 רציף, 1 מנוקד, 2 מקווקו
  width: 1 | 2
  what: string
  pair?: string             // הקצה השני של אותו אזור (לחישוב רוחב האזור)
}

export const LEVEL_DEFS: LevelDef[] = [
  // ── FVG ──
  { key: 'fLt', layer: 'fvg', title: 'FVG תומך', color: '#10b981', style: 0, width: 2, pair: 'fLb',
    what: 'פער מחיר שורי: המחיר קפץ למעלה והשאיר אזור שכמעט לא נסחר. זה הקצה העליון של הפער. כשהמחיר יורד חזרה לאזור, מחפשים שם לונג.' },
  { key: 'fLb', layer: 'fvg', title: 'FVG תומך ▁', color: '#10b981', style: 2, width: 1, pair: 'fLt',
    what: 'הקצה התחתון של הפער השורי. סגירה מתחתיו מבטלת את הפער.' },
  { key: 'fSb', layer: 'fvg', title: 'FVG מתנגד', color: '#ef4444', style: 0, width: 2, pair: 'fSt',
    what: 'פער מחיר דובי: המחיר קפץ למטה והשאיר אזור שכמעט לא נסחר. זה הקצה התחתון של הפער. כשהמחיר עולה חזרה לאזור, מחפשים שם שורט.' },
  { key: 'fSt', layer: 'fvg', title: 'FVG מתנגד ▔', color: '#ef4444', style: 2, width: 1, pair: 'fSb',
    what: 'הקצה העליון של הפער הדובי. סגירה מעליו מבטלת את הפער.' },
  // ── iFVG ──
  { key: 'iLt', layer: 'ifvg', title: 'iFVG תומך', color: '#14b8a6', style: 0, width: 1, pair: 'iLb',
    what: 'פער דובי שהמחיר פרץ דרכו למעלה, ולכן התהפך לתמיכה. זה הקצה העליון. חזרה לאזור מלמעלה = ריטסט ללונג.' },
  { key: 'iLb', layer: 'ifvg', title: 'iFVG תומך ▁', color: '#14b8a6', style: 2, width: 1, pair: 'iLt',
    what: 'הקצה התחתון של ה-iFVG התומך.' },
  { key: 'iSb', layer: 'ifvg', title: 'iFVG מתנגד', color: '#f97316', style: 0, width: 1, pair: 'iSt',
    what: 'פער שורי שהמחיר שבר דרכו למטה, ולכן התהפך להתנגדות. זה הקצה התחתון. חזרה לאזור מלמטה = ריטסט לשורט.' },
  { key: 'iSt', layer: 'ifvg', title: 'iFVG מתנגד ▔', color: '#f97316', style: 2, width: 1, pair: 'iSb',
    what: 'הקצה העליון של ה-iFVG המתנגד.' },
  // ── אורדר בלוק ──
  { key: 'obL', layer: 'ob', title: 'אורדר בלוק לונג', color: '#22c55e', style: 0, width: 2, pair: 'obLs',
    what: 'אורדר בלוק שורי: הנר האדום האחרון לפני תנועה חזקה למעלה. הקו הוא נקודת הכניסה, 21% לתוך האזור.' },
  { key: 'obLs', layer: 'ob', title: 'OB לונג · קצה', color: '#22c55e', style: 2, width: 1, pair: 'obL',
    what: 'הקצה התחתון של האורדר בלוק השורי. מתחתיו האזור נשבר, ושם יושב הסטופ.' },
  { key: 'obS', layer: 'ob', title: 'אורדר בלוק שורט', color: '#f43f5e', style: 0, width: 2, pair: 'obSs',
    what: 'אורדר בלוק דובי: הנר הירוק האחרון לפני תנועה חזקה למטה. הקו הוא נקודת הכניסה, 21% לתוך האזור.' },
  { key: 'obSs', layer: 'ob', title: 'OB שורט · קצה', color: '#f43f5e', style: 2, width: 1, pair: 'obS',
    what: 'הקצה העליון של האורדר בלוק הדובי. מעליו האזור נשבר, ושם יושב הסטופ.' },
  // ── מבנה ──
  { key: 'pH', layer: 'structure', title: 'שיא פיבוט', color: '#818cf8', style: 1, width: 1,
    what: 'השיא המשמעותי האחרון (5 נרות נמוכים ממנו מכל צד). סגירה מעליו = שבירת מבנה למעלה (BOS או CHoCH).' },
  { key: 'pL', layer: 'structure', title: 'שפל פיבוט', color: '#818cf8', style: 1, width: 1,
    what: 'השפל המשמעותי האחרון (5 נרות גבוהים ממנו מכל צד). סגירה מתחתיו = שבירת מבנה למטה (BOS או CHoCH).' },
  // ── טווח ──
  { key: 'rHi', layer: 'range', title: 'קריק', color: '#3b82f6', style: 0, width: 1,
    what: 'התקרה של טווח הדשדוש הנוכחי (בוויקוף: קריק). סגירה מעליה = קפיצה מעל הקריק, סימן כוח.' },
  { key: 'rLo', layer: 'range', title: 'אייס', color: '#3b82f6', style: 0, width: 1,
    what: 'התחתית של טווח הדשדוש הנוכחי (בוויקוף: אייס). סגירה מתחתיה = נפילה דרך הקרח, סימן חולשה.' },
  { key: 'jac', layer: 'range', title: 'קו הקפיצה', color: '#60a5fa', style: 2, width: 1,
    what: 'הרמה שהמחיר כבר קפץ מעליה (קריק) או שבר מתחתיה (אייס). כשהמחיר חוזר לבדוק אותה זה הריטסט, ושם מחפשים כניסה.' },
  // ── נזילות ──
  { key: 'plH', layer: 'liquidity', title: 'נזילות ▲', color: '#f59e0b', style: 1, width: 1,
    what: 'בריכת נזילות עליונה: שני שיאים כמעט באותו מחיר (הקו הוא הממוצע שלהם). מעליהם יושבים סטופים, והמחיר נוטה להגיע לאסוף אותם.' },
  { key: 'plL', layer: 'liquidity', title: 'נזילות ▼', color: '#f59e0b', style: 1, width: 1,
    what: 'בריכת נזילות תחתונה: שני שפלים כמעט באותו מחיר (הקו הוא הממוצע שלהם). מתחתיהם יושבים סטופים, והמחיר נוטה להגיע לאסוף אותם.' },
  // ── SMT ──
  { key: 'hi20', layer: 'smt', title: 'שיא 20 נרות', color: '#ec4899', style: 1, width: 1,
    what: 'השיא של 20 הנרות האחרונים. אם המחיר עושה שיא חדש והנכס הצמוד (S&P או את׳ריום) לא, זה SMT דובי.' },
  { key: 'lo20', layer: 'smt', title: 'שפל 20 נרות', color: '#ec4899', style: 1, width: 1,
    what: 'השפל של 20 הנרות האחרונים. אם המחיר עושה שפל חדש והנכס הצמוד (S&P או את׳ריום) לא, זה SMT שורי.' },
  // ── סשנים ──
  { key: 'sesH', layer: 'session', title: 'שיא סשן קודם', color: '#94a3b8', style: 2, width: 1, what: 'המחיר הגבוה ביותר של הסשן הקודם. רמה שהמחיר נוטה לבדוק או לקחת.' },
  { key: 'sesL', layer: 'session', title: 'שפל סשן קודם', color: '#94a3b8', style: 2, width: 1, what: 'המחיר הנמוך ביותר של הסשן הקודם. רמה שהמחיר נוטה לבדוק או לקחת.' },
  { key: 'asH', layer: 'session', title: 'שיא אסיה', color: '#64748b', style: 2, width: 1, what: 'הגבוה של סשן אסיה. לונדון וניו יורק נוטות לקחת אחד מקצוות אסיה.' },
  { key: 'asL', layer: 'session', title: 'שפל אסיה', color: '#64748b', style: 2, width: 1, what: 'הנמוך של סשן אסיה. לונדון וניו יורק נוטות לקחת אחד מקצוות אסיה.' },
  // ── טווח הפתיחה ──
  { key: 'orH', layer: 'po3', title: 'שיא טווח הפתיחה', color: '#0ea5e9', style: 1, width: 1, what: 'הגבוה של 15 הדקות הראשונות אחרי פתיחת ניו יורק. סגירה מעליו = פריצת טווח הפתיחה למעלה.' },
  { key: 'orL', layer: 'po3', title: 'שפל טווח הפתיחה', color: '#0ea5e9', style: 1, width: 1, what: 'הנמוך של 15 הדקות הראשונות אחרי פתיחת ניו יורק. סגירה מתחתיו = פריצת טווח הפתיחה למטה.' },
  // ── מסגרות גבוהות ──
  { key: 'dH', layer: 'htf', title: 'שיא יומי', color: '#e2e8f0', style: 0, width: 1, what: 'הגבוה של יום המסחר הקודם.' },
  { key: 'dL', layer: 'htf', title: 'שפל יומי', color: '#e2e8f0', style: 0, width: 1, what: 'הנמוך של יום המסחר הקודם.' },
  { key: 'h4H', layer: 'htf', title: 'שיא 4H', color: '#cbd5e1', style: 1, width: 1, what: 'הגבוה של נר 4 השעות הקודם.' },
  { key: 'h4L', layer: 'htf', title: 'שפל 4H', color: '#cbd5e1', style: 1, width: 1, what: 'הנמוך של נר 4 השעות הקודם.' },
  { key: 'wH', layer: 'htf', title: 'שיא שבועי', color: '#f8fafc', style: 0, width: 1, what: 'הגבוה של השבוע הקודם.' },
  { key: 'wL', layer: 'htf', title: 'שפל שבועי', color: '#f8fafc', style: 0, width: 1, what: 'הנמוך של השבוע הקודם.' },
  // ── ווליום ──
  { key: 'poc', layer: 'vp', title: 'POC', color: '#facc15', style: 0, width: 1, what: 'המחיר שבו נסחר הכי הרבה ווליום היום. מתנהג כמו מגנט: המחיר נוטה לחזור אליו.' },
  { key: 'vah', layer: 'vp', title: 'VAH · תקרת האזור ההוגן', color: '#a16207', style: 2, width: 1, pair: 'val', what: 'התקרה של האזור ההוגן של היום (האזור שבו נסחר 70% מהווליום). סגירת נר דקה מעליה = יציאה מהאזור ההוגן למעלה, תנאי ללונג ברמזור.' },
  { key: 'val', layer: 'vp', title: 'VAL · תחתית האזור ההוגן', color: '#a16207', style: 2, width: 1, pair: 'vah', what: 'התחתית של האזור ההוגן של היום (האזור שבו נסחר 70% מהווליום). סגירת נר דקה מתחתיה = יציאה מהאזור ההוגן למטה, תנאי לשורט ברמזור.' },
  // ── AVWAP ──
  { key: 'avD', layer: 'avwap', title: 'AVWAP יומי', color: '#38bdf8', style: 1, width: 1, what: 'המחיר הממוצע של היום, משוקלל לפי ווליום. מעליו הקונים של היום ברווח, מתחתיו בהפסד.' },
  { key: 'avW', layer: 'avwap', title: 'AVWAP שבועי', color: '#0284c7', style: 1, width: 1, what: 'המחיר הממוצע מתחילת השבוע, משוקלל לפי ווליום.' },
  { key: 'avT', layer: 'avwap', title: 'AVWAP מפתיחת היום האמיתית', color: '#7dd3fc', style: 2, width: 1, what: 'המחיר הממוצע מאז "פתיחת היום האמיתית" של תורת הרבעים (חצות בניו יורק), משוקלל לפי ווליום.' },
  // ── כנף ──
  { key: 'wgU', layer: 'wing', title: 'קו הכנף ▲', color: '#c084fc', style: 1, width: 1, what: 'קו המגמה העולה שמחבר את שני השפלים האחרונים, בערכו עכשיו. סגירה מתחתיו = שבירת כנף לשורט.' },
  { key: 'wgD', layer: 'wing', title: 'קו הכנף ▼', color: '#c084fc', style: 1, width: 1, what: 'קו המגמה היורדת שמחבר את שני השיאים האחרונים, בערכו עכשיו. סגירה מעליו = שבירת כנף ללונג.' },
  // ── EMA ──
  { key: 'ema', layer: 'ema', title: 'EMA 12', color: '#fb923c', style: 0, width: 1, what: 'ממוצע נע של 12 נרות, בערכו עכשיו. המחיר מעליו וה-EMA עולה = כיוון לונג ברמזור. מתחתיו ויורד = כיוון שורט.' },
  // ── בולינגר (רק כשאין לנכס ציור בולינגר מלא) ──
  { key: 'bbU', layer: 'bollinger', title: 'בולינגר עליון', color: '#a855f7', style: 1, width: 1, what: 'הרצועה העליונה של בולינגר (20 נרות, 2 סטיות תקן), בערכה עכשיו.' },
  { key: 'bbL', layer: 'bollinger', title: 'בולינגר תחתון', color: '#a855f7', style: 1, width: 1, what: 'הרצועה התחתונה של בולינגר (20 נרות, 2 סטיות תקן), בערכה עכשיו.' },
]
export const LEVEL_LAYERS: LayerId[] = [...new Set(LEVEL_DEFS.map(d => d.layer))]
