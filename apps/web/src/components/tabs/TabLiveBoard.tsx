'use client'

import { useEffect, useMemo, useState } from 'react'
import { API_BASE } from '@/lib/api'

// ─── מערכת 3 — לוח ההחלטה החי ───
// HTT Snapshot (בגרף) שולח בכל סגירת נר את מצב כל האישורים לכל מסגרת זמן. כאן רואים במקום אחד:
// כמה אישורים דולקים עכשיו ללונג ולשורט, מה הכי קרוב לקרות (כמה נקודות חסרות), כל האישורים לפי מסגרת, כרטיס עסקה, גמא ו-Order Flow.
// הלוח רק מציג — ההחלטה שלך.

interface TfRow {
  tf: string; missing: boolean; exec: boolean
  ageSec?: number; stale?: boolean; phase?: string; phaseDir?: 'long' | 'short' | null; ms?: number; htfMs?: number; dq?: number
  rsi?: number | null; atr?: number | null; entryL?: string | null; entryS?: string | null
  long?: string[]; short?: string[]; neutral?: string[]
}
interface NearItem { key: string; name: string; dir: 'long' | 'short'; tfs: string[]; level: number; levelName: string; dist: number; pct: number; inZone: boolean; note?: string }
interface CardOpt { label: string; stop: number; pts: number; contracts: number; unit: string; riskUsd: number; t1: number; t2: number; r1Usd: number; r2Usd: number; fits: boolean }
interface Side { exec: number; context: number; total: number; entries: Array<{ tf: string; code: string; name: string }> }
interface OfSum { updatedAt: number | null; lastDelta: number | null; cvdSlope5: number | null; cvdDay: number | null }
interface Board {
  symbol: string; serverTs: number; price: number | null; priceAgeSec: number | null
  tfs: TfRow[]; summary: { long: Side; short: Side }; near: NearItem[]
  card: { riskUsd: number; long: { tf: string; options: CardOpt[] } | null; short: { tf: string; options: CardOpt[] } | null }
  options: { ageMin: number; regime: string; levels: Array<{ key: string; name: string; price: number; dist: number | null }> } | null
  orderflow: Record<string, OfSum | null>
  session: { ny: string; il: string; inRth: boolean; minutesToOpen: number | null; minutesToClose: number | null }
  news: { title: string; inMin: number } | null
  guard: { live: boolean; inSession: boolean; newsClear: boolean }
}
interface Meta { names: Record<string, string>; groups: Record<string, string>; groupOrder: string[]; entries: Record<string, string> }

const TF_HE: Record<string, string> = { '1m': 'דקה', '5m': '5 דק׳', '15m': '15 דק׳', '1h': 'שעה', '4h': '4 שעות', '1D': 'יומי', '1W': 'שבועי' }
const POINT_SYMBOLS = new Set(['NQ', 'ES'])
const num = (v: number, d = 2) => v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d })
const age = (s: number) => (s < 90 ? `${s} שנ׳` : s < 5400 ? `${Math.round(s / 60)} דק׳` : `${Math.round(s / 3600)} שע׳`)

