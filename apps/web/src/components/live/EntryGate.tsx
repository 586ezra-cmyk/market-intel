'use client'

import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/lib/api'
import { useEyesFlow } from './eyesFlow'

// ─── רמזור הכניסה ───
// שורה אחת שאומרת מה המצב עכשיו: אין עסקה / מתקרב / עכשיו. מתחתיה: מה חסר, רשימת התנאים, מה אסור, חוקי היום, ויומן של כל "ירוק".
// הכול מחושב בשרת מנתוני TradingView (services/entryGate.ts). כאן רק מציגים.
// ירוק פירושו "הכללים מתקיימים עכשיו" ולא "העסקה תרוויח". המערכת לא שולחת פקודות.

export interface GateCondition { key: string; name: string; ok: boolean; detail: string; need: string | null }
export interface GatePlan { dir: 'long' | 'short'; entry: number; stop: number; t1: number; t2: number; stopPts: number; estimated: boolean; contracts: number; unit: string; riskUsd: number; rewardUsd: number }
export interface GateSignalRow {
  id: number; dir: 'long' | 'short'; barTime: number; ts: number; entry: number; stop: number; t1: number; t2: number; blocked: string | null
  status: 'open' | 'target' | 'stop' | 'expired'; r: number | null; hit1At: number | null; ambiguous: boolean; mfe: number; mae: number
  why?: string[]; cvdSrc?: 'bookmap' | 'tv'
}
export interface GateOn {
  supported: true; symbol: string; serverTs: number; dataAgeSec: number | null
  state: 'off' | 'red' | 'yellow' | 'green'; dir: 'long' | 'short' | null; headline: string; missing: string | null
  blocks: Array<{ key: string; text: string }>; warnings: string[]; conditions: GateCondition[]
  other: { dir: 'long' | 'short'; ok: number; total: number } | null
  plan: GatePlan | null
  signal: { id: number; ts: number; validUntil: number; secLeft: number; blocked: string | null } | null
  flow?: { source: 'bookmap' | 'tv'; cvd: 'up' | 'down' | 'flat' | null; ageSec: number | null }
  why?: string[]
  day: { date: string; trades: number; wins: number; losses: number; usd: number; maxTrades: number; maxLosses: number; dayTargetUsd: number; cooldownLeftMin: number; locked: string | null }
  rules: { stopPts: number; rr: number; startIl: string; newsMin: number; maxEmaDistPts: number; cooldownMin: number; contracts: number; unit: string; riskUsd: number; rewardUsd: number }
  log: {
    stats: { n: number; target: number; stop: number; expired: number; open: number; blocked: number; winPct: number | null; sumR: number; since: number | null
      bookmap?: { n: number; target: number; stop: number }; tv?: { n: number; target: number; stop: number } }
    recent: GateSignalRow[]; today: GateSignalRow[]
  }
}
export type Gate = GateOn | { supported: false; symbol: string }

