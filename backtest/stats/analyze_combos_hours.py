# -*- coding: utf-8 -*-
"""ניתוח למשתמש (27.10): אילו טריגרים+אישורים עבדו הכי טוב (R גבוה, מעט סטופים, מעט התראות) ואילו שעות.
קלט: trades/htt_path_store_year_course.json (שנה, 4 נכסים, 3 מסגרות). פלט: backtest/21_טריגרים_ושעות_27-10.md + JSON"""
import sys, json, datetime, zoneinfo, itertools, collections
import numpy as np
sys.path.insert(0, '.')
import build_backtest_report as B
from build_stats import FLAG_HE, STRAT_HE
T, _ = B.load()
FLAGS = B.FLAGS; IDX = B.IDX
IL = zoneinfo.ZoneInfo('Asia/Jerusalem'); NY = zoneinfo.ZoneInfo('America/New_York')
WEEKS = 52.0
def he(k): return FLAG_HE.get(k, k)
def stats(ts):
    n = len(ts)
    if n == 0: return None
    s4 = np.array([t['s4'] for t in ts if t['s4'] is not None], float)
    s1 = np.array([t['s1'] for t in ts if t['s1'] is not None], float)
    if len(s4) == 0: return None
    pos = s4[s4 > 0].sum(); neg = -s4[s4 < 0].sum()
    win = float((s1 >= 2.9).mean()) if len(s1) else 0.0
    stop = float((s1 <= -0.9).mean()) if len(s1) else 0.0
    right = sum(1 for t in ts if t['b1'] >= 0) / n
    ts_sorted = sorted(ts, key=lambda t: t['entryTime']); mid = ts_sorted[len(ts_sorted) // 2]['entryTime']
    h1 = [t['s4'] for t in ts if t['s4'] is not None and t['entryTime'] < mid]; h2 = [t['s4'] for t in ts if t['s4'] is not None and t['entryTime'] >= mid]
    return {'n': n, 'wk': round(n / WEEKS, 1), 'R4': round(float(s4.mean()), 3), 'PF4': round(float(pos / neg), 2) if neg > 0 else 9.99, 'R1': round(float(s1.mean()), 3) if len(s1) else None,
            'win13': round(win, 3), 'stop13': round(stop, 3), 'right1R': round(right, 3), 'H1': round(float(np.mean(h1)), 2) if h1 else None, 'H2': round(float(np.mean(h2)), 2) if h2 else None}
def fmt(s): return f"n={s['n']} ({s['wk']}/שבוע) · R גרירה {s['R4']:+.2f} · PF {s['PF4']:.2f} · 1:3 הצלחה {s['win13']*100:.0f}% · סטופ {s['stop13']*100:.0f}% · חצאי שנה {s['H1']:+.2f}/{s['H2']:+.2f}"
OUT = {}; L = []
A = L.append
A('# טריגרים ואישורים שעבדו הכי טוב + שעות (מדידת v56, 27.10.2026)')
A('> נתונים: שנה אחרונה, 4 נכסים (NQ, BTC, ETH, SOL), 3 מסגרות; טריגרי הקורס בלי P. R גרירה = איזון אחרי 1R וגרירה לפי פיבוטים; "1:3 הצלחה" = הגיע ל-3R עם סטופ הקורס; "סטופ" = נעצר לפני 3R. "חצאי שנה" = R בחצי הראשון / השני (יציבות). תנאי כניסה לרשימות: מספיק עסקאות ושני החצאים חיוביים.')
A('')
pool_all = [t for t in T if t['strat'] != 'P']
TFN = {'240': '4 שעות', '15': '15 דקות', '5': '5 דקות'}
MINN = {'240': 25, '15': 80, '5': 80}
# ── A. טריגרים לפי מסגרת ──
A('## א. הטריגרים לבדם, לפי מסגרת')
A('| מסגרת | טריגר | עסקאות | לשבוע | R גרירה | PF | 1:3 הצלחה | סטופ | חצאים |'); A('|---|---|---|---|---|---|---|---|---|')
for tf in ('240', '15', '5'):
    for st in 'OMWFBK':
        s = stats([t for t in pool_all if t['res'] == tf and t['strat'] == st])
        if s and s['n'] >= 20: A(f"| {TFN[tf]} | {STRAT_HE.get(st, st)} | {s['n']} | {s['wk']} | {s['R4']:+.2f} | {s['PF4']:.2f} | {s['win13']*100:.0f}% | {s['stop13']*100:.0f}% | {s['H1']:+.2f} / {s['H2']:+.2f} |")
A('')
# ── B/C. חיפוש צירופים: טריגר + 1/2/3 אישורים ──
def search(pool, tf, label, min_n, top=8, max_k=3):
    M = np.array([[c == '1' for c in t['flags']] for t in pool], bool)
    R = np.array([t['s4'] if t['s4'] is not None else 0.0 for t in pool], float)
    S1 = np.array([t['s1'] if t['s1'] is not None else 0.0 for t in pool], float)
    ET = np.array([t['entryTime'] for t in pool]); mid = np.median(ET)
    rate = M.mean(0); cand = [i for i in range(len(FLAGS)) if 0.03 <= rate[i] <= 0.75]
    res = []
    base = R.mean()
    def rec(mask, keys):
        n = int(mask.sum())
        if n < min_n: return
        r = R[mask]; h1 = r[ET[mask] < mid]; h2 = r[ET[mask] >= mid]
        if len(h1) < min_n / 3 or len(h2) < min_n / 3 or h1.mean() <= 0 or h2.mean() <= 0: return
        s1 = S1[mask]; pos = r[r > 0].sum(); neg = -r[r < 0].sum()
        res.append({'keys': keys, 'n': n, 'wk': round(n / WEEKS, 1), 'R4': round(float(r.mean()), 3), 'PF4': round(float(pos / neg), 2) if neg > 0 else 9.99, 'win13': round(float((s1 >= 2.9).mean()), 3), 'stop13': round(float((s1 <= -0.9).mean()), 3), 'H1': round(float(h1.mean()), 2), 'H2': round(float(h2.mean()), 2)})
    for i in cand:
        rec(M[:, i], (FLAGS[i],))
        if max_k >= 2:
            for j in cand:
                if j <= i: continue
                m2 = M[:, i] & M[:, j]
                if m2.sum() < min_n: continue
                rec(m2, (FLAGS[i], FLAGS[j]))
                if max_k >= 3:
                    for k in cand:
                        if k <= j: continue
                        m3 = m2 & M[:, k]
                        if m3.sum() < min_n: continue
                        rec(m3, (FLAGS[i], FLAGS[j], FLAGS[k]))
    # ניפוי: צירוף גדול נכנס רק אם הוא טוב מכל תת-צירוף שלו ב-0.05R לפחות
    by = {r['keys']: r for r in res}
    keep = []
    for r in res:
        ok = True
        for sub in itertools.combinations(r['keys'], len(r['keys']) - 1):
            if sub and sub in by and by[sub]['R4'] + 0.05 >= r['R4']: ok = False; break
        if ok: keep.append(r)
    keep.sort(key=lambda r: (-r['R4'], r['stop13']))
    return keep[:top], base
A('## ב. הצירופים הטובים ביותר (טריגר + אישורים), לפי מסגרת')
A('לכל מסגרת: הטריגרים שעבדו, ואז שילובי האישורים שהעלו את ה-R והורידו סטופים. צירוף מופיע רק אם הוא טוב מכל תת-צירוף שלו ומחזיק בשני חצאי השנה.')
A('')
for tf in ('240', '15', '5'):
    OUT[tf] = {}
    for st in ('ALL', 'O', 'M', 'W', 'B', 'K', 'F'):
        pool = [t for t in pool_all if t['res'] == tf and (st == 'ALL' or t['strat'] == st)]
        if len(pool) < MINN[tf]: continue
        top, base = search(pool, tf, st, MINN[tf], top=6 if st == 'ALL' else 4, max_k=3)
        if not top: continue
        OUT[tf][st] = top
        A(f"### {TFN[tf]} · {'כל הטריגרים' if st == 'ALL' else STRAT_HE.get(st, st)} (בסיס R גרירה {base:+.2f}, n={len(pool)})")
        A('| אישורים | עסקאות | לשבוע | R גרירה | PF | 1:3 הצלחה | סטופ | חצאים |'); A('|---|---|---|---|---|---|---|---|')
        for r in top:
            A(f"| {' + '.join(he(k) for k in r['keys'])} | {r['n']} | {r['wk']} | {r['R4']:+.2f} | {r['PF4']:.2f} | {r['win13']*100:.0f}% | {r['stop13']*100:.0f}% | {r['H1']:+.2f} / {r['H2']:+.2f} |")
        A('')
# ── D. הכי פחות סטופים (עם R חיובי) ──
A('## ג. הכי פחות סטופים (1:3) עם R חיובי, לפי מסגרת — "פחות התראות, יותר איכות"')
for tf in ('240', '15', '5'):
    pool = [t for t in pool_all if t['res'] == tf]
    top, base = search(pool, tf, 'ALL', MINN[tf], top=60, max_k=2)
    top = sorted([r for r in top if r['R4'] > 0.1], key=lambda r: (r['stop13'], -r['R4']))[:6]
    A(f"### {TFN[tf]}")
    A('| אישורים | עסקאות | לשבוע | R גרירה | PF | 1:3 הצלחה | סטופ |'); A('|---|---|---|---|---|---|---|')
    for r in top: A(f"| {' + '.join(he(k) for k in r['keys'])} | {r['n']} | {r['wk']} | {r['R4']:+.2f} | {r['PF4']:.2f} | {r['win13']*100:.0f}% | {r['stop13']*100:.0f}% |")
    A('')
# ── E. שעות ──
def hour_tables(pool, title, tz, min_n):
    A(f"### {title}")
    A('| שעה | עסקאות | R גרירה | PF | 1:3 הצלחה | סטופ |'); A('|---|---|---|---|---|---|')
    rows = []
    for h in range(24):
        ts = [t for t in pool if datetime.datetime.fromtimestamp(t['entryTime'] / 1000, tz).hour == h]
        s = stats(ts)
        if s and s['n'] >= min_n: rows.append((h, s))
    for h, s in rows: A(f"| {h:02d}:00 | {s['n']} | {s['R4']:+.2f} | {s['PF4']:.2f} | {s['win13']*100:.0f}% | {s['stop13']*100:.0f}% |")
    best = sorted(rows, key=lambda x: -x[1]['R4'])[:4]; worst = sorted(rows, key=lambda x: x[1]['R4'])[:3]
    A(''); A('**הכי טוב:** ' + ' · '.join(f"{h:02d}:00 ({s['R4']:+.2f}, n={s['n']})" for h, s in best) + '  \n**הכי גרוע:** ' + ' · '.join(f"{h:02d}:00 ({s['R4']:+.2f}, n={s['n']})" for h, s in worst)); A('')
    return rows
A('## ד. לפי שעות (שעון ישראל) — טריגרי הקורס, רמה ≥3 (הזרם שסוחרים)')
A('רק עסקאות ברמה 3 ומעלה (כמו ההתראות). שעה = שעת הכניסה בשעון ישראל.')
A('')
HOURS = {}
lvl3 = [t for t in pool_all if t['level'] >= 3]
HOURS['all_intraday'] = hour_tables([t for t in lvl3 if t['res'] in ('15', '5')], 'כל הנכסים, 15 ו-5 דקות', IL, 40)
HOURS['nq_intraday'] = hour_tables([t for t in lvl3 if t['res'] in ('15', '5') and t['sym'] == 'NQ1!'], 'נאסדק בלבד, 15 ו-5 דקות', IL, 20)
HOURS['crypto_intraday'] = hour_tables([t for t in lvl3 if t['res'] in ('15', '5') and t['sym'] in ('BTC', 'ETH')], 'ביטקוין + את׳ריום, 15 ו-5 דקות', IL, 25)
A('### לפי סשן (כל הנכסים, 15 ו-5 דקות, רמה ≥3)')
A('| סשן | עסקאות | R גרירה | PF | 1:3 הצלחה | סטופ |'); A('|---|---|---|---|---|---|')
SES = {0: 'אסיה (02–10)', 1: 'לונדון (10–18)', 2: 'ניו-יורק (18–01)', 3: 'מחוץ לסשנים'}
for si, nm in SES.items():
    s = stats([t for t in lvl3 if t['res'] in ('15', '5') and t['ses'] == si])
    if s: A(f"| {nm} | {s['n']} | {s['R4']:+.2f} | {s['PF4']:.2f} | {s['win13']*100:.0f}% | {s['stop13']*100:.0f}% |")
A('')
A('### לפי יום בשבוע (כל הנכסים, 15 ו-5 דקות, רמה ≥3)')
A('| יום | עסקאות | R גרירה | PF | 1:3 הצלחה | סטופ |'); A('|---|---|---|---|---|---|')
DAYS = ['ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת', 'א׳']
for d in range(7):
    s = stats([t for t in lvl3 if t['res'] in ('15', '5') and datetime.datetime.fromtimestamp(t['entryTime'] / 1000, IL).weekday() == d])
    if s and s['n'] >= 20: A(f"| {DAYS[d]} | {s['n']} | {s['R4']:+.2f} | {s['PF4']:.2f} | {s['win13']*100:.0f}% | {s['stop13']*100:.0f}% |")
A('')
open('../21_טריגרים_ושעות_27-10.md', 'w', encoding='utf-8').write('\n'.join(L) + '\n')
json.dump({'combos': OUT, 'hours': {k: [(h, s) for h, s in v] for k, v in HOURS.items()}}, open('../../apps/web/public/htt-backtest/combos_hours.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('\n'.join(L))
