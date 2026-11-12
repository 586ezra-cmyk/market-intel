# -*- coding: utf-8 -*-
"""מערכת 3 — "כולם עם כולם": כל האישורים (כולל הטריגרים, שמעכשיו גם הם אישורים) לבד, בזוגות, בשלשות וברביעיות, בכל מסגרת.
נתונים: מדידת השנה של HTT (Path Lab v56): NQ, BTC, ETH, SOL × 5m / 15m / 4H, 84 דגלים + 9 דגלי Order Flow (קריפטו) + 7 סוגי כניסה.
תוצאה לכל צירוף: אחוז הצלחה ותוחלת ביעד 1:1 וביעד 1:2 (עם סטופ הקורס), R בגרירה, ויציבות בשני חצאי השנה.
בדיקת כנות: בוחרים את 50 הצירופים הטובים לפי החצי הראשון בלבד ובודקים מה קרה להם בחצי השני.
שימוש: python3 combos.py  →  data/combos.json + ../../31_כולם_עם_כולם_*.md"""
import sys, json, pathlib, time
import numpy as np
np.seterr(all='ignore')          # ‏Accelerate במק מרים דגלי נקודה-צפה שגויים ב-matmul (התוצאות נבדקו מול חישוב ישיר)
ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
import build_backtest_report as B
from build_stats import FLAG_HE, STRAT_HE
OF = json.load(open(ROOT.parent / 'trades' / 'trades_v56_of.json', encoding='utf-8'))
TRIG = ['O', 'M', 'W', 'F', 'B', 'K', 'P']
TRIG_HE = {'O': 'כניסת אורדר בלוק', 'M': 'כניסת W/M', 'W': 'כניסת שבירת כנף', 'F': 'כניסת טיסה', 'B': 'כניסת פריצה (BOS/CHoCH)', 'K': 'כניסת ריטסט קריק/אייס', 'P': 'כניסת ריטסט POC'}
KEYS = B.FLAGS + [k for k in OF['flags']] + ['T:' + s for s in TRIG]
HE = dict(FLAG_HE); HE.update(OF['he']); HE.update({'T:' + s: TRIG_HE[s] for s in TRIG})
SKIP = {'ofAvail'}
TFN = {'5': '5 דקות', '15': '15 דקות', '240': '4 שעות'}
QN = ['n', 'w11', 'y11', 'w12', 'y12', 's4', 'h1', 'y12h1', 'y11h1', 's4h1']

def build(rows):
    n = len(rows); M = np.zeros((n, len(KEYS)), bool); nb = len(B.FLAGS); no = len(OF['flags'])
    Q = np.zeros((n, len(QN)), np.float32); et = np.array([t['entryTime'] for t in rows]); mid = np.median(et)
    for r, t in enumerate(rows):
        f = t['flags'] + OF['byKey'].get(f"{t['sym']}|{t['res']}|{t['strat']}|{t['entryTime']}", '0' * no)
        M[r, :nb + no] = np.frombuffer(f.encode(), 'S1') == b'1'
        if t['strat'] in TRIG: M[r, nb + no + TRIG.index(t['strat'])] = True
        m = t['mfeBeforeStop'] or 0; st = t['stopBar'] >= 0
        y11 = 1.0 if m >= 1 else (-1.0 if st else 0.0); y12 = 2.0 if m >= 2 else (-1.0 if st else 0.0)
        h1 = 1.0 if t['entryTime'] < mid else 0.0
        Q[r] = (1, y11 > 0, y11, y12 > 0, y12, t['s4'] or 0.0, h1, y12 * h1, y11 * h1, (t['s4'] or 0.0) * h1)
    return M, Q

