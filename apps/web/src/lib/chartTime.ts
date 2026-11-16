// ציר הזמן של הגרפים בשעון ישראל.
// lightweight-charts מציג את הזמן ב-UTC כברירת מחדל, ולכן הנר האחרון נראה "שעתיים אחורה" (שלוש בקיץ)
// מול השעון של המשתמש. כאן רק התצוגה משתנה — חותמות הזמן של הנרות נשארות כמו שהן.

const IL = 'Asia/Jerusalem'
const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: IL, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function ilParts(sec: number) {
  const p: Record<string, string> = {}
  for (const x of partsFmt.formatToParts(new Date(sec * 1000))) p[x.type] = x.value
  if (p.hour === '24') p.hour = '00'
  return p
}

function toSec(time: unknown): number | null {
  if (typeof time === 'number') return time
  if (typeof time === 'string') { const ms = Date.parse(time); return Number.isNaN(ms) ? null : Math.floor(ms / 1000) }
  if (time && typeof time === 'object' && 'year' in time) {
    const t = time as { year: number; month: number; day: number }
    return Math.floor(Date.UTC(t.year, t.month - 1, t.day) / 1000)
  }
  return null
}

/** תווית הצלב (crosshair): תאריך ושעה בשעון ישראל */
export function ilCrosshairLabel(time: unknown): string {
  const sec = toSec(time)
  if (sec == null) return ''
  const p = ilParts(sec)
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`
}

/**
 * תוויות הציר. הספרייה מחליטה איפה "מתחיל יום" לפי UTC, כלומר ב-02:00 או 03:00 בישראל.
 * בגרף תוך-יומי כותבים שם גם את השעה, כדי שהתווית לא תיראה כמו חצות.
 * סוגי התווית: 0 שנה · 1 חודש · 2 יום · 3 שעה · 4 שעה עם שניות.
 */
export function ilTickLabel(time: unknown, tickType: number, intraday: boolean): string | null {
  const sec = toSec(time)
  if (sec == null) return null
  const p = ilParts(sec)
  if (tickType === 4) return `${p.hour}:${p.minute}:${p.second}`
  if (tickType === 3) return `${p.hour}:${p.minute}`
  if (intraday) return `${p.day}/${p.month} ${p.hour}:${p.minute}`
  if (tickType === 0) return p.year
  if (tickType === 1) return `${p.month}/${p.year.slice(2)}`
  return `${p.day}/${p.month}`
}

/** אפשרויות מוכנות ל-createChart / applyOptions */
export function ilTimeOptions(isIntraday: () => boolean) {
  return {
    localization: { timeFormatter: (t: unknown) => ilCrosshairLabel(t) },
    tickMarkFormatter: (t: unknown, tickType: number) => ilTickLabel(t, tickType, isIntraday()),
  }
}
