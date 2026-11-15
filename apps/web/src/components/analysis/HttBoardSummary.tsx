'use client'

// ─── "בחן עכשיו" לנאסדק ול-S&P: מצב האישורים של HTT מלוח ההחלטה, במקום המנוע הישן (שאין לו נתונים לנכסים האלה) ───
// אותו מקור כמו הטאב "לוח החלטה": צילום המצב ש-HTT Snapshot שולח מ-TradingView בכל סגירת נר.

interface Side { exec: number; context: number; total: number; entries: Array<{ tf: string; code: string; name: string }> }
interface NearItem { key: string; name: string; dir: 'long' | 'short'; tfs: string[]; level: number; levelName: string; dist: number; pct: number; inZone: boolean }
interface CardOpt { label: string; stop: number; pts: number; contracts: number; unit: string; riskUsd: number; t1: number; t2: number; fits: boolean }
export interface BoardLite {
  symbol: string; price: number | null; priceAgeSec: number | null
  tfs: Array<{ tf: string; missing: boolean; stale?: boolean; ageSec?: number; phase?: string; long?: string[]; short?: string[] }>
  summary: { long: Side; short: Side }; near: NearItem[]
  card: { riskUsd: number; long: { tf: string; options: CardOpt[] } | null; short: { tf: string; options: CardOpt[] } | null }
  options: { regime: string; nearFlip?: boolean; levels: Array<{ key: string; name: string; price: number; dist: number | null }> } | null
  guard: { live: boolean }
}

const TF_HE: Record<string, string> = { '1m': 'דקה', '5m': '5 דק׳', '15m': '15 דק׳', '1h': 'שעה', '4h': '4 שע׳', '1D': 'יומי', '1W': 'שבועי' }
const num = (v: number, d = 2) => v.toLocaleString('en-US', { maximumFractionDigits: d })
const age = (s: number) => (s < 90 ? `${s} שניות` : s < 5400 ? `${Math.round(s / 60)} דקות` : s < 172800 ? `${Math.round(s / 3600)} שעות` : `${Math.round(s / 86400)} ימים`)