def enum(M, Q, k, min_n):
    """מחזיר (אינדקסים [m×k], כמויות [m×q]) לכל צירוף של k אישורים עם לפחות min_n עסקאות."""
    F = M.shape[1]; Mf = M.astype(np.float32); out_i = []; out_q = []
    def pairs_of(Ms, Qs, offset, prefix):
        # כל הזוגות (a<b) בתוך תת-המטריצה Ms; העמודות שלה מתחילות ב-offset
        G = np.stack([Ms.T @ (Ms * Qs[:, q:q + 1]) for q in range(Qs.shape[1])], -1)
        a, b = np.triu_indices(Ms.shape[1], 1); g = G[a, b]; ok = g[:, 0] >= min_n
        if ok.any():
            idx = np.column_stack([np.full(ok.sum(), p) for p in prefix] + [a[ok] + offset, b[ok] + offset]) if prefix else np.column_stack([a[ok] + offset, b[ok] + offset])
            out_i.append(idx.astype(np.int16)); out_q.append(g[ok])
    if k == 1:
        g = Mf.T @ Q; ok = g[:, 0] >= min_n; return np.flatnonzero(ok)[:, None].astype(np.int16), g[ok]
    if k == 2: pairs_of(Mf, Q, 0, [])
    elif k == 3:
        for i in range(F - 2):
            r = M[:, i]
            if r.sum() >= min_n: pairs_of(Mf[r][:, i + 1:], Q[r], i + 1, [i])
    else:
        for i in range(F - 3):
            ri = M[:, i]
            if ri.sum() < min_n: continue
            for j in range(i + 1, F - 2):
                r = ri & M[:, j]
                if r.sum() >= min_n: pairs_of(Mf[r][:, j + 1:], Q[r], j + 1, [i, j])
    if not out_i: return np.zeros((0, k), np.int16), np.zeros((0, len(QN)), np.float32)
    return np.concatenate(out_i), np.concatenate(out_q)

def metrics(g):
    n = g[:, 0]; n1 = g[:, 6]; n2 = n - n1
    with np.errstate(divide='ignore', invalid='ignore'):
        return dict(n=n, win11=g[:, 1] / n, exp11=g[:, 2] / n, win12=g[:, 3] / n, exp12=g[:, 4] / n, trail=g[:, 5] / n, n1=n1, n2=n2,
                    e12h1=g[:, 7] / n1, e12h2=(g[:, 4] - g[:, 7]) / n2, e11h1=g[:, 8] / n1, e11h2=(g[:, 2] - g[:, 8]) / n2, trh1=g[:, 9] / n1, trh2=(g[:, 5] - g[:, 9]) / n2)

def top(idx, m, key, min_half, limit=12, per_flag=4):
    hk = {'exp12': ('e12h1', 'e12h2'), 'exp11': ('e11h1', 'e11h2'), 'win11': ('e11h1', 'e11h2')}[key]
    ok = (m['n1'] >= min_half) & (m['n2'] >= min_half) & (m[hk[0]] > 0) & (m[hk[1]] > 0)
    order = np.argsort(-np.where(ok, m[key], -9)); used = {}; res = []
    for o in order:
        if not ok[o] or len(res) >= limit: break
        fl = [int(x) for x in idx[o]]
        if any(used.get(f, 0) >= per_flag for f in fl): continue
        for f in fl: used[f] = used.get(f, 0) + 1
        res.append(int(o))
    return res

def oos(idx, m, min_half, k=50):
    """בוחרים את k הטובים לפי החצי הראשון בלבד, ומודדים את החצי השני — לכל שיטת יציאה בנפרד. + מתאם בין החצאים."""
    ok = (m['n1'] >= min_half) & (m['n2'] >= min_half)
    if ok.sum() < k: return None
    res = dict(tested=int(ok.sum()))
    for nm, a, b in (('e12', 'e12h1', 'e12h2'), ('e11', 'e11h1', 'e11h2'), ('tr', 'trh1', 'trh2')):
        order = np.argsort(-np.where(ok, m[a], -9))[:k]
        big = (m['n1'] >= 3 * min_half) & (m['n2'] >= 3 * min_half)
        res[nm] = dict(h1=float(m[a][order].mean()), h2=float(m[b][order].mean()), pos=float((m[b][order] > 0).mean()),
                       corr=float(np.corrcoef(m[a][big], m[b][big])[0, 1]) if big.sum() > 30 else float('nan'))
    res.update(h1=res['e12']['h1'], h2=res['e12']['h2'], pos=res['e12']['pos'])
    return res

