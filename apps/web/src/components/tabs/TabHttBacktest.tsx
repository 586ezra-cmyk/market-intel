'use client'

import { useEffect, useMemo, useState } from 'react'

// ─── סטטיסטיקת בקטסט של HTT (אינדיקטור TradingView) ─────────────────────────
// הנתונים נוצרים על ידי backtest/stats/build_stats.py ונשמרים ב-public/htt-backtest/stats.json

interface Agg {
  n: number
  open?: number
  wins?: number
  winRate?: number
  avgR?: number
  sumR?: number
  profitFactor?: number | null
  maxDD_R?: number
  avgMFE?: number | null
  mfe1R?: number | null
  mfe2R?: number | null
  significant?: boolean
}

interface FlagRow {
  flag: string
  he: string
  with: Agg
  without: Agg
  liftR: number | null
  liftWin: number | null
}

interface ComboRow {
  flags: string[]
  he: string[]
  stats: Agg
}

interface Trade {
  combo: string
  strat: string
  side: 'L' | 'S'
  entryTime: number
  exitTime: number | null
  entry: number
  stop: number
  target: number
  exit: number | null
  exitKind: string
  r: number | null
  mfe: number | null
  mae: number | null
  bars: number | null
  flags: string
  ses: number
  phase: number
  conf: number
  outcome: 'win' | 'loss' | 'flat' | 'open'
}

interface PathAgg {
  n: number
  rightDir1R?: number | null
  reach?: Record<string, number | null>
  reachFree?: Record<string, number | null>
  stopped?: number | null
  stoppedThenWent2R?: number | null
  withTarget?: number
  targetHit?: number | null
  targetMedianR?: number | null
  advBefore1R?: { p50: number | null; p70: number | null; p80: number | null; p90: number | null; n: number }
  advBefore2R?: { p50: number | null; p70: number | null; p80: number | null; p90: number | null; n: number }
  stopScan?: Array<{ stopMult: number; winRate: number; expR: number }>
  tpScan?: Array<{ target: number; reach: number | null; expR: number }>
  bestTP?: { target: number; reach: number | null; expR: number }
  schemes?: Record<string, { he: string; n: number; avgR: number; winRate: number | null; sumR: number }>
  medianBarsTo1R?: number | null
  medianBarsTo2R?: number | null
  significant?: boolean
}

interface PathStats {
  generatedAt: string
  minN: number
  levels: number[]
  schemesHe: Record<string, string>
  stratHe: Record<string, string>
  sesHe: Record<string, string>
  phHe: Record<string, string>
  nSignals: number
  groups: { all: PathAgg; byStrat: Record<string, PathAgg>; byRes: Record<string, PathAgg>; bySym: Record<string, PathAgg>; bySide: Record<string, PathAgg>; bySes: Record<string, PathAgg>; byPhase: Record<string, PathAgg> }
  flagRows: Array<{ flag: string; he: string; n: number; rightDir1R: number | null; reach2: number | null; reach3: number | null; bestScheme: string | null; bestSchemeR: number | null; s1R: number | null }>
  setups: Array<{ flags: string[]; he: string[]; stats: PathAgg }>
}

interface Stats {
  generatedAt: string
  targetR: number
  minN: number
  flags: Array<{ key: string; he: string }>
  stratHe: Record<string, string>
  sesHe: Record<string, string>
  phHe: Record<string, string>
  base: Agg
  combos: Record<string, { sym: string; res: string; firstTrade: number | null; lastT: number; stats: Agg }>
  byStrat: Record<string, Agg>
  bySes: Record<string, Agg>
  byPhase: Record<string, Agg>
  bySide: Record<string, Agg>
  byRes: Record<string, Agg>
  bySym: Record<string, Agg>
  flagRows: FlagRow[]
  topCombos: ComboRow[]
  topMFE: ComboRow[]
  stratFlag: Record<string, Array<{ flag: string; he: string; stats: Agg }>>
  trades: Trade[]
}

