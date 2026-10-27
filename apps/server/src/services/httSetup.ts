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
  jac: 'JAC/FTI — קפיצה מעבר לקריק/אייס', crkRt: 'BUTTC/RBTI — ריטסט הקריק/אייס', tso: 'ניעור סופי (TSO/TUT)', dq2: 'איכות D ≥ 2', dq3: 'איכות D ≥ 3', dqMag: 'מגנט לקריק/אייס', cTso: 'C עם ניעור סופי', reacc: 'איסוף/פיזור חוזר', avwapD: 'בצד הנכון של AVWAP יומי', qtJudas: "ג'ודאס של הרבע (תורת הרבעים)", qtAccum: "רבע צבירה (90 דק')", qtManip: "רבע מניפולציה (90 דק')", qtDist: "רבע חלוקה (90 דק')", qtDayLon: 'רבע יומי 2 (לונדון, מניפולציה של היום)', tdoDisc: 'בצד הזול של True Day Open', tsoDisc: 'בצד הזול של True Session Open', twoDisc: 'בצד הזול של True Weekly Open', avwTdoSide: 'בצד הנכון של AVWAP מ-True Day Open', avwTdoRt: 'ריטסט AVWAP מ-True Day Open', avwWkSide: 'בצד הנכון של AVWAP שבועי', avwSwRt: 'ריטסט AVWAP מהסווינג האחרון', avwSlope: 'שיפוע AVWAP יומי בכיוון', avwStack: 'מעל/מתחת גם AVWAP יומי וגם שבועי', avwapRt: 'ריטסט AVWAP יומי', cvdOk: 'CVD בכיוון (5 נרות)', cvdDiv: 'דיברגנס CVD (20 נרות)',
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

// ─── הקשר לכרטיס ההתראה (28.10): Order Flow אמיתי (קריפטו) ורמות שוק האופציות (נאסדק) ברגע הסטאפ ───
import { OF_SYMBOLS, getSummary, type OfSummary } from './orderflowService'
import { latestSnapshot } from './optionsLevelsService'
export interface HttContext {
  orderflow?: OfSummary
  options?: { regime: string; nearest: string; level: number; distancePct: number; nqLast: number | null }
  linesHe: string[]
}
const sgn = (v: number | null) => (v == null ? '—' : (v > 0 ? '+' : '') + Math.round(v).toLocaleString('en-US'))
export function buildHttContext(symbol: string, tf: string, price: number): HttContext {
  const lines: string[] = []
  const out: HttContext = { linesHe: lines }
  const sym = symbol.toUpperCase()
  const tfMin = tf === '4h' ? 240 : tf === '1h' ? 60 : tf === '5m' ? 5 : tf === '1m' ? 1 : 15
  if ((OF_SYMBOLS as readonly string[]).includes(sym)) {
    try {
      const o = getSummary(sym, tfMin)
      if (o.updatedAt) {
        out.orderflow = o
        lines.push(`🌊 Order Flow: דלתא ${sgn(o.lastDelta)} · CVD ${(o.cvdSlope5 ?? 0) >= 0 ? '▲' : '▼'} ${sgn(o.cvdSlope5)} (5 נרות)` +
          (o.lastDiv ? ` · דיברגנס ${o.lastDiv.side === 1 ? 'שורי' : 'דובי'}` : '') + (o.lastAbsorb ? ` · ספיגת ${o.lastAbsorb.side === 1 ? 'מוכרים (שורי)' : 'קונים (דובי)'}` : ''))
      }
    } catch { /* אין נתוני Order Flow — הכרטיס נשלח בלעדיהם */ }
  }
  if (/^(NQ|NAS|MNQ)/i.test(sym)) {
    const s = latestSnapshot()
    if (s) {
      const cands = ([['קיר קולים', s.nq.callWall], ['קיר פוטים', s.nq.putWall], ['אפס-גמא', s.nq.zeroGamma], ['מגנט OI', s.nq.magnet], ['0DTE', s.nq.zdte]] as Array<[string, unknown]>)
        .filter((x): x is [string, number] => typeof x[1] === 'number')
      if (cands.length) {
        const [name, level] = cands.reduce((a, b) => (Math.abs(b[1] - price) < Math.abs(a[1] - price) ? b : a))
        const distancePct = (level - price) / price * 100
        const regime = s.nq.regime === 'positive' ? 'גמא חיובית (רגוע, חזרה לממוצע)' : 'גמא שלילית (נפיץ, מגמה)'
        out.options = { regime: String(s.nq.regime), nearest: name, level, distancePct, nqLast: s.nqLast }
        lines.push(`🎯 אופציות: ${regime} · הכי קרוב: ${name} ${level.toLocaleString('en-US')} (${distancePct >= 0 ? '+' : ''}${distancePct.toFixed(2)}%)`)
      }
    }
  }
  return out
}
