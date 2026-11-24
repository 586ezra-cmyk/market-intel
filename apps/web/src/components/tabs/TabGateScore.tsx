'use client'

import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/api'
import type { GateSignalRow } from '@/components/live/EntryGate'

// ─── מדד הרמזור: המערכת מודדת את עצמה ───
// כל "ירוק" שנשלח נרשם בשרת, ואחריו מה קרה. כאן רואים כמה היו טובים וכמה לא: בסך הכול, לפי יום, לפי כיוון,
// עם אישור Bookmap מול בלעדיו, לפי שעה, ומה היה יוצא אם לוקחים אותם לפי חוקי היום.
interface Tally { n: number; good: number; bad: number; closed: number; open: number; winPct: number | null; sumR: number; usd: number; hit1: number }
interface Score {
  supported: true; symbol: string; serverTs: number; since: number | null; blocked: number
  rules: { stopPts: number; rr: number; contracts: number; unit: string; riskUsd: number; rewardUsd: number; maxTrades: number; maxLosses: number; cooldownMin: number; dayTargetUsd: number }
  total: Tally
  current?: Tally                       // השיטה הנוכחית בלבד: 15 דק׳ ← 5 דק׳ ← דקה
  byMethod?: Array<Tally & { key: string }>
  bySource: Array<Tally & { key: string }>; byDir: Array<Tally & { key: string }>; byVol: Array<Tally & { key: string }>; byHour: Array<Tally & { key: string }>
  byDay: Array<Tally & { day: string; byRules: Tally & { ids: number[] } }>
  list: GateSignalRow[]
}
const num = (v: number, d = 2) => v.toLocaleString('en-US', { maximumFractionDigits: d })
const signed = (v: number, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), d)}`
const tone = (v: number) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-white')
const timeFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const dayFmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const KEY_HE: Record<string, string> = {
  bookmap: 'עם אישור Bookmap', tv: 'TradingView בלבד', long: 'לונג', short: 'שורט',
  volatile: 'תנודתי (נר דקה ממוצע גדול מהסטופ)', calm: 'רגוע',
  mtf: 'השיטה הנוכחית: 15 דק׳ ← 5 דק׳ ← אישור בדקה', v1: 'השיטה הקודמת: נר דקה בלבד (עד 24.11)',
}

function Tile({ label, value, cls = 'text-white', sub }: { label: string; value: string; cls?: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-3xl font-black tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}
function Breakdown({ title, rows, keyLabel }: { title: string; rows: Array<Tally & { key: string }>; keyLabel?: (k: string) => string }) {
  return (
    <div className="card !p-3">
      <div className="font-bold mb-1.5">{title}</div>
      {rows.length === 0 ? <div className="text-sm text-slate-500">אין עדיין נתונים</div> : (
        <table className="w-full text-sm">
          <thead><tr className="text-slate-400 text-xs border-b border-surface-border"><th className="text-right py-1 font-normal"> </th><th className="font-normal">נשלחו</th><th className="font-normal">טובות</th><th className="font-normal">לא טובות</th><th className="font-normal">הצלחה</th><th className="font-normal">R</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.key} className="border-b border-surface-border">
              <td className="py-1 text-right text-white">{keyLabel ? keyLabel(r.key) : (KEY_HE[r.key] ?? r.key)}</td>
              <td className="text-center tabular-nums">{r.n}</td>
              <td className="text-center tabular-nums text-emerald-400">{r.good}</td>
              <td className="text-center tabular-nums text-red-400">{r.bad}</td>
              <td className="text-center tabular-nums">{r.winPct != null ? `${r.winPct}%` : '—'}</td>
              <td className={`text-center tabular-nums font-bold ${tone(r.sumR)}`}>{signed(r.sumR)}</td>
            </tr>))}
          </tbody>
        </table>
      )}
    </div>
  )
}
function status(s: GateSignalRow): { text: string; cls: string } {
  const r = s.r != null ? ` (${signed(s.r)}R)` : ''
  if (s.status === 'target') return { text: `טובה: הגיעה ליעד${r}`, cls: 'text-emerald-400' }
  if (s.status === 'stop') return { text: `לא טובה: סטופ${r}${s.ambiguous ? ' · סטופ ויעד באותו נר' : ''}${s.hit1At ? ' · נגעה ב-1:1 לפני כן' : ''}`, cls: 'text-red-400' }
  if (s.status === 'expired') return { text: `נסגרה בסוף הסשן${r}`, cls: 'text-slate-300' }
  return { text: s.hit1At ? 'עוד פתוחה · נגעה ב-1:1' : 'עוד פתוחה', cls: 'text-amber-300' }
}

export default function TabGateScore() {
  const [sc, setSc] = useState<Score | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openRow, setOpenRow] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => fetch(`${API_BASE}/api/live/NQ/gate-score`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(j => { if (alive) { setSc(j); setErr(null) } })
      .catch(e => { if (alive) setErr(String(e.message ?? e)) })
    load(); const id = setInterval(load, 15_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  if (err && !sc) return <div className="p-4 text-sm text-red-400" dir="rtl">המדד לא נטען ({err}).</div>
  if (!sc) return <div className="p-4 text-sm text-slate-400" dir="rtl">טוען…</div>
  const t = sc.total; const decided = t.good + t.bad
  const verdict = t.n === 0 ? 'עוד לא נשלח אף ירוק.'
    : decided < 30 ? `עד עכשיו ${t.good} טובות מתוך ${decided} שהוכרעו. ${decided} זה מדגם קטן מדי כדי לדעת אם הרמזור טוב; צריך לפחות 30.`
    : t.sumR > 0 ? `${t.good} טובות מתוך ${decided}. בסך הכול הרמזור בפלוס של ${num(t.sumR)}R.`
    : `${t.good} טובות מתוך ${decided}. בסך הכול הרמזור במינוס של ${num(Math.abs(t.sumR))}R: בצורה הזאת הוא לא מרוויח.`

  return (
    <div className="p-3 space-y-3 max-w-[1300px] mx-auto" dir="rtl">
      <div className="card !p-3">
        <div className="text-lg font-black text-white">🎯 מדד הרמזור · נאסד״ק</div>
        <div className="text-sm text-slate-300 mt-1">{verdict}</div>
        {sc.current && (
          <div className="text-sm text-sky-200 mt-1">
            מאז המעבר לשיטה של 15 דק׳ ← 5 דק׳ ← דקה: {sc.current.n === 0 ? 'עוד לא נשלח אף ירוק.' : `${sc.current.n} ירוקים, ${sc.current.good} טובות, ${sc.current.bad} לא טובות, ${signed(sc.current.sumR)}R.`}
          </div>
        )}
        <div className="text-[11px] text-slate-500 mt-1 leading-4">
          {sc.since ? `נמדד מאז ${timeFmt.format(new Date(sc.since))}. ` : ''}
          טובה = הגיעה ליעד 1:{sc.rules.rr} לפני הסטופ ({sc.rules.stopPts} נק׳). הכניסה לפי מחיר הסגירה של נר האיתות, בלי עמלות ובלי החלקה. הכסף מחושב לפי {sc.rules.contracts} {sc.rules.unit} ({num(sc.rules.riskUsd, 0)}$ סיכון).
          {sc.blocked > 0 ? ` ${sc.blocked} ירוקים נחסמו (חדשות או נעילה) ולא נספרים.` : ''}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <Tile label="ירוקים שנשלחו" value={String(t.n)} sub={t.open ? `${t.open} עוד פתוחות` : undefined} />
        <Tile label="טובות (יעד)" value={String(t.good)} cls="text-emerald-400" />
        <Tile label="לא טובות (סטופ)" value={String(t.bad)} cls="text-red-400" />
        <Tile label="אחוז הצלחה" value={t.winPct != null ? `${t.winPct}%` : '—'} sub={`ביעד 1:${sc.rules.rr} צריך מעל ${Math.round(100 / (1 + sc.rules.rr))}% כדי להרוויח`} />
        <Tile label="סך הכול ביחידות סיכון" value={`${signed(t.sumR)}R`} cls={tone(t.sumR)} />
        <Tile label="סך הכול בדולרים" value={`${signed(t.usd, 0)}$`} cls={tone(t.usd)} sub="אילו נלקחו כולן" />
      </div>

      <div className="card !p-3">
        <div className="font-bold mb-1.5">לפי יום</div>
        {sc.byDay.length === 0 ? <div className="text-sm text-slate-500">אין עדיין נתונים</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs border-b border-surface-border">
                <th className="text-right py-1 font-normal">יום</th><th className="font-normal">נשלחו</th><th className="font-normal">טובות</th><th className="font-normal">לא טובות</th><th className="font-normal">הצלחה</th><th className="font-normal">R</th><th className="font-normal">$ אילו נלקחו כולן</th>
                <th className="font-normal border-r border-surface-border">לפי החוקים שלך: נלקחו</th><th className="font-normal">טובות</th><th className="font-normal">לא טובות</th><th className="font-normal">$</th>
              </tr>
            </thead>
            <tbody>{sc.byDay.map(d => (
              <tr key={d.day} className="border-b border-surface-border">
                <td className="py-1 text-right text-white">{dayFmt(d.day)}</td>
                <td className="text-center tabular-nums">{d.n}</td>
                <td className="text-center tabular-nums text-emerald-400">{d.good}</td>
                <td className="text-center tabular-nums text-red-400">{d.bad}</td>
                <td className="text-center tabular-nums">{d.winPct != null ? `${d.winPct}%` : '—'}</td>
                <td className={`text-center tabular-nums font-bold ${tone(d.sumR)}`}>{signed(d.sumR)}</td>
                <td className={`text-center tabular-nums ${tone(d.usd)}`}>{signed(d.usd, 0)}$</td>
                <td className="text-center tabular-nums border-r border-surface-border">{d.byRules.n}</td>
                <td className="text-center tabular-nums text-emerald-400">{d.byRules.good}</td>
                <td className="text-center tabular-nums text-red-400">{d.byRules.bad}</td>
                <td className={`text-center tabular-nums font-bold ${tone(d.byRules.usd)}`}>{signed(d.byRules.usd, 0)}$</td>
              </tr>))}
            </tbody>
          </table>
        )}
        <div className="mt-2 text-[11px] text-slate-500 leading-4">
          &quot;לפי החוקים שלך&quot;: עסקה אחת בכל פעם, צינון {sc.rules.cooldownMin} דק׳ אחרי הפסד, נעילה אחרי {sc.rules.maxLosses} הפסדים, עד {sc.rules.maxTrades} עסקאות, עצירה ב-+{num(sc.rules.dayTargetUsd, 0)}$.
          כמה ירוקים צמודים הם בדרך כלל אותו מהלך, ולכן המספר הזה קרוב יותר למה שאפשר היה לקחת בפועל.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Breakdown title="לפי שיטה" rows={sc.byMethod ?? []} />
        <Breakdown title="עם אישור Bookmap מול בלעדיו" rows={sc.bySource} />
        <Breakdown title="לפי כיוון" rows={sc.byDir} />
        <Breakdown title="תנודתי מול רגוע" rows={sc.byVol} />
        <Breakdown title="לפי שעה (שעון ישראל)" rows={sc.byHour} keyLabel={k => `${k}:00`} />
      </div>

      <div className="card !p-3 text-sm text-slate-300">
        אילו היעד היה 1:1 במקום 1:{sc.rules.rr}: <b className="text-white">{t.hit1}</b> מתוך <b className="text-white">{t.n}</b> נגעו ביעד 1:1 לפני הסטופ.
      </div>

      <div className="card !p-3">
        <div className="font-bold mb-1.5">כל הירוקים (לחיצה על שורה = למה נשלח)</div>
        {sc.list.length === 0 ? <div className="text-sm text-slate-500">עוד לא נשלח אף ירוק.</div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-slate-400 text-xs border-b border-surface-border"><th className="text-right py-1 font-normal">מתי</th><th className="font-normal">כיוון</th><th className="font-normal">כניסה</th><th className="font-normal">הכי רחוק לטובה</th><th className="font-normal">הכי רחוק נגד</th><th className="font-normal">CVD</th><th className="text-right font-normal">מה קרה</th></tr></thead>
            <tbody>{sc.list.map(r => { const st = status(r); return [
              <tr key={r.id} onClick={() => setOpenRow(openRow === r.id ? null : r.id)} className="border-b border-surface-border cursor-pointer hover:bg-surface">
                <td className="py-1 text-right tabular-nums text-slate-300">{timeFmt.format(new Date(r.ts))}</td>
                <td className={`text-center font-bold ${r.dir === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>{r.dir === 'long' ? 'לונג' : 'שורט'}</td>
                <td className="text-center tabular-nums">{num(r.entry)}</td>
                <td className="text-center tabular-nums text-emerald-300">{num(r.mfe)}</td>
                <td className="text-center tabular-nums text-red-300">{num(r.mae)}</td>
                <td className={`text-center text-xs ${r.cvdSrc === 'bookmap' ? 'text-sky-300' : 'text-slate-500'}`}>{r.cvdSrc === 'bookmap' ? 'Bookmap ✓' : 'TV בלבד'}</td>
                <td className={`text-right ${st.cls}`}>{st.text}</td>
              </tr>,
              openRow === r.id && (
                <tr key={`${r.id}-why`} className="border-b border-surface-border bg-black/30">
                  <td colSpan={7} className="py-1.5 px-2 text-right text-xs text-slate-300 leading-5">
                    {(r.why?.length ?? 0) > 0 ? r.why!.map((w, i) => <div key={i}>✓ {w}</div>) : 'לאיתות הזה לא נשמר הסבר (נרשם לפני שהתוספת עלתה).'}
                    <div className="text-slate-500 tabular-nums">כניסה {num(r.entry)} · סטופ {num(r.stop)} · יעד {num(r.t2)}</div>
                  </td>
                </tr>),
            ] })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
