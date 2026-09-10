# -*- coding: utf-8 -*-
"""השוואת וריאנטים של המשתמש (Path Lab v6): F מול G (טיסה, סטופ מתחת ל-BOS), O מול R (אורדר בלוק בריטסט 21%), X (3 אישורים = טריגר),
לצד W/M/B. קלט: trades/htt_path_store_v6.json. פלט: public/htt-backtest/variants.json"""
import json, pathlib, datetime, re
ROOT = pathlib.Path(__file__).resolve().parent
from build_fib_stats import parse
from build_stats import STRAT_HE, FLAG_HE
FLAGS = [l.strip() for l in (ROOT / 'flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]
idx = {k: i for i, k in enumerate(FLAGS)}
POS = ['judas', 'ob', 'phC', 'fvgAt', 'sweep', 'kz', 'sesLon', 'htfMs', 'fvg', 'ddt']; NEG = ['phD', 'conf4', 'volLow', 'amdD', 'cDir', 'htfCD', 'rrOk', 'ifvg', 'lps', 'shake']
def s4(t): return t['s4'] if t['s4'] is not None else (t['horizonR'] or 0.0)
def s1(t): return t['s1'] if t['s1'] is not None else (t['horizonR'] or 0.0)
def agg(ts):
    n = len(ts)
    if n == 0: return {'n': 0}
    stopped = sum(1 for t in ts if t['stopBar'] >= 0) / n
    stw = sum(1 for t in ts if t['stopBar'] >= 0 and (t['mfe'] or 0) >= 2) / n
    rel = sorted(abs(t['entry'] - t['stop']) / t['entry'] * 100 for t in ts)
    return {'n': n, 'dir': round(sum(1 for t in ts if t['b1'] >= 0) / n, 3), 'r2': round(sum(1 for t in ts if (t['mfeBeforeStop'] or 0) >= 2) / n, 3),
            's4': round(sum(s4(t) for t in ts) / n, 3), 's1': round(sum(s1(t) for t in ts) / n, 3), 'stopped': round(stopped, 3), 'stoppedThenWent': round(stw, 3),
            'stopPctMedian': round(rel[len(rel) // 2], 3)}
def fmt(a): return f"n={a['n']:4d} הלכו נכון={a['dir']*100:3.0f}% 2R={a['r2']*100:3.0f}% גרירה={a['s4']:+.2f} 1:3={a['s1']:+.2f} נעצרו={a['stopped']*100:3.0f}% נעצרו-ואז-הלכו={a['stoppedThenWent']*100:3.0f}% סטופ={a['stopPctMedian']:.2f}%" if a['n'] else 'n=0'
def main():
    d = json.loads((ROOT / 'trades' / 'htt_path_store_v6.json').read_text(encoding='utf-8'))
    T = []; obret = {}
    for name, v in d['combos'].items():
        T += [x for x in (parse(r, name) for r in v.get('rows', [])) if x]
        m = re.search(r'obRet(\d+)/(\d+)', v.get('meta') or '')
        if m: obret[name] = (int(m.group(1)), int(m.group(2)))
    for t in T:
        t['lvl'] = sum(1 for k in POS if t['flags'][idx[k]] == '1') - sum(1 for k in NEG if t['flags'][idx[k]] == '1'); t['res'] = t['combo'].rsplit('_', 1)[1]
    print('סיגנלים:', len(T), '| OB ריטסט: מילויים/סיגנלים לכל שילוב:', obret, '| סה"כ', sum(v[0] for v in obret.values()), '/', sum(v[1] for v in obret.values()))
    out = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'nSignals': len(T), 'obRetest': obret, 'byStrat': {}, 'byStratRes': {}, 'byStratLvl': {}, 'stratHe': STRAT_HE}
    order = ['F', 'G', 'O', 'R', 'W', 'M', 'B', 'X']
    print('\nלפי סוג כניסה (כל המסגרות):')
    for s in order:
        a = agg([t for t in T if t['strat'] == s]); out['byStrat'][s] = a
        print(f"  {s} {STRAT_HE.get(s, s):<28} {fmt(a)}")
    for res in ('240', '15', '5'):
        print(f'\nמסגרת {res}:'); out['byStratRes'][res] = {}
        for s in order:
            a = agg([t for t in T if t['strat'] == s and t['res'] == res]); out['byStratRes'][res][s] = a
            if a['n']: print(f"  {s} {STRAT_HE.get(s, s):<28} {fmt(a)}")
    print('\nלפי רמה (רמה ≥3):'); out['byStratLvl']['3'] = {}
    for s in order:
        a = agg([t for t in T if t['strat'] == s and t['lvl'] >= 3]); out['byStratLvl']['3'][s] = a
        if a['n']: print(f"  {s} {STRAT_HE.get(s, s):<28} {fmt(a)}")
    # X לפי מספר אישורים בכניסה (ספירת דגלי POS) ולפי כיוון
    X = [t for t in T if t['strat'] == 'X']
    print('\nX (3 אישורים) לפי כיוון:', 'לונג', fmt(agg([t for t in X if t['side'] == 'L'])), '| שורט', fmt(agg([t for t in X if t['side'] == 'S'])))
    (ROOT.parents[1] / 'apps/web/public/htt-backtest/variants.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
if __name__ == '__main__':
    main()
