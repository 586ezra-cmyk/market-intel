/**
 * ForexFactory economic calendar scraper.
 * Primary: scrape forexfactory.com
 * Fallback: Financial Modeling Prep (FMP) API
 */

import { sendTelegram } from './alertDispatcher'

export interface EconEvent {
  id: string
  title: string
  titleHe: string
  country: string
  currency: string
  impact: 'high' | 'medium' | 'low'
  date: string        // YYYY-MM-DD
  time: string        // HH:mm UTC
  timeIL: string      // HH:mm Israel
  forecast: string
  previous: string
  actual: string
  explanationHe: string
  bullishHe: string
  bearishHe: string
}

// Hebrew explanations for major economic events
const EVENT_TRANSLATIONS: Record<string, { titleHe: string; explanationHe: string; bullishHe: string; bearishHe: string }> = {
  'Non-Farm Employment Change': {
    titleHe: 'שינוי בתעסוקה חוץ-חקלאית (NFP)',
    explanationHe: 'מספר המשרות שנוצרו מחוץ לסקטור החקלאי בארה"ב — האינדיקטור החשוב ביותר לשוק העבודה.',
    bullishHe: 'NFP גבוה מהצפי = כלכלה חזקה = דולר מתחזק = לחץ על BTC/מניות.',
    bearishHe: 'NFP נמוך מהצפי = כלכלה מוחלשת = דולר נחלש = תמיכה ב-BTC/מניות.',
  },
  'CPI m/m': {
    titleHe: 'מדד המחירים לצרכן (CPI)',
    explanationHe: 'שינוי חודשי באינפלציה — משפיע ישירות על ציפיות הריבית של הפד.',
    bullishHe: 'CPI גבוה = אינפלציה גבוהה = הפד יעלה ריבית = דולר מתחזק = לחץ על סיכון.',
    bearishHe: 'CPI נמוך = אינפלציה נמוכה = הפד יוריד ריבית = דולר נחלש = תמיכה בסיכון.',
  },
  'FOMC Statement': {
    titleHe: 'הצהרת ועדת שוק הפדרלי (FOMC)',
    explanationHe: 'הודעת הריבית של הפד האמריקאי — הגורם הבודד המשפיע ביותר על שווקים.',
    bullishHe: 'הפד "ניח" (dovish) = ריבית יורדת או מדיניות רכה = דולר נחלש = שווקים עולים.',
    bearishHe: 'הפד "ניצי" (hawkish) = ריבית עולה = דולר מתחזק = שווקים יורדים.',
  },
  'GDP q/q': {
    titleHe: 'תוצר מקומי גולמי רבעוני (GDP)',
    explanationHe: 'שינוי ברבעוני בסך הסחורות והשירותים שנוצרו בארה"ב.',
    bullishHe: 'GDP גבוה = כלכלה חזקה = דולר מתחזק.',
    bearishHe: 'GDP נמוך = כלכלה מוחלשת = ציפיות להורדת ריבית = דולר נחלש.',
  },
  'Core PCE Price Index m/m': {
    titleHe: 'מדד PCE ליבה — האינפלציה המועדפת על הפד',
    explanationHe: 'המדד שהפד מסתכל עליו הכי הרבה לקביעת ריבית. חשוב מאוד.',
    bullishHe: 'PCE גבוה = ריבית תישאר גבוהה = דולר חזק.',
    bearishHe: 'PCE נמוך = הפד יוריד ריבית = דולר נחלש = סיכון עולה.',
  },
  'Unemployment Claims': {
    titleHe: 'תביעות אבטלה שבועיות',
    explanationHe: 'מספר האנשים שהגישו תביעת אבטלה ראשונה בשבוע האחרון.',
    bullishHe: 'תביעות נמוכות = שוק עבודה חזק = דולר מתחזק.',
    bearishHe: 'תביעות גבוהות = שוק עבודה מוחלש = ציפיות להורדת ריבית.',
  },
  'ISM Manufacturing PMI': {
    titleHe: 'מדד מנהלי הרכש — ייצור',
    explanationHe: 'מדד פעילות המגזר הייצורי. מעל 50 = התרחבות, מתחת = כיווץ.',
    bullishHe: 'PMI מעל 50 = ייצור מתרחב = כלכלה חזקה.',
    bearishHe: 'PMI מתחת ל-50 = ייצור מתכווץ = חולשה כלכלית.',
  },
  'Retail Sales m/m': {
    titleHe: 'קמעונות חודשי',
    explanationHe: 'שינוי חודשי במכירות הקמעונאיות — מדד לביקוש הצרכנים.',
    bullishHe: 'מכירות גבוהות = צרכן חזק = כלכלה חזקה.',
    bearishHe: 'מכירות נמוכות = צרכן חלש = חולשה כלכלית.',
  },
}

function impactFromString(s: string): 'high' | 'medium' | 'low' {
  if (s?.includes('High') || s === 'red') return 'high'
  if (s?.includes('Medium') || s === 'orange') return 'medium'
  return 'low'
}

