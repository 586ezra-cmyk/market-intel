'use client'

// 👁 עיניים — לוח של העוזר המקומי (tools/eyes) בתוך האתר.
// הדף רץ בדפדפן של המשתמש ומדבר ישירות עם http://127.0.0.1:8770 — שום דבר לא עובר דרך Vercel/Railway.
// תיאור בלבד: אין כאן המלצות מסחר.

import { useState, useEffect, useCallback, useRef } from 'react'

const EYES = 'http://127.0.0.1:8770'
const POLL_MS = 1000
const STALE_S = 10

type Pair = [number | string | null, number | string | null]
type Trade = [number | string | null, string | null, number | string | null]

interface EyesBar {
  max_delta: number | null; delta: number | null; min_delta: number | null; volume: number | null
  bar?: string; is_last?: boolean
}
interface EyesFast {
  price: number | null; cvd: number | null; vol_imb_pct: number | null
  bar: EyesBar | null; notes?: string[]; ms?: number; age_s?: number
}
interface EyesModelData {
  bands?: Array<number | string> | null
  cob_above?: Pair[] | null
  cob_below?: Pair[] | null
  big_trades?: Trade[] | null
  footprint?: { max_volume_price?: number | string | null; delta?: string | null } | null
  sentence_he?: string | null
}
interface EyesModel { ts_iso: string; age_s: number; model: string; secs: number; data: EyesModelData | null }
interface EyesSettings { interval_s: number; fast_every_s: number; model: 'haiku' | 'sonnet' }
interface EyesState {
  running: boolean
  since: string | null
  run_s: number | null
  stop_reason: string | null
  settings: EyesSettings
  file_mode: boolean
  window: string | null
  fast: EyesFast | null
  model: EyesModel | null
  model_busy: boolean
  model_error: string | null
  changes: string[]
  alerts: Array<{ name: string; text: string }>
  counters: { fast_reads: number; model_calls: number; model_skipped: number }
  errors: Array<{ ts: string; msg: string }>
  zoom_reset?: { ts_iso: string; reason: string; age_s: number } | null
}

function post(path: string, body?: unknown) {
  return fetch(EYES + path, {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Eyes': '1' },
    body: body === undefined ? '' : JSON.stringify(body),
  })
}

const NA = <span className="text-slate-500 text-sm font-normal">לא נקרא</span>