def main():
    T, _ = B.load(); t0 = time.time()
    L = []; A = L.append; J = {}
    A('# כולם עם כולם — כל האישורים בזוגות, בשלשות וברביעיות, בכל מסגרת (12.11.2026)')
    A('> **נתונים:** מדידת השנה של HTT (הקוד האמיתי של האינדיקטור): נאסדק, ביטקוין, את\'ריום, סולאנה × 5 דקות / 15 דקות / 4 שעות. 100 אישורים: 84 של HTT + 9 של Order Flow (קריפטו בלבד) + 7 סוגי הכניסה (שמעכשיו גם הם אישורים).')
    A('> **איך קוראים:** "1:1" ו-"1:2" = אחוז העסקאות שהגיעו ליעד לפני הסטופ של הקורס, והתוחלת ב-R (R אחד = 300$). 1:1 צריך מעל 50%, 1:2 מעל 33.3%. "גרירה" = איזון אחרי 1R וגרירה לפי פיבוטים. "חצאים" = תוחלת 1:2 בחצי הראשון / השני של השנה. בלי עמלות.')
    A('> **רשימות "הטובים":** רק צירופים שחיוביים בשני חצאי השנה; כל אישור מופיע עד 4 פעמים ברשימה, כדי שלא תתמלא בגרסאות של אותו דבר.')
    A('> **בדיקת כנות:** כשבודקים מיליוני צירופים, הטובים ביותר נראים מצוין גם במקרה. לכן לכל סבב: בחרתי את 50 הטובים לפי החצי הראשון בלבד, ובדקתי מה הם עשו בחצי השני. זה המספר שאפשר לסמוך עליו.')
    A('> ⚠️ אין כאן נרות דקה ואין 1H — HTT עוד לא נמדד עליהם. הסטופ הוא סטופ הקורס (בנאסדק 5m: 97 נק\' בחציון).')
    POOLS = [('כל 4 הנכסים', lambda t: True, {'5': 60, '15': 50, '240': 20}), ('נאסדק בלבד', lambda t: t['sym'] == 'NQ1!', {'5': 40, '15': 30}), ('ביטקוין בלבד', lambda t: t['sym'] == 'BTC', {'5': 30, '15': 30})]
    summary = []
    for pname, pf, mins in POOLS:
        for tf in ('5', '15', '240'):
            if tf not in mins: continue
            rows = [t for t in T if t['res'] == tf and pf(t)]; min_n = mins[tf]; min_half = max(6, min_n // 3)
            M, Q = build(rows)
            rate = M.mean(0); keep = [i for i, k in enumerate(KEYS) if k not in SKIP and M[:, i].sum() >= min_n and rate[i] <= 0.95]
            seen = {}; cols = []
            for i in keep:                                   # עמודות זהות = אותו אישור (למשל שתי גרסאות EMA 12)
                h = M[:, i].tobytes()
                if h in seen: continue
                seen[h] = i; cols.append(i)
            Ms = M[:, cols]; names = [HE.get(KEYS[i], KEYS[i]) for i in cols]
            base = metrics(Q.sum(0)[None, :])
            A(''); A(f'## {pname} · {TFN[tf]} — {len(rows)} עסקאות, {len(cols)} אישורים')
            A(f"בסיס (כל העסקאות): 1:1 {base['win11'][0] * 100:.1f}% ({base['exp11'][0]:+.2f}R) · 1:2 {base['win12'][0] * 100:.1f}% ({base['exp12'][0]:+.2f}R) · גרירה {base['trail'][0]:+.2f}R. מינימום לצירוף: {min_n} עסקאות.")
            J[f'{pname}|{tf}'] = {'rows': len(rows), 'names': names, 'rounds': {}}
            for k, title in ((1, 'אישור אחד לבד'), (2, 'סבב 1 — שני אישורים יחד'), (3, 'סבב 2 — שלושה אישורים יחד'), (4, 'סבב 3 — ארבעה אישורים יחד')):
                idx, g = enum(Ms, Q, k, min_n); m = metrics(g)
                if len(idx) == 0: A(f'\n### {title}: אין צירופים עם מספיק עסקאות'); continue
                o = oos(idx, m, min_half) if k > 1 else None
                pos_both = int(((m['e12h1'] > 0) & (m['e12h2'] > 0) & (m['n1'] >= min_half) & (m['n2'] >= min_half)).sum())
                A(f'\n### {title} — נבדקו {len(idx):,} צירופים; {pos_both:,} חיוביים ב-1:2 בשני החצאים')
                if o:
                    A(f"**בדיקת כנות:** 50 הטובים לפי החצי הראשון נתנו שם {o['h1']:+.2f}R לעסקה ביעד 1:2; **בחצי השני: {o['h2']:+.2f}R**, ו-{o['pos'] * 100:.0f}% מהם נשארו חיוביים.")
                    summary.append((pname, TFN[tf], k, len(idx), o))
                def table(key, limit, label):
                    sel = top(idx, m, key, min_half, limit)
                    if not sel: A(f'\n{label}: אין צירוף שחיובי בשני החצאים.'); return []
                    A(f'\n{label}'); A('| אישורים | עסקאות | 1:1 | 1:2 | גרירה | חצאים (1:2) |'); A('|---|---|---|---|---|---|')
                    for s in sel:
                        A(f"| {' + '.join(names[int(x)] for x in idx[s])} | {int(m['n'][s])} | {m['win11'][s] * 100:.0f}% ({m['exp11'][s]:+.2f}) | {m['win12'][s] * 100:.0f}% ({m['exp12'][s]:+.2f}) | {m['trail'][s]:+.2f} | {m['e12h1'][s]:+.2f} / {m['e12h2'][s]:+.2f} |")
                    return sel
                s1 = table('exp12', 12 if k > 1 else 15, '**הטובים ביעד 1:2:**')
                s2 = table('win11', 6, '**הטובים ביעד 1:1 (לפי אחוז הצלחה):**')
                order = np.argsort(-np.where((m['n1'] >= min_half) & (m['n2'] >= min_half), m['exp12'], -9))[:300]
                J[f'{pname}|{tf}']['rounds'][str(k)] = [dict(c=[int(x) for x in idx[s]], n=int(m['n'][s]), w11=round(float(m['win11'][s]), 3), e11=round(float(m['exp11'][s]), 3), w12=round(float(m['win12'][s]), 3),
                                                              e12=round(float(m['exp12'][s]), 3), tr=round(float(m['trail'][s]), 3), h1=round(float(m['e12h1'][s]), 3), h2=round(float(m['e12h2'][s]), 3)) for s in order]
                print(pname, tf, 'k', k, 'combos', len(idx), 'both-halves+', pos_both, 'oos', o, round(time.time() - t0), 's', flush=True)
    A(''); A('## סיכום בדיקת הכנות — האם "הטובים" מחזיקים מעמד?')
    A('לכל שיטת יציאה: 50 הטובים לפי החצי הראשון → מה עשו בחצי השני (ובסוגריים: כמה מהם נשארו חיוביים). "מתאם" = עד כמה צירוף שהיה טוב בחצי הראשון היה טוב גם בשני (0 = אין קשר, 1 = קשר מלא).')
    A('| נכסים | מסגרת | אישורים בצירוף | צירופים | יעד 1:1: חצי 1 → חצי 2 | יעד 1:2: חצי 1 → חצי 2 | גרירה: חצי 1 → חצי 2 | מתאם (1:2 / גרירה) |'); A('|---|---|---|---|---|---|---|---|')
    for pname, tfn, k, cnt, o in summary:
        f = lambda d: f"{d['h1']:+.2f} → **{d['h2']:+.2f}** ({d['pos'] * 100:.0f}%)"
        A(f"| {pname} | {tfn} | {k} | {cnt:,} | {f(o['e11'])} | {f(o['e12'])} | {f(o['tr'])} | {o['e12']['corr']:+.2f} / {o['tr']['corr']:+.2f} |")
    (ROOT.parent.parent / '31_כולם_עם_כולם_סבבים_2-3-4_12-11.md').write_text('\n'.join(L) + '\n', encoding='utf8')
    json.dump(J, open(ROOT / 'data' / 'combos.json', 'w'), ensure_ascii=False)

if __name__ == '__main__': main()
