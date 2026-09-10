# -*- coding: utf-8 -*-
"""VIX מול הנכס: האם משטר ה-VIX משפר את העסקאות? קלט: trades/htt_path_store_vix.json (Path Lab v5, דגלי vixOk/vixHigh/vixSpike/vixDiv).
פלט: טבלאות לקונסול + public/htt-backtest/vix.json"""
import json, pathlib, datetime
ROOT = pathlib.Path(__file__).resolve().parent
from build_fib_stats import parse
from build_stats import FLAG_HE
FLAGS = [l.strip() for l in (ROOT / 'flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]
idx = {k: i for i, k in enumerate(FLAGS)}
POS = ['judas', 'ob', 'phC', 'fvgAt', 'sweep', 'kz', 'sesLon', 'htfMs', 'fvg', 'ddt']; NEG = ['phD', 'conf4', 'volLow', 'amdD', 'cDir', 'htfCD', 'rrOk', 'ifvg', 'lps', 'shake']
def s4(t): return t['s4'] if t['s4'] is not None else (t['horizonR'] or 0.0)
def s1(t): return t['s1'] if t['s1'] is not None else (t['horizonR'] or 0.0)
def agg(ts):
    n = len(ts)
    if n == 0: return {'n': 0}
    return {'n': n, 'dir': round(sum(1 for t in ts if t['b1'] >= 0) / n, 3), 'r2': round(sum(1 for t in ts if (t['mfeBeforeStop'] or 0) >= 2) / n, 3), 's4': round(sum(s4(t) for t in ts) / n, 3), 's1': round(sum(s1(t) for t in ts) / n, 3)}
def fmt(a): return f"n={a['n']:4d} כיוון={a['dir']*100:3.0f}% 2R={a['r2']*100:3.0f}% גרירה={a['s4']:+.2f} 1:3={a['s1']:+.2f}" if a['n'] else 'n=0'
def main():
    d = json.loads((ROOT / 'trades' / 'htt_path_store_vix.json').read_text(encoding='utf-8'))
    T = []
    for name, v in d['combos'].items():
        T += [x for x in (parse(r, name) for r in v.get('rows', [])) if x]
    for t in T:
        t['lvl'] = sum(1 for k in POS if t['flags'][idx[k]] == '1') - sum(1 for k in NEG if t['flags'][idx[k]] == '1'); t['res'] = t['combo'].rsplit('_', 1)[1]; t['sym'] = t['combo'].rsplit('_', 1)[0]
    out = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'groups': {}}
    for sym in sorted(set(t['sym'] for t in T)):
        S = [t for t in T if t['sym'] == sym]
        print(f"\n##### {sym}: {fmt(agg(S))}")
        g = {'base': agg(S), 'flags': {}}
        for k in ('vixOk', 'vixHigh', 'vixSpike', 'vixDiv'):
            w = [t for t in S if t['flags'][idx[k]] == '1']; wo = [t for t in S if t['flags'][idx[k]] == '0']
            print(f"  {FLAG_HE.get(k,k):<44} עם: {fmt(agg(w))} | בלי: {fmt(agg(wo))}")
            g['flags'][k] = {'he': FLAG_HE.get(k, k), 'with': agg(w), 'without': agg(wo),
                             'withLong': agg([t for t in w if t['side'] == 'L']), 'withShort': agg([t for t in w if t['side'] == 'S']),
                             'withoutLong': agg([t for t in wo if t['side'] == 'L']), 'withoutShort': agg([t for t in wo if t['side'] == 'S']),
                             'byRes': {r: {'with': agg([t for t in w if t['res'] == r]), 'without': agg([t for t in wo if t['res'] == r])} for r in ('240', '15', '5')},
                             'lvl3': {'with': agg([t for t in w if t['lvl'] >= 3]), 'without': agg([t for t in wo if t['lvl'] >= 3])}}
            print(f"      לונג עם: {fmt(agg([t for t in w if t['side']=='L']))} | לונג בלי: {fmt(agg([t for t in wo if t['side']=='L']))}")
            print(f"      שורט עם: {fmt(agg([t for t in w if t['side']=='S']))} | שורט בלי: {fmt(agg([t for t in wo if t['side']=='S']))}")
            print(f"      רמה≥3 עם: {fmt(agg([t for t in w if t['lvl']>=3]))} | רמה≥3 בלי: {fmt(agg([t for t in wo if t['lvl']>=3]))}")
        # שילוב: VIX תומך + רמה
        for th in (2, 3, 4):
            a = [t for t in S if t['flags'][idx['vixOk']] == '1' and t['lvl'] >= th]; b = [t for t in S if t['flags'][idx['vixOk']] == '0' and t['lvl'] >= th]
            print(f"  רמה≥{th} + VIX תומך: {fmt(agg(a))} | רמה≥{th} בלי VIX תומך: {fmt(agg(b))}")
        out['groups'][sym] = g
    (ROOT.parents[1] / 'apps/web/public/htt-backtest/vix.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
if __name__ == '__main__':
    main()