const num = (v: number, d = 2) => v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d })
const DIR_HE = { long: 'לונג', short: 'שורט' } as const
const timeFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v))}`

const TONE = {
  green:  { box: 'border-emerald-400 bg-emerald-900/50', text: 'text-emerald-300', label: 'ירוק' },
  yellow: { box: 'border-amber-500 bg-amber-900/30', text: 'text-amber-300', label: 'צהוב' },
  red:    { box: 'border-red-700 bg-red-950/50', text: 'text-red-300', label: 'אדום' },
  off:    { box: 'border-slate-700 bg-surface-raised', text: 'text-slate-300', label: 'כבוי' },
} as const

function Lamp({ state }: { state: GateOn['state'] }) {
  const dot = (on: boolean, cls: string) => <span className={`block w-5 h-5 rounded-full border border-black/40 ${on ? cls : 'bg-slate-800'}`} />
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-black/40 p-2 shrink-0" role="img" aria-label={`רמזור: ${TONE[state].label}`}>
      {dot(state === 'red', 'bg-red-500 shadow-[0_0_12px_#ef4444]')}
      {dot(state === 'yellow', 'bg-amber-400 shadow-[0_0_12px_#fbbf24]')}
      {dot(state === 'green', 'bg-emerald-400 shadow-[0_0_14px_#34d399] animate-pulse')}
    </div>
  )
}

function statusText(s: GateSignalRow): { text: string; cls: string } {
  if (s.blocked) return { text: `נחסם · ${s.blocked}`, cls: 'text-slate-500' }
  const r = s.r != null ? ` (${signed(s.r)}R)` : ''
  if (s.status === 'target') return { text: `יעד ✓${r}`, cls: 'text-emerald-400' }
  if (s.status === 'stop') return { text: `סטופ ✗${r}${s.ambiguous ? ' · סטופ ויעד באותו נר' : ''}`, cls: 'text-red-400' }
  if (s.status === 'expired') return { text: `נסגר בסוף הסשן${r}`, cls: 'text-slate-300' }
  return { text: s.hit1At ? 'פתוח · נגע ב-1:1' : 'פתוח', cls: 'text-amber-300' }
}

/** שלושה צפצופים קצרים ברגע שנדלק ירוק. הדפדפן מרשה צליל רק אחרי לחיצה אחת כלשהי בדף. */
function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.type = 'sine'; osc.frequency.value = 880
      const t = ctx.currentTime + i * 0.22
      gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      osc.connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t + 0.2)
    }
    setTimeout(() => { void ctx.close() }, 1200)
  } catch { /* אין צליל — הרמזור עדיין מוצג */ }
}
const SOUND_KEY = 'htt-gate-sound'

export default function EntryGate({ gate, symbol, onChanged }: { gate: Gate | undefined; symbol: string; onChanged?: () => void }) {
  const [showLog, setShowLog] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sound, setSound] = useState(true)
  const [showWhy, setShowWhy] = useState(false)
  const [openRow, setOpenRow] = useState<number | null>(null)
  const eyes = useEyesFlow()
  const lastGreen = useRef<number | null>(null)
  useEffect(() => { try { if (localStorage.getItem(SOUND_KEY) === 'off') setSound(false) } catch { /* אין אחסון */ } }, [])
  // צליל פעם אחת לכל ירוק חדש (לפי מספר האיתות), לא בכל רענון
  const greenId = gate?.supported && gate.state === 'green' ? gate.signal?.id ?? null : null
  useEffect(() => {
    if (greenId == null || greenId === lastGreen.current) return
    lastGreen.current = greenId
    if (sound) beep()
  }, [greenId, sound])
  const toggleSound = () => {
    const next = !sound
    setSound(next)
    try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off') } catch { /* אין אחסון */ }
    if (next) beep()                                    // גם בדיקת שמע, וגם "פותח" את הצליל בדפדפן
  }
  if (!gate) return null
  if (!gate.supported) return (
    <div className="card !p-3 text-sm text-slate-400">🚦 רמזור הכניסה מוגדר כרגע רק לנאסד״ק (האסטרטגיה בקורס היא לנאסד״ק בלבד).</div>
  )
  const g = gate; const tone = TONE[g.state]; const p = g.plan; const s = g.log.stats

  const mark = (method: 'POST' | 'DELETE', result?: 'win' | 'loss' | 'be') => {
    setBusy(true); setErr(null)
    fetch(`${API_BASE}/api/live/${encodeURIComponent(symbol)}/day-trade`, { method, headers: { 'Content-Type': 'application/json' }, body: result ? JSON.stringify({ result }) : undefined })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); onChanged?.() })
      .catch(e => setErr(`הסימון לא נשמר (${String(e.message ?? e)})`))
      .finally(() => setBusy(false))
  }

  return (
    <div className="space-y-2">
      {/* ── השורה הגדולה ── */}
      <div className={`rounded-xl border-2 p-4 flex items-stretch gap-4 ${tone.box}`}>
        <Lamp state={g.state} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <button onClick={() => setShowWhy(v => !v)} title="לחיצה מציגה למה" className={`text-3xl font-black text-right ${tone.text} hover:opacity-80`}>
              {g.headline} <span className="text-sm font-bold underline decoration-dotted opacity-80">{showWhy ? 'הסתר' : 'למה?'}</span>
            </button>
            {g.state === 'green' && g.signal && <div className="text-sm font-bold text-emerald-200">תקף עוד {g.signal.secLeft} שנ׳ (הנר הזה בלבד)</div>}
            {g.other && g.state !== 'green' && <div className="text-xs text-slate-400">הכיוון השני ({DIR_HE[g.other.dir]}): {g.other.ok} מתוך {g.other.total} תנאים</div>}
            <button onClick={toggleSound} title="צליל ברגע שנדלק ירוק" className={`mr-auto px-2 py-0.5 rounded text-xs ${sound ? 'bg-black/30 text-white' : 'bg-black/20 text-slate-500'}`}>{sound ? '🔔 צליל דולק' : '🔕 צליל כבוי'}</button>
          </div>
          {g.blocks.length > 0 && (
            <div className="mt-2 rounded-md bg-red-600/90 text-white font-bold px-3 py-1.5 text-sm">
              ⛔ {g.blocks.map(b => b.text).join(' · ')}
            </div>
          )}
          {g.missing && <div className="mt-2 text-lg text-white leading-7">{g.missing}</div>}
          {showWhy && (
            <div className="mt-2 rounded-md bg-black/40 p-2.5 text-sm">
              <div className="font-bold text-white mb-1">{g.state === 'green' ? `למה ${g.dir ? DIR_HE[g.dir] : ''} עכשיו` : g.dir ? `מה מתקיים ומה לא, ל${DIR_HE[g.dir]}` : 'אין כיוון כרגע'}</div>
              {g.state === 'green' && (g.why?.length ?? 0) > 0
                ? <ul className="space-y-0.5 text-slate-200">{g.why!.map((w, i) => <li key={i}>✓ {w}</li>)}</ul>
                : <ul className="space-y-0.5">{g.conditions.map(c => <li key={c.key} className={c.ok ? 'text-slate-200' : 'text-red-200'}>{c.ok ? '✓' : '✗'} {c.name}: {c.ok ? c.detail : (c.need ?? c.detail)}</li>)}</ul>}
              <div className="mt-1.5 text-[11px] text-slate-400">
                {g.flow?.source === 'bookmap' ? 'ה-CVD נבדק מול Bookmap (כיוון 5 דקות).' : 'ה-CVD לפי הערכה של TradingView, כי העיניים כבויות או שעוד אין להן 2 דקות של נתונים.'}
              </div>
            </div>
          )}
          {p && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div><span className="text-slate-400">{p.estimated ? 'כניסה משוערת ' : 'כניסה '}</span><b className="text-white tabular-nums text-base">{num(p.entry)}</b></div>
              <div><span className="text-slate-400">סטופ </span><b className="text-red-300 tabular-nums text-base">{num(p.stop)}</b><span className="text-slate-500"> ({p.stopPts} נק׳)</span></div>
              <div><span className="text-slate-400">יעד 1:1 </span><b className="text-emerald-200 tabular-nums">{num(p.t1)}</b></div>
              <div><span className="text-slate-400">יעד 1:{g.rules.rr} </span><b className="text-emerald-300 tabular-nums text-base">{num(p.t2)}</b></div>
              <div className="text-slate-300">{p.contracts} {p.unit} · סיכון {num(p.riskUsd, 0)}$ · יעד {num(p.rewardUsd, 0)}$</div>
            </div>
          )}
          {g.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-sm text-amber-200">
              {g.warnings.map((w, i) => <li key={i}>⚠️ {w}</li>)}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-2">
        {/* ── רשימת התנאים ── */}
        <div className="card !p-3">
          <div className="font-bold mb-1.5">תנאי הכניסה{g.dir ? ` · ${DIR_HE[g.dir]}` : ''}</div>
          {g.conditions.length === 0
            ? <div className="text-sm text-slate-500">{g.state === 'off' ? 'אין נתון טרי, אז אין מה לבדוק.' : 'אין כרגע כיוון: ה-EMA 12 והמחיר לא מצביעים לאותו צד.'}</div>
            : (
              <ul className="space-y-1">
                {g.conditions.map(c => (
                  <li key={c.key} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full grid place-items-center text-xs font-black ${c.ok ? 'bg-emerald-600 text-white' : 'bg-red-700 text-white'}`}>{c.ok ? '✓' : '✗'}</span>
                    <span className="min-w-0"><b className={c.ok ? 'text-white' : 'text-red-200'}>{c.name}</b><span className="text-slate-400"> · {c.ok ? c.detail : (c.need ?? c.detail)}</span></span>
                  </li>
                ))}
              </ul>
            )}
          <div className={`mt-2 rounded px-2 py-1 text-xs ${eyes.running && eyes.dir ? 'bg-sky-950/60 text-sky-100' : 'bg-surface text-slate-400'}`}>
            {!eyes.running ? '👁 העיניים כבויות: ה-CVD ברמזור לפי הערכה של TradingView. להדליק בלשונית "עיניים" כדי לבדוק מול Bookmap.'
              : eyes.symbol !== 'NQ' ? '👁 העיניים דלוקות, אבל חלון Bookmap של נאסד״ק לא נמצא כרגע על המסך. ה-CVD ברמזור לפי TradingView.'
              : !eyes.dir ? `👁 Bookmap: אוספים נתונים. צריך לפחות 2 דקות של CVD כדי לקבוע כיוון${eyes.refAgeS != null ? ` (יש ${eyes.refAgeS} שנ׳)` : ''}.`
              : <>👁 Bookmap (רק במחשב הזה): CVD עכשיו <b className="tabular-nums">{signed(eyes.cvd ?? 0)}</b> · לפני {Math.round((eyes.refAgeS ?? 0) / 60)} דק׳ <b className="tabular-nums">{signed(eyes.ref ?? 0)}</b> · <b>{eyes.dir === 'up' ? 'עולה ↑' : eyes.dir === 'down' ? 'יורד ↓' : 'לא זז לכיוון ברור'}</b>{eyes.sent ? ' · הכיוון נשלח לרמזור ✓' : ' · הכיוון עוד לא הגיע לשרת'}</>}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 leading-4">
            נבדק בכל סגירת נר דקה, מנתוני TradingView{g.dataAgeSec != null ? ` · עודכן לפני ${g.dataAgeSec} שנ׳` : ''}. ירוק = הכללים מתקיימים עכשיו, לא הבטחה לרווח.
          </div>
        </div>

        {/* ── חוקי היום ── */}
        <div className="card !p-3">
          <div className="font-bold mb-1.5">היום שלי</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div><span className="text-slate-400">עסקאות </span><b className="text-white">{g.day.trades}/{g.day.maxTrades}</b></div>
            <div><span className="text-slate-400">הפסדים </span><b className={g.day.losses >= g.day.maxLosses ? 'text-red-400' : 'text-white'}>{g.day.losses}/{g.day.maxLosses}</b></div>
            <div><span className="text-slate-400">תוצאה </span><b className={g.day.usd > 0 ? 'text-emerald-400' : g.day.usd < 0 ? 'text-red-400' : 'text-white'}>{signed(g.day.usd)}$</b></div>
          </div>
          <div className="mt-2 text-xs text-slate-400">עסקה שלקחת נסגרה? לסמן כאן, ותקבל תזכורת לפי חוקי היום. הרמזור ממשיך להראות ולמדוד ירוקים בכל מקרה:</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <button disabled={busy} onClick={() => mark('POST', 'win')} className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50">✓ יעד (+{num(g.rules.rewardUsd, 0)}$)</button>
            <button disabled={busy} onClick={() => mark('POST', 'loss')} className="px-2.5 py-1 rounded text-xs font-bold bg-red-700 hover:bg-red-600 text-white disabled:opacity-50">✗ סטופ (−{num(g.rules.riskUsd, 0)}$)</button>
            <button disabled={busy} onClick={() => mark('POST', 'be')} className="px-2.5 py-1 rounded text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50">אפס</button>
            <button disabled={busy || g.day.trades === 0} onClick={() => mark('DELETE')} className="px-2.5 py-1 rounded text-xs bg-surface text-slate-400 hover:text-white disabled:opacity-40">בטל אחרון</button>
          </div>
          {err && <div className="mt-1 text-xs text-red-400">{err}</div>}
          <div className="mt-2 text-[11px] text-slate-500 leading-4">
            נעילה אחרי {g.day.maxLosses} הפסדים · עד {g.day.maxTrades} עסקאות · צינון {g.rules.cooldownMin} דק׳ אחרי הפסד · עצירה ב-+{num(g.day.dayTargetUsd, 0)}$ · בלי כניסה {g.rules.newsMin} דק׳ לפני ואחרי חדשות.
          </div>
        </div>
      </div>

      {/* ── יומן הרמזור ── */}
      <div className="card !p-3">
        <button onClick={() => setShowLog(v => !v)} className="w-full flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-right">
          <span className="font-bold">📒 יומן הרמזור</span>
          {s.n === 0 ? <span className="text-slate-400">עוד לא נרשם אף ירוק.</span> : (
            <>
              <span><b className="text-white">{s.n}</b><span className="text-slate-400"> ירוקים</span></span>
              <span><b className="text-emerald-400">{s.target}</b><span className="text-slate-400"> יעד</span></span>
              <span><b className="text-red-400">{s.stop}</b><span className="text-slate-400"> סטופ</span></span>
              {s.expired > 0 && <span><b className="text-slate-200">{s.expired}</b><span className="text-slate-400"> נסגרו בסוף הסשן</span></span>}
              {s.open > 0 && <span><b className="text-amber-300">{s.open}</b><span className="text-slate-400"> פתוחים</span></span>}
              {s.winPct != null && <span><span className="text-slate-400">הצלחה </span><b className="text-white">{s.winPct}%</b></span>}
              <span><span className="text-slate-400">סה״כ </span><b className={s.sumR > 0 ? 'text-emerald-400' : s.sumR < 0 ? 'text-red-400' : 'text-white'}>{signed(s.sumR)}R</b></span>
            </>
          )}
          {s.bookmap && s.tv && s.n > 0 && <span className="text-slate-400 text-xs">עם Bookmap: {s.bookmap.n} ({s.bookmap.target} יעד, {s.bookmap.stop} סטופ) · TV בלבד: {s.tv.n} ({s.tv.target} יעד, {s.tv.stop} סטופ)</span>}
          {s.blocked > 0 && <span className="text-slate-500">({s.blocked} נחסמו ולא נספרים)</span>}
          <span className="mr-auto text-xs text-slate-500">{showLog ? 'הסתר ▲' : 'הצג ▼'}</span>
        </button>
        {showLog && (
          <div className="mt-2">
            {g.log.recent.length === 0 ? <div className="text-sm text-slate-500">כשהרמזור יידלק ירוק, זה יירשם כאן יחד עם מה שקרה אחר כך.</div> : (
              <table className="w-full text-sm">
                <thead><tr className="text-slate-400 text-xs border-b border-surface-border"><th className="text-right py-1 font-normal">מתי</th><th className="font-normal">כיוון</th><th className="font-normal">כניסה</th><th className="font-normal">סטופ</th><th className="font-normal">יעד</th><th className="text-right font-normal">מה קרה</th></tr></thead>
                <tbody>{g.log.recent.map(r => { const st = statusText(r); return [
                  <tr key={r.id} onClick={() => setOpenRow(openRow === r.id ? null : r.id)} title="לחיצה מציגה למה נדלק" className={`border-b border-surface-border cursor-pointer hover:bg-surface ${r.blocked ? 'opacity-60' : ''}`}>
                    <td className="py-1 text-right tabular-nums text-slate-300">{timeFmt.format(new Date(r.ts))} <span className={`text-[10px] ${r.cvdSrc === 'bookmap' ? 'text-sky-300' : 'text-slate-500'}`}>{r.cvdSrc === 'bookmap' ? 'Bookmap ✓' : 'TV בלבד'}</span></td>
                    <td className={`text-center font-bold ${r.dir === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>{DIR_HE[r.dir]}</td>
                    <td className="text-center tabular-nums">{num(r.entry)}</td>
                    <td className="text-center tabular-nums text-slate-400">{num(r.stop)}</td>
                    <td className="text-center tabular-nums text-slate-400">{num(r.t2)}</td>
                    <td className={`text-right ${st.cls}`}>{st.text}</td>
                  </tr>,
                  openRow === r.id && (
                    <tr key={`${r.id}-why`} className="border-b border-surface-border bg-black/30">
                      <td colSpan={6} className="py-1.5 px-2 text-right text-xs text-slate-300 leading-5">
                        {(r.why?.length ?? 0) > 0 ? r.why!.map((w, i) => <div key={i}>✓ {w}</div>) : 'לאיתות הזה לא נשמר הסבר (נרשם לפני שהתוספת עלתה).'}
                        <div className="text-slate-500">הכי רחוק לטובה: {num(r.mfe)} נק׳ · הכי רחוק נגד: {num(r.mae)} נק׳</div>
                      </td>
                    </tr>),
                ] })}
                </tbody>
              </table>
            )}
            <div className="mt-2 text-[11px] text-slate-500 leading-4">
              הכניסה נרשמת במחיר הסגירה של נר האיתות, סטופ {g.rules.stopPts} נק׳ ויעד 1:{g.rules.rr}. סטופ ויעד באותו נר נרשמים כסטופ. פחות מ-30 ירוקים זה עוד לא מספר שאפשר לסמוך עליו.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
