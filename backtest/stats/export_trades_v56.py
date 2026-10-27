# -*- coding: utf-8 -*-
"""ייצוא קומפקטי של כל העסקאות (שנה, 84 דגלים) למעבדת הצירופים באתר + מסמך 22: כל אישור לבדו, בכל מסגרת,
הדוגמה של המשתמש (ספרינג + תורת הרבעים + SMT + iSMT), והטבלאות המלאות של זוגות/שלשות (n ≥ 30) לפי R."""
import sys, json, datetime, itertools, collections, pathlib
import numpy as np
sys.path.insert(0, '.')
import build_backtest_report as B
from build_stats import FLAG_HE, STRAT_HE
T, _ = B.load()
# דגלי Order Flow אמיתיים (קריפטו) מ-build_orderflow_features.py — מצורפים אחרי 84 הדגלים
OF = json.load(open('trades/trades_v56_of.json', encoding='utf-8')) if pathlib.Path('trades/trades_v56_of.json').exists() else {'flags': [], 'he': {}, 'byKey': {}}
FLAGS = B.FLAGS + OF['flags']
FLAG_HE = dict(FLAG_HE, **OF['he'])
for t in T:
    k = f"{t['sym']}|{t['res']}|{t['strat']}|{t['entryTime']}"
    t['flags'] = t['flags'] + OF['byKey'].get(k, '0' * len(OF['flags']))
he = lambda k: FLAG_HE.get(k, k)
IDX = {k: i for i, k in enumerate(FLAGS)}
GROUPS = {
 'ספרינג / וויקוף': ['shake', 'volC', 'lps', 'test', 'phC', 'phD', 'phE', 'phAB', 'cDir', 'tso', 'cTso', 'reacc', 'jac', 'crkRt', 'dq2', 'dq3', 'dqMag', 'clues3', 'engulf', 'climax', 'volLow'],
 'מבנה': ['bos', 'choch', 'htfMs', 'htfCD', 'wm', 'ddt', 'ob', 'conf4', 'rrOk', 'atEdge', 'atHtfLvl', 'atSesLvl', 'atPool', 'orBrk'],
 'נזילות / ICT': ['sweep', 'judas', 'fvg', 'ifvg', 'fvgAt', 'ifvgAt', 'gap', 'pd', 'kz'],
 'SMT': ['smt', 'ismt'],
 'תורת הרבעים': ['qtJudas', 'qtAccum', 'qtManip', 'qtDist', 'qtDayLon', 'tdoDisc', 'tsoDisc', 'twoDisc', 'tso'],
 'AVWAP': ['avwapD', 'avwapRt', 'avwTdoSide', 'avwTdoRt', 'avwWkSide', 'avwSwRt', 'avwSlope', 'avwStack'],
 'CVD (מקורב)': ['cvdOk', 'cvdDiv'],
 'EMA 12': ['ema12Ok', 'ema12Side'],
 'Volume Profile': ['pocRt', 'pocAt', 'pocSide', 'vaIn', 'vaCheap', 'pocTrend'],
 'סשנים / AMD': ['sesLon', 'sesNY', 'sesAsia', 'amdD'],
 'VIX': ['vixOk', 'vixHigh', 'vixSpike', 'vixDiv'],
 'בולינגר': ['bb', 'bbSq'],
 'RSI / צבת': ['rsi', 'tweezer'],
 'Order Flow (קריפטו)': ['ofDeltaOk', 'ofDelta3Ok', 'ofDeltaBig', 'ofCvdOk', 'ofDivFor', 'ofDivAgainst', 'ofAbsorbFor', 'ofAbsorbAgainst', 'ofAvail'],
}
# ── 1) קובץ עסקאות קומפקטי לאתר ──
rows = []
for t in T:
    bits = int(t['flags'][::-1], 2)  # ביט i = דגל i
    rows.append([t['res'], t['strat'], t['sym'], t['side'], t['entryTime'], format(bits, 'x'), t['s1'], t['s4'], t['b1'], t['level'], t['ses']])
out = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'flags': FLAGS, 'he': {k: he(k) for k in FLAGS}, 'groups': GROUPS, 'strats': STRAT_HE,
       'cols': ['tf', 'strat', 'sym', 'side', 't', 'flagsHex', 's1', 's4', 'b1', 'level', 'ses'], 'rows': rows}
