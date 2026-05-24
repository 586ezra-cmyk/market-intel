'use client'

import { useState, useEffect, useCallback } from 'react'

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */
type Status = 'none' | 'learning' | 'mastered'

interface TopicProgress {
  status: Status
  rating: number
  notes: string
  lastStudied: number | null
}

interface TopicProgressMap {
  [topicId: string]: TopicProgress
}

/* ─────────────────────────────────────────────────────────────
   Topic data
───────────────────────────────────────────────────────────── */
interface Topic {
  id: string
  nameHe: string
  nameEn: string
  category: string
  explanation: string
}

const CATEGORIES = [
  { id: 'market-structure', label: '📊 מבנה שוק' },
  { id: 'value-zones',      label: '📦 אזורי ערך' },
  { id: 'liquidity',        label: '💧 נזילות' },
  { id: 'smt',              label: '⚡ SMT' },
  { id: 'wyckoff',          label: '🏛 Wyckoff' },
  { id: 'time-session',     label: '⏰ זמן וסשן' },
]

const TOPICS: Topic[] = [
  /* ── מבנה שוק ── */
  {
    id: 'bos',
    nameHe: 'שבירת מבנה',
    nameEn: 'BOS — Break of Structure',
    category: 'market-structure',
    explanation:
      'BOS הוא שבירת מבנה שוק בכיוון המגמה הקיימת. בשוק בוליש: מחיר שובר מעל ה-Swing High הקודם = BOS בוליש. בשוק בארישׁ: מחיר שובר מתחת ל-Swing Low הקודם = BOS בארישׁ. BOS מאשר שהמגמה ממשיכה. חפש כניסה לאחר BOS עם FVG.',
  },
  {
    id: 'choch',
    nameHe: 'שינוי אופי',
    nameEn: 'CHoCH — Change of Character',
    category: 'market-structure',
    explanation:
      'CHoCH הוא שינוי אופי — שבירת מבנה בכיוון ההפוך למגמה. זהו הסימן הראשון שהשוק עשוי להתהפך. בשוק בוליש: CHoCH = שבירה מתחת ל-Swing Low = אזהרה. לא להיכנס נגד CHoCH בלי אישורים נוספים.',
  },
  {
    id: 'double-top',
    nameHe: 'דאבל טופ',
    nameEn: 'Double Top',
    category: 'market-structure',
    explanation:
      'פסגה כפולה — שני שיאים ברמה דומה (הפרש < 0.1%). סימן היפוך בארישׁ. נדרש אישור: שבירה מתחת לגובה שבין שתי הפסגות (neckline). חזק יותר עם FVG בארישׁ מעל, Liquidity Sweep של הפסגות.',
  },
  {
    id: 'double-bottom',
    nameHe: 'דאבל בוטום',
    nameEn: 'Double Bottom',
    category: 'market-structure',
    explanation:
      'תחתית כפולה — שני שפלים ברמה דומה. סימן היפוך בוליש. אישור: שבירה מעל ה-neckline (גובה שבין שתי התחתיות). חזק יותר עם FVG בוליש מתחת, Spring של Wyckoff.',
  },

  /* ── אזורי ערך ── */
  {
    id: 'fvg',
    nameHe: 'פער ערך הוגן',
    nameEn: 'FVG — Fair Value Gap',
    category: 'value-zones',
    explanation:
      'FVG (Fair Value Gap) הוא פער בין שלושה נרות עוקבים — כאשר הנר האמצעי חזק מאוד ויוצר רווח בין הנר הראשון לשלישי שמחיר לא עבר בו. בוליש FVG: low של נר שלישי גבוה מ-high של נר ראשון. בארישׁ FVG: high של נר שלישי נמוך מ-low של נר ראשון. המוסדיים חוזרים למלא את הפערים הללו — זה נקודת הכניסה המדויקת. FVG פעיל = עדיין לא מולא. FVG ממולא = לא רלוונטי.',
  },
  {
    id: 'ifvg',
    nameHe: 'פער ערך הוגן הפוך',
    nameEn: 'iFVG — Inverse FVG',
    category: 'value-zones',
    explanation:
      'iFVG הוא FVG שמחיר כבר עבר דרכו — כלומר "נשבר". כשמחיר חוזר לאזור ה-FVG שכבר מולא ומגיע ממנו בכיוון הנגדי, האזור הופך ל-iFVG. זה כמו Breaker Block אבל ל-FVG. משמש כנקודת כניסה בריטסט.',
  },
  {
    id: 'order-block',
    nameHe: 'בלוק הזמנות',
    nameEn: 'Order Block',
    category: 'value-zones',
    explanation:
      'OB הוא הנר האחרון בכיוון הנגדי לפני displacement (תנועה חזקה). Bullish OB: הנר הדובי האחרון לפני עלייה חזקה. Bearish OB: הנר השורי האחרון לפני ירידה חזקה. מחיר חוזר לאזור ה-OB לכניסה. גבולות OB: High וLow של אותו נר.',
  },
  {
    id: 'breaker-block',
    nameHe: 'בלוק שבור',
    nameEn: 'Breaker Block',
    category: 'value-zones',
    explanation:
      'Breaker הוא OB שנשבר — מחיר חזר ל-OB ועבר דרכו. כשזה קורה, ה-OB "מתהפך": Bullish OB שנשבר הופך ל-Bearish Breaker (מכירה ברטסט). ולהפך. נחשב לכניסה חזקה כי המוסדיים לכדו שתי נזילויות.',
  },
  {
    id: 'vwap',
    nameHe: 'ממוצע מחיר משוקלל לפי נפח',
    nameEn: 'VWAP',
    category: 'value-zones',
    explanation:
      'Volume Weighted Average Price — ממוצע המחיר לפי נפח במהלך היום. רמה מוסדית מרכזית. מחיר מתחת ל-VWAP = Discount, מעל = Premium. מחיר שחוזר ל-VWAP = נקודת כניסה אפשרית.',
  },

  /* ── נזילות ── */
  {
    id: 'liquidity-sweep',
    nameHe: 'ניקוי נזילות',
    nameEn: 'Liquidity Sweep',
    category: 'liquidity',
    explanation:
      'Liquidity Sweep הוא ניקוי נזילות — מחיר עובר מעל Equal Highs או מתחת ל-Equal Lows, לוכד Stop Losses, ומיד חוזר. זהו הטריגר לכניסה הפוכה. ויק מעל EQH עם סגירה מתחתיו = Bearish Sweep → שורט.',
  },
  {
    id: 'dealing-range',
    nameHe: 'טווח עסקאות',
    nameEn: 'Dealing Range',
    category: 'liquidity',
    explanation:
      'טווח העסקאות הנוכחי — מוגדר על ידי Asian Session High/Low (בטווחי זמן נמוכים) או Swing High/Low (בטווחים גבוהים). חצי עליון = Premium (יקר, מכירה). חצי תחתון = Discount (זול, קנייה). קנה ב-Discount, מכור ב-Premium.',
  },
  {
    id: 'premium-discount',
    nameHe: 'פרמיום / דיסקאונט',
    nameEn: 'Premium / Discount',
    category: 'liquidity',
    explanation:
      'Premium = מחיר מעל 50% של הטווח. Discount = מחיר מתחת ל-50%. ICT: לעולם אל תקנה ב-Premium ואל תמכור ב-Discount. חכה שמחיר יגיע לאזור הנכון.',
  },

  /* ── SMT ── */
  {
    id: 'smt',
    nameHe: 'טכניקת כסף חכם',
    nameEn: 'SMT — Smart Money Technique',
    category: 'smt',
    explanation:
      'SMT הוא דיברגנס בין שני נכסים מתואמים. BTC ו-ETH אמורים לנוע יחד. אם BTC עושה High חדש אבל ETH לא — זהו SMT בארישׁ (BTC מוביל מזויף, מוסדיים מוכרים). ולהפך עם תחתיות. צוות 1: BTC↔ETH, צוות 2: NQ↔ES.',
  },
  {
    id: 'ismt',
    nameHe: 'SMT תוך-נרי',
    nameEn: 'iSMT — Intra-bar SMT',
    category: 'smt',
    explanation:
      'iSMT הוא SMT על 2 נרות עוקבים בלבד — גרסה מהירה ומדויקת יותר. נר א\' של BTC שובר High, נר ב\' לא מאשר (סוגר מתחת). באותו הזמן ETH לא עשה את אותה שבירה. זה iSMT בארישׁ. עובד על 5m, 15m, 30m, 1h בלבד.',
  },

  /* ── Wyckoff ── */
  {
    id: 'wyckoff-spring',
    nameHe: 'ספרינג',
    nameEn: 'Wyckoff Spring',
    category: 'wyckoff',
    explanation:
      'Spring הוא הפעולה האחרונה לפני עלייה בצבירה (Accumulation). מחיר שובר מתחת לתחתית הטווח עם נפח נמוך, אבל חוזר מעלה ונסגר בתוך הטווח. זהו המלכודת האחרונה לשורטיסטים. כניסה הטובה ביותר: Test After Spring (הנר שאחרי Spring שמאשר החזרה).',
  },
  {
    id: 'lps',
    nameHe: 'נקודת תמיכה אחרונה',
    nameEn: 'Wyckoff LPS — Last Point of Support',
    category: 'wyckoff',
    explanation:
      'LPS הוא נקודת התמיכה האחרונה לאחר SOS (Sign of Strength). מחיר פרץ מעל הטווח, חוזר לרטסט על נפח נמוך, ונעצר מעל אמצע הטווח. זו כניסת Phase D — הכניסה הכי בטוחה בצבירה.',
  },
  {
    id: 'utad',
    nameHe: 'עלייה לאחר חלוקה',
    nameEn: 'UTAD — Upthrust After Distribution',
    category: 'wyckoff',
    explanation:
      'UTAD הוא המקבילה של Spring בהפצה (Distribution). מחיר שובר מעל ראש הטווח עם נפח נמוך, אבל חוזר מטה ונסגר בתוך הטווח. מלכודת ללונגיסטים. Test of UTAD = הנר שאחריו שמאשר — הכניסה הטובה ביותר לשורט.',
  },
  {
    id: 'lpsy',
    nameHe: 'נקודת היצע אחרונה',
    nameEn: 'LPSY — Last Point of Supply',
    category: 'wyckoff',
    explanation:
      'LPSY הוא נקודת ההיצע האחרונה בהפצה Phase D. מחיר פרץ מתחת לטווח (SOW), חוזר לרטסט על נפח נמוך, נעצר מתחת לאמצע הטווח. כניסת שורט Phase D.',
  },

  /* ── זמן וסשן ── */
  {
    id: 'kill-zone',
    nameHe: 'אזור ההרג',
    nameEn: 'Kill Zone',
    category: 'time-session',
    explanation:
      'Kill Zone הם חלונות זמן שבהם מוסדיים הכי פעילים: London 07:00-11:00 UTC, NY 13:00-16:00 UTC, Asian 20:00-00:00 UTC. סטאפ שנוצר בתוך Kill Zone חזק פי כמה. אין Kill Zone = חכה.',
  },
  {
    id: 'po3',
    nameHe: 'כוח של 3 / תנועת פיתוי',
    nameEn: 'Po3 / Judas Swing',
    category: 'time-session',
    explanation:
      'Power of 3: שלושה שלבים בכל יום — Accumulation (צבירה), Manipulation (פיתוי), Distribution (חלוקה). Judas Swing: בתחילת London/NY, מחיר נע בכיוון מזויף כדי ללכוד כניסות מוקדמות, ואז מתהפך לכיוון האמיתי. אל תיכנס ב-15 הדקות הראשונות.',
  },
]

