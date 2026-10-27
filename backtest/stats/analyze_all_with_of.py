# -*- coding: utf-8 -*-
"""מסמך 23: "כולם עם כולם" כולל דלתא/CVD אמיתיים (קריפטו). כל אישור לבדו (כולל OF), הדוגמאות של המשתמש עם דלתא,
וכל הזוגות/השלשות (n ≥ 30) בבריכת הקריפטו עם 93 דגלים. הטריגרים: טריגרי הקורס בלי P."""
import sys, json, itertools, datetime, pathlib
import numpy as np
sys.path.insert(0, '.')
import build_backtest_report as B
from build_stats import FLAG_HE
OF = json.load(open('trades/trades_v56_of.json', encoding='utf-8'))
FLAGS = B.FLAGS + OF['flags']; HE = dict(FLAG_HE, **OF['he']); IDX = {k: i for i, k in enumerate(FLAGS)}
he = lambda k: HE.get(k, k)
T, _ = B.load()
for t in T:
    t['flags'] = t['flags'] + OF['byKey'].get(f"{t['sym']}|{t['res']}|{t['strat']}|{t['entryTime']}", '0' * len(OF['flags']))
pool_all = [t for t in T if t['strat'] != 'P']
crypto = [t for t in pool_all if t['flags'][IDX['ofAvail']] == '1']
TFN = {'240': '4 שעות', '15': '15 דקות', '5': '5 דקות'}
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
on = lambda t, k: t['flags'][IDX[k]] == '1'
L = []; A = L.append
A('# כולם עם כולם — כולל דלתא ו-CVD אמיתיים (27.10.2026, אחרי שלב 3)')
A('> בריכת הקריפטו (BTC, ETH, SOL; נאסדק בלי Order Flow עד Bookmap), טריגרי הקורס בלי P, שנה אחרונה. דלתא/CVD מנרות דקה של Binance (נפח קונים תוקפים). R = R בגרירה; 1:3 = הגיע ל-3R; סטופ = לא הגיע; חצאים = R בחצי הראשון/השני. **המעבדה באתר (טאב הבקטסט) מכילה את כל 93 הדגלים — כל צירוף שתרצה, מיידית.**')
A('')
A('## א. דגלי Order Flow לבדם, לפי מסגרת (עם לעומת בלי, בריכת הקריפטו)')
for tf in ('240', '15', '5'):
    pool = [t for t in crypto if t['res'] == tf]; base = stats(pool)['R4']
    A(f"### {TFN[tf]} — בסיס {base:+.2f}R על {len(pool)} עסקאות")
    A('| דגל | עסקאות עם | R (הפרש) | PF | 1:3 | סטופ | חצאים | בלי: R |'); A('|---|---|---|---|---|---|---|---|')
    for k in OF['flags'][:-1]:
        w = stats([t for t in pool if on(t, k)]); wo = stats([t for t in pool if not on(t, k)])
        if w and w['n'] >= 10: A(row(he(k), w, base)[:-1] + f" {wo['R4']:+.2f} |" if wo else row(he(k), w, base))
    A('')
A('## ב. הדוגמאות שביקשת, עכשיו עם דלתא (בריכת הקריפטו, כל המסגרות)')
EX = [('ספרינג + ג׳ודאס של הרבע + SMT + iSMT', ['shake', 'qtJudas', 'smt', 'ismt']), ('ספרינג + ג׳ודאס של הרבע + SMT + iSMT + דלתא בכיוון', ['shake', 'qtJudas', 'smt', 'ismt', 'ofDeltaOk']),
      ('ספרינג + דלתא בכיוון', ['shake', 'ofDeltaOk']), ('ספרינג + CVD אמיתי בכיוון', ['shake', 'ofCvdOk']), ('ספרינג + EMA 12 + דלתא בכיוון', ['shake', 'ema12Ok', 'ofDeltaOk']),
      ('SMT + דלתא בכיוון', ['smt', 'ofDeltaOk']), ('iSMT + דלתא בכיוון', ['ismt', 'ofDeltaOk']), ('ג׳ודאס של הרבע + דלתא בכיוון', ['qtJudas', 'ofDeltaOk']), ('רבע חלוקה + דלתא בכיוון', ['qtDist', 'ofDeltaOk']),
      ('אורדר בלוק + דלתא בכיוון', ['ob', 'ofDeltaOk']), ('אורדר בלוק + דלתא גדולה', ['ob', 'ofDeltaBig']), ('EMA 12 + CVD אמיתי בכיוון', ['ema12Ok', 'ofCvdOk']), ('דלתא בכיוון + CVD בכיוון + מבנה HTF תואם', ['ofDeltaOk', 'ofCvdOk', 'htfMs']),
      ('דלתא בכיוון + ספיגה בעד', ['ofDeltaOk', 'ofAbsorbFor']), ('דיברגנס CVD בעד + ג׳ודאס של הרבע', ['ofDivFor', 'qtJudas']), ('דלתא בכיוון + סשן לונדון + פאזה C', ['ofDeltaOk', 'sesLon', 'phC'])]
A('| צירוף | מסגרת | עסקאות | R | PF | 1:3 | סטופ | חצאים |'); A('|---|---|---|---|---|---|---|---|')
for name, keys in EX:
    for tf in ('all', '240', '15', '5'):
        pool = [t for t in crypto if (tf == 'all' or t['res'] == tf) and all(on(t, k) for k in keys)]
        s = stats(pool)
        A(f"| {name} | {'הכול' if tf == 'all' else TFN[tf]} | " + (row('', s)[4:] if s else '0 | — | — | — | — | — |'))
A('')
def search(pool, min_n, top):
    M = np.array([[c == '1' for c in t['flags']] for t in pool], bool); R = np.array([t['s4'] if t['s4'] is not None else 0.0 for t in pool]); S1 = np.array([t['s1'] if t['s1'] is not None else 0.0 for t in pool]); ET = np.array([t['entryTime'] for t in pool]); mid = np.median(ET)
    cnt = M.sum(0); cand = [i for i in range(len(FLAGS)) if cnt[i] >= min_n and FLAGS[i] != 'ofAvail']
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
A('## ג. הזוגות והשלשות הטובים ביותר בבריכת הקריפטו עם כל 93 הדגלים (n ≥ 30; רק עם לפחות דגל Order Flow אחד)')
for tf in ('240', '15', '5'):
    pool = [t for t in crypto if t['res'] == tf]
    top, counts = search(pool, 30 if tf != '240' else 20, 400)
    for kk, title in ((2, 'זוגות'), (3, 'שלשות')):
        rows = [r for r in top[kk] if any(k.startswith('of') for k in r['keys'])][:20]
        A(f"### {TFN[tf]} · {title} עם Order Flow (מתוך {counts[kk]:,} {title} שנבדקו)")
        A('| צירוף | עסקאות | R | PF | 1:3 | סטופ | חצאים |'); A('|---|---|---|---|---|---|---|')
        for r in rows: A(f"| {' + '.join(he(k) for k in r['keys'])} | {r['n']} | {r['R4']:+.2f} | {r['PF']:.2f} | {r['win']*100:.0f}% | {r['stop']*100:.0f}% | {r['H1']:+.2f} / {r['H2']:+.2f} |")
        A('')
open('../23_כולם_עם_כולם_כולל_דלתא_27-10.md', 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('doc 23 written', len(L), 'lines')
