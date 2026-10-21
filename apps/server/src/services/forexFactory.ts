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
  /** epoch ms of the event (from the official feed) */
  ts?: number
  /** YYYY-MM-DD in Israel time — for grouping by day */
  dateIL?: string
  /** true = high-impact USD event: prop-account news window (NEWS_WINDOW_MIN before/after) */
  noTrade?: boolean
  noTradeHe?: string
  allDay?: boolean
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
  if (s === 'Holiday' || s === 'Non-Economic') return 'low'
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
 * ForexFactory official weekly JSON feed (this week + next week), no scraping.
 * Feed: https://nfs.faireconomy.media/ff_calendar_thisweek.json — update at most every 30 min (their rule).
 * Falls back to FMP only if the feed is unreachable.
 */
const FEED_URLS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
]
const NEWS_WINDOW_MIN = Number(process.env.NEWS_WINDOW_MIN ?? '5')

export async function fetchEconomicCalendar(): Promise<EconEvent[]> {
  try {
    return await fetchForexFactoryFeed()
  } catch (err) {
    console.warn('[ForexFactory] feed failed, trying FMP...', err)
    try {
      return await fetchFMP()
    } catch (err2) {
      console.error('[ForexFactory] FMP also failed:', err2)
      return []
    }
  }
}

function ilDate(ts: number): string {
  // YYYY-MM-DD in Asia/Jerusalem
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

async function fetchForexFactoryFeed(): Promise<EconEvent[]> {
  const { createHash } = await import('crypto')
  const events: EconEvent[] = []
  let ok = 0
  for (const url of FEED_URLS) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'MarketIntel/1.0 (+https://market-intel-web-henna.vercel.app)', Accept: 'application/json' } })
      if (!res.ok) throw new Error(`feed ${res.status}`)
      const data = (await res.json()) as any[]
      ok++
      for (const ev of data) {
        if (!ev?.title || !ev?.date) continue
        const ts = Date.parse(ev.date)
        if (!Number.isFinite(ts)) continue
        const d = new Date(ts)
        const impactRaw = String(ev.impact ?? '')
        const impact = impactFromString(impactRaw)
        const allDay = impactRaw === 'Holiday' || impactRaw === 'Non-Economic'
        const currency = String(ev.country ?? '')          // the feed's "country" is the currency code (USD, EUR…)
        const trans = EVENT_TRANSLATIONS[ev.title]
        const dateUtc = d.toISOString().slice(0, 10)
        const timeUtc = d.toISOString().slice(11, 16)
        const noTrade = impact === 'high' && currency === 'USD' && !allDay
        events.push({
          id: 'ff-' + createHash('md5').update(`${ev.title}|${ev.date}|${currency}`).digest('hex').slice(0, 12),
          title: ev.title,
          titleHe: trans?.titleHe ?? ev.title,
          country: currency,
          currency,
          impact,
          date: dateUtc,
          time: timeUtc,
          timeIL: utcToIL(timeUtc, dateUtc),
          forecast: String(ev.forecast ?? ''),
          previous: String(ev.previous ?? ''),
          actual: String(ev.actual ?? ''),
          explanationHe: trans?.explanationHe ?? '',
          bullishHe: trans?.bullishHe ?? '',
          bearishHe: trans?.bearishHe ?? '',
          ts,
          dateIL: ilDate(ts),
          noTrade,
          noTradeHe: noTrade ? `דוח אדום בדולר — חלון זהירות ${NEWS_WINDOW_MIN} דק' לפני ואחרי (חשבון ממומן)` : undefined,
          allDay,
        })
      }
    } catch (e) {
      console.warn('[ForexFactory] feed url failed:', url, (e as Error).message)
    }
  }
  if (!ok) throw new Error('ForexFactory feed unreachable')
  // dedupe (the two weeks can overlap) and keep medium/high (+ holidays as info)
  const seen = new Set<string>()
  return events
    .filter(e => (e.impact === 'high' || e.impact === 'medium' || e.allDay) && !seen.has(e.id) && seen.add(e.id))
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
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
  const TTL = 30 * 60_000 // 30 min — the feed's own refresh rule

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

    const eventTime = ev.ts ?? new Date(`${ev.date}T${ev.time}:00Z`).getTime()
    const diff = eventTime - now
    const diffMin = diff / 60_000

    // 60 min reminder
    if (diffMin > 55 && diffMin < 65) {
      const msg = `⚠️ *תזכורת — דוח High Impact בעוד שעה!*\n\n` +
        `📋 ${ev.titleHe}\n` +
        `🕐 ${ev.timeIL} 🇮🇱 (${ev.time} UTC)\n` +
        `📊 צפי: ${ev.forecast || '—'} | קודם: ${ev.previous || '—'}\n\n` +
        `${ev.explanationHe}`
      await sendTelegram(msg, 0, undefined, process.env.TELEGRAM_TOPIC_BRIEFING, { ignoreMasterSwitch: true })
    }

    // 24h reminder
    const diffH = diff / 3600_000
    if (diffH > 23.5 && diffH < 24.5) {
      const msg = `📅 *תזכורת — דוח High Impact מחר*\n\n` +
        `📋 ${ev.titleHe}\n🕐 ${ev.timeIL} 🇮🇱`
      await sendTelegram(msg, 0, undefined, process.env.TELEGRAM_TOPIC_BRIEFING, { ignoreMasterSwitch: true })
    }
  }
}