function utcToIL(timeStr: string, dateStr: string): string {
  try {
    const [h, m] = timeStr.split(':').map(Number)
    const d = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`)
    return d.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })
  } catch {
    return timeStr
  }
}

/**
 * Scrape ForexFactory calendar for the current week.
 * Falls back to FMP if scraping fails.
 */
export async function fetchEconomicCalendar(): Promise<EconEvent[]> {
  try {
    return await scrapeForexFactory()
  } catch (err) {
    console.warn('[ForexFactory] Scraping failed, trying FMP...', err)
    try {
      return await fetchFMP()
    } catch (err2) {
      console.error('[ForexFactory] FMP also failed:', err2)
      return []
    }
  }
}

async function scrapeForexFactory(): Promise<EconEvent[]> {
  const res = await fetch('https://www.forexfactory.com/calendar', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  })

  if (!res.ok) throw new Error(`ForexFactory returned ${res.status}`)
  const html = await res.text()

  // Parse JSON embedded in page (ForexFactory embeds calendar data)
  const match = html.match(/window\.calendarComponentStates\s*=\s*(\{.+?\});/s)
  if (!match) throw new Error('Could not find embedded calendar data')

  const data = JSON.parse(match[1])
  const events: EconEvent[] = []

  const allEvents = data?.calendarWidget?.days?.flatMap((d: any) =>
    d.events?.map((e: any) => ({ ...e, date: d.date })) ?? []
  ) ?? []

  for (const ev of allEvents) {
    if (!ev.title) continue
    const trans = EVENT_TRANSLATIONS[ev.title]
    const impact = impactFromString(ev.impact)
    const timeStr = ev.time ?? '00:00'

    events.push({
      id: `ff-${ev.id ?? crypto.randomUUID()}`,
      title: ev.title,
      titleHe: trans?.titleHe ?? ev.title,
      country: ev.country ?? '',
      currency: ev.currency ?? '',
      impact,
      date: ev.date,
      time: timeStr,
      timeIL: utcToIL(timeStr, ev.date),
      forecast: ev.forecast ?? '',
      previous: ev.previous ?? '',
      actual: ev.actual ?? '',
      explanationHe: trans?.explanationHe ?? '',
      bullishHe: trans?.bullishHe ?? '',
      bearishHe: trans?.bearishHe ?? '',
    })
  }

  return events.filter(e => e.impact === 'high' || e.impact === 'medium')
}

async function fetchFMP(): Promise<EconEvent[]> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) throw new Error('FMP_API_KEY not set')

  const today = new Date()
  const nextWeek = new Date(today.getTime() + 7 * 86400_000)
  const from = today.toISOString().slice(0, 10)
  const to = nextWeek.toISOString().slice(0, 10)

  const res = await fetch(
    `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${apiKey}`
  )
  if (!res.ok) throw new Error(`FMP returned ${res.status}`)

  const data = (await res.json()) as any[]

  return data
    .filter(e => e.impact?.toLowerCase() !== 'low')
    .map(e => {
      const trans = EVENT_TRANSLATIONS[e.event]
      const dateStr = e.date?.slice(0, 10) ?? ''
      const timeStr = e.date?.slice(11, 16) ?? '00:00'
      return {
        id: `fmp-${e.event}-${e.date}`,
        title: e.event,
        titleHe: trans?.titleHe ?? e.event,
        country: e.country ?? '',
        currency: e.currency ?? 'USD',
        impact: e.impact?.toLowerCase() === 'high' ? 'high' : 'medium' as any,
        date: dateStr,
        time: timeStr,
        timeIL: utcToIL(timeStr, dateStr),
        forecast: String(e.estimate ?? ''),
        previous: String(e.previous ?? ''),
        actual: String(e.actual ?? ''),
        explanationHe: trans?.explanationHe ?? '',
        bullishHe: trans?.bullishHe ?? '',
        bearishHe: trans?.bearishHe ?? '',
      }
    })
}

// Cache
let _cache: { events: EconEvent[]; fetchedAt: number } | null = null

export async function getCachedCalendar(): Promise<EconEvent[]> {
  const now = Date.now()
  const TTL = 6 * 3600_000 // 6 hours

  if (_cache && now - _cache.fetchedAt < TTL) {
    return _cache.events
  }

  const events = await fetchEconomicCalendar()
  _cache = { events, fetchedAt: now }
  return events
}

/**
 * Send Telegram reminders for upcoming high-impact events.
 * Called periodically by scheduler.
 */
export async function sendEventReminders(): Promise<void> {
  const events = await getCachedCalendar()
  const now = Date.now()

  for (const ev of events) {
    if (ev.impact !== 'high') continue

    const eventTime = new Date(`${ev.date}T${ev.time}:00Z`).getTime()
    const diff = eventTime - now
    const diffMin = diff / 60_000

    // 60 min reminder
    if (diffMin > 55 && diffMin < 65) {
      const msg = `⚠️ *תזכורת — דוח High Impact בעוד שעה!*\n\n` +
        `📋 ${ev.titleHe}\n` +
        `🕐 ${ev.timeIL} 🇮🇱 (${ev.time} UTC)\n` +
        `📊 צפי: ${ev.forecast || '—'} | קודם: ${ev.previous || '—'}\n\n` +
        `${ev.explanationHe}`
      await sendTelegram(msg, 0, undefined, process.env.TELEGRAM_TOPIC_BRIEFING)
    }

    // 24h reminder
    const diffH = diff / 3600_000
    if (diffH > 23.5 && diffH < 24.5) {
      const msg = `📅 *תזכורת — דוח High Impact מחר*\n\n` +
        `📋 ${ev.titleHe}\n🕐 ${ev.timeIL} 🇮🇱`
      await sendTelegram(msg, 0, undefined, process.env.TELEGRAM_TOPIC_BRIEFING)
    }
  }
}
