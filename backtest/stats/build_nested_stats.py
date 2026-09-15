# -*- coding: utf-8 -*-
"""פאזות מקוננות בין מסגרות (4H → 15m → 5m) — טענת המשתמש: "בכל פאזה C של 4H יש C של 15m, ובכל C של 15m יש C של 5m".
בודק (1) קינון של מרווחי פאזה בין המסגרות, (2) סיגנלים שנכנסו כשכל שלוש המסגרות ב-C (או D) באותו כיוון — במצב "סגור"
(רק נרות שנסגרו) ובמצב "חי" (הנר של המסגרת הגבוהה שבו נמצאים, כולל מה שקרה עד סגירתו), (3) רשימת העסקאות עצמן.
קלט: trades/htt_path_store_syn_raw.json. פלט: public/htt-backtest/nested.json"""
import os, json, pathlib, datetime, bisect, statistics
ROOT = pathlib.Path(__file__).resolve().parent
from build_stats import FLAG_HE, STRAT_HE
from build_path_stats import parse, MIN_N
from build_year_stats import merge, level_of, brief, POOLS, TF_MS
from build_synergy_stats import timelines, MAX_GAP_BARS
FLAGS = [l.strip() for l in (ROOT / 'flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]
TFS = ['240', '15', '5']
# מצב = קבוצת פאזות לכל מסגרת (4H, 15m, 5m)
PHASE_SETS = {
    'CCC':    ({3}, {3}, {3}),
    'CD_C_C': ({3, 4}, {3}, {3}),
    'CD_CD_C': ({3, 4}, {3, 4}, {3}),
    'CDx3':   ({3, 4}, {3, 4}, {3, 4}),
    'DDD':    ({4}, {4}, {4}),
    'DDD_q2': ({4}, {4}, {4}),   # D איכותית (חוקי הברזל ≥ 2) בכל מסגרת — לפי שדה dQ בשורות H (Path Lab v16+)
    'DDD_q3': ({4}, {4}, {4}),
}
MIN_DQ = {'DDD_q2': 2, 'DDD_q3': 3}
PHASE_HE = {
    'DDD_q2': 'D איכותית (חוקי הברזל 2+) בשלוש המסגרות',
    'DDD_q3': 'D איכותית (חוקי הברזל 3+) בשלוש המסגרות',
    'CCC': 'C בשלוש המסגרות (הטענה המילולית)',
    'CD_C_C': '4H ב-C או D, 15m ב-C, 5m ב-C (ניעור בתוך ניעור אחרי הכרעת 4H)',
    'CD_CD_C': '4H ב-C או D, 15m ב-C או D, 5m ב-C',
    'CDx3': 'C או D בשלוש המסגרות',
    'DDD': 'D בשלוש המסגרות',
}
MODE_HE = {'strict': 'סגור — רק נרות שנסגרו לפני הכניסה (בלי הצצה קדימה)', 'live': 'חי — הנר של המסגרת הגבוהה שבו נמצאים, כולל מה שקרה עד סגירתו'}
STATES = [('S3', 'שלוש המסגרות באותו כיוון של העסקה'), ('S240_15', '4H + 15m'), ('S15_5', '15m + 5m'), ('S240_5', '4H + 5m'),
          ('S240', 'רק 4H'), ('S15', 'רק 15m'), ('S5', 'רק 5m'), ('none', 'אף מסגרת'), ('against3', 'שלוש המסגרות נגד כיוון העסקה')]

def state_at(tl, sym, res, tc, mode):
    key = (sym, res)
    if key not in tl:
        return None
    ts, vals = tl[key]
    tfms = TF_MS[res]
    ref = tc if mode == 'live' else tc - tfms
    i = bisect.bisect_right(ts, ref) - 1
    if i < 0 or tc - (ts[i] + tfms) > MAX_GAP_BARS * tfms:
        return None
    return vals[i]

def dir_of(st, phset, minq=0):
    if st is None or st[0] not in phset:
        return 0
    if minq and (len(st) < 3 or st[2] < minq):
        return 0
    return 1 if st[1] == 1 else -1

def state_key(dirs, side):
    d = [x == side for x in dirs]
    if all(x == -side for x in dirs):
        return 'against3'
    if all(d):
        return 'S3'
    if d[0] and d[1]:
        return 'S240_15'
    if d[1] and d[2]:
        return 'S15_5'
    if d[0] and d[2]:
        return 'S240_5'
    return 'S240' if d[0] else 'S15' if d[1] else 'S5' if d[2] else 'none'

def intervals(tl, sym, res):
    """מרווחי מצב קבוע (פאזה, כיוון) מציר הזמן: [(t0, t1, phase, bull)] — t1 = סגירת הנר האחרון של המרווח"""
    ts, vals = tl[(sym, res)]
    out = []
    tfms = TF_MS[res]
    i = 0
    while i < len(ts):
        j = i
        while j + 1 < len(ts) and vals[j + 1][:2] == vals[i][:2] and ts[j + 1] - ts[j] <= MAX_GAP_BARS * tfms:
            j += 1
        t1 = ts[j + 1] if (j + 1 < len(ts) and ts[j + 1] - ts[j] <= MAX_GAP_BARS * tfms) else ts[j] + tfms
        out.append((ts[i], t1, vals[i][0], vals[i][1]))
        i = j + 1
    return out

def nesting(tl, syms, sets):
    """לכל מרווח (פאזה מהקבוצה) ב-4H: האם יש מרווח מתאים ב-15m בתוכו (חפיפה בזמן, אותו כיוון)? ולכל 15m: 5m? וגם הפוך: כמה מה-15m בתוך 4H"""
    res = {}
    for sym in syms:
        iv = {tf: [x for x in intervals(tl, sym, tf) if x[2] in sets[k]] for k, tf in enumerate(TFS)}
        def overlaps(a, lst, same_dir=True):
            return [b for b in lst if b[0] < a[1] and b[1] > a[0] and (not same_dir or b[3] == a[3])]
        r = {}
        for hi, lo in (('240', '15'), ('15', '5'), ('240', '5')):
            H, L = iv[hi], iv[lo]
            with_inner = sum(1 for a in H if overlaps(a, L))
            with_inner_any = sum(1 for a in H if overlaps(a, L, False))
            inside_outer = sum(1 for b in L if overlaps(b, H))
            r[f'{hi}_{lo}'] = {'nHi': len(H), 'hiWithLo': with_inner, 'hiWithLoAnyDir': with_inner_any, 'pctHiWithLo': round(with_inner / len(H), 3) if H else None,
                               'nLo': len(L), 'loInsideHi': inside_outer, 'pctLoInsideHi': round(inside_outer / len(L), 3) if L else None}
        # שלוש רמות: C של 4H שיש בתוכו C של 15m שיש בתוכו C של 5m (אותו כיוון)
        n3 = 0
        for a in iv['240']:
            ok = False
            for b in overlaps(a, iv['15']):
                inner = [c for c in overlaps(b, iv['5']) if c[0] < a[1] and c[1] > a[0]]
                if inner:
                    ok = True
                    break
            n3 += ok
        r['triple'] = {'n240': len(iv['240']), 'withNested15and5': n3, 'pct': round(n3 / len(iv['240']), 3) if iv['240'] else None}
        r['durationBars'] = {tf: {'median': statistics.median([(x[1] - x[0]) / TF_MS[tf] for x in iv[tf]]) if iv[tf] else None, 'n': len(iv[tf])} for tf in TFS}
        res[sym] = r
    return res

def main():
    raw = json.loads((ROOT / 'trades' / 'htt_path_store_syn_raw.json').read_text(encoding='utf-8'))
    combos, coverage = merge(raw)
    tl = timelines(raw)
    syms = sorted(set(v['sym'] for v in combos.values()))
    now = raw['exportedAt']; cutoff = now - 365 * 86400000
    # רק השנה האחרונה גם במרווחים
    tl365 = {k: ([t for t in v[0] if t >= cutoff - 400 * TF_MS[k[1]]], [s for t, s in zip(v[0], v[1]) if t >= cutoff - 400 * TF_MS[k[1]]]) for k, v in tl.items()}
    base_T = []
    for name, v in combos.items():
        for r in v['rows']:
            t = parse(r, name)
            if t:
                t['res'] = v['res']; t['sym'] = v['sym']; t['level'] = level_of(t['flags'])
                base_T.append(t)
    out = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'minN': MIN_N, 'phaseHe': PHASE_HE, 'modeHe': MODE_HE,
           'statesHe': dict(STATES), 'stratHe': STRAT_HE, 'nesting': {}, 'results': {}, 'trades': {}}
    for pk, sets in PHASE_SETS.items():
        out['nesting'][pk] = nesting(tl365, syms, sets)
        for mode in ('strict', 'live'):
            T = []
            for t in base_T:
                tc = t['entryTime'] + TF_MS[t['res']]
                sts = [state_at(tl, t['sym'], tf, tc, mode) for tf in TFS]
                if any(s is None for s in sts):
                    continue
                side = 1 if t['side'] == 'L' else -1
                dirs = [dir_of(s, sets[k], MIN_DQ.get(pk, 0)) for k, s in enumerate(sts)]
                t2 = dict(t); t2['state'] = state_key(dirs, side); t2['phs'] = [s[0] for s in sts]
                T.append(t2)
            pools = {}
            for key, pdef in POOLS.items():
                P = [t for t in T if t['strat'] in pdef['types']]
                base = {'all': brief(P), 'L': brief([t for t in P if t['side'] == 'L']), 'S': brief([t for t in P if t['side'] == 'S'])}
                rows = []
                for st, he in STATES:
                    sub = [t for t in P if t['state'] == st]
                    row = {'state': st, 'he': he, 'all': brief(sub), 'share': round(len(sub) / len(P), 3) if P else None,
                           'bySide': {s: brief([t for t in sub if t['side'] == s]) for s in ('L', 'S')},
                           'byTf': {tf: brief([t for t in sub if t['res'] == tf]) for tf in TFS},
                           'bySym': {s: brief([t for t in sub if t['sym'] == s]) for s in syms},
                           'byStrat': {s: brief([t for t in sub if t['strat'] == s]) for s in pdef['types']}}
                    if row['all']['n'] >= MIN_N and row['all'].get('s4R') is not None and base['all'].get('s4R') is not None:
                        row['all']['lift'] = round(row['all']['s4R'] - base['all']['s4R'], 2)
                    for s in ('L', 'S'):
                        b = row['bySide'][s]
                        if b['n'] >= MIN_N and b.get('s4R') is not None and base[s].get('s4R') is not None:
                            b['lift'] = round(b['s4R'] - base[s]['s4R'], 2)
                    rows.append(row)
                s3 = [t for t in P if t['state'] == 'S3']
                levels = {str(k): brief([t for t in s3 if t['level'] >= k]) for k in range(0, 6)}
                pools[key] = {'he': pdef['he'], 'nSignals': len(P), 'base': base, 'rows': rows, 's3Levels': levels}
                if pk in ('CCC', 'CD_C_C', 'CD_CD_C', 'CDx3', 'DDD', 'DDD_q2', 'DDD_q3'):
                    trades = []
                    for t in sorted(s3, key=lambda x: x['entryTime'], reverse=True)[:400]:
                        on = [FLAG_HE.get(k, k) for i, k in enumerate(FLAGS) if t['flags'][i] == '1']
                        trades.append({'time': t['entryTime'], 'sym': t['sym'], 'res': t['res'], 'strat': t['strat'], 'side': t['side'], 'entry': t['entry'], 'stop': t['stop'],
                                       'tgtR': t['tgtR'], 's1': t['s1'], 's4': t['s4'], 'mfe': t['mfe'], 'rightDir': t['b1'] >= 0, 'level': t['level'], 'flags': on[:8], 'phs': t['phs']})
                    out['trades'][f'{pk}_{mode}_{key}'] = trades
            out['results'][f'{pk}_{mode}'] = {'phase': pk, 'mode': mode, 'nSignals': len(T), 'pools': pools}
    dest = ROOT.parents[1] / 'apps/web/public/htt-backtest'
    (dest / 'nested.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    # תדפיס
    for pk in PHASE_SETS:
        print('\n#### PHASE', pk)
        for sym, r in out['nesting'][pk].items():
            print(' ', sym.split(':')[1], '4H→15m', r['240_15']['nHi'], r['240_15']['pctHiWithLo'], '(any dir', r['240_15']['hiWithLoAnyDir'], ') | 15m→5m', r['15_5']['nHi'], r['15_5']['pctHiWithLo'],
                  '| 15m inside 4H', r['240_15']['pctLoInsideHi'], '| triple', r['triple'], '| dur', {k: v['median'] for k, v in r['durationBars'].items()})
        for mode in ('strict', 'live'):
            R = out['results'][f'{pk}_{mode}']
            for key, P in R['pools'].items():
                b = P['base']
                r3 = next(x for x in P['rows'] if x['state'] == 'S3')
                r15 = next(x for x in P['rows'] if x['state'] == 'S15_5')
                print(f"  [{mode}] {key:6s} base n={b['all']['n']} R={b['all'].get('s4R')} | S3 n={r3['all']['n']} share={r3['share']} R={r3['all'].get('s4R')} dir={r3['all'].get('rightDir1R')} L={r3['bySide']['L']['n']}/{r3['bySide']['L'].get('s4R')} S={r3['bySide']['S']['n']}/{r3['bySide']['S'].get('s4R')} tf=" +
                      ' '.join(f"{tf}:{x['n']}/{x.get('s4R')}" for tf, x in r3['byTf'].items()) + f" | 15+5 n={r15['all']['n']} R={r15['all'].get('s4R')}")

if __name__ == '__main__':
    main()
