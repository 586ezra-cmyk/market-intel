# -*- coding: utf-8 -*-
"""השוואת שתי ריצות Path Lab (חלונות Replay) — למשל בלי/עם חוק הקונטקסט. שימוש: python3 compare_variants.py A.json B.json"""
import sys, json
from build_path_stats import parse, analyze
from build_stats import STRAT_HE, FLAG_HE
from build_year_stats import merge
FLAGS = [l.strip() for l in open('flags.txt', encoding='utf-8') if l.strip()]
IDX = {k: i for i, k in enumerate(FLAGS)}
COURSE = ['F', 'W', 'O', 'M', 'B', 'K']

def load(path):
    raw = json.load(open(path))
    combos, cov = merge(raw)
    T = []
    for name, v in combos.items():
        for r in v['rows']:
            t = parse(r, name)
            if t: t['res'] = v['res']; T.append(t)
    return T

def s4(ts):
    a = analyze(ts)
    return (a['n'], a['schemes'].get('s4', {}).get('avgR'), a['rightDir1R']) if a['n'] else (0, None, None)

A = load(sys.argv[1]); B = load(sys.argv[2])
for tf in ['240', '15', '5']:
    print(f'\n=== TF {tf}')
    a = [t for t in A if t['res'] == tf and t['strat'] in COURSE]; b = [t for t in B if t['res'] == tf and t['strat'] in COURSE]
    print('  course pool   A', s4(a), ' B', s4(b))
    for s in COURSE:
        print(f'  {STRAT_HE.get(s, s)[:22]:24s} A', s4([t for t in a if t['strat'] == s]), ' B', s4([t for t in b if t['strat'] == s]))
    for k in ['phC', 'phD', 'shake', 'lps', 'reacc', 'htfMs']:
        print(f'  flag {FLAG_HE.get(k, k)[:22]:24s} A', s4([t for t in a if t['flags'][IDX[k]] == '1']), ' B', s4([t for t in b if t['flags'][IDX[k]] == '1']))
    rb = [t for t in b if t['flags'][IDX['reacc']] == '1']
    print('  B reacc signals by strat:', {s: s4([t for t in rb if t['strat'] == s]) for s in COURSE if any(t['strat'] == s for t in rb)})
    print('  B reacc long/short:', s4([t for t in rb if t['side'] == 'L']), s4([t for t in rb if t['side'] == 'S']))
    xa = [t for t in A if t['res'] == tf and t['strat'] == 'X']; xb = [t for t in B if t['res'] == tf and t['strat'] == 'X']
    print('  X trigger      A', s4(xa), ' B', s4(xb))
