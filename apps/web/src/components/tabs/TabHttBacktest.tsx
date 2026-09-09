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

export default function TabHttBacktest() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stratFilter, setStratFilter] = useState<string>('all')
  const [comboFilter, setComboFilter] = useState<string>('all')
  const [page, setPage] = useState(0)

  useEffect(() => {
    fetch('/htt-backtest/stats.json', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setStats)
      .catch(e => setError(String(e)))
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
    </div>
  )
}