function num(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA
  return <span dir="ltr" className="tabular-nums">{v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>
}

function signed(v: number | null | undefined, suffix = '') {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA
  const cls = v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-slate-200'
  return <span dir="ltr" className={`tabular-nums ${cls}`}>{v > 0 ? '+' : ''}{v.toLocaleString('en-US')}{suffix}</span>
}

function txt(v: unknown) {
  return v === null || v === undefined || v === '' ? '?' : String(v)
}

function Card({ title, extra, children }: { title: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
        {extra && <span className="text-xs text-slate-500">{extra}</span>}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, children, wide }: { label: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-100">{children}</div>
    </div>
  )
}

function pairs(a: Pair[] | null | undefined) {
  if (!Array.isArray(a) || a.length === 0) return NA
  return <span dir="ltr" className="tabular-nums">{a.map(p => Array.isArray(p) ? `${txt(p[0])} × ${txt(p[1])}` : txt(p)).join(' · ')}</span>
}

function trades(a: Trade[] | null | undefined) {
  if (!Array.isArray(a) || a.length === 0) return NA
  return (
    <>
      {a.map((t, i) => {
        if (!Array.isArray(t)) return <span key={i}>{txt(t)} </span>
        const side = t[1] === 'buy' ? <span className="text-green-400">קונה</span>
          : t[1] === 'sell' ? <span className="text-red-400">מוכר</span> : <span>{txt(t[1])}</span>
        return (
          <span key={i}>
            {i > 0 && ' · '}
            <span dir="ltr" className="tabular-nums">{txt(t[0])}</span> {side}
            {t[2] !== null && t[2] !== undefined && <> <span dir="ltr" className="tabular-nums">{txt(t[2])}</span></>}
          </span>
        )
      })}
    </>
  )
}

export default function TabEyes() {
  const [state, setState] = useState<EyesState | null>(null)
  const [reachable, setReachable] = useState<boolean | null>(null)  // null = עוד לא נבדק
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const inFlight = useRef(false)

  const poll = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2500)
    try {
      const r = await fetch(EYES + '/state', { mode: 'cors', cache: 'no-store', signal: ctrl.signal })
      if (!r.ok) throw new Error(String(r.status))
      setState(await r.json() as EyesState)
      setReachable(true)
    } catch {
      setReachable(false)
    } finally {
      clearTimeout(timer)
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  const toggle = async () => {
    if (busy || !state) return
    setBusy(true)
    setActionError('')
    try {
      const r = await post(state.running ? '/stop' : '/start')
      if (!r.ok) setActionError('העוזר המקומי סירב לבקשה (' + r.status + ')')
      await poll()
    } catch {
      setActionError('לא הצלחתי להגיע לעוזר המקומי')
    } finally {
      setBusy(false)
    }
  }

  const changeSetting = async (key: keyof EyesSettings, value: string) => {
    setActionError('')
    try {
      const r = await post('/settings', { [key]: key === 'model' ? value : Number(value) })
      if (!r.ok) setActionError('ההגדרה לא נשמרה')
      await poll()
    } catch {
      setActionError('לא הצלחתי להגיע לעוזר המקומי')
    }
  }

  const privacy = (
    <p className="text-xs text-slate-500">
      🔒 הנתונים לא יוצאים מהמחשב: הדף הזה מדבר ישירות עם העוזר המקומי בכתובת{' '}
      <span dir="ltr" className="font-mono">127.0.0.1:8770</span> — שום דבר לא עובר דרך השרת של האתר. קריאה בלבד: העוזר רק מצלם את חלון Bookmap, לא לוחץ ולא שולח פקודות. תיאור בלבד, לא המלצה.
    </p>
  )

  const header = (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-lg font-bold text-slate-100">👁 עיניים</h2>
      <span className="text-xs text-slate-500">קריאה בלבד · לא לוחץ ולא שולח פקודות</span>
    </div>
  )

  if (reachable === false || (reachable === null && !state)) {
    return (
      <div dir="rtl" className="max-w-2xl mx-auto p-4 space-y-4">
        {header}
        {reachable === null ? (
          <div className="card text-sm text-slate-400">בודק אם העוזר המקומי רץ…</div>
        ) : (
          <div className="card space-y-3 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <h3 className="font-semibold text-slate-100">העוזר המקומי לא רץ במחשב הזה</h3>
            </div>
            <p>הטאב הזה מציג את &quot;עיניים&quot; — כלי שרץ על המחשב שלך וקורא את חלון Bookmap. כדי שהכפתור יעבוד, העוזר צריך לרוץ ברקע. שתי דרכים:</p>
            <ol className="list-decimal pr-5 space-y-1">
              <li>
                <b>הפעלה אוטומטית</b> (פעם אחת): לחיצה כפולה על{' '}
                <span dir="ltr" className="font-mono text-xs">tools/eyes/autostart/install_autostart.command</span>.
                מעכשיו העוזר עולה לבד בכל כניסה למחשב, במצב כבוי, ולא מצלם כלום עד שלוחצים &quot;התחל עיניים&quot;.
              </li>
              <li>
                <b>הפעלה ידנית</b>: לחיצה כפולה על{' '}
                <span dir="ltr" className="font-mono text-xs">tools/eyes/start.command</span>.
              </li>
            </ol>
            <p className="text-slate-400">
              בפעם הראשונה הדפדפן עשוי לשאול אם לאפשר לאתר גישה לרשת המקומית / למכשירים ברשת המקומית — לבחור <b>Allow / אפשר</b>.
              אם בחרת בטעות &quot;חסום&quot;, אפשר לשנות בהגדרות האתר בדפדפן (סמל המנעול ליד הכתובת). מומלץ Chrome.
            </p>
            <p className="text-slate-500 text-xs">הדף ממשיך לבדוק כל שנייה ויתחבר לבד ברגע שהעוזר יעלה.</p>
          </div>
        )}
        {privacy}
      </div>
    )
  }

  if (!state) return null

  const f = state.fast
  const age = f?.age_s ?? null
  const stale = age !== null && age > STALE_S
  const m = state.model
  const d = m?.data
  const fp = d?.footprint ?? {}
  const lastErr = state.errors?.length ? state.errors[state.errors.length - 1].msg : null

  return (
    <div dir="rtl" className="max-w-3xl mx-auto p-4 space-y-4">
      {header}

      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`w-full text-2xl font-bold py-5 rounded-xl text-white transition-colors disabled:opacity-60 ${
          state.running ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-600 hover:bg-slate-500'
        }`}
      >
        {busy ? '…' : state.running ? 'עצור' : 'התחל עיניים'}
      </button>

      <div className="text-sm text-slate-400 space-y-1">
        {state.running ? (
          <div>
            פועל מאז <b className="text-slate-200">{state.since}</b>
            {state.file_mode && ' (מצב קובץ)'}
            {' · '}גיל העדכון האחרון:{' '}
            {age === null ? '—' : <span className={stale ? 'text-red-400 font-bold' : 'text-slate-200'}>{Math.round(age)} שנ׳</span>}
            {' · '}קריאות מודל: <b className="text-slate-200">{state.counters.model_calls}</b>
            {state.model_busy && ' (רץ…)'}
          </div>
        ) : (
          <div>כבוי{state.stop_reason ? ' · ' + state.stop_reason : ''}</div>
        )}
        {state.running && state.window && <div className="text-xs text-slate-500">חלון: {state.window}</div>}
        {state.running && lastErr && <div className="text-red-400">{lastErr}</div>}
        {actionError && <div className="text-red-400">{actionError}</div>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="מספרים חיים" extra={f?.ms ? `קריאה ב-${f.ms} מ״ש` : undefined}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Stat label="מחיר">{num(f?.price, 2)}</Stat>
            <Stat label="CVD">{signed(f?.cvd)}</Stat>
            <Stat label="Volume Imb.">{signed(f?.vol_imb_pct, '%')}</Stat>
            <Stat label={<>נר 5 דק׳{f?.bar?.bar ? ' ' + f.bar.bar : ''}{f?.bar && f.bar.is_last === false ? ' (קודם)' : ''} · נפח</>}>
              {num(f?.bar?.volume)}
            </Stat>
            <Stat wide label="נר 5 דק׳: מקס׳ דלתא / דלתא / מינ׳ דלתא">
              <span className="text-xl">
                {signed(f?.bar?.max_delta)} / {signed(f?.bar?.delta)} / {signed(f?.bar?.min_delta)}
              </span>
            </Stat>
          </div>
          {f?.notes && f.notes.length > 0 && <div className="mt-3 text-xs text-slate-500">{f.notes.join(' · ')}</div>}
        </Card>

        <Card
          title={<>תמונת מצב <span className="text-xs text-slate-500 font-normal">(מודל)</span></>}
          extra={m ? `${m.ts_iso.slice(11, 19)} · לפני ${Math.round(m.age_s)} שנ׳ · ${m.model} ${m.secs} שנ׳` : undefined}
        >
          {d ? (
            <div className="space-y-2 text-sm text-slate-300">
              {d.sentence_he && <div className="text-base text-slate-100">{d.sentence_he}</div>}
              <ul className="space-y-1 list-disc pr-5">
                <li>פסי נזילות חזקים: {Array.isArray(d.bands) && d.bands.length
                  ? <span dir="ltr" className="tabular-nums">{d.bands.map(txt).join(' · ')}</span> : NA}</li>
                <li>קירות מעל המחיר (COB): {pairs(d.cob_above)}</li>
                <li>קירות מתחת למחיר (COB): {pairs(d.cob_below)}</li>
                <li>עסקאות גדולות: {trades(d.big_trades)}</li>
                <li>פוטפרינט אחרון: נפח מקסימלי ב-<span dir="ltr" className="tabular-nums">{txt(fp?.max_volume_price)}</span>, דלתא{' '}
                  {fp?.delta === 'positive' ? <span className="text-green-400">חיובית</span>
                    : fp?.delta === 'negative' ? <span className="text-red-400">שלילית</span> : 'לא ברור'}</li>
              </ul>
            </div>
          ) : (
            <div className="text-sm text-slate-500">עוד לא התקבלה קריאה</div>
          )}
          {state.model_error && <div className="mt-2 text-sm text-red-400">{state.model_error}</div>}
        </Card>

        <Card title={<>דגלים <span className="text-xs text-yellow-400 bg-yellow-900/30 rounded px-1.5 py-0.5 font-normal">ניסיוני</span></>}>
          {state.alerts?.length ? (
            <div className="space-y-2">
              {state.alerts.map((a, i) => (
                <div key={i} className="border-r-4 border-yellow-500 bg-yellow-900/10 rounded px-3 py-2 text-sm text-slate-200">
                  <b>{a.name}</b> — {a.text}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">אין דגלים כרגע</div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            ״מחיר נגד CVD״: ב-2 דקות המחיר זז 10 נק׳ ומעלה לכיוון אחד וה-CVD זז 50 ומעלה לכיוון השני.
            ״לחץ בלי תזוזה״: בנר הנוכחי מקס׳/מינ׳ דלתא 300 ומעלה והמחיר נע עד 8 נק׳ ב-2 דקות. תיאור בלבד, לא המלצה.
          </p>
        </Card>

        <Card title="הערות">
          {state.changes?.length ? (
            <ul className="space-y-1 list-disc pr-5 text-sm text-slate-300">
              {state.changes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          ) : (
            <div className="text-sm text-slate-500">אין עדיין מספיק נתונים</div>
          )}
          {state.zoom_reset && (
            <div className="mt-2 text-xs text-slate-500">
              זום השתנה לאחרונה ב-{state.zoom_reset.ts_iso.slice(11, 19)} ({state.zoom_reset.reason}) — CVD נמדד מחדש מאז.
            </div>
          )}
        </Card>
      </div>

      <Card title="הגדרות">
        <div className="grid gap-3 sm:grid-cols-3 text-sm text-slate-300">
          <label className="flex items-center justify-between gap-2">
            קריאה מהירה כל
            <select className="bg-surface border border-surface-border rounded px-2 py-1 text-slate-200"
              value={String(state.settings.fast_every_s)} onChange={e => changeSetting('fast_every_s', e.target.value)}>
              {[1, 2, 3, 5].map(v => <option key={v} value={v}>{v} שנ׳</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            קריאת מודל כל
            <select className="bg-surface border border-surface-border rounded px-2 py-1 text-slate-200"
              value={String(state.settings.interval_s)} onChange={e => changeSetting('interval_s', e.target.value)}>
              {[10, 15, 20, 30, 40].map(v => <option key={v} value={v}>{v} שנ׳</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            מודל
            <select className="bg-surface border border-surface-border rounded px-2 py-1 text-slate-200"
              value={state.settings.model} onChange={e => changeSetting('model', e.target.value)}>
              <option value="haiku">Haiku (מהיר)</option>
              <option value="sonnet">Sonnet</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          היומן (מספרים בלבד, בלי תמונות) נשמר במחשב שלך: <span dir="ltr" className="font-mono">~/.local/share/htt-eyes/logs</span>
        </p>
      </Card>

      {privacy}
    </div>
  )
}
