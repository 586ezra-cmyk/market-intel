'use client'

import { useState, useMemo } from 'react'

interface KBEntry {
  id: string
  titleHe: string
  titleEn: string
  abbr?: string
  category: string
  summary: string
  explanation: string
  assets?: string
  timeframes?: string
  requiredConfirmations?: string
  commonMistakes?: string
  relatedTopics?: string[]
}

const KB_DATA: KBEntry[] = [
  {
    id: 'bos', titleHe: 'שבירת מבנה', titleEn: 'Break of Structure', abbr: 'BOS',
    category: 'מבנה שוק',
    summary: 'סגירת נר מעל שיא קודם (שוק עולה) או מתחת לשפל קודם (שוק יורד).',
    explanation: `שבירת מבנה (BOS) מתרחשת כאשר מחיר סוגר מעל ה-Higher High הקודם בשוק עולה,
או מתחת ל-Lower Low הקודם בשוק יורד. זוהי אישור להמשך המגמה הקיימת.
BOS שורטיש: מחיר שובר מתחת לשפל קודם — המגמה ממשיכה מטה.
BOS לונגיש: מחיר שובר מעל לשיא קודם — המגמה ממשיכה למעלה.
חשוב: BOS חייב להיות עם סגירת נר, לא רק wick!`,
    assets: 'כל הנכסים',
    timeframes: 'כל טווחי הזמן',
    requiredConfirmations: 'לפחות נר אחד סגור מעבר לרמה',
    commonMistakes: 'לספור wick בלבד בלי סגירת נר. לא לחכות לאישור.',
    relatedTopics: ['choch', 'structure', 'hhlh'],
  },
  {
    id: 'choch', titleHe: 'שינוי כיוון', titleEn: 'Change of Character', abbr: 'CHoCH',
    category: 'מבנה שוק',
    summary: 'אות ראשון להיפוך מגמה — שבירה בכיוון הנגדי לטרנד הקיים.',
    explanation: `CHoCH מתרחש כאשר מחיר שובר את הרמה בכיוון הנגדי לטרנד הנוכחי.
בשוק עולה: CHoCH = שבירה מתחת ל-Higher Low האחרון → אות להיפוך ירידה.
בשוק יורד: CHoCH = שבירה מעל ל-Lower High האחרון → אות להיפוך עלייה.
ההבדל מ-BOS: BOS = המשך מגמה. CHoCH = היפוך מגמה אפשרי.
מומלץ לחכות לאישור נוסף (FVG, Liquidity Sweep) לפני כניסה.`,
    assets: 'כל הנכסים',
    timeframes: 'כל טווחי הזמן',
    requiredConfirmations: 'FVG + Liquidity Sweep לאישור',
    commonMistakes: 'להיכנס מיד ב-CHoCH ללא אישורים נוספים.',
    relatedTopics: ['bos', 'fvg', 'liquidity-sweep'],
  },
  {
    id: 'fvg', titleHe: 'פער ערך הוגן', titleEn: 'Fair Value Gap', abbr: 'FVG',
    category: 'ICT',
    summary: 'פער בין הנר השלישי לנר הראשון ברצף של 3 נרות — אזור שמחיר נוטה לחזור אליו.',
    explanation: `FVG נוצר כאשר 3 נרות עוקבים משאירים פער (gap):
FVG שורטיש: ה-High של נר 3 נמוך מה-Low של נר 1 → פער שמחיר ירצה "למלא".
FVG לונגיש: ה-Low של נר 3 גבוה מה-High של נר 1 → פער שמחיר ירצה "למלא".
שימוש: TP1 = מילוי FVG קרוב. כניסה: ריטסט ל-FVG בכיוון האיתות.
FVG נמחק מהמערכת כאשר מחיר סוגר בתוכו (is_active = false).`,
    assets: 'כל הנכסים',
    timeframes: 'כל טווחי הזמן',
    requiredConfirmations: 'BOS/CHoCH + Kill Zone לאישור כניסה',
    commonMistakes: 'כניסה ל-FVG ללא הקשר מבנה. לכנס לכל FVG ללא סינון.',
    relatedTopics: ['bos', 'choch', 'killzone', 'range'],
  },
  {
    id: 'liquidity-sweep', titleHe: 'שאיבת נזילות', titleEn: 'Liquidity Sweep',
    abbr: undefined,
    category: 'נזילות',
    summary: 'מחיר עובר מעל/מתחת לרמת נזילות (Equal Highs/Lows) וסוגר חזרה — מלכודת לקטנים.',
    explanation: `שאיבת נזילות היא כאשר מחיר "שואב" את הסטופים שנמצאים מעבר לרמה,
ואז חוזר בכיוון ההפוך. זהו אחד האותות החזקים ביותר במסחר ICT.
Bullish Sweep: מחיר שוקע מתחת ל-Equal Lows או Swing Low → סוגר מעלה → לונג.
Bearish Sweep: מחיר עולה מעל ל-Equal Highs או Swing High → סוגר מטה → שורט.
חשוב: הסגירה צריכה להיות ברורה חזרה לתוך הטווח, לא רק tick.`,
    assets: 'כל הנכסים',
    timeframes: 'כל טווחי הזמן',
    requiredConfirmations: 'CHoCH לאחר הסוויפ + FVG',
    commonMistakes: 'להיכנס לפני שהסגירה חוזרת. לא לחכות לאישור מבנה.',
    relatedTopics: ['choch', 'fvg', 'equal-hl'],
  },
  {
    id: 'smt', titleHe: 'דיברגנס בין-שוקי', titleEn: 'Smart Money Tool', abbr: 'SMT',
    category: 'SMT/iSMT',
    summary: 'כשנכס A עושה High חדש אבל נכס B מתואם לא מאשר — אות חולשה/כוח.',
    explanation: `SMT בודק קורלציה בין שני נכסים מתואמים (BTC↔ETH, NQ↔ES).
Bearish SMT: BTC עושה Higher High חדש, ETH לא מאשר → אות שורט.
Bullish SMT: BTC עושה Lower Low חדש, ETH לא מאשר → אות לונג.
זוגות: BTC↔ETH (קריפטו), NQ↔ES (אינדקסים).
הנכס שזזz פחות = מומלץ לכניסה (יותר פוטנציאל).`,
    assets: 'BTC/ETH, NQ/ES',
    timeframes: 'כל טווחי הזמן',
    requiredConfirmations: 'FVG + Kill Zone',
    commonMistakes: 'להשוות נכסים שאינם מתואמים. לא לבדוק את ה-TF הנמוך יותר.',
    relatedTopics: ['ismt', 'killzone', 'fvg'],
  },
  {
    id: 'ismt', titleHe: 'דיברגנס בין-שוקי מהיר', titleEn: 'Intermarket SMT', abbr: 'iSMT',
    category: 'SMT/iSMT',
    summary: 'בדיוק 2 נרות עוקבים — נכס A עושה sweep ונסגר חזרה, נכס B לא מאשר.',
    explanation: `iSMT הוא גרסה מהירה של SMT — עובד על בדיוק 2 נרות עוקבים בלבד.
Bearish iSMT: נר 1 של נכס A עושה High. נר 2: A עולה מעל High של נר 1 ואז סוגר מתחתיו (sweep). נכס B: לא מאשר את ה-High החדש או סוגר גם הוא מטה. → דיברגנס → שורט.
Bullish iSMT: ההפך עם Lows.
TF תקינים: 5m, 15m, 30m, 1h בלבד.
זוגות: BTC↔ETH, NQ↔ES.
כניסה מדויקת: חכה ל-FVG ב-TF נמוך יותר בכיוון האיתות.`,
    assets: 'BTC/ETH, NQ/ES',
    timeframes: '5m, 15m, 30m, 1h',
    requiredConfirmations: 'בדיוק 2 נרות עוקבים + FVG ב-TF נמוך',
    commonMistakes: 'להשתמש ביותר מ-2 נרות. TF לא מתאים.',
    relatedTopics: ['smt', 'fvg', 'killzone'],
  },
  {
    id: 'killzone', titleHe: 'אזור Kill Zone', titleEn: 'Kill Zone',
    abbr: 'KZ',
    category: 'ICT',
    summary: 'שעות הפתיחה של סשנים — התנודתיות הגבוהה ביותר ואיכות האיתותים הטובה ביותר.',
    explanation: `Kill Zones הן שעות שבהן "הכסף הגדול" פעיל ומניע שווקים.
לונדון Kill Zone: 07:00–11:00 UTC (10:00–14:00 שעון ישראל).
ניו יורק Kill Zone: 13:00–16:00 UTC (16:00–19:00 שעון ישראל).
כלל ברזל: התראות בתוך Kill Zone מקבלות +0.3 בדירוג.
סיגנלים בתוך KZ = איכותיים הרבה יותר מסיגנלים מחוץ לה.
לא מכניסים פוזיציות חשובות מחוץ ל-Kill Zone ללא אישורים חזקים נוספים.`,
    assets: 'כל הנכסים',
    timeframes: 'רלוונטי לכל TF',
    requiredConfirmations: 'לא נדרש — זה הקשר, לא אות',
    commonMistakes: 'להיכנס לפוזיציות חשובות מחוץ ל-Kill Zone.',
    relatedTopics: ['smt', 'fvg', 'bos'],
  },
  {
    id: 'range', titleHe: 'טווח עסקאות', titleEn: 'Dealing Range',
    abbr: undefined,
    category: 'ICT',
    summary: 'הטווח הנוכחי שבו המחיר נסחר — מבוסס Asian Session (TF נמוך) או Swing (TF גבוה).',
    explanation: `Dealing Range מחלק את הטווח ל-3 אזורים:
Premium (מעל midpoint) — אזור שמחיר נוטה למכור ממנו.
Discount (מתחת לmidpoint) — אזור שמחיר נוטה לקנות ממנו.
Midpoint — קו ה-50% המרכזי.
כלל: מחפשים לונג מ-Discount, שורט מ-Premium.
TF נמוך (1m-15m): טווח = High/Low של Asian Session (20:00-00:00 UTC).
TF גבוה (30m+): טווח = Swing High/Low עם lookback 5/5.`,
    assets: 'כל הנכסים',
    timeframes: 'כל טווחי הזמן',
    requiredConfirmations: 'אין — זה הקשר מחירי',
    commonMistakes: 'לקנות ב-Premium, למכור ב-Discount.',
    relatedTopics: ['fvg', 'liquidity-sweep', 'killzone'],
  },
  {
    id: 'wyckoff', titleHe: 'מחזור Wyckoff', titleEn: 'Wyckoff Method',
    abbr: undefined,
    category: 'Wyckoff',
    summary: 'ניתוח מחזורי שוק: צבירה, עלייה, חלוקה, ירידה — על פי ריצ׳רד וויקוף.',
    explanation: `שיטת Wyckoff מחלקת את מחזור השוק ל-4 פאזות:
1. Accumulation (צבירה) — "הכסף הגדול" קונה בשקט. מזוהה על ידי:
   Phase A: PS → SC → AR → ST. Phase C: Spring. Phase D: LPS → SOS.
2. Markup (עלייה) — השוק עולה לאחר הצבירה.
3. Distribution (חלוקה) — "הכסף הגדול" מוכר בשקט. מזוהה על ידי:
   Phase A: PSY → BC → AR → ST. Phase C: UTAD/Upthrust. Phase D: LPSY → SOW.
4. Markdown (ירידה) — השוק יורד לאחר החלוקה.
Spring: שפל מזויף שנדחה כלפי מעלה בווליום נמוך → כניסת לונג.
Upthrust: שיא מזויף שנדחה כלפי מטה בווליום נמוך → כניסת שורט.`,
    assets: 'כריפטו, פיוצ׳רס CME',
    timeframes: 'כל טווחי הזמן',
    requiredConfirmations: 'Volume validation + CHoCH לאחר Spring/Upthrust',
    commonMistakes: 'לזהות Spring ללא Volume נמוך. לא לחכות לאישור Test after Spring.',
    relatedTopics: ['spring', 'upthrust', 'volume'],
  },
  {
    id: 'order-block', titleHe: 'בלוק הזמנות', titleEn: 'Order Block', abbr: 'OB',
    category: 'ICT',
    summary: 'הנר האחרון לפני תנועה חדה (displacement) — אזור שמחיר נוטה לחזור אליו.',
    explanation: `Order Block הוא הנר (או קבוצת נרות) האחרונים לפני displacement חזק.
Bullish OB: הנר האחרון שירד לפני עלייה חדה. מחיר חוזר אליו = קנייה.
Bearish OB: הנר האחרון שעלה לפני ירידה חדה. מחיר חוזר אליו = מכירה.
ה-OB "אוכל" את הנרות שמאחוריו כאשר מחיר מגיע אליו.
שימוש: אזור כניסה מדויק לאחר CHoCH + FVG.`,
    assets: 'כל הנכסים',
    timeframes: 'כל טווחי הזמן',
    requiredConfirmations: 'CHoCH + Liquidity Sweep + Kill Zone',
    commonMistakes: 'לזהות כל נר כ-OB. לא לוודא שיש displacement אחריו.',
    relatedTopics: ['fvg', 'choch', 'breaker'],
  },
  {
    id: 'breaker', titleHe: 'בלוק שבור', titleEn: 'Breaker Block',
    abbr: undefined,
    category: 'ICT',
    summary: 'Order Block שנשבר — הופך לאזור פעיל בכיוון ההפוך.',
    explanation: `Breaker Block = Order Block שמחיר עבר דרכו ולא עמד בו.
כאשר Bullish OB נשבר (מחיר ירד מתחתיו ולא עלה) → הופך ל-Bearish Breaker.
כאשר Bearish OB נשבר (מחיר עלה מעליו ולא ירד) → הופך ל-Bullish Breaker.
שימוש: ריטסט לבריאקר בלוק אחרי שבירה = כניסה מדויקת.`,
    assets: 'כל הנכסים',
    timeframes: 'כל טווחי הזמן',
    requiredConfirmations: 'CHoCH + FVG בריטסט',
    commonMistakes: 'לא לזהות שה-OB נשבר ולנסות לכנס ממנו כ-OB.',
    relatedTopics: ['order-block', 'fvg', 'choch'],
  },
  {
    id: 'pdh-pdl', titleHe: 'שיא/שפל יומי קודם', titleEn: 'Previous Day High / Low', abbr: 'PDH/PDL',
    category: 'נזילות',
    summary: 'High/Low של יום המסחר הקודם — רמות נזילות חיצוניות חזקות.',
    explanation: `PDH (Previous Day High) ו-PDL (Previous Day Low) הם רמות מפתח.
מסחר יומי/תוך-יומי רב משתתפים מציב סטופים מעל PDH ומתחת ל-PDL.
שאיבה של PDH עם CHoCH = כניסת שורט.
שאיבה של PDL עם CHoCH = כניסת לונג.
בדרך כלל = TP2 (נזילות חיצונית ראשונה).`,
    assets: 'כל הנכסים',
    timeframes: '15m, 30m, 1h, 4h',
    requiredConfirmations: 'Liquidity Sweep + CHoCH',
    commonMistakes: 'לא לעדכן PDH/PDL בכל יום חדש.',
    relatedTopics: ['liquidity-sweep', 'pwh-pwl'],
  },
  {
    id: 'pwh-pwl', titleHe: 'שיא/שפל שבועי קודם', titleEn: 'Previous Week High / Low', abbr: 'PWH/PWL',
    category: 'נזילות',
    summary: 'High/Low של השבוע הקודם — רמות נזילות חיצוניות גדולות עבור TF גבוה.',
    explanation: `PWH/PWL חשובים מאוד למסחר סווינג ויומי.
מסחר ב-4h, 1D: PDH/PDL = TP1. PWH/PWL = TP2 או TP3.
שאיפה של PWH עם מבנה שורטיש = יעד שורט חזק.
כאשר מחיר שואב PWL ועושה CHoCH = לונג לעבר PWH.`,
    assets: 'כל הנכסים',
    timeframes: '4h, 1D, 1W',
    requiredConfirmations: 'Sweep + CHoCH',
    commonMistakes: 'לשכוח לעדכן בפתיחת שבוע חדש.',
    relatedTopics: ['pdh-pdl', 'liquidity-sweep'],
  },
  {
    id: 'po3', titleHe: 'כוח שלוש', titleEn: 'Power of 3', abbr: 'Po3',
    category: 'ICT',
    summary: 'מחזור אינטרה-יומי: צבירה → מניפולציה (Judas Swing) → חלוקה.',
    explanation: `Power of 3 (Po3) מתאר את מחזור המניפולציה היומי:
1. Accumulation: מחיר נסחר בטווח צר בפתיחת סשן.
2. Manipulation (Judas Swing): תנועה מזויפת בכיוון ההפוך — לשאוב סטופים.
3. Distribution: התנועה האמיתית בכיוון הצפוי.
דוגמה: לונדון פותחת → מחיר יורד קצת (Judas Swing ← שורטים קצרי רוח נכנסים) → מחיר עולה בחזקה.
שימוש: לא לכנס בפתיחת סשן. לחכות לJudas Swing ואז לכנס בכיוון ההפוך.`,
    assets: 'כל הנכסים',
    timeframes: '5m, 15m, 30m (תוך-יומי)',
    requiredConfirmations: 'FVG + CHoCH לאחר Judas Swing',
    commonMistakes: 'ליפול לJudas Swing ולכנס בכיוון הלא נכון.',
    relatedTopics: ['killzone', 'fvg', 'opening-range'],
  },
  {
    id: 'vwap', titleHe: 'ממוצע משוקלל בנפח', titleEn: 'Volume Weighted Average Price', abbr: 'VWAP',
    category: 'מוסדיים',
    summary: 'ממוצע מחיר יומי משוקלל לפי נפח — רמת ייחוס מוסדית מרכזית.',
    explanation: `VWAP הוא הממוצע המשוקלל בנפח לאורך יום המסחר.
מוסדיים משתמשים בו כרמת ייחוס: קנייה מתחת ל-VWAP = "במחיר טוב".
מחיר מעל VWAP = Premium מוסדי. מחיר מתחת = Discount מוסדי.
מהווה תמיכה/התנגדות דינמית — ריטסט ל-VWAP + BOS = כניסה.`,
    assets: 'פיוצ׳רס, קריפטו',
    timeframes: 'תוך-יומי (1m–1h)',
    requiredConfirmations: 'BOS + Kill Zone',
    commonMistakes: 'להשתמש ב-VWAP כיחיד ללא הקשר מבנה.',
    relatedTopics: ['range', 'killzone'],
  },
]

