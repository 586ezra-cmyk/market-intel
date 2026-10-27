'use client'

import { useEffect, useMemo, useState } from 'react'

// ─── 🧪 מעבדת צירופים: כל אישור עם כל אישור, על העסקאות של מדידת השנה (Path Lab v56) ───
// הנתונים: public/htt-backtest/trades_v56.json (נוצר ב-backtest/stats/export_trades_v56.py). כל החישוב בדפדפן.

interface Data { generatedAt: string; flags: string[]; he: Record<string, string>; groups: Record<string, string[]>; strats: Record<string, string>; rows: Array<[string, string, string, string, number, string, number | null, number | null, number, number, number]> }
interface Stat { n: number; wk: number; R4: number; PF4: number; R1: number; win13: number; stop13: number; right1R: number; H1: number; H2: number }
interface ComboRow extends Stat { keys: number[] }
const TF_HE: Record<string, string> = { '240': '4 שעות', '15': '15 דקות', '5': '5 דקות' }
const SES_HE = ['אסיה', 'לונדון', 'ניו-יורק', 'מחוץ']
const WEEKS = 52
const r2 = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2)
const pc = (v: number) => Math.round(v * 100) + '%'
function popcnt(x: number): number { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24 }

export default function CombosLab() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tf, setTf] = useState('all'); const [strat, setStrat] = useState('course'); const [sym, setSym] = useState('all'); const [side, setSide] = useState('all'); const [minLevel, setMinLevel] = useState(0); const [ses, setSes] = useState('all')
  const [req, setReq] = useState<number[]>([]); const [exc, setExc] = useState<number[]>([])
  const [minN, setMinN] = useState(30); const [stableOnly, setStableOnly] = useState(true); const [sortBy, setSortBy] = useState<'R4' | 'stop13' | 'n'>('R4')
  const [combos, setCombos] = useState<{ pairs: ComboRow[]; triples: ComboRow[]; scanned: number } | null>(null); const [busy, setBusy] = useState(false)

  useEffect(() => { fetch('/htt-backtest/trades_v56.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then(setData).catch(e => setErr(String(e.message ?? e))) }, [])

  // מסכות דגלים (פעם אחת)
  const masks = useMemo(() => {
    if (!data) return null
    const n = data.rows.length, F = data.flags.length
    const m: Uint8Array[] = Array.from({ length: F }, () => new Uint8Array(n))
    for (let j = 0; j < n; j++) {
      const hex = data.rows[j][5]
      for (let i = 0; i < F; i++) { const nib = parseInt(hex[hex.length - 1 - (i >> 2)] ?? '0', 16); if ((nib >> (i & 3)) & 1) m[i][j] = 1 }
    }
    return m
  }, [data])

  // הבחירה הנוכחית → רשימת אינדקסים
  const sel = useMemo(() => {
    if (!data || !masks) return null
    const idx: number[] = []
    data.rows.forEach((r, j) => {
      if (tf !== 'all' && r[0] !== tf) return
      if (strat === 'course' ? r[1] === 'P' : strat !== 'all' && r[1] !== strat) return
      if (sym !== 'all' && r[2] !== sym) return
      if (side !== 'all' && r[3] !== side) return
      if (r[9] < minLevel) return
      if (ses !== 'all' && String(r[10]) !== ses) return
      for (const f of req) if (!masks[f][j]) return
      for (const f of exc) if (masks[f][j]) return
      idx.push(j)
    })
    return idx
  }, [data, masks, tf, strat, sym, side, minLevel, ses, req, exc])

  const statOf = (ids: ArrayLike<number>): Stat | null => {
    if (!data || !ids.length) return null
    let n = 0, nr = 0, s4 = 0, pos = 0, neg = 0, s1 = 0, n1 = 0, win = 0, stop = 0, right = 0
    const times: number[] = []
    for (let k = 0; k < ids.length; k++) { const r = data.rows[ids[k]]; times.push(r[4]) }
    times.sort((a, b) => a - b); const mid = times[Math.floor(times.length / 2)]
    let h1 = 0, h1n = 0, h2 = 0, h2n = 0
    for (let k = 0; k < ids.length; k++) {
      const r = data.rows[ids[k]]; n++
      if (r[7] !== null) { nr++; s4 += r[7]; if (r[7] > 0) pos += r[7]; else neg -= r[7]; if (r[4] < mid) { h1 += r[7]; h1n++ } else { h2 += r[7]; h2n++ } }
      if (r[6] !== null) { n1++; s1 += r[6]; if (r[6] >= 2.9) win++; if (r[6] <= -0.9) stop++ }
      if (r[8] >= 0) right++
    }
    return { n, wk: n / WEEKS, R4: nr ? s4 / nr : 0, PF4: neg > 0 ? pos / neg : 9.99, R1: n1 ? s1 / n1 : 0, win13: n1 ? win / n1 : 0, stop13: n1 ? stop / n1 : 0, right1R: n ? right / n : 0, H1: h1n ? h1 / h1n : 0, H2: h2n ? h2 / h2n : 0 }
  }
  const cur = useMemo(() => (sel ? statOf(sel) : null), [sel]) // eslint-disable-line react-hooks/exhaustive-deps

  // כל אישור לבדו בתוך הבחירה: עם לעומת בלי
  const singles = useMemo(() => {
    if (!data || !masks || !sel) return []
    return data.flags.map((k, i) => {
      const w: number[] = [], wo: number[] = []
      for (const j of sel) (masks[i][j] ? w : wo).push(j)
      const a = statOf(w), b = statOf(wo)
      return { i, k, he: data.he[k] ?? k, w: a, wo: b, lift: a && b ? a.R4 - b.R4 : null }
    }).filter(x => x.w && x.w.n >= 10).sort((a, b) => (b.lift ?? -9) - (a.lift ?? -9))
  }, [data, masks, sel]) // eslint-disable-line react-hooks/exhaustive-deps

  // חיפוש זוגות ושלשות בתוך הבחירה (מסכות ארוזות ב-32 ביט)
  const search = () => {
    if (!data || !masks || !sel || !sel.length) return
    setBusy(true)
    setTimeout(() => {
      const n = sel.length, W = (n + 31) >>> 5, F = data.flags.length
      const packed: Uint32Array[] = [], cnt: number[] = []
      for (let i = 0; i < F; i++) { const p = new Uint32Array(W); let c = 0; for (let j = 0; j < n; j++) if (masks[i][sel[j]]) { p[j >>> 5] |= 1 << (j & 31); c++ } packed.push(p); cnt.push(c) }
      const s4 = new Float64Array(n), res = new Uint32Array(W), s1 = new Float64Array(n), h1 = new Uint32Array(W)
      const times = sel.map(j => data.rows[j][4]).sort((a, b) => a - b); const mid = times[n >> 1]
      for (let j = 0; j < n; j++) { const r = data.rows[sel[j]]; if (r[7] !== null) { s4[j] = r[7]; res[j >>> 5] |= 1 << (j & 31) } s1[j] = r[6] ?? 0; if (r[4] < mid) h1[j >>> 5] |= 1 << (j & 31) }
      const evalMask = (m: Uint32Array, keys: number[]): ComboRow | null => {
        let nn = 0, nr = 0, sum = 0, pos = 0, neg = 0, win = 0, stop = 0, a = 0, an = 0, b = 0, bn = 0
        for (let w = 0; w < W; w++) {
          let x = m[w]; if (!x) continue
          nn += popcnt(x)
          while (x) { const bit = x & -x; const j = (w << 5) + (31 - Math.clz32(bit)); x ^= bit
            if (res[w] & bit) { nr++; sum += s4[j]; if (s4[j] > 0) pos += s4[j]; else neg -= s4[j]; if (h1[w] & bit) { a += s4[j]; an++ } else { b += s4[j]; bn++ } }
            if (s1[j] >= 2.9) win++; if (s1[j] <= -0.9) stop++ }
        }
        if (nn < minN) return null
        return { keys, n: nn, wk: nn / WEEKS, R4: nr ? sum / nr : 0, PF4: neg > 0 ? pos / neg : 9.99, R1: 0, win13: nn ? win / nn : 0, stop13: nn ? stop / nn : 0, right1R: 0, H1: an ? a / an : 0, H2: bn ? b / bn : 0 }
      }
      const pairs: ComboRow[] = [], triples: ComboRow[] = []; let scanned = 0
      const cand = [...Array(F).keys()].filter(i => cnt[i] >= minN && !req.includes(i) && !exc.includes(i))
      const tmp = new Uint32Array(W), tmp3 = new Uint32Array(W)
      for (let a = 0; a < cand.length; a++) for (let b = a + 1; b < cand.length; b++) {
        const i = cand[a], j = cand[b]; let c = 0
        for (let w = 0; w < W; w++) { tmp[w] = packed[i][w] & packed[j][w]; c += popcnt(tmp[w]) }
        scanned++
        if (c < minN) continue
        const pr = evalMask(tmp, [i, j]); if (pr) pairs.push(pr)
        for (let d = b + 1; d < cand.length; d++) {
          const k = cand[d]; let c3 = 0
          for (let w = 0; w < W; w++) { tmp3[w] = tmp[w] & packed[k][w]; c3 += popcnt(tmp3[w]) }
          scanned++
          if (c3 < minN) continue
          const tr = evalMask(tmp3, [i, j, k]); if (tr) triples.push(tr)
        }
      }
      const keep = (r: ComboRow) => !stableOnly || (r.H1 > 0 && r.H2 > 0)
      const srt = (x: ComboRow, y: ComboRow) => sortBy === 'R4' ? y.R4 - x.R4 : sortBy === 'stop13' ? x.stop13 - y.stop13 || y.R4 - x.R4 : y.n - x.n
      setCombos({ pairs: pairs.filter(keep).sort(srt).slice(0, 60), triples: triples.filter(keep).sort(srt).slice(0, 60), scanned })
      setBusy(false)
    }, 10)
  }
  const cycle = (i: number) => { if (req.includes(i)) { setReq(req.filter(x => x !== i)); setExc([...exc, i]) } else if (exc.includes(i)) setExc(exc.filter(x => x !== i)); else setReq([...req, i]) }
  const names = (keys: number[]) => keys.map(i => data!.he[data!.flags[i]] ?? data!.flags[i]).join(' + ')
  const StatRow = ({ label, s }: { label: string; s: Stat | null }) => s ? (
    <tr className="border-b border-surface-border"><td className="py-1 pr-2 text-right">{label}</td><td className="text-center">{s.n.toLocaleString()}</td><td className="text-center text-slate-400">{s.wk.toFixed(1)}</td><td className={`text-center font-bold ${s.R4 > 0.1 ? 'text-emerald-400' : s.R4 < 0 ? 'text-red-400' : ''}`}>{r2(s.R4)}</td><td className="text-center">{s.PF4.toFixed(2)}</td><td className="text-center">{pc(s.win13)}</td><td className="text-center">{pc(s.stop13)}</td><td className="text-center text-slate-400">{r2(s.H1)} / {r2(s.H2)}</td></tr>
  ) : null
  if (err) return <div className="card p-3 text-red-400 text-sm">מעבדת הצירופים: {err}</div>
  if (!data || !masks || !sel) return <div className="card p-3 text-slate-400 text-sm">טוען את מעבדת הצירופים…</div>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h2 className="text-xl font-bold">🧪 מעבדת צירופים — כל אישור עם כל אישור</h2>
        <div className="text-xs text-slate-500">{data.rows.length.toLocaleString()} עסקאות · {data.flags.length} דגלים · נוצר {data.generatedAt.slice(0, 10)}</div>
      </div>
      <div className="card p-3 text-xs text-slate-400 leading-relaxed">בוחרים מסגרת/טריגר/נכס, מסמנים אישורים (לחיצה אחת = חובה, שתיים = להוציא, שלוש = ביטול) ורואים מיד את המספרים של בדיוק הצירוף הזה. "חפש זוגות ושלשות" סורק את כל הצירופים של שני אישורים ושלושה בתוך הבחירה. R = R בגרירה · 1:3 = הגיע ל-3R עם סטופ הקורס · סטופ = לא הגיע · חצאים = R בחצי הראשון / השני של השנה. דגלי Order Flow (דלתא/CVD אמיתיים) קיימים רק לקריפטו — לבחור נכס קריפטו כשבודקים אותם.</div>
      <div className="card p-3 flex flex-wrap gap-3 text-sm items-center">
        <label>מסגרת <select value={tf} onChange={e => setTf(e.target.value)} className="bg-surface-border rounded px-2 py-1"><option value="all">הכול</option>{Object.entries(TF_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>טריגר <select value={strat} onChange={e => setStrat(e.target.value)} className="bg-surface-border rounded px-2 py-1"><option value="course">טריגרי הקורס (בלי P)</option><option value="all">הכול כולל P</option>{Object.entries(data.strats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>נכס <select value={sym} onChange={e => setSym(e.target.value)} className="bg-surface-border rounded px-2 py-1"><option value="all">הכול</option>{['NQ1!', 'BTC', 'ETH', 'SOL'].map(s => <option key={s} value={s}>{s}</option>)}</select></label>
        <label>כיוון <select value={side} onChange={e => setSide(e.target.value)} className="bg-surface-border rounded px-2 py-1"><option value="all">הכול</option><option value="L">לונג</option><option value="S">שורט</option></select></label>
        <label>רמה ≥ <input type="number" min={0} max={8} value={minLevel} onChange={e => setMinLevel(Number(e.target.value))} className="bg-surface-border rounded px-2 py-1 w-14" /></label>
        <label>סשן <select value={ses} onChange={e => setSes(e.target.value)} className="bg-surface-border rounded px-2 py-1"><option value="all">הכול</option>{SES_HE.map((s, i) => <option key={i} value={String(i)}>{s}</option>)}</select></label>
        <button onClick={() => { setReq([]); setExc([]) }} className="px-2 py-1 rounded bg-surface-border text-slate-300">נקה אישורים</button>
      </div>
      <div className="card p-3 space-y-2">
        {Object.entries(data.groups).map(([g, keys]) => (
          <div key={g} className="flex flex-wrap items-center gap-1 text-xs"><span className="text-slate-500 w-28 shrink-0">{g}</span>
            {keys.map(k => { const i = data.flags.indexOf(k); if (i < 0) return null; const st = req.includes(i) ? 'bg-emerald-700 text-white' : exc.includes(i) ? 'bg-red-800 text-white line-through' : 'bg-surface-border text-slate-300'
              return <button key={k} onClick={() => cycle(i)} className={`px-2 py-0.5 rounded ${st}`} title={k}>{data.he[k] ?? k}</button> })}
          </div>
        ))}
      </div>
      <div className="card p-3 overflow-x-auto">
        <div className="font-bold mb-1">הבחירה הנוכחית{req.length ? ' · חובה: ' + names(req) : ''}{exc.length ? ' · בלי: ' + names(exc) : ''}</div>
        <table className="w-full text-xs"><thead><tr className="text-slate-400 border-b border-surface-border"><th className="text-right py-1">&nbsp;</th><th>עסקאות</th><th>לשבוע</th><th>R גרירה</th><th>PF</th><th>1:3</th><th>סטופ</th><th>חצאים</th></tr></thead>
          <tbody><StatRow label="הכול" s={cur} />{['240', '15', '5'].map(t => <StatRow key={t} label={TF_HE[t]} s={statOf(sel.filter(j => data.rows[j][0] === t))} />)}</tbody></table>
      </div>
      <div className="card p-3 overflow-x-auto">
        <div className="font-bold mb-1">כל אישור לבדו בתוך הבחירה — עם לעומת בלי (ממוין לפי ההפרש)</div>
        <table className="w-full text-xs"><thead><tr className="text-slate-400 border-b border-surface-border"><th className="text-right py-1">אישור</th><th>עם: עסקאות</th><th>עם: R</th><th>בלי: R</th><th>הפרש</th><th>עם: 1:3</th><th>עם: סטופ</th><th>עם: חצאים</th></tr></thead>
          <tbody>{singles.map(x => <tr key={x.k} className="border-b border-surface-border"><td className="py-1 pr-2 text-right"><button onClick={() => cycle(x.i)} className="hover:text-blue-300">{x.he}</button></td><td className="text-center">{x.w!.n}</td><td className="text-center">{r2(x.w!.R4)}</td><td className="text-center text-slate-400">{x.wo ? r2(x.wo.R4) : '—'}</td><td className={`text-center font-bold ${(x.lift ?? 0) > 0.05 ? 'text-emerald-400' : (x.lift ?? 0) < -0.05 ? 'text-red-400' : ''}`}>{x.lift === null ? '—' : r2(x.lift)}</td><td className="text-center">{pc(x.w!.win13)}</td><td className="text-center">{pc(x.w!.stop13)}</td><td className="text-center text-slate-400">{r2(x.w!.H1)} / {r2(x.w!.H2)}</td></tr>)}</tbody></table>
      </div>
      <div className="card p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button onClick={search} disabled={busy} className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50">{busy ? 'סורק…' : 'חפש זוגות ושלשות בתוך הבחירה'}</button>
          <label>מינימום עסקאות <input type="number" min={10} value={minN} onChange={e => setMinN(Number(e.target.value))} className="bg-surface-border rounded px-2 py-1 w-16" /></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={stableOnly} onChange={e => setStableOnly(e.target.checked)} /> רק יציבים (שני החצאים חיוביים)</label>
          <label>מיון <select value={sortBy} onChange={e => setSortBy(e.target.value as 'R4' | 'stop13' | 'n')} className="bg-surface-border rounded px-2 py-1"><option value="R4">R גבוה</option><option value="stop13">הכי פחות סטופים</option><option value="n">הכי הרבה עסקאות</option></select></label>
          {combos && <span className="text-xs text-slate-500">נסרקו {combos.scanned.toLocaleString()} צירופים</span>}
        </div>
        {combos && [['שלשות', combos.triples], ['זוגות', combos.pairs]].map(([title, rows]) => (
          <div key={title as string} className="overflow-x-auto"><div className="font-bold text-sm mt-2 mb-1">{title as string} ({(rows as ComboRow[]).length})</div>
            <table className="w-full text-xs"><thead><tr className="text-slate-400 border-b border-surface-border"><th className="text-right py-1">צירוף</th><th>עסקאות</th><th>לשבוע</th><th>R גרירה</th><th>PF</th><th>1:3</th><th>סטופ</th><th>חצאים</th></tr></thead>
              <tbody>{(rows as ComboRow[]).map(r => <tr key={r.keys.join('|')} className="border-b border-surface-border"><td className="py-1 pr-2 text-right"><button onClick={() => { setReq(Array.from(new Set([...req, ...r.keys]))) }} className="hover:text-blue-300 text-right">{names(r.keys)}</button></td><td className="text-center">{r.n}</td><td className="text-center text-slate-400">{r.wk.toFixed(1)}</td><td className={`text-center font-bold ${r.R4 > 0.1 ? 'text-emerald-400' : r.R4 < 0 ? 'text-red-400' : ''}`}>{r2(r.R4)}</td><td className="text-center">{r.PF4.toFixed(2)}</td><td className="text-center">{pc(r.win13)}</td><td className="text-center">{pc(r.stop13)}</td><td className="text-center text-slate-400">{r2(r.H1)} / {r2(r.H2)}</td></tr>)}</tbody></table></div>
        ))}
      </div>
    </div>
  )
}