function useBoard(symbol: string) {
  const [board, setBoard] = useState<Board | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setBoard(null)
    const load = () => fetch(`${API_BASE}/api/live/${symbol}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(j => { if (alive) { setBoard(j); setErr(null) } })
      .catch(e => { if (alive) setErr(String(e.message ?? e)) })
    load(); const id = setInterval(load, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [symbol])
  return { board, err }
}

function SummaryCard({ dir, side }: { dir: 'long' | 'short'; side: Side }) {
  const long = dir === 'long'
  return (
    <div className={`rounded-lg border p-4 ${long ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-red-700/60 bg-red-950/30'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className={`text-lg font-bold ${long ? 'text-emerald-400' : 'text-red-400'}`}>{long ? '🟢 לונג' : '🔴 שורט'}</div>
        <div className="text-xs text-slate-400">אישורים שדולקים עכשיו</div>
      </div>
      <div className="flex items-end gap-4 mt-1">
        <div className={`text-5xl font-black tabular-nums ${long ? 'text-emerald-300' : 'text-red-300'}`}>{side.total}</div>
        <div className="text-sm text-slate-300 pb-1.5 leading-5">
          <div>דקה + 5 דק׳: <b className="text-white">{side.exec}</b></div>
          <div>מסגרות גבוהות: <b className="text-white">{side.context}</b></div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 min-h-[24px]">
        {side.entries.length === 0
          ? <span className="text-xs text-slate-500">אין כרגע סוג כניסה פעיל</span>
          : side.entries.map((e, i) => <span key={i} className={`px-2 py-0.5 rounded text-xs font-bold ${long ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>{e.name} · {TF_HE[e.tf] ?? e.tf}</span>)}
      </div>
    </div>
  )
}

function Chips({ keys, meta, tone }: { keys: string[]; meta: Meta | null; tone: 'long' | 'short' | 'neutral' }) {
  const grouped = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const k of keys) { const g = meta?.groups[k] ?? 'אחר'; if (!m.has(g)) m.set(g, []); m.get(g)!.push(k) }
    const order = meta?.groupOrder ?? []
    return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  }, [keys, meta])
  if (!keys.length) return <span className="text-xs text-slate-600">—</span>
  const cls = tone === 'long' ? 'bg-emerald-900/50 text-emerald-200 border-emerald-800' : tone === 'short' ? 'bg-red-900/50 text-red-200 border-red-800' : 'bg-slate-800/60 text-slate-300 border-slate-700'
  return (
    <div className="flex flex-wrap gap-1">
      {grouped.map(([g, ks]) => ks.map(k => (
        <span key={k} title={g} className={`px-1.5 py-0.5 rounded border text-[11px] leading-4 ${cls}`}>{meta?.names[k] ?? k}</span>
      )))}
    </div>
  )
}

function TfBlock({ t, meta }: { t: TfRow; meta: Meta | null }) {
  const name = TF_HE[t.tf] ?? t.tf
  if (t.missing) return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/50 p-3 flex items-center justify-between">
      <div className="font-bold text-slate-400">{name}</div><div className="text-xs text-slate-500">עוד לא הגיע צילום מצב מהמסגרת הזו</div>
    </div>
  )
  const msTxt = t.ms === 1 ? 'מבנה עולה' : t.ms === -1 ? 'מבנה יורד' : 'מבנה —'
  return (
    <div className={`rounded-lg border p-3 ${t.stale ? 'border-amber-800/60 opacity-60' : t.exec ? 'border-brand-600/60' : 'border-surface-border'} bg-surface-raised`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="text-base font-black text-white w-16">{name}</div>
        <div className="text-sm"><span className="text-slate-400">פאזה </span><b className={t.phaseDir === 'long' ? 'text-emerald-400' : t.phaseDir === 'short' ? 'text-red-400' : 'text-white'}>{t.phase}{t.phaseDir ? (t.phaseDir === 'long' ? ' ↑' : ' ↓') : ''}</b></div>
        <div className={`text-sm ${t.ms === 1 ? 'text-emerald-400' : t.ms === -1 ? 'text-red-400' : 'text-slate-400'}`}>{msTxt}</div>
        {t.rsi != null && <div className="text-sm text-slate-300">RSI <b className={t.rsi >= 70 ? 'text-red-400' : t.rsi <= 30 ? 'text-emerald-400' : 'text-white'}>{Math.round(t.rsi)}</b></div>}
        <div className="text-sm"><b className="text-emerald-400">{t.long?.length ?? 0}</b><span className="text-slate-500"> לונג · </span><b className="text-red-400">{t.short?.length ?? 0}</b><span className="text-slate-500"> שורט</span></div>
        {t.entryL && <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-600 text-white">{meta?.entries[t.entryL] ?? t.entryL}</span>}
        {t.entryS && <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white">{meta?.entries[t.entryS] ?? t.entryS}</span>}
        <div className={`text-xs mr-auto ${t.stale ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>{t.stale ? `לא מעודכן (${age(t.ageSec ?? 0)})` : `לפני ${age(t.ageSec ?? 0)}`}</div>
      </div>
      <div className="mt-2 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-2">
        <div><div className="text-[11px] text-emerald-500 mb-1">לונג</div><Chips keys={t.long ?? []} meta={meta} tone="long" /></div>
        <div><div className="text-[11px] text-red-500 mb-1">שורט</div><Chips keys={t.short ?? []} meta={meta} tone="short" /></div>
      </div>
      {(t.neutral?.length ?? 0) > 0 && <div className="mt-2"><div className="text-[11px] text-slate-500 mb-1">הקשר (נכון לשני הכיוונים)</div><Chips keys={t.neutral ?? []} meta={meta} tone="neutral" /></div>}
    </div>
  )
}

function CardSide({ dir, side, pointSym, price }: { dir: 'long' | 'short'; side: { tf: string; options: CardOpt[] } | null; pointSym: boolean; price: number | null }) {
  const long = dir === 'long'
  return (
    <div>
      <div className={`font-bold mb-1 ${long ? 'text-emerald-400' : 'text-red-400'}`}>{long ? 'אם נכנסים לונג עכשיו' : 'אם נכנסים שורט עכשיו'}</div>
      {!side || !side.options.length ? <div className="text-sm text-slate-500">אין נתון טרי ממסגרת הביצוע</div> : (
        <table className="w-full text-sm">
          <thead><tr className="text-slate-400 text-xs border-b border-surface-border"><th className="text-right py-1 font-normal">סטופ</th><th className="font-normal">מרחק</th><th className="font-normal">כמות</th><th className="font-normal">סיכון</th><th className="font-normal">1:1</th><th className="font-normal">1:2</th></tr></thead>
          <tbody>{side.options.map((o, i) => (
            <tr key={i} className={`border-b border-surface-border ${o.fits ? '' : 'opacity-50'}`}>
              <td className="py-1.5 text-right"><div className="text-white tabular-nums">{num(o.stop)}</div><div className="text-[11px] text-slate-500">{o.label}</div></td>
              <td className="text-center tabular-nums">{pointSym ? `${num(o.pts)} נק׳` : price ? `${(o.pts / price * 100).toFixed(2)}%` : num(o.pts)}</td>
              <td className="text-center font-bold text-white">{o.fits ? `${o.contracts} ${o.unit}` : 'רחב מדי'}</td>
              <td className="text-center tabular-nums">{o.fits ? `${num(o.riskUsd, 0)}$` : '—'}</td>
              <td className="text-center tabular-nums text-slate-300">{num(o.t1)}<div className="text-[11px] text-emerald-500">{o.fits ? `+${num(o.r1Usd, 0)}$` : ''}</div></td>
              <td className="text-center tabular-nums text-slate-300">{num(o.t2)}<div className="text-[11px] text-emerald-500">{o.fits ? `+${num(o.r2Usd, 0)}$` : ''}</div></td>
            </tr>))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function TabLiveBoard() {
  const [symbol, setSymbol] = useState('NQ')
  const [symbols, setSymbols] = useState<string[]>(['NQ'])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [dirFilter, setDirFilter] = useState<'all' | 'long' | 'short'>('all')
  const { board, err } = useBoard(symbol)
  useEffect(() => {
    fetch(`${API_BASE}/api/live/meta`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => j && setMeta(j)).catch(() => {})
    fetch(`${API_BASE}/api/live`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { if (j?.symbols?.length) setSymbols([...new Set(['NQ', ...j.symbols as string[]])]) }).catch(() => {})
  }, [])
  const pointSym = POINT_SYMBOLS.has(symbol)
  const dist = (n: NearItem) => (n.inZone ? 'בתוך האזור' : pointSym ? `${num(n.dist)} נק׳` : `${n.pct.toFixed(2)}%`)
  const near = (board?.near ?? []).filter(n => dirFilter === 'all' || n.dir === dirFilter).slice(0, 14)
  const execTfs = (board?.tfs ?? []).filter(t => t.exec); const ctxTfs = (board?.tfs ?? []).filter(t => !t.exec)
  const noData = board && board.price == null
  const of1 = board?.orderflow?.['1'] ?? null; const of5 = board?.orderflow?.['5'] ?? null
  const ofLive = !!(of1?.updatedAt && board && board.serverTs - of1.updatedAt < 5 * 60_000)

  return (
    <div className="p-3 space-y-3 max-w-[1500px] mx-auto" dir="rtl">
      {/* ── שורת מצב ── */}
      <div className="card !p-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex gap-1">{symbols.map(s => <button key={s} onClick={() => setSymbol(s)} className={`px-3 py-1 rounded text-sm font-bold ${s === symbol ? 'bg-brand-600 text-white' : 'bg-surface text-slate-400 hover:text-white'}`}>{s}</button>)}</div>
        <div className="text-3xl font-black text-white tabular-nums">{board?.price != null ? num(board.price) : '—'}</div>
        <div className={`flex items-center gap-1.5 text-sm font-bold ${board?.guard.live ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${board?.guard.live ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
          {err ? `אין חיבור לשרת (${err})` : !board ? 'טוען…' : board.guard.live ? `חי · עודכן לפני ${age(board.priceAgeSec ?? 0)}` : noData ? 'עוד לא הגיע צילום מצב' : `לא מעודכן · ${age(board.priceAgeSec ?? 0)}`}
        </div>
        {board && <div className="text-sm text-slate-300">ישראל <b className="text-white tabular-nums">{board.session.il}</b> · ניו יורק <b className="text-white tabular-nums">{board.session.ny}</b></div>}
        {board && <div className={`text-sm font-bold ${board.session.inRth ? 'text-emerald-400' : 'text-slate-400'}`}>
          {board.session.inRth ? `סשן ניו יורק פתוח · עוד ${Math.floor((board.session.minutesToClose ?? 0) / 60)}:${String((board.session.minutesToClose ?? 0) % 60).padStart(2, '0')} לסגירה` : board.session.minutesToOpen != null ? `עוד ${Math.floor(board.session.minutesToOpen / 60)}:${String(board.session.minutesToOpen % 60).padStart(2, '0')} לפתיחת ניו יורק` : 'מחוץ לסשן ניו יורק'}
        </div>}
        {board?.news && <div className={`text-sm ${Math.abs(board.news.inMin) <= 5 ? 'text-red-400 font-bold' : board.news.inMin <= 30 ? 'text-amber-400' : 'text-slate-400'}`}>📰 {board.news.title} · {board.news.inMin >= 0 ? `בעוד ${board.news.inMin} דק׳` : `לפני ${-board.news.inMin} דק׳`}</div>}
      </div>

      {noData && (
        <div className="card text-sm text-slate-300 leading-6">
          עוד לא הגיע צילום מצב ל-{symbol}. כדי שהלוח יתמלא: מוסיפים לגרף ב-TradingView את הסקריפט <b className="text-white">HTT Snapshot</b>, ויוצרים לו התראה אחת לכל מסגרת זמן
          (דקה, 5 דק׳, 15 דק׳, שעה, 4 שעות, יומי) עם &quot;Any alert() function call&quot; וכתובת ה-Webhook של השרת.
        </div>
      )}

      {/* ── סיכום: כמה אישורים לכל כיוון ── */}
      {board && <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><SummaryCard dir="long" side={board.summary.long} /><SummaryCard dir="short" side={board.summary.short} /></div>}

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-3">
        {/* ── מה הכי קרוב לקרות ── */}
        <div className="card !p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold">⏳ מה הכי קרוב לקרות — כמה חסר</div>
            <div className="flex gap-1">{([['all', 'הכול'], ['long', 'לונג'], ['short', 'שורט']] as const).map(([v, l]) => <button key={v} onClick={() => setDirFilter(v)} className={`px-2 py-0.5 rounded text-xs ${dirFilter === v ? 'bg-brand-600 text-white' : 'bg-surface text-slate-400'}`}>{l}</button>)}</div>
          </div>
          {near.length === 0 ? <div className="text-sm text-slate-500">אין כרגע אישור קרוב עם רמה ידועה</div> : (
            <table className="w-full text-sm">
              <tbody>{near.map((n, i) => (
                <tr key={i} className={`border-b border-surface-border ${n.inZone || n.pct <= 0.05 ? 'bg-amber-900/20' : ''}`}>
                  <td className="py-1.5 w-14"><span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${n.dir === 'long' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>{n.dir === 'long' ? 'לונג' : 'שורט'}</span></td>
                  <td className="py-1.5"><div className="text-white">{n.name}</div><div className="text-[11px] text-slate-500">{n.levelName} {num(n.level)}{n.note ? ` · ${n.note}` : ''}</div></td>
                  <td className="text-center text-[11px] text-slate-400 whitespace-nowrap">{n.tfs.map(t => TF_HE[t] ?? t).join(' · ')}</td>
                  <td className="text-left font-bold tabular-nums whitespace-nowrap text-amber-300">{n.inZone ? '' : 'חסר '}{dist(n)}</td>
                </tr>))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-3">
          {/* ── כרטיס עסקה ── */}
          <div className="card !p-3">
            <div className="font-bold mb-2">🎯 כרטיס עסקה — {board ? `${num(board.card.riskUsd, 0)}$ סיכון` : ''}{board?.card.long ? ` · לפי נר ${TF_HE[board.card.long.tf]}` : ''}</div>
            <div className="space-y-3">
              <CardSide dir="long" side={board?.card.long ?? null} pointSym={pointSym} price={board?.price ?? null} />
              <CardSide dir="short" side={board?.card.short ?? null} pointSym={pointSym} price={board?.price ?? null} />
            </div>
          </div>
          {/* ── גמא ── */}
          <div className="card !p-3">
            <div className="flex items-baseline justify-between"><div className="font-bold">🧲 שוק האופציות (גמא)</div>{board?.options && <div className="text-[11px] text-slate-500">עודכן לפני {board.options.ageMin} דק׳ · נתון מעוכב 15 דק׳</div>}</div>
            {!board?.options ? <div className="text-sm text-slate-500 mt-1">{symbol === 'NQ' ? 'עוד אין חישוב' : 'זמין כרגע רק לנאסדק'}</div> : (
              <>
                <div className={`text-sm font-bold mt-1 ${board.options.regime === 'positive' ? 'text-emerald-400' : board.options.regime === 'negative' ? 'text-red-400' : 'text-slate-400'}`}>
                  {board.options.regime === 'positive' ? 'גמא חיובית — השוק נוטה לבלום ולחזור לממוצע' : board.options.regime === 'negative' ? 'גמא שלילית — השוק נוטה להאיץ תנועות' : 'משטר הגמא לא ידוע'}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm">
                  {[...board.options.levels].sort((a, b) => b.price - a.price).map(l => (
                    <div key={l.key}><span className="text-slate-400">{l.name} </span><b className="text-white tabular-nums">{num(l.price)}</b>{l.dist != null && <span className={`tabular-nums ${Math.abs(l.dist) <= 40 ? 'text-amber-300 font-bold' : 'text-slate-500'}`}> ({l.dist > 0 ? '+' : ''}{num(l.dist, 0)} נק׳)</span>}</div>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* ── Order Flow ── */}
          <div className="card !p-3">
            <div className="font-bold">🌊 Order Flow — לחץ קונים ומוכרים</div>
            {!ofLive ? <div className="text-sm text-slate-500 mt-1">ממתין לנתונים חיים{symbol === 'NQ' ? ' מ-Bookmap' : ''}. הבלוק יתמלא לבד כשהם יגיעו.</div> : (
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm">
                {([['דקה', of1], ['5 דק׳', of5]] as const).map(([l, o]) => o && (
                  <div key={l}><span className="text-slate-400">{l}: דלתא </span><b className={(o.lastDelta ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>{(o.lastDelta ?? 0) > 0 ? '+' : ''}{num(o.lastDelta ?? 0, 0)}</b><span className="text-slate-400"> · CVD 5 נרות </span><b className={(o.cvdSlope5 ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>{(o.cvdSlope5 ?? 0) > 0 ? '+' : ''}{num(o.cvdSlope5 ?? 0, 0)}</b></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── כל האישורים לפי מסגרת זמן ── */}
      {board && !noData && (
        <>
          <div className="text-sm font-bold text-slate-300 pt-1">מסגרות הביצוע</div>
          <div className="space-y-2">{execTfs.map(t => <TfBlock key={t.tf} t={t} meta={meta} />)}</div>
          <div className="text-sm font-bold text-slate-300 pt-1">מסגרות גבוהות — הקשר</div>
          <div className="space-y-2">{ctxTfs.map(t => <TfBlock key={t.tf} t={t} meta={meta} />)}</div>
        </>
      )}
    </div>
  )
}
