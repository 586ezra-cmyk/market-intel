/**
 * HTT setup alerts — one event from the HTT Master indicator carrying every confirmation
 * that was present at the trigger, the Wyckoff phase, the support/resistance the price
 * arrived at, and a net quality level. The site decides (htt_min_score) which level
 * goes to Telegram. Names and tiers mirror backtest/stats (rank.json).
 */
import type { AlertFactor, Timeframe } from '@market/shared'

export const HTT_FLAG_HE: Record<string, string> = {
  bos: 'BOS', choch: 'CHoCH', sweep: 'חטיפת נזילות', smt: 'SMT', ismt: 'iSMT', ifvg: 'iFVG', fvg: 'FVG נוצר עכשיו',
  judas: "ג'ודאס", tweezer: 'צבת', shake: 'ספרינג/UT', volC: 'C ווליום (V)', lps: 'LPS/LPSY', gap: 'גאפ',
  ob: 'אורדר בלוק', wm: 'W/M', ddt: 'DD/DT', engulf: 'נר בולען', bb: 'פריצת בולינגר', rsi: 'RSI בקצה',
  climax: 'ווליום קליימקס', fvgAt: 'כניסה מ-FVG', ifvgAt: 'כניסה מ-iFVG', atPool: 'בריכת נזילות', orBrk: 'פריצת טווח פתיחה',
  test: 'טסט ✓', pd: 'דיסקאונט/פרימיום', kz: 'קיל-זון', sesLon: 'סשן לונדון', sesNY: 'סשן ניו-יורק', sesAsia: 'סשן אסיה',
  phC: 'פאזה C', phD: 'פאזה D', phE: 'פאזה E', phAB: 'פאזה A/B', cDir: 'כיוון C תואם', clues3: '3+ רמזים',
  volLow: 'ווליום נמוך', htfMs: 'מבנה HTF תואם', htfCD: 'HTF ב-C/D תואם', amdD: 'AMD D', conf4: '4+ אישורים',
  rrOk: 'יחס 1:3 אפשרי', atEdge: 'הגיע לאייס/קריק', atHtfLvl: 'רמת 4H/יומי/שבועי', atSesLvl: 'רמת סשן/אסיה', bbSq: 'התכווצות בולינגר',
  vixOk: 'VIX תומך', vixHigh: 'VIX מעל 20', vixSpike: 'זינוק VIX', vixDiv: 'דיברגנס VIX',
  jac: 'JAC/FTI — קפיצה מעבר לקריק/אייס', crkRt: 'BUTTC/RBTI — ריטסט הקריק/אייס', tso: 'ניעור סופי (TSO/TUT)', dq2: 'איכות D ≥ 2', dq3: 'איכות D ≥ 3', dqMag: 'מגנט לקריק/אייס', cTso: 'C עם ניעור סופי', reacc: 'איסוף/פיזור חוזר',
}

/** Map HTT keys onto the site's fixed factor vocabulary (for the alerts tab chips). */
const TO_FACTOR: Record<string, AlertFactor> = {
  bos: 'BOS', choch: 'CHoCH', sweep: 'LiquiditySweep', fvg: 'FVG', fvgAt: 'FVG', ifvg: 'iFVG', ifvgAt: 'iFVG',
  smt: 'SMT', ismt: 'iSMT', ob: 'OrderBlock', phC: 'Wyckoff', phD: 'Wyckoff', phE: 'Wyckoff', shake: 'Wyckoff', volC: 'Wyckoff',
}

export interface HttSetupInput {
  symbol: string
  timeframe: Timeframe
  time: number
  direction: 'long' | 'short'
  trigger: string
  price: number
  stop?: number | null
  target?: number | null
  score: number
  confirmations: string[]
  negatives: string[]
  phase?: string
  sr: string[]
  session?: string
  inKillZone: boolean
  rsi?: number | null
}

const TRIGGER_HE: Record<string, string> = { F: 'טיסה', W: 'שבירת כנף', O: 'אורדר בלוק', M: 'W/M', K: 'ריטסט הקריק/אייס (BUTTC/RBTI)', B: 'פריצה (BOS/CHoCH)' }
const SR_HE: Record<string, string> = { ice: 'אייס (תמיכת הטווח)', creek: 'קריק (התנגדות הטווח)', htf: 'רמת 4H/יומי/שבועי', ses: 'רמת סשן/אסיה', pool: 'בריכת נזילות', fvg: 'FVG', ifvg: 'iFVG', ob: 'אורדר בלוק' }

export function httFactors(keys: string[]): AlertFactor[] {
  const out = new Set<AlertFactor>()
  for (const k of keys) { const f = TO_FACTOR[k]; if (f) out.add(f) }
  return [...out]
}

export function buildHttMessage(d: HttSetupInput): string {
  const dir = d.direction === 'long' ? 'לונג 🟢' : 'שורט 🔴'
  const pos = d.confirmations.map(k => HTT_FLAG_HE[k] ?? k)
  const neg = d.negatives.map(k => HTT_FLAG_HE[k] ?? k)
  const sr = d.sr.map(k => SR_HE[k] ?? k)
  const risk = d.stop != null ? Math.abs(d.price - d.stop) : null
  const lines = [
    `🎯 HTT · ${d.symbol} · ${d.timeframe} · ${dir} · רמה ${d.score}`,
    `טריגר: ${TRIGGER_HE[d.trigger] ?? d.trigger}${d.phase ? ` · וויקוף: פאזה ${d.phase}` : ''}${d.session ? ` · ${d.session}` : ''}${d.inKillZone ? ' · קיל-זון' : ''}`,
    sr.length ? `הגיע ל: ${sr.join(' · ')}` : '',
    pos.length ? `אישורים (${pos.length}): ${pos.join(' · ')}` : 'אישורים: —',
    neg.length ? `נגד (${neg.length}): ${neg.join(' · ')}` : '',
    `כניסה ${d.price}${d.stop != null ? ` · סטופ ${d.stop}` : ''}${d.target != null ? ` · יעד 1:3 ${d.target}` : ''}${risk != null ? ` · סיכון ${risk.toFixed(2)}` : ''}${d.rsi != null ? ` · RSI ${Math.round(d.rsi)}` : ''}`,
    'ניהול מומלץ (בקטסט): חלק ב-1R + סטופ לאיזון, ואז גרירה מתחת לפיבוט האחרון',
  ]
  return lines.filter(Boolean).join('\n')
}