p = '../../apps/web/public/htt-backtest/trades_v56.json'
json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
import os; print('trades_v56.json', round(os.path.getsize(p) / 1e6, 1), 'MB', len(rows), 'rows')
# ── 2) מסמך 22 ──
pool_all = [t for t in T if t['strat'] != 'P']
def stats(ts):
    n = len(ts)
    if n == 0: return None
    s4 = np.array([t['s4'] for t in ts if t['s4'] is not None], float); s1 = np.array([t['s1'] for t in ts if t['s1'] is not None], float)
    if len(s4) == 0: return None
    pos = s4[s4 > 0].sum(); neg = -s4[s4 < 0].sum()
    ts2 = sorted(ts, key=lambda t: t['entryTime']); mid = ts2[len(ts2) // 2]['entryTime']
    h1 = [t['s4'] for t in ts if t['s4'] is not None and t['entryTime'] < mid]; h2 = [t['s4'] for t in ts if t['s4'] is not None and t['entryTime'] >= mid]
    return {'n': n, 'R4': float(s4.mean()), 'PF': float(pos / neg) if neg > 0 else 9.99, 'win': float((s1 >= 2.9).mean()) if len(s1) else 0, 'stop': float((s1 <= -0.9).mean()) if len(s1) else 0, 'H1': float(np.mean(h1)) if h1 else float('nan'), 'H2': float(np.mean(h2)) if h2 else float('nan')}
def row(name, s, base=None):
    if not s: return f"| {name} | 0 | — | — | — | — | — |"
    d = f" ({s['R4'] - base:+.2f})" if base is not None else ''
    return f"| {name} | {s['n']} | {s['R4']:+.2f}{d} | {s['PF']:.2f} | {s['win']*100:.0f}% | {s['stop']*100:.0f}% | {s['H1']:+.2f} / {s['H2']:+.2f} |"
TFN = {'240': '4 שעות', '15': '15 דקות', '5': '5 דקות'}
L = []; A = L.append
A('# כל האישורים — כל אחד לבדו, הדוגמה שלך, וכל הזוגות והשלשות (מדידת v56, 27.10.2026)')
A('> שנה אחרונה, 4 נכסים, טריגרי הקורס (טיסה, כנף, OB, W/M, פריצה, ריטסט קריק) בלי P. "R" = R בגרירה; "(±x)" = ההפרש מהבסיס של המסגרת; "1:3" = הגיע ל-3R; "סטופ" = לא הגיע; "חצאים" = R בחצי הראשון / השני של השנה. **דלתא אמיתית עדיין לא במדידה** (תגיע משלב 3, Binance) — CVD כאן הוא מקורב לפי צבע הנר.')
A('> המעבדה האינטראקטיבית לכל שילוב שתרצה: באתר, טאב הבקטסט, מקטע "🧪 מעבדת צירופים".')
A('')
A('## א. כל אישור לבדו, בכל מסגרת (עם האישור לעומת הבסיס)')
for tf in ('240', '15', '5'):
    pool = [t for t in pool_all if t['res'] == tf]; base = stats(pool)['R4']
    A(f"### {TFN[tf]} — בסיס {base:+.2f}R על {len(pool)} עסקאות")
    A('| קבוצה | אישור | עסקאות עם | R (הפרש) | PF | 1:3 | סטופ | חצאים |'); A('|---|---|---|---|---|---|---|---|')
    for g, keys in GROUPS.items():
        for k in keys:
            i = IDX.get(k)
            if i is None: continue
            s = stats([t for t in pool if t['flags'][i] == '1'])
            if s and s['n'] >= 10: A(f"| {g} " + row(he(k), s, base)[1:])
    A('')
# ── הדוגמה של המשתמש + משפחות שביקש ──
A('## ב. הדוגמאות שביקשת (כל המסגרות, טריגרי הקורס)')
EX = [('ספרינג + ג׳ודאס של הרבע + SMT + iSMT', ['shake', 'qtJudas', 'smt', 'ismt']), ('ספרינג + ג׳ודאס של הרבע + SMT', ['shake', 'qtJudas', 'smt']), ('ספרינג + ג׳ודאס של הרבע', ['shake', 'qtJudas']), ('ספרינג + SMT', ['shake', 'smt']), ('ספרינג + iSMT', ['shake', 'ismt']), ('SMT + iSMT', ['smt', 'ismt']), ('ספרינג + רבע מניפולציה', ['shake', 'qtManip']), ('ספרינג + EMA 12', ['shake', 'ema12Ok']), ('ספרינג + CVD בכיוון', ['shake', 'cvdOk']), ('SMT + EMA 12', ['smt', 'ema12Ok']), ('SMT + ג׳ודאס של הרבע', ['smt', 'qtJudas']), ('ספרינג + SMT + EMA 12', ['shake', 'smt', 'ema12Ok']), ('ספרינג + כיוון C תואם + Test', ['shake', 'cDir', 'test']), ('ג׳ודאס של הרבע + EMA 12 + CVD', ['qtJudas', 'ema12Ok', 'cvdOk'])]
A('| צירוף | מסגרת | עסקאות | R | PF | 1:3 | סטופ | חצאים |'); A('|---|---|---|---|---|---|---|---|')
for name, keys in EX:
    for tf in ('all', '240', '15', '5'):
        pool = [t for t in pool_all if (tf == 'all' or t['res'] == tf) and all(t['flags'][IDX[k]] == '1' for k in keys)]
        s = stats(pool)
        A(f"| {name} | {'הכול' if tf == 'all' else TFN[tf]} | " + (row('', s)[4:] if s else '0 | — | — | — | — | — |'))
A('')
# ── זוגות ושלשות: הטבלאות המלאות לפי R (n ≥ 30), 30 לכל מסגרת ──
def search(pool, min_n, top):
    M = np.array([[c == '1' for c in t['flags']] for t in pool], bool); R = np.array([t['s4'] if t['s4'] is not None else 0.0 for t in pool]); S1 = np.array([t['s1'] if t['s1'] is not None else 0.0 for t in pool]); ET = np.array([t['entryTime'] for t in pool]); mid = np.median(ET)
    cnt = M.sum(0); cand = [i for i in range(len(FLAGS)) if cnt[i] >= min_n]
    res = {2: [], 3: []}
    def rec(mask, keys):
        n = int(mask.sum()); r = R[mask]; h1 = r[ET[mask] < mid]; h2 = r[ET[mask] >= mid]; s1 = S1[mask]; pos = r[r > 0].sum(); neg = -r[r < 0].sum()
        res[len(keys)].append({'keys': keys, 'n': n, 'R4': float(r.mean()), 'PF': float(pos / neg) if neg > 0 else 9.99, 'win': float((s1 >= 2.9).mean()), 'stop': float((s1 <= -0.9).mean()), 'H1': float(h1.mean()) if len(h1) else float('nan'), 'H2': float(h2.mean()) if len(h2) else float('nan')})
    for a, i in enumerate(cand):
        for j in cand[a + 1:]:
            m2 = M[:, i] & M[:, j]
            if m2.sum() < min_n: continue
            rec(m2, (FLAGS[i], FLAGS[j]))
            for k in cand:
                if k <= j: continue
                m3 = m2 & M[:, k]
                if m3.sum() < min_n: continue
                rec(m3, (FLAGS[i], FLAGS[j], FLAGS[k]))
    for kk in res: res[kk].sort(key=lambda r: -r['R4'])
    return {kk: v[:top] for kk, v in res.items()}, {kk: len(v) for kk, v in res.items()}
A('## ג. כל הזוגות והשלשות — 30 הטובים לפי R בכל מסגרת (n ≥ 30, בלי סינון נוסף; מלוא הרשימה במעבדה באתר)')
for tf in ('240', '15', '5'):
    pool = [t for t in pool_all if t['res'] == tf]
    top, counts = search(pool, 30 if tf != '240' else 20, 30)
    for kk, title in ((2, 'זוגות'), (3, 'שלשות')):
        A(f"### {TFN[tf]} · {title} (נבדקו {counts[kk]:,} {title} עם מספיק עסקאות)")
        A('| צירוף | עסקאות | R | PF | 1:3 | סטופ | חצאים |'); A('|---|---|---|---|---|---|---|')
        for r in top[kk]: A(f"| {' + '.join(he(k) for k in r['keys'])} | {r['n']} | {r['R4']:+.2f} | {r['PF']:.2f} | {r['win']*100:.0f}% | {r['stop']*100:.0f}% | {r['H1']:+.2f} / {r['H2']:+.2f} |")
        A('')
open('../22_כל_האישורים_כל_הצירופים_27-10.md', 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('doc 22 written', len(L), 'lines')
