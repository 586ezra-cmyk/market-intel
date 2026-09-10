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

interface FibAgg {
  n: number
  he?: string
  rightDir1R?: number | null
  reach2?: number | null
  reach3?: number | null
  s1AvgR?: number
  s1Win?: number | null
  s4AvgR?: number
  s4Win?: number | null
  fibStopR?: { p50: number | null; p25: number | null; p75: number | null; n: number }
  fibStopHit?: number | null
  courseStopHit?: number | null
  t0?: { he: string; medianR: number | null; n: number; hitBeforeCourseStop: number | null; hitBeforeFibStop: number | null }
  t1?: { he: string; medianR: number | null; n: number; hitBeforeCourseStop: number | null; hitBeforeFibStop: number | null }
  t2?: { he: string; medianR: number | null; n: number; hitBeforeCourseStop: number | null; hitBeforeFibStop: number | null }
  schemes?: Record<string, { n: number; avgR: number; winRate: number | null }>
  significant?: boolean
}

interface FibStats {
  generatedAt: string
  minN: number
  nSignals: number
  nWithLeg: number
  zonesHe: Record<string, string>
  rangeZonesHe: Record<string, string>
  stratHe: Record<string, string>
  all: FibAgg
  zones: Record<string, FibAgg>
  zoneDist: Record<string, number>
  rangeZones: Record<string, Record<string, FibAgg>>
  flagRows: Array<{ flag: string; he: string; golden: FibAgg; other: FibAgg; liftS1: number; liftS4: number; liftDir: number }>
  byStrat: Record<string, { golden: FibAgg; other: FibAgg }>
  byRes: Record<string, { golden: FibAgg; other: FibAgg }>
}

interface RankRow { flag: string; he: string; n: number; dir: number; dirLift: number; r2: number; s4: number; s4Lift: number; s1: number; s1Lift: number; cons: string; w: number }
interface RankData { rows: RankRow[]; weights: Record<string, number> }
interface ComboRowX { flags: string[]; he: string[]; k: number; n: number; dir: number; r2: number; s4: number; s1: number; byStrat: Record<string, number> }
interface ComboGroup { base: { n: number; dir: number; r2: number; s4: number; s1: number }; searched: number; byR: ComboRowX[]; byDir: ComboRowX[] }
interface CombosData { generatedAt: string; nSignals: number; negativesExcluded: string[]; groups: Record<string, ComboGroup> }
interface LevelsData { pos: string[]; neg: string[]; posHe: string[]; negHe: string[]; levels: Record<string, { all: { n: number; dir: number; r2: number; s4: number; s1: number }; per: Record<string, { n: number; dir: number; r2: number; s4: number; s1: number } | null> }> }

