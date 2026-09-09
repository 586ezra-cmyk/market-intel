# -*- coding: utf-8 -*-
"""דירוג כל האישורים מנתוני מעבדת המסלול (3,600+ סיגנלים): לכל אישור — כמה עסקאות, הלכו נכון, ממוצע R בגרירה (S4) עם ובלי,
שיפור, עקביות בין מסגרות זמן, ומשקל מומלץ לציון סטאפ. ואז: ציון מצטבר לכל סיגנל ותוחלת לפי מדרגות ציון → מדרגות התראה."""
import json, pathlib, collections, statistics
ROOT = pathlib.Path(__file__).resolve().parent
from build_fib_stats import parse
from build_stats import FLAG_HE
FLAGS = [l.strip() for l in (ROOT / 'flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]
idx = {k: i for i, k in enumerate(FLAGS)}
d = json.loads((ROOT / 'trades' / 'htt_path_store.json').read_text(encoding='utf-8'))
T = []
for name, v in d['combos'].items():
    T += [x for x in (parse(r, name) for r in v.get('rows', [])) if x]
def s4(t): return t['s4'] if t['s4'] is not None else (t['horizonR'] or 0.0)
def s1(t): return t['s1'] if t['s1'] is not None else (t['horizonR'] or 0.0)
def stats(ts):
    n = len(ts)
    if n == 0: return {'n': 0}
    return {'n': n, 'dir': sum(1 for t in ts if t['b1'] >= 0) / n, 'r2': sum(1 for t in ts if (t['mfeBeforeStop'] or 0) >= 2) / n,
            's4': sum(s4(t) for t in ts) / n, 's1': sum(s1(t) for t in ts) / n}
rows = []
for k in FLAGS:
    w = [t for t in T if t['flags'][idx[k]] == '1']; wo = [t for t in T if t['flags'][idx[k]] == '0']
    a, b = stats(w), stats(wo)
    if a['n'] == 0 or b['n'] == 0: continue
    # עקביות: השיפור ב-S4 חיובי בכמה מ-3 מסגרות הזמן (רק כשיש 30+ עם האישור)
    cons = 0; tfs = 0
    for res in ('5', '15', '240'):
        ww = [t for t in w if t['combo'].endswith('_' + res)]; wwo = [t for t in wo if t['combo'].endswith('_' + res)]
        if len(ww) >= 30 and len(wwo) >= 30:
            tfs += 1
            if stats(ww)['s4'] - stats(wwo)['s4'] > 0: cons += 1
    rows.append({'flag': k, 'he': FLAG_HE.get(k, k), 'n': a['n'], 'dir': a['dir'], 'dirLift': a['dir'] - b['dir'], 'r2': a['r2'], 's4': a['s4'], 's4Lift': a['s4'] - b['s4'], 's1': a['s1'], 's1Lift': a['s1'] - b['s1'], 'cons': f'{cons}/{tfs}', 'consN': cons, 'consD': tfs})
# משקל: השיפור ב-S4 (מעוגל ל-0.05), מכווץ כשהמדגם קטן, ורק אם עקבי ב-2 מסגרות לפחות (או אישור שלילי מובהק)
def weight(r):
    lift = r['s4Lift']
    shrink = min(1.0, r['n'] / 200.0)
    w = lift * shrink
    if r['consD'] >= 2 and r['consN'] < 2 and w > 0: w *= 0.5   # לא עקבי — חצי משקל
    return round(w * 20) / 20
for r in rows: r['w'] = weight(r)
rows.sort(key=lambda r: r['s4Lift'], reverse=True)
print(f"{'אישור':<26}{'n':>6}{'הלכו נכון':>11}{'שיפור כיוון':>12}{'S4 עם':>8}{'שיפור S4':>10}{'שיפור 1:3':>10}{'עקבי':>7}{'משקל':>7}")
for r in rows:
    print(f"{r['he']:<26}{r['n']:>6}{r['dir']*100:>10.0f}%{r['dirLift']*100:>+11.0f}%{r['s4']:>+8.2f}{r['s4Lift']:>+10.2f}{r['s1Lift']:>+10.2f}{r['cons']:>7}{r['w']:>+7.2f}")
W = {r['flag']: r['w'] for r in rows}
# ציון מצטבר לכל סיגנל
for t in T:
    t['score'] = sum(W[k] for k in FLAGS if k in W and t['flags'][idx[k]] == '1')
scores = sorted(t['score'] for t in T)
qs = [round(scores[int(len(scores) * p)], 2) for p in (0.5, 0.7, 0.8, 0.9, 0.95)]
print('\nציון: חציון/70%/80%/90%/95% =', qs)
print(f"\n{'מדרגה (ציון ≥)':<16}{'סיגנלים':>9}{'% מהכל':>8}{'הלכו נכון':>11}{'2R':>6}{'S4 R':>8}{'1:3 R':>8}{'4H n/S4':>12}{'15m n/S4':>12}{'5m n/S4':>12}")
for th in (-9, 0.0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8):
    sub = [t for t in T if t['score'] >= th]
    if not sub: continue
    st = stats(sub)
    per = []
    for res in ('240', '15', '5'):
        ss = [t for t in sub if t['combo'].endswith('_' + res)]
        per.append(f"{len(ss)}/{stats(ss)['s4']:+.2f}" if ss else '—')
    print(f"{('≥ ' + str(th)) if th > -9 else 'הכל':<16}{st['n']:>9}{st['n']/len(T)*100:>7.0f}%{st['dir']*100:>10.0f}%{st['r2']*100:>5.0f}%{st['s4']:>+8.2f}{st['s1']:>+8.2f}{per[0]:>12}{per[1]:>12}{per[2]:>12}")
# מדרגות לפי סוג כניסה
print('\nלפי סוג כניסה, ציון ≥ 0.4:')
for s_ in ('F', 'W', 'O', 'M'):
    sub = [t for t in T if t['strat'] == s_ and t['score'] >= 0.4]; allst = [t for t in T if t['strat'] == s_]
    if sub: print(f"  {s_}: {len(sub)}/{len(allst)} סיגנלים, הלכו נכון {stats(sub)['dir']*100:.0f}% (הכל {stats(allst)['dir']*100:.0f}%), S4 {stats(sub)['s4']:+.2f} (הכל {stats(allst)['s4']:+.2f})")
# כמה התראות בשבוע לפי מדרגה ומסגרת (לפי טווח הזמן של הנתונים)
print('\nקצב התראות (לכל נכס) לפי מסגרת:')
for res, days in (('240', 4.5 * 365), ('15', 130), ('5', 38)):
    tot = [t for t in T if t['combo'].endswith('_' + res)]
    for th in (0.3, 0.5):
        sub = [t for t in tot if t['score'] >= th]
        print(f"  {res:>4}: ציון ≥{th}: {len(sub)/4/days*7:.1f} התראות לשבוע לנכס (מתוך {len(tot)/4/days*7:.1f})")
json.dump({'rows': rows, 'weights': W}, open(ROOT.parents[1] / 'apps/web/public/htt-backtest/rank.json', 'w', encoding='utf-8'), ensure_ascii=False)