export default function HttBoardSummary({ board, onOpenBoard }: { board: BoardLite; onOpenBoard: () => void }) {
  const points = board.symbol === 'NQ' || board.symbol === 'ES'
  const liveTfs = board.tfs.filter(t => !t.missing && !t.stale)
  const any = board.tfs.some(t => !t.missing)

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* מצב החיבור — לפני כל מספר, כדי שיהיה ברור אם הוא של עכשיו */}
      {!any ? (
        <div className="bg-amber-950/60 border border-amber-700 rounded-lg p-3 text-sm text-amber-200">
          <div className="font-bold mb-1">⚠️ אין נתונים ל-{board.symbol}</div>
          עוד לא הגיע אף צילום מצב מ-TradingView. צריך להוסיף את הסקריפט HTT Snapshot לגרף ולהפעיל את ההתראות שלו.
        </div>
      ) : !board.guard.live ? (
        <div className="bg-amber-950/60 border border-amber-700 rounded-lg p-3 text-sm text-amber-200">
          <div className="font-bold mb-1">⚠️ הנתונים לא חיים</div>
          הצילום האחרון הגיע לפני {board.priceAgeSec != null ? age(board.priceAgeSec) : '—'}. ההתראות של HTT Snapshot לא שולחות כרגע (או שהשוק סגור), ולכן הספירה למטה ריקה ולא משקפת את עכשיו.
        </div>
      ) : (
        <div className="bg-emerald-950/50 border border-emerald-700/60 rounded-lg p-3 text-sm text-emerald-200">
          🟢 חי · הצילום האחרון לפני {age(board.priceAgeSec ?? 0)} · {liveTfs.length} מסגרות זמן מעודכנות
        </div>
      )}

      {board.price != null && (
        <div className="bg-gray-800 rounded-lg p-4 text-center">
          <div className="text-xs text-gray-400 mb-1">{board.symbol} · מחיר בצילום האחרון</div>
          <div className="text-3xl font-bold text-white tabular-nums">{num(board.price)}</div>
        </div>
      )}

      {/* כמה אישורים דולקים עכשיו לכל כיוון */}
      <div className="grid grid-cols-2 gap-3">
        {(['long', 'short'] as const).map(d => {
          const s = board.summary[d]; const long = d === 'long'
          return (
            <div key={d} className={`rounded-lg border p-3 ${long ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-red-700/60 bg-red-950/30'}`}>
              <div className={`font-bold ${long ? 'text-emerald-400' : 'text-red-400'}`}>{long ? '🟢 לונג' : '🔴 שורט'}</div>
              <div className="text-3xl font-bold text-white tabular-nums mt-1">{s.total}</div>
              <div className="text-[11px] text-gray-400">אישורים דולקים</div>
              <div className="text-xs text-gray-300 mt-2">דקה + 5 דק׳: <b className="text-white">{s.exec}</b></div>
              <div className="text-xs text-gray-300">מסגרות גבוהות: <b className="text-white">{s.context}</b></div>
              {s.entries.map(e => <div key={e.tf + e.code} className="text-[11px] text-amber-300 mt-1">⚡ {e.name} · {TF_HE[e.tf] ?? e.tf}</div>)}
            </div>
          )
        })}
      </div>

      {/* מה הכי קרוב לקרות */}
      {board.near.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="font-bold text-white text-sm mb-2">מה הכי קרוב לקרות — כמה חסר</div>
          <div className="space-y-1.5">
            {board.near.slice(0, 8).map(n => (
              <div key={n.key + n.dir + n.level} className="flex items-baseline justify-between gap-2 text-xs">
                <span className={n.dir === 'long' ? 'text-emerald-400' : 'text-red-400'}>{n.dir === 'long' ? '▲' : '▼'} {n.name}</span>
                <span className="text-gray-400 truncate">{n.levelName} {num(n.level)}</span>
                <span className="text-white font-bold tabular-nums whitespace-nowrap">{n.inZone ? 'בתוך האזור' : points ? `${num(n.dist, 1)} נק׳` : `${n.pct.toFixed(2)}%`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* כרטיס עסקה */}
      {(board.card.long || board.card.short) && (
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="font-bold text-white text-sm mb-2">כרטיס עסקה · סיכון ${board.card.riskUsd}</div>
          {(['long', 'short'] as const).map(d => {
            const c = board.card[d]; const o = c?.options[0]
            if (!o) return null
            return (
              <div key={d} className="text-xs text-gray-300 mb-1.5">
                <span className={d === 'long' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{d === 'long' ? 'לונג' : 'שורט'}</span>
                {' '}· סטופ {num(o.stop)} ({num(o.pts, 1)} {points ? 'נק׳' : ''}) · {o.fits ? <b className="text-white">{o.contracts} {o.unit}</b> : <b className="text-amber-300">הסטופ רחוק מדי לסיכון הזה</b>}
                {o.fits && <> · יעד 1:1 {num(o.t1)} · 1:2 {num(o.t2)}</>}
              </div>
            )
          })}
        </div>
      )}

      {board.options && (
        <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300">
          <div className="font-bold text-white text-sm mb-1">שוק האופציות (גמא)</div>
          <div className={board.options.regime === 'positive' ? 'text-emerald-400' : board.options.regime === 'negative' ? 'text-red-400' : 'text-gray-400'}>
            {board.options.regime === 'positive' ? 'גמא חיובית — השוק נוטה לבלום' : board.options.regime === 'negative' ? 'גמא שלילית — השוק נוטה להאיץ' : 'משטר לא ידוע'}
            {board.options.nearFlip ? ' · קרוב לאפס-גמא, המשטר לא יציב' : ''}
          </div>
          {board.options.levels.map(l => <div key={l.key}>{l.name}: <b className="text-white tabular-nums">{num(l.price)}</b></div>)}
        </div>
      )}

      {/* מסגרות הזמן */}
      <div className="bg-gray-800 rounded-lg p-3">
        <div className="font-bold text-white text-sm mb-2">מסגרות הזמן</div>
        <div className="space-y-1">
          {board.tfs.map(t => (
            <div key={t.tf} className="flex items-baseline justify-between text-xs">
              <span className="text-gray-300 w-14">{TF_HE[t.tf] ?? t.tf}</span>
              {t.missing ? <span className="text-gray-600">אין צילום</span> : t.stale ? <span className="text-amber-400">ישן (לפני {age(t.ageSec ?? 0)})</span> : (
                <span className="tabular-nums"><span className="text-emerald-400">▲ {t.long?.length ?? 0}</span> <span className="text-red-400 mr-2">▼ {t.short?.length ?? 0}</span> <span className="text-gray-500 mr-2">פאזה {t.phase}</span></span>
              )}
            </div>
          ))}
        </div>
      </div>

      <button onClick={onOpenBoard} className="w-full bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold py-2 rounded">🎛️ פתח את לוח ההחלטה המלא</button>
      <div className="text-gray-600 text-[11px] text-center pb-4">הלוח רק מציג את מה שדולק עכשיו וכמה חסר. ההחלטה שלך.</div>
    </div>
  )
}