const pct = (v?: number | null) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(0)}%`)
const num = (v?: number | null, d = 2) => (v === null || v === undefined ? '—' : v.toFixed(d))
const dt = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const rColor = (r?: number | null) => (r === null || r === undefined ? 'text-slate-400' : r > 0 ? 'text-emerald-400' : r < 0 ? 'text-red-400' : 'text-slate-300')
const resHe: Record<string, string> = { '5': '5 דקות', '15': '15 דקות', '240': '4 שעות', 'D': 'יומי' }

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : 'text-slate-100'
  return (
    <div className="card p-3 flex flex-col gap-1">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}

function AggRow({ name, a, minN }: { name: string; a: Agg; minN: number }) {
  const weak = a.n < minN
  return (
    <tr className={`border-b border-surface-border ${weak ? 'opacity-50' : ''}`}>
      <td className="py-1.5 pr-2 text-right whitespace-nowrap">{name}</td>
      <td className="py-1.5 text-center">{a.n}</td>
      <td className="py-1.5 text-center">{pct(a.winRate)}</td>
      <td className={`py-1.5 text-center font-semibold ${rColor(a.avgR)}`}>{num(a.avgR)}</td>
      <td className={`py-1.5 text-center ${rColor(a.sumR)}`}>{num(a.sumR, 1)}</td>
      <td className="py-1.5 text-center">{a.profitFactor === null || a.profitFactor === undefined ? '—' : a.profitFactor.toFixed(2)}</td>
      <td className="py-1.5 text-center">{num(a.avgMFE)}</td>
      <td className="py-1.5 text-center">{pct(a.mfe2R)}</td>
      <td className="py-1.5 text-center">{num(a.maxDD_R, 1)}</td>
    </tr>
  )
}

function AggTable({ title, rows, minN, hint }: { title: string; rows: Array<[string, Agg]>; minN: number; hint?: string }) {
  return (
    <div className="card p-3 overflow-x-auto">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-semibold">{title}</h3>
        {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="text-right pb-1">קבוצה</th>
            <th className="pb-1">עסקאות</th>
            <th className="pb-1">אחוז הצלחה</th>
            <th className="pb-1">ממוצע R</th>
            <th className="pb-1">סה"כ R</th>
            <th className="pb-1">פרופיט פקטור</th>
            <th className="pb-1">ממוצע תנועה (R)</th>
            <th className="pb-1">הגיע ל-2R</th>
            <th className="pb-1">דרודאון (R)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, a]) => <AggRow key={name} name={name} a={a} minN={minN} />)}
        </tbody>
      </table>
    </div>
  )
}

function PathSchemes({ title, rows, minN }: { title: string; rows: Array<[string, PathAgg]>; minN: number }) {
  const keys = ['s1', 's2', 's3', 's4', 's5', 's6']
  return (
    <div className="card p-3 overflow-x-auto">
      <h3 className="font-semibold mb-2">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="text-right pb-1">קבוצה</th>
            <th className="pb-1">סיגנלים</th>
            <th className="pb-1">הלכו נכון (1R לפני הסטופ)</th>
            <th className="pb-1">הגיעו ל-2R</th>
            <th className="pb-1">הגיעו ל-3R</th>
            <th className="pb-1">יעד מבני הושג</th>
            {keys.map(k => <th key={k} className="pb-1">{k.toUpperCase()}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, a]) => (
            <tr key={name} className={`border-b border-surface-border ${a.n < minN ? 'opacity-50' : ''}`}>
              <td className="py-1.5 pr-2 text-right whitespace-nowrap">{name}</td>
              <td className="py-1.5 text-center">{a.n}</td>
              <td className="py-1.5 text-center">{pct(a.rightDir1R)}</td>
              <td className="py-1.5 text-center">{pct(a.reach?.['2'])}</td>
              <td className="py-1.5 text-center">{pct(a.reach?.['3'])}</td>
              <td className="py-1.5 text-center">{pct(a.targetHit)}</td>
              {keys.map(k => {
                const sc = a.schemes?.[k]
                const best = sc && Object.values(a.schemes ?? {}).every(v => v.avgR <= sc.avgR)
                return <td key={k} className={`py-1.5 text-center ${best ? 'font-bold' : ''} ${rColor(sc?.avgR)}`}>{sc ? num(sc.avgR) : '—'}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PathSection({ path }: { path: PathStats }) {
  const a = path.groups.all
  const stratRows: Array<[string, PathAgg]> = Object.entries(path.groups.byStrat).map(([k, v]) => [path.stratHe[k] ?? k, v])
  const resRows: Array<[string, PathAgg]> = Object.entries(path.groups.byRes).map(([k, v]) => [resHe[k] ?? k, v])
  const symRows: Array<[string, PathAgg]> = Object.entries(path.groups.bySym).map(([k, v]) => [k, v])
  const sesRows: Array<[string, PathAgg]> = Object.entries(path.groups.bySes).map(([k, v]) => [path.sesHe[k] ?? k, v])
  const phRows: Array<[string, PathAgg]> = Object.entries(path.groups.byPhase).map(([k, v]) => [`פאזה ${path.phHe[k] ?? k}`, v])
  const sideRows: Array<[string, PathAgg]> = Object.entries(path.groups.bySide).map(([k, v]) => [k === 'L' ? 'לונג' : 'שורט', v])
  const setupRows: Array<[string, PathAgg]> = path.setups.map(s => [s.he.join(' + '), s.stats])
  const bestScheme = a.schemes ? Object.entries(a.schemes).sort((x, y) => y[1].avgR - x[1].avgR)[0] : null
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h2 className="text-xl font-bold">🛣️ מסלול המחיר אחרי כל סיגנל — סטופ, יעד וניהול</h2>
        <div className="text-xs text-slate-500">מקור: "HTT Path Lab" ב-TradingView · כל סיגנל נמדד {'120'} נרות קדימה, בלי הגבלה של עסקה אחת · {path.nSignals} סיגנלים · עודכן {dt(Date.parse(path.generatedAt))}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="סיגנלים" value={String(a.n)} />
        <Kpi label="הלכו בכיוון הנכון" value={pct(a.rightDir1R)} sub="הגיעו ל-1R לפני שהסטופ נפגע" tone="neutral" />
        <Kpi label="הגיעו ל-2R / 3R" value={`${pct(a.reach?.['2'])} / ${pct(a.reach?.['3'])}`} sub="עם סטופ הקורס" />
        <Kpi label="היעד המבני הושג" value={pct(a.targetHit)} sub={`חציון מרחק היעד ${num(a.targetMedianR, 1)}R · ${a.withTarget} עם יעד`} />
        <Kpi label="נעצרו ואז הלכו 2R" value={pct(a.stoppedThenWent2R)} sub="סטופ הקורס היה צר מדי" tone="bad" />
        <Kpi label="הניהול הטוב ביותר" value={bestScheme ? num(bestScheme[1].avgR) + ' R' : '—'} sub={bestScheme ? bestScheme[1].he : ''} tone={bestScheme && bestScheme[1].avgR > 0 ? 'good' : 'bad'} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-3 overflow-x-auto">
          <h3 className="font-semibold mb-1">איפה לשים סטופ</h3>
          <p className="text-[11px] text-slate-500 mb-2">כמה נגד הלכו העסקאות שבסוף הגיעו ל-1R / 2R, ביחידות של סטופ הקורס (1.0 = סטופ הקורס). אחוזון 80 = סטופ ששומר 80% מהעסקאות שהיו מצליחות.</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">לפני</th><th className="pb-1">חציון</th><th className="pb-1">70%</th><th className="pb-1">80%</th><th className="pb-1">90%</th><th className="pb-1">n</th></tr></thead>
            <tbody>
              <tr className="border-b border-surface-border"><td className="py-1 text-right">הגעה ל-1R</td><td className="text-center">{num(a.advBefore1R?.p50)}</td><td className="text-center">{num(a.advBefore1R?.p70)}</td><td className="text-center font-semibold">{num(a.advBefore1R?.p80)}</td><td className="text-center">{num(a.advBefore1R?.p90)}</td><td className="text-center">{a.advBefore1R?.n}</td></tr>
              <tr className="border-b border-surface-border"><td className="py-1 text-right">הגעה ל-2R</td><td className="text-center">{num(a.advBefore2R?.p50)}</td><td className="text-center">{num(a.advBefore2R?.p70)}</td><td className="text-center font-semibold">{num(a.advBefore2R?.p80)}</td><td className="text-center">{num(a.advBefore2R?.p90)}</td><td className="text-center">{a.advBefore2R?.n}</td></tr>
            </tbody>
          </table>
          <table className="w-full text-sm mt-3">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">סטופ (× הקורס)</th><th className="pb-1">הצלחה ליעד 2R</th><th className="pb-1">תוחלת R</th></tr></thead>
            <tbody>
              {(a.stopScan ?? []).map(r => <tr key={r.stopMult} className="border-b border-surface-border"><td className="py-1 text-right">{r.stopMult}</td><td className="text-center">{pct(r.winRate)}</td><td className={`text-center font-semibold ${rColor(r.expR)}`}>{num(r.expR)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="card p-3 overflow-x-auto">
          <h3 className="font-semibold mb-1">איפה לקחת רווח</h3>
          <p className="text-[11px] text-slate-500 mb-2">כמה מהסיגנלים הגיעו לכל רמה לפני הסטופ (עם סטופ הקורס), והתוחלת ליעד יחיד באותה רמה. טייק ראשון = רמה שרוב העסקאות מגיעות אליה, טייק שני = הרמה עם התוחלת הגבוהה.</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">יעד (R)</th><th className="pb-1">הגיעו</th><th className="pb-1">בלי סטופ</th><th className="pb-1">תוחלת R</th></tr></thead>
            <tbody>
              {(a.tpScan ?? []).map(r => <tr key={r.target} className={`border-b border-surface-border ${a.bestTP?.target === r.target ? 'font-bold' : ''}`}><td className="py-1 text-right">{r.target}</td><td className="text-center">{pct(r.reach)}</td><td className="text-center text-slate-400">{pct(a.reachFree?.[String(r.target)])}</td><td className={`text-center ${rColor(r.expR)}`}>{num(r.expR)}</td></tr>)}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">חציון נרות עד 1R: {a.medianBarsTo1R ?? '—'} · עד 2R: {a.medianBarsTo2R ?? '—'}</p>
        </div>
        <div className="card p-3 overflow-x-auto">
          <h3 className="font-semibold mb-1">שש שיטות ניהול, כל הסיגנלים</h3>
          <p className="text-[11px] text-slate-500 mb-2">ממוצע R לעסקה. עסקה שלא הוכרעה עד סוף האופק נספרת בשווי השוק שלה.</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">שיטה</th><th className="pb-1">הצלחה</th><th className="pb-1">ממוצע R</th></tr></thead>
            <tbody>
              {Object.entries(a.schemes ?? {}).map(([k, v]) => <tr key={k} className={`border-b border-surface-border ${bestScheme && bestScheme[0] === k ? 'font-bold' : ''}`}><td className="py-1 text-right">{k.toUpperCase()} · {v.he}</td><td className="text-center">{pct(v.winRate)}</td><td className={`text-center ${rColor(v.avgR)}`}>{num(v.avgR)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <PathSchemes title="לפי אסטרטגיה — כיוון, הגעה ליעדים, ושש שיטות הניהול (ממוצע R)" rows={stratRows} minN={path.minN} />
      <div className="grid lg:grid-cols-2 gap-4">
        <PathSchemes title="לפי מסגרת זמן" rows={resRows} minN={path.minN} />
        <PathSchemes title="לפי נכס" rows={symRows} minN={path.minN} />
        <PathSchemes title="לפי סשן" rows={sesRows} minN={path.minN} />
        <PathSchemes title="לפי פאזה בכניסה" rows={phRows} minN={path.minN} />
        <PathSchemes title="לונג מול שורט" rows={sideRows} minN={path.minN} />
      </div>
      <PathSchemes title="הסטאפים המובילים — מה הניהול הכי טוב לכל אחד" rows={setupRows} minN={path.minN} />
      <div className="card p-3 overflow-x-auto">
        <h3 className="font-semibold mb-2">כל אישור — כיוון נכון, הגעה ליעדים, והשיטה הטובה לו</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">אישור</th><th className="pb-1">סיגנלים</th><th className="pb-1">הלכו נכון</th><th className="pb-1">הגיעו ל-2R</th><th className="pb-1">הגיעו ל-3R</th><th className="pb-1">1:3 קבוע</th><th className="pb-1">השיטה הטובה</th><th className="pb-1">ממוצע R בשיטה הטובה</th></tr></thead>
          <tbody>
            {path.flagRows.map(f => <tr key={f.flag} className="border-b border-surface-border"><td className="py-1 pr-2 text-right whitespace-nowrap">{f.he}</td><td className="text-center">{f.n}</td><td className="text-center">{pct(f.rightDir1R)}</td><td className="text-center">{pct(f.reach2)}</td><td className="text-center">{pct(f.reach3)}</td><td className={`text-center ${rColor(f.s1R)}`}>{num(f.s1R)}</td><td className="text-center">{f.bestScheme ? f.bestScheme.toUpperCase() + ' · ' + path.schemesHe[f.bestScheme] : '—'}</td><td className={`text-center font-semibold ${rColor(f.bestSchemeR)}`}>{num(f.bestSchemeR)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function TabHttBacktest() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [path, setPath] = useState<PathStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stratFilter, setStratFilter] = useState<string>('all')
  const [comboFilter, setComboFilter] = useState<string>('all')
  const [page, setPage] = useState(0)

  useEffect(() => {
    fetch('/htt-backtest/stats.json', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setStats)
      .catch(e => setError(String(e)))
    fetch('/htt-backtest/path.json', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setPath(d) })
      .catch(() => {})
  }, [])

  const trades = useMemo(() => {
    if (!stats) return []
    return stats.trades.filter(t => (stratFilter === 'all' || t.strat === stratFilter) && (comboFilter === 'all' || t.combo === comboFilter))
  }, [stats, stratFilter, comboFilter])

  if (error) return <div className="p-6 text-red-400">שגיאה בטעינת הסטטיסטיקה: {error}</div>
  if (!stats) return <div className="p-6 text-slate-400">טוען סטטיסטיקת בקטסט…</div>

  const b = stats.base
  const PAGE = 50
  const pages = Math.max(1, Math.ceil(trades.length / PAGE))
  const pageTrades = trades.slice(page * PAGE, page * PAGE + PAGE)
  const comboNames = Object.keys(stats.combos)
  const stratRows: Array<[string, Agg]> = Object.entries(stats.byStrat).map(([k, v]) => [stats.stratHe[k] ?? k, v])
  const comboRows: Array<[string, Agg]> = Object.entries(stats.combos).map(([k, v]) => [`${v.sym?.split(':')[1] ?? k} · ${resHe[v.res] ?? v.res}`, v.stats])
  const sesRows: Array<[string, Agg]> = Object.entries(stats.bySes).map(([k, v]) => [stats.sesHe[k] ?? k, v])
  const phaseRows: Array<[string, Agg]> = Object.entries(stats.byPhase).map(([k, v]) => [`פאזה ${stats.phHe[k] ?? k}`, v])
  const sideRows: Array<[string, Agg]> = Object.entries(stats.bySide).map(([k, v]) => [k === 'L' ? 'לונג' : 'שורט', v])
  const resRows: Array<[string, Agg]> = Object.entries(stats.byRes).map(([k, v]) => [resHe[k] ?? k, v])
  const symRows: Array<[string, Agg]> = Object.entries(stats.bySym).map(([k, v]) => [k, v])

  return (
    <div className="p-4 space-y-5 max-w-7xl mx-auto" dir="rtl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">🔬 בקטסט HTT — כל האישורים</h2>
        <div className="text-xs text-slate-500">
          מקור: אסטרטגיית "HTT Backtest" ב-TradingView (כניסה בסגירת נר הטריגר, סטופ לפי הקורס, יעד 1:{stats.targetR}, עסקה אחת בכל פעם) · עודכן {dt(Date.parse(stats.generatedAt))} ·
          מובהק = לפחות {stats.minN} עסקאות
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Kpi label="עסקאות סגורות" value={String(b.n)} sub={`${b.open ?? 0} פתוחות`} />
        <Kpi label="אחוז הצלחה" value={pct(b.winRate)} sub={`נקודת איזון ב-1:${stats.targetR} = ${pct(1 / (1 + stats.targetR))}`} tone={(b.winRate ?? 0) > 1 / (1 + stats.targetR) ? 'good' : 'bad'} />
        <Kpi label="ממוצע R לעסקה" value={num(b.avgR)} tone={(b.avgR ?? 0) > 0 ? 'good' : 'bad'} />
        <Kpi label="סה״כ R" value={num(b.sumR, 1)} tone={(b.sumR ?? 0) > 0 ? 'good' : 'bad'} />
        <Kpi label="פרופיט פקטור" value={b.profitFactor === null || b.profitFactor === undefined ? '—' : b.profitFactor.toFixed(2)} tone={(b.profitFactor ?? 0) > 1 ? 'good' : 'bad'} />
        <Kpi label="ממוצע תנועה לטובה" value={`${num(b.avgMFE)} R`} sub={`${pct(b.mfe1R)} הגיעו ל-1R · ${pct(b.mfe2R)} ל-2R`} />
        <Kpi label="דרודאון מקסימלי" value={`${num(b.maxDD_R, 1)} R`} tone="neutral" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <AggTable title="לפי אסטרטגיה" rows={stratRows} minN={stats.minN} />
        <AggTable title="לפי נכס ומסגרת זמן" rows={comboRows} minN={stats.minN} />
        <AggTable title="לפי מסגרת זמן" rows={resRows} minN={stats.minN} />
        <AggTable title="לפי נכס" rows={symRows} minN={stats.minN} />
        <AggTable title="לפי סשן (שעון ישראל)" rows={sesRows} minN={stats.minN} />
        <AggTable title="לפי פאזת וויקוף בכניסה" rows={phaseRows} minN={stats.minN} />
        <AggTable title="לונג מול שורט" rows={sideRows} minN={stats.minN} />
      </div>

      {/* ── לכל אישור: עם / בלי ── */}
      <div className="card p-3 overflow-x-auto">
        <h3 className="font-semibold mb-1">כל אישור בנפרד — עסקאות עם האישור מול בלי</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          "אירועים" (BOS, חטיפה, SMT, ספרינג…) נספרים אם קרו ב-10 הנרות שלפני הכניסה. "מצבים" (פאזה, סשן, דיסקאונט, קיל-זון…) נבדקים בנר הכניסה.
          שיפור R = ממוצע R עם האישור פחות ממוצע R בלי. שורות בהירות = פחות מ-{stats.minN} עסקאות, לא מובהק.
        </p>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="text-right pb-1">אישור</th>
              <th className="pb-1">עסקאות עם</th>
              <th className="pb-1">הצלחה עם</th>
              <th className="pb-1">ממוצע R עם</th>
              <th className="pb-1">תנועה עם</th>
              <th className="pb-1">עסקאות בלי</th>
              <th className="pb-1">הצלחה בלי</th>
              <th className="pb-1">ממוצע R בלי</th>
              <th className="pb-1">שיפור R</th>
              <th className="pb-1">שיפור הצלחה</th>
            </tr>
          </thead>
          <tbody>
            {stats.flagRows.map(f => (
              <tr key={f.flag} className={`border-b border-surface-border ${f.with.n < stats.minN ? 'opacity-50' : ''}`}>
                <td className="py-1.5 pr-2 text-right whitespace-nowrap">{f.he}</td>
                <td className="py-1.5 text-center">{f.with.n}</td>
                <td className="py-1.5 text-center">{pct(f.with.winRate)}</td>
                <td className={`py-1.5 text-center font-semibold ${rColor(f.with.avgR)}`}>{num(f.with.avgR)}</td>
                <td className="py-1.5 text-center">{num(f.with.avgMFE)}</td>
                <td className="py-1.5 text-center">{f.without.n}</td>
                <td className="py-1.5 text-center">{pct(f.without.winRate)}</td>
                <td className={`py-1.5 text-center ${rColor(f.without.avgR)}`}>{num(f.without.avgR)}</td>
                <td className={`py-1.5 text-center font-semibold ${rColor(f.liftR)}`}>{f.liftR === null ? '—' : (f.liftR > 0 ? '+' : '') + f.liftR.toFixed(2)}</td>
                <td className={`py-1.5 text-center ${rColor(f.liftWin)}`}>{f.liftWin === null ? '—' : (f.liftWin > 0 ? '+' : '') + (f.liftWin * 100).toFixed(0) + '%'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── שילובים ── */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-3 overflow-x-auto">
          <h3 className="font-semibold mb-1">השילובים עם ממוצע R הגבוה ביותר</h3>
          <p className="text-[11px] text-slate-500 mb-2">זוגות ושלשות של אישורים שהופיעו יחד בכניסה, רק שילובים עם לפחות {stats.minN} עסקאות.</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">שילוב</th><th className="pb-1">עסקאות</th><th className="pb-1">הצלחה</th><th className="pb-1">ממוצע R</th><th className="pb-1">תנועה</th></tr></thead>
            <tbody>
              {stats.topCombos.map((c, i) => (
                <tr key={i} className="border-b border-surface-border">
                  <td className="py-1.5 pr-2 text-right">{c.he.join(' + ')}</td>
                  <td className="py-1.5 text-center">{c.stats.n}</td>
                  <td className="py-1.5 text-center">{pct(c.stats.winRate)}</td>
                  <td className={`py-1.5 text-center font-semibold ${rColor(c.stats.avgR)}`}>{num(c.stats.avgR)}</td>
                  <td className="py-1.5 text-center">{num(c.stats.avgMFE)}</td>
                </tr>
              ))}
              {stats.topCombos.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-slate-500">אין עדיין שילובים עם מספיק עסקאות</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card p-3 overflow-x-auto">
          <h3 className="font-semibold mb-1">השילובים עם התנועה הטובה ביותר</h3>
          <p className="text-[11px] text-slate-500 mb-2">לפי ממוצע התנועה המקסימלית לטובת העסקה (ב-R) אחרי הכניסה, גם אם הסטופ נפגע בסוף.</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">שילוב</th><th className="pb-1">עסקאות</th><th className="pb-1">תנועה ממוצעת</th><th className="pb-1">הגיע ל-2R</th><th className="pb-1">ממוצע R</th></tr></thead>
            <tbody>
              {stats.topMFE.map((c, i) => (
                <tr key={i} className="border-b border-surface-border">
                  <td className="py-1.5 pr-2 text-right">{c.he.join(' + ')}</td>
                  <td className="py-1.5 text-center">{c.stats.n}</td>
                  <td className="py-1.5 text-center font-semibold">{num(c.stats.avgMFE)} R</td>
                  <td className="py-1.5 text-center">{pct(c.stats.mfe2R)}</td>
                  <td className={`py-1.5 text-center ${rColor(c.stats.avgR)}`}>{num(c.stats.avgR)}</td>
                </tr>
              ))}
              {stats.topMFE.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-slate-500">אין עדיין שילובים עם מספיק עסקאות</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── לפי אסטרטגיה: האישורים הכי טובים ── */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(stats.stratFlag).map(([s, rows]) => (
          <div key={s} className="card p-3 overflow-x-auto">
            <h3 className="font-semibold mb-2">{stats.stratHe[s] ?? s} — האישורים שהכי עוזרים</h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">אישור</th><th className="pb-1">עסקאות</th><th className="pb-1">הצלחה</th><th className="pb-1">ממוצע R</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.flag} className="border-b border-surface-border">
                    <td className="py-1 pr-2 text-right">{r.he}</td>
                    <td className="py-1 text-center">{r.stats.n}</td>
                    <td className="py-1 text-center">{pct(r.stats.winRate)}</td>
                    <td className={`py-1 text-center font-semibold ${rColor(r.stats.avgR)}`}>{num(r.stats.avgR)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-slate-500">אין מספיק עסקאות</td></tr>}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* ── רשימת העסקאות ── */}
      <div className="card p-3 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h3 className="font-semibold">כל העסקאות ({trades.length})</h3>
          <select className="bg-surface-raised border border-surface-border rounded px-2 py-1 text-sm" value={stratFilter} onChange={e => { setStratFilter(e.target.value); setPage(0) }}>
            <option value="all">כל האסטרטגיות</option>
            {Object.entries(stats.stratHe).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="bg-surface-raised border border-surface-border rounded px-2 py-1 text-sm" value={comboFilter} onChange={e => { setComboFilter(e.target.value); setPage(0) }}>
            <option value="all">כל הנכסים והמסגרות</option>
            {comboNames.map(k => <option key={k} value={k}>{`${stats.combos[k].sym?.split(':')[1] ?? k} · ${resHe[stats.combos[k].res] ?? stats.combos[k].res}`}</option>)}
          </select>
          <div className="text-xs text-slate-500 mr-auto">
            עמוד {page + 1} / {pages}
            <button className="btn-ghost px-2 py-0.5 mx-1" onClick={() => setPage(p => Math.max(0, p - 1))}>‹</button>
            <button className="btn-ghost px-2 py-0.5" onClick={() => setPage(p => Math.min(pages - 1, p + 1))}>›</button>
          </div>
        </div>
        <table className="w-full text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="text-right pb-1">כניסה</th>
              <th className="pb-1">נכס · מסגרת</th>
              <th className="pb-1">אסטרטגיה</th>
              <th className="pb-1">כיוון</th>
              <th className="pb-1">מחיר כניסה</th>
              <th className="pb-1">סטופ</th>
              <th className="pb-1">יעד</th>
              <th className="pb-1">תוצאה</th>
              <th className="pb-1">R</th>
              <th className="pb-1">תנועה (R)</th>
              <th className="pb-1">נרות</th>
              <th className="pb-1">פאזה</th>
              <th className="pb-1">סשן</th>
              <th className="pb-1">אישורים בכניסה</th>
            </tr>
          </thead>
          <tbody>
            {pageTrades.map((t, i) => {
              const flagsOn = stats.flags.filter((f, idx) => t.flags[idx] === '1').map(f => f.he)
              const c = stats.combos[t.combo]
              return (
                <tr key={`${t.combo}-${t.entryTime}-${i}`} className="border-b border-surface-border align-top">
                  <td className="py-1 pr-1 text-right whitespace-nowrap">{dt(t.entryTime)}</td>
                  <td className="py-1 text-center whitespace-nowrap">{c?.sym?.split(':')[1] ?? t.combo} · {resHe[c?.res] ?? c?.res}</td>
                  <td className="py-1 text-center">{stats.stratHe[t.strat] ?? t.strat}</td>
                  <td className={`py-1 text-center ${t.side === 'L' ? 'text-emerald-400' : 'text-red-400'}`}>{t.side === 'L' ? 'לונג' : 'שורט'}</td>
                  <td className="py-1 text-center">{t.entry}</td>
                  <td className="py-1 text-center">{t.stop}</td>
                  <td className="py-1 text-center">{t.target}</td>
                  <td className="py-1 text-center">{t.outcome === 'win' ? '✅ יעד' : t.outcome === 'loss' ? '❌ סטופ' : t.outcome === 'open' ? '⏳ פתוחה' : '➖ סגירה'}</td>
                  <td className={`py-1 text-center font-semibold ${rColor(t.r)}`}>{t.r === null ? '—' : t.r.toFixed(1)}</td>
                  <td className="py-1 text-center">{num(t.mfe, 1)}</td>
                  <td className="py-1 text-center">{t.bars ?? '—'}</td>
                  <td className="py-1 text-center">{stats.phHe[String(t.phase)] ?? t.phase}</td>
                  <td className="py-1 text-center">{stats.sesHe[String(t.ses)] ?? t.ses}</td>
                  <td className="py-1 text-right text-slate-400 max-w-md">{flagsOn.join(' · ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {path && <PathSection path={path} />}
    </div>
  )
}