const CATEGORIES = ['הכל', 'מבנה שוק', 'נזילות', 'ICT', 'Wyckoff', 'SMT/iSMT', 'מוסדיים']

export default function TabKnowledgeBase() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('הכל')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return KB_DATA.filter(entry => {
      const matchCat = category === 'הכל' || entry.category === category
      const matchSearch = !q || [entry.titleHe, entry.titleEn, entry.abbr ?? '', entry.summary]
        .some(s => s.toLowerCase().includes(q))
      return matchCat && matchSearch
    })
  }, [search, category])

  const selected = KB_DATA.find(e => e.id === selectedId)

  return (
    <div className="p-4 flex gap-4 h-full overflow-hidden">
      {/* Left: list */}
      <div className="w-80 shrink-0 flex flex-col gap-3">
        <h2 className="text-lg font-bold">📚 בסיס ידע</h2>

        <input
          className="input"
          placeholder="חיפוש: BOS, שבירת מבנה, SMT..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                category === c ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {filtered.map(entry => (
            <button
              key={entry.id}
              onClick={() => setSelectedId(entry.id)}
              className={`w-full text-right p-2 rounded transition-colors ${
                selectedId === entry.id ? 'bg-brand-900/40 border border-brand-600/40' : 'hover:bg-surface-raised'
              }`}
            >
              <div className="font-medium text-sm">
                {entry.titleHe}
                {entry.abbr && <span className="text-slate-400 text-xs mr-1">({entry.abbr})</span>}
              </div>
              <div className="text-xs text-slate-500">{entry.category}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <div className="text-4xl mb-3">📖</div>
            <div>בחר נושא לקריאה</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Title */}
            <div>
              <h1 className="text-2xl font-bold">{selected.titleHe}</h1>
              <div className="text-slate-400 text-sm">{selected.titleEn} {selected.abbr && `· ${selected.abbr}`}</div>
              <span className="inline-block mt-1 px-2 py-0.5 bg-surface rounded text-xs text-slate-400">{selected.category}</span>
            </div>

            {/* Summary */}
            <div className="card border-brand-600/20">
              <div className="text-sm font-medium text-brand-400 mb-1">סיכום</div>
              <p className="text-sm">{selected.summary}</p>
            </div>

            {/* Full explanation */}
            <div className="card">
              <div className="text-sm font-medium text-slate-300 mb-2">הסבר מפורט</div>
              <p className="text-sm leading-relaxed whitespace-pre-line text-slate-200">
                {selected.explanation}
              </p>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selected.assets && (
                <div className="card">
                  <div className="text-xs text-slate-400 mb-1">נכסים מתאימים</div>
                  <div className="text-sm">{selected.assets}</div>
                </div>
              )}
              {selected.timeframes && (
                <div className="card">
                  <div className="text-xs text-slate-400 mb-1">טווחי זמן מומלצים</div>
                  <div className="text-sm">{selected.timeframes}</div>
                </div>
              )}
              {selected.requiredConfirmations && (
                <div className="card">
                  <div className="text-xs text-slate-400 mb-1">אישורים נדרשים</div>
                  <div className="text-sm">{selected.requiredConfirmations}</div>
                </div>
              )}
              {selected.commonMistakes && (
                <div className="card border-red-900/30">
                  <div className="text-xs text-red-400 mb-1">⚠️ שגיאות נפוצות</div>
                  <div className="text-sm">{selected.commonMistakes}</div>
                </div>
              )}
            </div>

            {/* Related */}
            {selected.relatedTopics && (
              <div>
                <div className="text-xs text-slate-400 mb-2">קשור ל:</div>
                <div className="flex flex-wrap gap-2">
                  {selected.relatedTopics.map(id => {
                    const rel = KB_DATA.find(e => e.id === id)
                    if (!rel) return null
                    return (
                      <button
                        key={id}
                        onClick={() => setSelectedId(id)}
                        className="px-3 py-1 bg-surface hover:bg-surface-raised rounded text-xs transition-colors"
                      >
                        {rel.titleHe} {rel.abbr && `(${rel.abbr})`}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