/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */
const STORAGE_KEY = 'learning_topics'

const defaultProgress = (): TopicProgress => ({
  status: 'none',
  rating: 0,
  notes: '',
  lastStudied: null,
})

function loadProgress(): TopicProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveProgress(map: TopicProgressMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

const STATUS_CYCLE: Status[] = ['none', 'learning', 'mastered']

const STATUS_LABEL: Record<Status, string> = {
  none: 'לא התחלתי',
  learning: 'לומד',
  mastered: 'שלטתי',
}

const STATUS_CLASS: Record<Status, string> = {
  none: 'bg-gray-600 text-gray-200',
  learning: 'bg-yellow-600 text-yellow-100',
  mastered: 'bg-green-600 text-green-100',
}

function formatDate(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

/* ─────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────── */

function StarRating({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star === value ? 0 : star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="text-lg leading-none transition-transform hover:scale-125 focus:outline-none"
          title={`${star} כוכבים`}
        >
          <span className={(hovered || value) >= star ? 'text-yellow-400' : 'text-gray-600'}>
            ★
          </span>
        </button>
      ))}
    </div>
  )
}

function TopicCard({
  topic,
  progress,
  onUpdate,
}: {
  topic: Topic
  progress: TopicProgress
  onUpdate: (id: string, partial: Partial<TopicProgress>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState(progress.notes)

  const cycleStatus = () => {
    const cur = STATUS_CYCLE.indexOf(progress.status)
    const next = STATUS_CYCLE[(cur + 1) % STATUS_CYCLE.length]
    onUpdate(topic.id, { status: next, lastStudied: Date.now() })
  }

  const saveNotes = () => {
    onUpdate(topic.id, { notes: notesValue })
    setEditingNotes(false)
  }

  return (
    <div
      className={`
        rounded-xl border transition-all duration-200
        ${
          progress.status === 'mastered'
            ? 'border-green-700 bg-green-950/30'
            : progress.status === 'learning'
            ? 'border-yellow-700 bg-yellow-950/20'
            : 'border-surface-border bg-surface-raised'
        }
      `}
    >
      {/* Card header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-text-primary text-base leading-snug">{topic.nameHe}</h3>
            <p className="text-xs text-text-muted mt-0.5 font-mono">{topic.nameEn}</p>
          </div>

          {/* Status badge */}
          <button
            onClick={cycleStatus}
            className={`
              shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer
              transition-all hover:opacity-80 active:scale-95
              ${STATUS_CLASS[progress.status]}
            `}
            title="לחץ לשינוי סטטוס"
          >
            {STATUS_LABEL[progress.status]}
          </button>
        </div>

        {/* Rating + date row */}
        <div className="flex items-center justify-between mt-3">
          <StarRating
            value={progress.rating}
            onChange={(v) => onUpdate(topic.id, { rating: v })}
          />
          <span className="text-xs text-text-muted">
            {progress.lastStudied ? `נלמד: ${formatDate(progress.lastStudied)}` : 'טרם נלמד'}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setExpanded((p) => !p)}
            className="flex-1 text-xs bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-800 rounded-lg py-1.5 px-3 transition-colors"
          >
            {expanded ? '🔼 סגור הסבר' : '📖 קרא הסבר'}
          </button>
          <button
            onClick={() => {
              setEditingNotes((p) => !p)
              setNotesValue(progress.notes)
            }}
            className="flex-1 text-xs bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 border border-purple-800 rounded-lg py-1.5 px-3 transition-colors"
          >
            📝 הערות שלי{progress.notes ? ' ✓' : ''}
          </button>
        </div>
      </div>

      {/* Explanation panel */}
      {expanded && (
        <div className="border-t border-surface-border mx-4 mb-4 pt-4">
          <div className="bg-blue-950/40 border border-blue-900 rounded-lg p-4">
            <p className="text-sm text-blue-100 leading-relaxed">{topic.explanation}</p>
          </div>
        </div>
      )}

      {/* Notes panel */}
      {editingNotes && (
        <div className="border-t border-surface-border mx-4 mb-4 pt-4">
          <p className="text-xs text-text-muted mb-2">הערות אישיות:</p>
          <textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={3}
            placeholder="כתוב כאן הערות, תובנות, דוגמאות..."
            className="w-full bg-surface-base border border-surface-border rounded-lg p-3 text-sm text-text-primary resize-none focus:outline-none focus:border-purple-600 placeholder-text-muted"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={saveNotes}
              className="text-xs bg-purple-700 hover:bg-purple-600 text-white rounded-lg px-4 py-1.5 transition-colors"
            >
              שמור
            </button>
            <button
              onClick={() => setEditingNotes(false)}
              className="text-xs bg-surface-raised hover:bg-surface-border text-text-muted rounded-lg px-4 py-1.5 transition-colors"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Saved notes preview */}
      {!editingNotes && progress.notes && (
        <div className="border-t border-surface-border mx-4 mb-4 pt-3">
          <p className="text-xs text-purple-400 font-medium mb-1">הערות שלי:</p>
          <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
            {progress.notes}
          </p>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────────── */
export default function TabLearning() {
  const [progress, setProgress] = useState<TopicProgressMap>({})
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [search, setSearch] = useState('')
  const [mounted, setMounted] = useState(false)

  // Load from localStorage after mount
  useEffect(() => {
    setProgress(loadProgress())
    setMounted(true)
  }, [])

  const getProgress = useCallback(
    (id: string): TopicProgress => progress[id] ?? defaultProgress(),
    [progress]
  )

  const updateProgress = useCallback(
    (id: string, partial: Partial<TopicProgress>) => {
      setProgress((prev) => {
        const updated = {
          ...prev,
          [id]: { ...(prev[id] ?? defaultProgress()), ...partial },
        }
        saveProgress(updated)
        return updated
      })
    },
    []
  )

  // ── derived stats ──
  const stats = {
    total: TOPICS.length,
    mastered: TOPICS.filter((t) => getProgress(t.id).status === 'mastered').length,
    learning: TOPICS.filter((t) => getProgress(t.id).status === 'learning').length,
    fullConfidence: TOPICS.filter((t) => getProgress(t.id).rating === 5).length,
  }

  // ── filtered topics ──
  const searchLower = search.toLowerCase()
  const filteredTopics = TOPICS.filter((t) => {
    const statusMatch =
      filter === 'all' || getProgress(t.id).status === filter
    const searchMatch =
      !search ||
      t.nameHe.includes(search) ||
      t.nameEn.toLowerCase().includes(searchLower)
    return statusMatch && searchMatch
  })

  if (!mounted) return null

  return (
    <div dir="rtl" className="h-full overflow-auto bg-surface-base">
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* ── Header ── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary mb-1">📚 דשבורד לימודים</h1>
          <p className="text-text-muted text-sm">עקוב אחר ההתקדמות שלך במושגי ICT ו-Wyckoff</p>
        </div>

        {/* ── Progress summary ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-surface-raised rounded-xl border border-surface-border p-4 text-center">
            <div className="text-3xl font-bold text-text-primary">{stats.mastered}</div>
            <div className="text-xs text-green-400 mt-1">✅ שלטתי</div>
          </div>
          <div className="bg-surface-raised rounded-xl border border-surface-border p-4 text-center">
            <div className="text-3xl font-bold text-text-primary">{stats.learning}</div>
            <div className="text-xs text-yellow-400 mt-1">📖 בתהליך</div>
          </div>
          <div className="bg-surface-raised rounded-xl border border-surface-border p-4 text-center">
            <div className="text-3xl font-bold text-text-primary">
              {stats.total - stats.mastered - stats.learning}
            </div>
            <div className="text-xs text-text-muted mt-1">⭕ לא התחלתי</div>
          </div>
          <div className="bg-surface-raised rounded-xl border border-surface-border p-4 text-center">
            <div className="text-3xl font-bold text-text-primary">{stats.fullConfidence}</div>
            <div className="text-xs text-yellow-300 mt-1">⭐⭐⭐⭐⭐ ביטחון מלא</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-text-muted mb-1.5">
            <span>התקדמות כוללת</span>
            <span>{stats.mastered}/{stats.total} נושאים נלמדו</span>
          </div>
          <div className="h-2 bg-surface-raised rounded-full overflow-hidden border border-surface-border">
            <div
              className="h-full bg-green-600 rounded-full transition-all duration-500"
              style={{ width: `${(stats.mastered / stats.total) * 100}%` }}
            />
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Status filter */}
          <div className="flex gap-1 bg-surface-raised border border-surface-border rounded-xl p-1">
            {([
              ['all', 'כל הנושאים'],
              ['none', 'לא התחלתי'],
              ['learning', 'לומד'],
              ['mastered', 'שלטתי'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`
                  text-xs px-3 py-1.5 rounded-lg font-medium transition-all
                  ${
                    filter === val
                      ? 'bg-blue-700 text-white'
                      : 'text-text-muted hover:text-text-primary hover:bg-surface-border'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 חיפוש לפי שם..."
              className="w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* ── Categories ── */}
        {CATEGORIES.map((cat) => {
          const catTopics = filteredTopics.filter((t) => t.category === cat.id)
          if (catTopics.length === 0) return null

          return (
            <section key={cat.id} className="mb-8">
              <h2 className="text-base font-bold text-text-primary mb-3 flex items-center gap-2">
                {cat.label}
                <span className="text-xs font-normal text-text-muted bg-surface-raised border border-surface-border rounded-full px-2 py-0.5">
                  {catTopics.length} נושאים
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {catTopics.map((topic) => (
                  <TopicCard
                    key={topic.id}
                    topic={topic}
                    progress={getProgress(topic.id)}
                    onUpdate={updateProgress}
                  />
                ))}
              </div>
            </section>
          )
        })}

        {filteredTopics.length === 0 && (
          <div className="text-center py-20 text-text-muted">
            <div className="text-4xl mb-3">🔍</div>
            <p>לא נמצאו נושאים תואמים</p>
          </div>
        )}
      </div>
    </div>
  )
}