interface YearBrief { n: number; rightDir1R?: number | null; reach2?: number | null; reach3?: number | null; s1R?: number | null; s4R?: number | null; s4Win?: number | null; advP80?: number | null; lift?: number }
interface YearFlagRow { flag: string; he: string; byTf: Record<string, YearBrief>; bySym: Record<string, YearBrief>; all: YearBrief; stable: string | null }
interface YearCoverage { sym: string; res: string; windows: number; bars: number; from: number | null; to: number | null; nAll: number; n365: number; dup: number; agree: number; errors: number }
interface YearPool { he: string; types: string[]; nSignals: number; base: Record<string, YearBrief>; baseSym: Record<string, Record<string, YearBrief>>; flagRows: YearFlagRow[]; levels: Record<string, Record<string, YearBrief>> }
interface YearData {
  generatedAt: string
  days: number
  warmupBars: number
  minN: number
  nSignals: number
  flagsHe: Record<string, string>
  stratHe: Record<string, string>
  pos: string[]
  neg: string[]
  coverage: Record<string, YearCoverage>
  pools: Record<string, YearPool>
  stratRows: Record<string, Record<string, YearBrief>>
  months: Record<string, Record<string, number>>
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

const FIB_SCHEME_HE: Record<string, string> = {
  courseStop_t0: 'סטופ הקורס · יעד קצה התנועה (0)', courseStop_t1: 'סטופ הקורס · יעד 1.272', courseStop_t2: 'סטופ הקורס · יעד 1.618',
  fibStop_t0: 'סטופ פיבו (מעבר ל-1.0) · יעד 0', fibStop_t1: 'סטופ פיבו · יעד 1.272', fibStop_t2: 'סטופ פיבו · יעד 1.618',
}

function FibRow({ name, a, minN }: { name: string; a: FibAgg; minN: number }) {
  return (
    <tr className={`border-b border-surface-border ${a.n < minN ? 'opacity-50' : ''}`}>
      <td className="py-1.5 pr-2 text-right whitespace-nowrap">{name}</td>
      <td className="py-1.5 text-center">{a.n}</td>
      <td className="py-1.5 text-center">{pct(a.rightDir1R)}</td>
      <td className="py-1.5 text-center">{pct(a.reach2)}</td>
      <td className={`py-1.5 text-center ${rColor(a.s1AvgR)}`}>{num(a.s1AvgR)}</td>
      <td className={`py-1.5 text-center font-semibold ${rColor(a.s4AvgR)}`}>{num(a.s4AvgR)}</td>
      <td className="py-1.5 text-center">{pct(a.fibStopHit)} / {pct(a.courseStopHit)}</td>
      <td className="py-1.5 text-center">{pct(a.t0?.hitBeforeFibStop)}</td>
      <td className="py-1.5 text-center">{pct(a.t1?.hitBeforeFibStop)}</td>
      <td className={`py-1.5 text-center ${rColor(a.schemes?.fibStop_t1?.avgR)}`}>{num(a.schemes?.fibStop_t1?.avgR)}</td>
    </tr>
  )
}

function FibTable({ title, rows, minN, hint }: { title: string; rows: Array<[string, FibAgg]>; minN: number; hint?: string }) {
  return (
    <div className="card p-3 overflow-x-auto">
      <div className="flex items-baseline justify-between mb-1"><h3 className="font-semibold">{title}</h3>{hint && <span className="text-[11px] text-slate-500">{hint}</span>}</div>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="text-right pb-1">קבוצה</th>
            <th className="pb-1">סיגנלים</th>
            <th className="pb-1">הלכו נכון (1R)</th>
            <th className="pb-1">הגיעו ל-2R</th>
            <th className="pb-1">1:3 קבוע (R)</th>
            <th className="pb-1">גרירה S4 (R)</th>
            <th className="pb-1">סטופ פיבו / קורס נפגע</th>
            <th className="pb-1">הגיעו לקצה התנועה</th>
            <th className="pb-1">הגיעו ל-1.272</th>
            <th className="pb-1">סטופ פיבו + יעד 1.272 (R)</th>
          </tr>
        </thead>
        <tbody>{rows.map(([name, a]) => <FibRow key={name} name={name} a={a} minN={minN} />)}</tbody>
      </table>
    </div>
  )
}

function FibSection({ fib }: { fib: FibStats }) {
  const a = fib.all
  const zoneRows: Array<[string, FibAgg]> = Object.entries(fib.zones).map(([k, v]) => [fib.zonesHe[k] ?? k, v])
  const stratRows: Array<[string, FibAgg]> = Object.entries(fib.byStrat).flatMap(([k, v]) => [[`${fib.stratHe[k] ?? k} · באזור הזהב`, v.golden], [`${fib.stratHe[k] ?? k} · מחוץ לאזור הזהב`, v.other]] as Array<[string, FibAgg]>)
  const resRows: Array<[string, FibAgg]> = Object.entries(fib.byRes).flatMap(([k, v]) => [[`${resHe[k] ?? k} · באזור הזהב`, v.golden], [`${resHe[k] ?? k} · מחוץ`, v.other]] as Array<[string, FibAgg]>)
  const rangeRows = (scope: string): Array<[string, FibAgg]> => Object.entries(fib.rangeZones[scope] ?? {}).map(([k, v]) => [fib.rangeZonesHe[k] ?? k, v])
  const golden = fib.zones.golden
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h2 className="text-xl font-bold">🌀 פיבונאצ'י — כאישור, לסטופ וליעד</h2>
        <div className="text-xs text-slate-500">לפי הקורס (4-5, 4-6, 25-9): תנועה אחת, מפתיל לפתיל, מהפיבוט האחרון עד הקיצון שאחריו · אזור הזהב 0.618–0.786 · סטופ מעבר ל-1.0 · יעדים 0 / 1.272 / 1.618 · {fib.nWithLeg} מתוך {fib.nSignals} סיגנלים עם תנועה מדידה · עודכן {dt(Date.parse(fib.generatedAt))}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="כניסות באזור הזהב" value={String(golden?.n ?? 0)} sub={`${pct((golden?.n ?? 0) / Math.max(1, fib.nWithLeg))} מהסיגנלים`} />
        <Kpi label="הלכו נכון: זהב מול השאר" value={`${pct(golden?.rightDir1R)} / ${pct(a.rightDir1R)}`} tone={(golden?.rightDir1R ?? 0) > (a.rightDir1R ?? 0) ? 'good' : 'bad'} />
        <Kpi label="גרירה S4: זהב מול הכל" value={`${num(golden?.s4AvgR)} / ${num(a.s4AvgR)}`} tone={(golden?.s4AvgR ?? 0) > (a.s4AvgR ?? 0) ? 'good' : 'bad'} />
        <Kpi label="סטופ פיבו לעומת סטופ הקורס" value={`×${num(a.fibStopR?.p50)}`} sub="חציון המרחק, 1.0 = סטופ הקורס" />
        <Kpi label="סטופ פיבו נפגע / סטופ הקורס נפגע" value={`${pct(a.fibStopHit)} / ${pct(a.courseStopHit)}`} />
        <Kpi label="הגיעו לקצה התנועה / ל-1.272" value={`${pct(a.t0?.hitBeforeFibStop)} / ${pct(a.t1?.hitBeforeFibStop)}`} sub="לפני סטופ הפיבו" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-3 overflow-x-auto">
          <h3 className="font-semibold mb-1">שש שיטות פיבונאצ'י לסטופ וליעד, כל הסיגנלים</h3>
          <p className="text-[11px] text-slate-500 mb-2">ממוצע R ביחידות של הסטופ שבשימוש. עסקה שלא הוכרעה עד סוף האופק נספרת בשווי השוק.</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">שיטה</th><th className="pb-1">סיגנלים</th><th className="pb-1">הצלחה</th><th className="pb-1">ממוצע R</th></tr></thead>
            <tbody>
              {Object.entries(a.schemes ?? {}).map(([k, v]) => <tr key={k} className="border-b border-surface-border"><td className="py-1 text-right">{FIB_SCHEME_HE[k] ?? k}</td><td className="text-center">{v.n}</td><td className="text-center">{pct(v.winRate)}</td><td className={`text-center font-semibold ${rColor(v.avgR)}`}>{num(v.avgR)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="card p-3 overflow-x-auto">
          <h3 className="font-semibold mb-1">יעדי הפיבונאצ'י — מרחק והגעה</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">יעד</th><th className="pb-1">חציון מרחק (R של הקורס)</th><th className="pb-1">הושג לפני סטופ הקורס</th><th className="pb-1">הושג לפני סטופ הפיבו</th></tr></thead>
            <tbody>
              {(['t0', 't1', 't2'] as const).map(k => { const v = a[k]; return v ? <tr key={k} className="border-b border-surface-border"><td className="py-1 text-right">{v.he}</td><td className="text-center">{num(v.medianR, 1)}</td><td className="text-center">{pct(v.hitBeforeCourseStop)}</td><td className="text-center">{pct(v.hitBeforeFibStop)}</td></tr> : null })}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">סטופ הפיבו: חציון ×{num(a.fibStopR?.p50)} מסטופ הקורס (רבעונים ×{num(a.fibStopR?.p25)} – ×{num(a.fibStopR?.p75)}).</p>
        </div>
      </div>
      <FibTable title="לפי עומק התיקון בכניסה (כאישור)" rows={zoneRows} minN={fib.minN} hint="0 = בקצה התנועה, 1 = בתחילתה" />
      <div className="grid lg:grid-cols-3 gap-4">
        <FibTable title="מיקום בטווח התהליך" rows={rangeRows('process')} minN={fib.minN} />
        <FibTable title="מיקום בטווח היומי" rows={rangeRows('daily')} minN={fib.minN} />
        <FibTable title="מיקום בטווח השבועי" rows={rangeRows('weekly')} minN={fib.minN} />
      </div>
      <FibTable title="לפי אסטרטגיה — באזור הזהב מול מחוץ לו" rows={stratRows} minN={fib.minN} />
      <FibTable title="לפי מסגרת זמן — באזור הזהב מול מחוץ לו" rows={resRows} minN={fib.minN} />
      <div className="card p-3 overflow-x-auto">
        <h3 className="font-semibold mb-1">אזור הזהב על גבי כל אחד מהאישורים שלנו</h3>
        <p className="text-[11px] text-slate-500 mb-2">לכל אישור: הסיגנלים עם האישור שנכנסו באזור הזהב (0.618–0.786 של התנועה האחרונה) מול אלה שנכנסו מחוץ לו. שיפור = ההפרש בממוצע R עם גרירה (S4).</p>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">אישור</th><th className="pb-1">בזהב: n</th><th className="pb-1">בזהב: הלכו נכון</th><th className="pb-1">בזהב: S4</th><th className="pb-1">מחוץ: n</th><th className="pb-1">מחוץ: הלכו נכון</th><th className="pb-1">מחוץ: S4</th><th className="pb-1">שיפור S4</th><th className="pb-1">שיפור כיוון</th></tr></thead>
          <tbody>
            {fib.flagRows.map(r => <tr key={r.flag} className="border-b border-surface-border"><td className="py-1 pr-2 text-right whitespace-nowrap">{r.he}</td><td className="text-center">{r.golden.n}</td><td className="text-center">{pct(r.golden.rightDir1R)}</td><td className={`text-center ${rColor(r.golden.s4AvgR)}`}>{num(r.golden.s4AvgR)}</td><td className="text-center">{r.other.n}</td><td className="text-center">{pct(r.other.rightDir1R)}</td><td className={`text-center ${rColor(r.other.s4AvgR)}`}>{num(r.other.s4AvgR)}</td><td className={`text-center font-semibold ${rColor(r.liftS4)}`}>{(r.liftS4 > 0 ? '+' : '') + r.liftS4.toFixed(2)}</td><td className={`text-center ${rColor(r.liftDir)}`}>{(r.liftDir > 0 ? '+' : '') + (r.liftDir * 100).toFixed(0)}%</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const GROUP_HE: Record<string, string> = { all: 'כל המסגרות והנכסים', '240': '4 שעות', '15': '15 דקות', '5': '5 דקות', BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL', NQ1: 'NQ' }
const STRAT_SHORT: Record<string, string> = { F: 'טיסה', W: 'כנף', O: 'OB', M: 'W/M' }

function RankSection({ rank, levels }: { rank: RankData; levels: LevelsData | null }) {
  const tier = (r: RankRow) => (r.w >= 0.15 ? 'דרגה 1 — עוגן' : r.w >= 0.05 ? 'דרגה 2 — תומך' : r.w > -0.05 ? 'דרגה 3 — ניטרלי' : r.w > -0.15 ? 'דרגה 4 — מוריד' : 'דרגה 5 — נגד')
  const tierColor = (r: RankRow) => (r.w >= 0.15 ? 'text-emerald-400' : r.w >= 0.05 ? 'text-emerald-300' : r.w > -0.05 ? 'text-slate-300' : r.w > -0.15 ? 'text-amber-400' : 'text-red-400')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h2 className="text-xl font-bold">🏅 דירוג כל האישורים</h2>
        <div className="text-xs text-slate-500">{rank.rows.length} אישורים · המדד: כמה R לעסקה האישור מוסיף (עם ניהול בגרירה) · יציבות = בכמה מ-3 מסגרות הזמן השיפור נשאר חיובי</div>
      </div>
      <div className="card p-3 text-xs text-slate-400 leading-relaxed">
        <b className="text-slate-200">איך לקרוא את הטבלה.</b> <b>עסקאות</b> = כמה סיגנלים היה בהם האישור. <b>הלכו נכון</b> = אחוז שהגיע ל-1R לפני שהסטופ נפגע.
        <b> שיפור כיוון</b> = ההפרש באחוז הזה מול סיגנלים בלי האישור. <b>R עם</b> = ממוצע R לעסקה (בגרירה) כשהאישור קיים.
        <b> שיפור R</b> = ההפרש מול בלי האישור: חיובי = האישור משפר, שלילי = מוריד. <b>שיפור 1:3</b> = אותו הפרש אבל ביעד קבוע 1:3.
        <b> יציבות</b> = בכמה מ-3 מסגרות הזמן השיפור נשאר חיובי (3/3 = עובד בכולן). <b>משקל</b> = שיפור R מעוגל ומכווץ לפי גודל המדגם, זה מה שקובע את הדרגה.
        R = יחידת סיכון: 1R = המרחק מהכניסה לסטופ. +0.20R על 100 עסקאות = 20R.
      </div>
      <div className="card p-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400">
            <tr><th className="text-right pb-1">דרגה</th><th className="text-right pb-1">אישור</th><th className="pb-1">עסקאות</th><th className="pb-1">הלכו נכון</th><th className="pb-1">שיפור כיוון</th><th className="pb-1">הגיעו ל-2R</th><th className="pb-1">R עם</th><th className="pb-1">שיפור R</th><th className="pb-1">שיפור 1:3</th><th className="pb-1">יציבות</th><th className="pb-1">משקל</th></tr>
          </thead>
          <tbody>
            {rank.rows.map(r => (
              <tr key={r.flag} className={`border-b border-surface-border ${r.n < 30 ? 'opacity-50' : ''}`}>
                <td className={`py-1 pr-2 text-right whitespace-nowrap ${tierColor(r)}`}>{tier(r)}</td>
                <td className="py-1 pr-2 text-right whitespace-nowrap">{r.he}</td>
                <td className="text-center">{r.n}</td>
                <td className="text-center">{pct(r.dir)}</td>
                <td className={`text-center ${rColor(r.dirLift)}`}>{(r.dirLift > 0 ? '+' : '') + (r.dirLift * 100).toFixed(0)}%</td>
                <td className="text-center">{pct(r.r2)}</td>
                <td className={`text-center ${rColor(r.s4)}`}>{num(r.s4)}</td>
                <td className={`text-center font-semibold ${rColor(r.s4Lift)}`}>{(r.s4Lift > 0 ? '+' : '') + r.s4Lift.toFixed(2)}</td>
                <td className={`text-center ${rColor(r.s1Lift)}`}>{(r.s1Lift > 0 ? '+' : '') + r.s1Lift.toFixed(2)}</td>
                <td className="text-center">{r.cons}</td>
                <td className={`text-center ${rColor(r.w)}`}>{(r.w > 0 ? '+' : '') + r.w.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {levels && (
        <div className="card p-3 overflow-x-auto">
          <h3 className="font-semibold mb-1">רמת ההתראה — מה כל רמה נתנה בבקטסט</h3>
          <p className="text-[11px] text-slate-500 mb-2">רמה = מספר אישורי דרגה 1 שנוכחים ({levels.posHe.join(', ')}) פחות אישורים נגד ({levels.negHe.join(', ')}). את הרמה המינימלית לטלגרם קובעים בטאב "ניהול התראות".</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">רמה</th><th className="pb-1">סיגנלים</th><th className="pb-1">הלכו נכון</th><th className="pb-1">הגיעו ל-2R</th><th className="pb-1">R בגרירה</th><th className="pb-1">R ב-1:3</th><th className="pb-1">4 שעות</th><th className="pb-1">15 דקות</th><th className="pb-1">5 דקות</th><th className="pb-1">עד 2024</th><th className="pb-1">2025 ואילך</th></tr></thead>
            <tbody>
              {Object.entries(levels.levels).map(([th, v]) => (
                <tr key={th} className="border-b border-surface-border">
                  <td className="py-1 text-right">{th === '-9' ? 'כל הסיגנלים' : `רמה ${th} ומעלה`}</td>
                  <td className="text-center">{v.all.n}</td>
                  <td className="text-center">{pct(v.all.dir)}</td>
                  <td className="text-center">{pct(v.all.r2)}</td>
                  <td className={`text-center font-semibold ${rColor(v.all.s4)}`}>{num(v.all.s4)}</td>
                  <td className={`text-center ${rColor(v.all.s1)}`}>{num(v.all.s1)}</td>
                  {(['240', '15', '5', 'early', 'late'] as const).map(k => { const p = v.per[k]; return <td key={k} className={`text-center ${rColor(p?.s4)}`}>{p ? `${p.n} · ${num(p.s4)}` : '—'}</td> })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CombosSection({ combos, group, setGroup, sort, setSort }: { combos: CombosData; group: string; setGroup: (g: string) => void; sort: 'byR' | 'byDir'; setSort: (s: 'byR' | 'byDir') => void }) {
  const g = combos.groups[group] ?? combos.groups.all
  const rows = g[sort]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h2 className="text-xl font-bold">🧩 אילו אישורים ביחד מצליחים הכי הרבה</h2>
        <div className="text-xs text-slate-500">חיפוש שיטתי על כל השילובים של 2–5 אישורים ({g.searched.toLocaleString()} שילובים בקבוצה הזו) · בסיס הקבוצה: {g.base.n} סיגנלים, הלכו נכון {pct(g.base.dir)}, R בגרירה {num(g.base.s4)}</div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {Object.keys(combos.groups).map(k => <button key={k} onClick={() => setGroup(k)} className={`px-3 py-1 rounded-lg text-xs border ${group === k ? 'bg-brand-600/20 border-brand-500/50 text-white' : 'border-slate-700 text-slate-400'}`}>{GROUP_HE[k] ?? k}</button>)}
        <span className="text-slate-600 mx-1">|</span>
        <button onClick={() => setSort('byR')} className={`px-3 py-1 rounded-lg text-xs border ${sort === 'byR' ? 'bg-brand-600/20 border-brand-500/50 text-white' : 'border-slate-700 text-slate-400'}`}>לפי R לעסקה</button>
        <button onClick={() => setSort('byDir')} className={`px-3 py-1 rounded-lg text-xs border ${sort === 'byDir' ? 'bg-brand-600/20 border-brand-500/50 text-white' : 'border-slate-700 text-slate-400'}`}>לפי "הלכו נכון"</button>
      </div>
      <p className="text-[11px] text-slate-500">אישורים שיצאו שליליים בדירוג לא נכללים בשילובים. שילובים עם מעט עסקאות (25–40) הם רמז, לא הוכחה: כשבודקים אלפי שילובים, חלק יוצאים טובים במקרה. שילוב שחוזר בכמה מסגרות זמן ונכסים הוא הרציני.</p>
      <div className="card p-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">#</th><th className="text-right pb-1">השילוב</th><th className="pb-1">עסקאות</th><th className="pb-1">הלכו נכון</th><th className="pb-1">הגיעו ל-2R</th><th className="pb-1">R בגרירה</th><th className="pb-1">R ב-1:3</th><th className="pb-1">סוגי כניסה</th></tr></thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={i} className="border-b border-surface-border">
                <td className="py-1 text-right text-slate-500">{i + 1}</td>
                <td className="py-1 pr-2 text-right">{c.he.join(' + ')}</td>
                <td className="text-center">{c.n}</td>
                <td className={`text-center ${c.dir >= 0.6 ? 'text-emerald-400 font-semibold' : ''}`}>{pct(c.dir)}</td>
                <td className="text-center">{pct(c.r2)}</td>
                <td className={`text-center font-semibold ${rColor(c.s4)}`}>{num(c.s4)}</td>
                <td className={`text-center ${rColor(c.s1)}`}>{num(c.s1)}</td>
                <td className="text-center text-slate-400 whitespace-nowrap">{Object.entries(c.byStrat).filter(([, v]) => v > 0).map(([k, v]) => `${STRAT_SHORT[k] ?? k} ${v}`).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const signed = (v?: number | null, d = 2) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(d))
const YEAR_TFS: Array<[string, string]> = [['240', '4 שעות'], ['15', '15 דקות'], ['5', '5 דקות']]

function YearCell({ b, minN, showR }: { b?: YearBrief; minN: number; showR?: boolean }) {
  if (!b || !b.n) return <td className="text-center text-slate-600">—</td>
  const weak = b.n < minN
  return (
    <td className={`text-center whitespace-nowrap ${weak ? 'opacity-40' : ''}`}>
      <span className="text-slate-400">{b.n}</span>
      {showR && <span className={`mr-1 ${rColor(b.s4R)}`}>{num(b.s4R)}</span>}
      {b.lift !== undefined && <span className={`mr-1 font-semibold ${rColor(b.lift)}`}>{signed(b.lift)}</span>}
    </td>
  )
}

function YearSection({ year }: { year: YearData }) {
  const [view, setView] = useState<'tf' | 'sym'>('tf')
  const [sortTf, setSortTf] = useState<string>('all')
  const [poolKey, setPoolKey] = useState<string>('course')
  const P = year.pools[poolKey] ?? year.pools.course
  const syms = Object.keys(P.baseSym)
  const symHe = (s: string) => s.split(':')[1]?.replace('USDT', '') ?? s
  const rows = useMemo(() => {
    const key = (r: YearFlagRow) => {
      const b = sortTf === 'all' ? r.all : view === 'tf' ? r.byTf[sortTf] : r.bySym[sortTf]
      return b && b.n >= year.minN && b.lift !== undefined ? b.lift : -99
    }
    return [...P.flagRows].sort((a, b) => key(b) - key(a))
  }, [P, sortTf, view, year.minN])
  const cov = Object.entries(year.coverage)
  const from = Math.min(...cov.map(([, c]) => c.from ?? Infinity))
  const to = Math.max(...cov.map(([, c]) => c.to ?? 0))
  const tierOf = (r: YearFlagRow) => {
    const l = r.all.n >= year.minN ? r.all.lift : undefined
    if (l === undefined) return ['—', 'text-slate-500']
    return l >= 0.15 ? ['עוגן', 'text-emerald-400'] : l >= 0.05 ? ['תומך', 'text-emerald-300'] : l > -0.05 ? ['ניטרלי', 'text-slate-300'] : l > -0.15 ? ['מוריד', 'text-amber-400'] : ['נגד', 'text-red-400']
  }
  const levelKeys = Object.keys(P.levels.all ?? {}).filter(k => Number(k) >= 0)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h2 className="text-xl font-bold">📅 בדיקת שנה — כל האישורים בכל מסגרות הזמן</h2>
        <div className="text-xs text-slate-500">
          {year.nSignals.toLocaleString()} סיגנלים · {year.days} ימים אחרונים ({dt(from)} → {dt(to)}) · 4 נכסים × 3 מסגרות · עודכן {dt(Date.parse(year.generatedAt))} · מובהק = לפחות {year.minN} סיגנלים
        </div>
      </div>
      <div className="card p-3 text-xs text-slate-400 leading-relaxed">
        <b className="text-slate-200">איך נאסף.</b> TradingView טוען רק כ-10,000 נרות לכל גרף (במנוי Plus), אז את השנה האחרונה אספתי ב"חלונות" של Bar Replay: כל חלון = 10,000 נרות אחורה מנקודת ה-Replay, החלונות חופפים, ו-{year.warmupBars.toLocaleString()} נרות החימום בתחילת כל חלון לא נספרים (שם המנוע עוד בלי היסטוריה). כל סיגנל נספר פעם אחת. 5 דקות ≈ 8–13 חלונות לנכס, 15 דקות ≈ 3–4, 4 שעות חלון אחד.
        <br />
        <b className="text-slate-200">איך לקרוא.</b> בכל תא: <span className="text-slate-400">מספר הסיגנלים</span> ואחריו <b>שיפור R</b> = ממוצע R לעסקה (ניהול בגרירה: איזון אחרי 1R ואז גרירה לפי פיבוטים) עם האישור, פחות הממוצע של כל הסיגנלים באותה מסגרת זמן. חיובי = האישור משפר, שלילי = מוריד. <b>יציבות</b> = בכמה מ-3 מסגרות הזמן (עם מדגם מספיק) השיפור חיובי. תא דהוי = מדגם קטן מדי. R = יחידת סיכון: המרחק מהכניסה לסטופ.
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">על אילו סיגנלים מודדים:</span>
        {Object.entries(year.pools).map(([k, pl]) => (
          <button key={k} onClick={() => setPoolKey(k)} className={`px-2 py-1 rounded ${poolKey === k ? 'bg-emerald-700 text-white' : 'bg-surface-border text-slate-300'}`}>{pl.he} · {pl.nSignals.toLocaleString()}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['all', 'כל המסגרות'], ...YEAR_TFS].map(([k, he]) => {
          const b = P.base[k]
          return <Kpi key={k} label={`${he} — כל הסיגנלים`} value={`${num(b?.s4R)} R`} sub={`${b?.n?.toLocaleString() ?? 0} סיגנלים · ${pct(b?.rightDir1R)} הלכו נכון · ${pct(b?.reach2)} הגיעו ל-2R`} tone={(b?.s4R ?? 0) > 0 ? 'good' : 'bad'} />
        })}
      </div>
      <div className="card p-3 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="font-semibold">כל האישורים — שיפור R לפי {view === 'tf' ? 'מסגרת זמן' : 'נכס'}</h3>
          <div className="flex flex-wrap gap-1 text-xs">
            <button onClick={() => { setView('tf'); setSortTf('all') }} className={`px-2 py-1 rounded ${view === 'tf' ? 'bg-emerald-700 text-white' : 'bg-surface-border text-slate-300'}`}>לפי מסגרת זמן</button>
            <button onClick={() => { setView('sym'); setSortTf('all') }} className={`px-2 py-1 rounded ${view === 'sym' ? 'bg-emerald-700 text-white' : 'bg-surface-border text-slate-300'}`}>לפי נכס</button>
            <span className="text-slate-500 mr-2">מיון לפי:</span>
            {[['all', 'הכול'], ...(view === 'tf' ? YEAR_TFS : syms.map(s => [s, symHe(s)] as [string, string]))].map(([k, he]) => (
              <button key={k} onClick={() => setSortTf(k)} className={`px-2 py-1 rounded ${sortTf === k ? 'bg-slate-600 text-white' : 'bg-surface-border text-slate-300'}`}>{he}</button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="text-right pb-1">דרגה</th><th className="text-right pb-1">אישור</th>
              <th className="pb-1">כל המסגרות<br /><span className="font-normal">סיגנלים · R · שיפור</span></th>
              {(view === 'tf' ? YEAR_TFS : syms.map(s => [s, symHe(s)] as [string, string])).map(([k, he]) => <th key={k} className="pb-1">{he}<br /><span className="font-normal">סיגנלים · שיפור</span></th>)}
              <th className="pb-1">יציבות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const [tierHe, tierCls] = tierOf(r)
              return (
                <tr key={r.flag} className="border-b border-surface-border">
                  <td className={`py-1 pr-2 text-right whitespace-nowrap ${tierCls}`}>{tierHe}</td>
                  <td className="py-1 pr-2 text-right whitespace-nowrap">{r.he}</td>
                  <YearCell b={r.all} minN={year.minN} showR />
                  {(view === 'tf' ? YEAR_TFS.map(([k]) => r.byTf[k]) : syms.map(s => r.bySym[s])).map((b, i) => <YearCell key={i} b={b} minN={year.minN} />)}
                  <td className="text-center">{r.stable ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-3 overflow-x-auto">
          <h3 className="font-semibold mb-1">לפי סוג טריגר</h3>
          <p className="text-[11px] text-slate-500 mb-2">בכל תא: סיגנלים · ממוצע R בגרירה · אחוז שהלכו נכון (1R לפני הסטופ)</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">טריגר</th><th className="pb-1">הכול</th>{YEAR_TFS.map(([k, he]) => <th key={k} className="pb-1">{he}</th>)}</tr></thead>
            <tbody>
              {Object.entries(year.stratRows).map(([k, v]) => (
                <tr key={k} className="border-b border-surface-border">
                  <td className="py-1 text-right whitespace-nowrap">{year.stratHe[k] ?? k}</td>
                  {['all', '240', '15', '5'].map(tf => { const b = v[tf]; return <td key={tf} className={`text-center whitespace-nowrap ${b && b.n < year.minN ? 'opacity-40' : ''}`}>{b && b.n ? <><span className="text-slate-400">{b.n}</span> <span className={rColor(b.s4R)}>{num(b.s4R)}</span> <span className="text-slate-500">{pct(b.rightDir1R)}</span></> : '—'}</td> })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-3 overflow-x-auto">
          <h3 className="font-semibold mb-1">רמת ההתראה על נתוני השנה</h3>
          <p className="text-[11px] text-slate-500 mb-2">רמה = אישורי דרגה 1 ({year.pos.map(k => year.flagsHe[k] ?? k).join(', ')}) פחות אישורים נגד ({year.neg.map(k => year.flagsHe[k] ?? k).join(', ')}). בכל תא: סיגנלים · ממוצע R בגרירה.</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">רמה</th><th className="pb-1">הכול</th>{YEAR_TFS.map(([k, he]) => <th key={k} className="pb-1">{he}</th>)}</tr></thead>
            <tbody>
              {levelKeys.map(k => (
                <tr key={k} className="border-b border-surface-border">
                  <td className="py-1 text-right whitespace-nowrap">{k === '0' ? 'רמה 0 ומעלה' : `רמה ${k} ומעלה`}</td>
                  {['all', '240', '15', '5'].map(tf => { const b = P.levels[tf]?.[k]; return <td key={tf} className={`text-center whitespace-nowrap ${b && b.n < year.minN ? 'opacity-40' : ''}`}>{b && b.n ? <><span className="text-slate-400">{b.n}</span> <span className={`font-semibold ${rColor(b.s4R)}`}>{num(b.s4R)}</span></> : '—'}</td> })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card p-3 overflow-x-auto">
        <h3 className="font-semibold mb-1">כיסוי הנתונים — מה נאסף לכל נכס ומסגרת</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400"><tr><th className="text-right pb-1">נכס · מסגרת</th><th className="pb-1">מתאריך</th><th className="pb-1">עד תאריך</th><th className="pb-1">חלונות Replay</th><th className="pb-1">נרות</th><th className="pb-1">סיגנלים (שנה)</th><th className="pb-1">כפילויות בחפיפה</th></tr></thead>
          <tbody>
            {cov.map(([k, c]) => (
              <tr key={k} className="border-b border-surface-border">
                <td className="py-1 text-right whitespace-nowrap">{symHe(c.sym)} · {resHe[c.res] ?? c.res}</td>
                <td className="text-center">{dt(c.from)}</td><td className="text-center">{dt(c.to)}</td>
                <td className="text-center">{c.windows}{c.errors ? ` (${c.errors} שגיאות)` : ''}</td>
                <td className="text-center">{c.bars.toLocaleString()}</td>
                <td className="text-center">{c.n365.toLocaleString()}</td>
                <td className="text-center text-slate-500">{c.dup ? `${c.dup} · ${pct(c.agree / c.dup)} זהות` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function TabHttBacktest() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [path, setPath] = useState<PathStats | null>(null)
  const [fib, setFib] = useState<FibStats | null>(null)
  const [rank, setRank] = useState<RankData | null>(null)
  const [combos, setCombos] = useState<CombosData | null>(null)
  const [levels, setLevels] = useState<LevelsData | null>(null)
  const [year, setYear] = useState<YearData | null>(null)
  const [comboGroup, setComboGroup] = useState<string>('all')
  const [comboSort, setComboSort] = useState<'byR' | 'byDir'>('byR')
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
    fetch('/htt-backtest/fib.json', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setFib(d) })
      .catch(() => {})
    for (const [file, setter] of [['rank', setRank], ['combos', setCombos], ['levels', setLevels], ['year', setYear]] as const) {
      fetch(`/htt-backtest/${file}.json`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d) (setter as (v: any) => void)(d) })
        .catch(() => {})
    }
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

      {year && <YearSection year={year} />}

      <div className="pt-2 text-sm text-slate-500">⬇ הסעיפים הבאים — הבקטסט המקורי על טווח הנרות הטעון בגרף (קצר יותר מהשנה): אסטרטגיות, מסלול המחיר, דירוג, צירופים ופיבונאצ'י.</div>

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

      {rank && <RankSection rank={rank} levels={levels} />}

      {combos && <CombosSection combos={combos} group={comboGroup} setGroup={setComboGroup} sort={comboSort} setSort={setComboSort} />}

      {fib && <FibSection fib={fib} />}
    </div>
  )
}
