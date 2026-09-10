# -*- coding: utf-8 -*-
"""אילו אישורים ביחד נותנים את ההצלחה הגבוהה ביותר — חיפוש שיטתי (apriori) על שילובים של 2–5 אישורים,
בכל מסגרת זמן בנפרד ובכולן יחד. מדדים: הלכו נכון (1R לפני הסטופ), הגיעו ל-2R, ממוצע R בגרירה (S4), ממוצע R ב-1:3 (S1).
פלט: public/htt-backtest/combos.json"""
import os, json, pathlib, datetime, itertools
ROOT = pathlib.Path(__file__).resolve().parent
from build_fib_stats import parse
from build_stats import FLAG_HE
FLAGS = [l.strip() for l in (ROOT / 'flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]
idx = {k: i for i, k in enumerate(FLAGS)}
d = json.loads((ROOT / 'trades' / os.environ.get('HTT_STORE', 'htt_path_store.json')).read_text(encoding='utf-8'))
T = []
for name, v in d['combos'].items():
    T += [x for x in (parse(r, name) for r in v.get('rows', [])) if x]
for t in T:
    t['res'] = t['combo'].rsplit('_', 1)[1]
    t['sym'] = t['combo'].rsplit('_', 1)[0]
    t['on'] = frozenset(k for k in FLAGS if t['flags'][idx[k]] == '1')
def s4(t): return t['s4'] if t['s4'] is not None else (t['horizonR'] or 0.0)
def s1(t): return t['s1'] if t['s1'] is not None else (t['horizonR'] or 0.0)
def agg(ts):
    n = len(ts)
    return {'n': n, 'dir': round(sum(1 for t in ts if t['b1'] >= 0) / n, 3), 'r2': round(sum(1 for t in ts if (t['mfeBeforeStop'] or 0) >= 2) / n, 3),
            's4': round(sum(s4(t) for t in ts) / n, 3), 's1': round(sum(s1(t) for t in ts) / n, 3),
            'byStrat': dict(sorted(((s, sum(1 for t in ts if t['strat'] == s)) for s in ('F', 'W', 'O', 'M', 'B')), key=lambda x: -x[1]))}
# אישורים שליליים מובהקים לא נכנסים לשילובים "חיוביים" (הם פילטרים)
NEG = {'phD', 'conf4', 'volLow', 'amdD', 'cDir', 'htfCD', 'rrOk', 'iFVG'.lower(), 'ifvg', 'lps', 'shake', 'rsi', 'pd', 'test', 'sesAsia', 'sesNY'}
CAND = [k for k in FLAGS if k not in NEG]
def search(ts, min_n, max_k=5, top=40):
    """apriori: מרחיבים רק שילובים עם תמיכה מספקת"""
    base = agg(ts)
    level = {frozenset([k]): [t for t in ts if k in t['on']] for k in CAND}
    level = {c: v for c, v in level.items() if len(v) >= min_n}
    found = []
    for k in range(2, max_k + 1):
        nxt = {}
        keys = list(level.keys())
        for a in keys:
            for f in CAND:
                if f in a: continue
                c = a | {f}
                if c in nxt: continue
                sub = [t for t in level[a] if f in t['on']]
                if len(sub) >= min_n:
                    nxt[c] = sub
        level = nxt
        for c, sub in level.items():
            st = agg(sub)
            found.append({'flags': sorted(c), 'he': [FLAG_HE.get(x, x) for x in sorted(c)], 'k': k, **st})
        if not level: break
    byR = sorted(found, key=lambda r: (r['s4'], r['n']), reverse=True)[:top]
    byDir = sorted(found, key=lambda r: (r['dir'], r['n']), reverse=True)[:top]
    return {'base': base, 'searched': len(found), 'byR': byR, 'byDir': byDir}
out = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'nSignals': len(T), 'negativesExcluded': sorted(NEG & set(FLAGS)), 'groups': {}}
out['groups']['all'] = search(T, 40)
for res in ('240', '15', '5'):
    out['groups'][res] = search([t for t in T if t['res'] == res], 25)
for sym in sorted(set(t['sym'] for t in T)):
    out['groups'][sym] = search([t for t in T if t['sym'] == sym], 25, max_k=4, top=20)
(ROOT.parents[1] / ('apps/web/public/htt-backtest/combos' + os.environ.get('HTT_SUFFIX', '') + '.json')).write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
for g in ('all', '240', '15', '5'):
    r = out['groups'][g]
    print(f"\n### {g}: base n={r['base']['n']} dir={r['base']['dir']} S4={r['base']['s4']} | שילובים שנבדקו: {r['searched']}")
    print('  לפי ממוצע R (גרירה):')
    for c in r['byR'][:8]:
        print(f"    S4={c['s4']:+.2f} 1:3={c['s1']:+.2f} n={c['n']:4d} כיוון={c['dir']*100:.0f}% 2R={c['r2']*100:.0f}% | " + ' + '.join(c['he']))
    print('  לפי הלכו נכון:')
    for c in r['byDir'][:5]:
        print(f"    כיוון={c['dir']*100:.0f}% S4={c['s4']:+.2f} n={c['n']:4d} | " + ' + '.join(c['he']))
