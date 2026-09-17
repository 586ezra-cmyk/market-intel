"""השוואת הגדרות רמה (רשימות POS/NEG) על נתוני השנה (בריכת הקורס, מעקב עד הכרעה).
מדפיס לכל הגדרה: לכל מסגרת ורמה מינימלית — עסקאות, לשבוע לנכס, R גרירה, PF גרירה, הצלחה 1:3, R 1:3."""
import json, sys
sys.path.insert(0, '.')
from build_path_stats import parse
from build_backtest_report import metrics

FLAGS = open('flags.txt', encoding='utf-8').read().split()
IDX = {k: i for i, k in enumerate(FLAGS)}
cur = json.load(open('../../apps/web/public/htt-backtest/levels.json', encoding='utf-8'))

SETS = {
    'A נוכחי (מהריצה הישנה 3,625)': (cur['pos'], cur['neg']),
    'B חדש רחב': (['vixOk', 'ddt', 'phC', 'reacc', 'atSesLvl', 'fvgAt', 'htfMs', 'ob', 'sweep', 'fvg', 'judas'],
                  ['htfCD', 'amdD', 'vixHigh', 'vixDiv', 'shake', 'conf4', 'smt', 'bb', 'bbSq', 'phAB', 'cTso', 'rsi']),
    'C חדש עקבי בלבד (cons ≥ 2/3)': (['vixOk', 'atSesLvl', 'fvgAt', 'htfMs', 'ob', 'sweep', 'fvg'],
                  ['htfCD', 'amdD', 'vixHigh', 'vixDiv', 'conf4', 'bb', 'phAB']),
}
d = json.load(open('trades/htt_path_store_year_course.json', encoding='utf-8'))
T = []
for name, v in d['combos'].items():
    for r in v['rows']:
        t = parse(r, name)
        if t:
            t['res'] = v['res']; T.append(t)
weeks = 365 / 7

def lvl(t, POS, NEG):
    f = t['flags']
    return sum(1 for k in POS if f[IDX[k]] == '1') - sum(1 for k in NEG if f[IDX[k]] == '1')

for name, (POS, NEG) in SETS.items():
    missing = [k for k in POS + NEG if k not in IDX]
    print(f"\n=== {name}  POS={len(POS)} NEG={len(NEG)} missing={missing}")
    print(f"{'tf':>4s} {'lvl':>4s} {'n':>6s} {'/wk/asset':>9s} {'R4':>6s} {'PF4':>5s} {'win13':>6s} {'R13':>6s} {'PF13':>5s}")
    for tf in ('240', '15', '5'):
        for k in range(0, 7):
            sub = [t for t in T if t['res'] == tf and lvl(t, POS, NEG) >= k]
            if not sub: continue
            m = metrics(sub)
            print(f"{tf:>4s} {k:>3d}+ {m['n']:6d} {m['n']/weeks/4:9.1f} {m['avgR4']:+6.2f} {str(m['pf4']):>5s} {m['win13']:6.0%} {m['avgR13']:+6.2f} {str(m['pf13']):>5s}")
