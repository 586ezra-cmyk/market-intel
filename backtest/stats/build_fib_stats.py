# -*- coding: utf-8 -*-
"""פיבונאצ'י על כל הסיגנלים (HTT Path Lab v2): (1) כאישור — איפה בתיקון של התנועה האחרונה נכנסנו (אזור הזהב 0.618–0.786 לפי
הקורס 4-5/4-6, ואיפה בטווח היומי/השבועי לפי 25-9); (2) לסטופ וליעד — סטופ מעבר ל-1.0 של התנועה, יעדים 0 / 1.272 / 1.618,
מול סטופ הקורס ויעד 1:3. קלט: trades/htt_path_store.json (שורות עם 40 שדות). פלט: public/htt-backtest/fib.json."""
import json, pathlib, datetime, collections
ROOT = pathlib.Path(__file__).resolve().parent
from build_path_stats import parse as parse_base, fnum, pct, q, MIN_N
from build_stats import FLAG_HE, STRAT_HE
FLAGS = [l.strip() for l in (ROOT / 'flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]

ZONES = [  # מיקום הכניסה בתיקון של התנועה האחרונה (0 = בקצה התנועה, 1 = בתחילתה)
    ('chase',   'קרוב לקצה (תיקון < 0.382)',        lambda r: r < 0.382),
    ('shallow', 'תיקון 0.382–0.5',                   lambda r: 0.382 <= r < 0.5),
    ('half',    'תיקון 0.5–0.618',                   lambda r: 0.5 <= r < 0.618),
    ('golden',  'אזור הזהב 0.618–0.786',             lambda r: 0.618 <= r <= 0.786),
    ('deep',    'תיקון עמוק 0.786–1.0',              lambda r: 0.786 < r <= 1.0),
    ('beyond',  'מעבר לתחילת התנועה (> 1.0)',        lambda r: r > 1.0),
]
RANGE_ZONES = [  # מיקום בטווח (0 = תחתית, 1 = תקרה), מנקודת המבט של כיוון העסקה
    ('rGolden', 'אזור הזהב של הטווח (0.618–0.786 מהקצה הנגדי)', lambda p: 0.214 <= p <= 0.382),
    ('rDisc',   'צד הדיסקאונט (עד 0.5) מחוץ לאזור הזהב',       lambda p: p < 0.5 and not (0.214 <= p <= 0.382)),
    ('rPrem',   'צד הפרימיום (מעל 0.5)',                        lambda p: p >= 0.5),
]

def parse(row, combo):
    t = parse_base(row, combo)
    if t is None:
        return None
    p = row.split('|')
    if len(p) < 40:
        return None
    t['ret'] = fnum(p[28]); t['fibStopR'] = fnum(p[29]); t['t0R'] = fnum(p[30]); t['t1R'] = fnum(p[31]); t['t2R'] = fnum(p[32])
    t['fsBar'] = int(p[33]); t['t0Bar'] = int(p[34]); t['t1Bar'] = int(p[35]); t['t2Bar'] = int(p[36])
    t['posR'] = fnum(p[37]); t['posD'] = fnum(p[38]); t['posW'] = fnum(p[39])
    # מיקום מנקודת המבט של הכיוון: ללונג 0 = תחתית; לשורט הופכים
    for k in ('posR', 'posD', 'posW'):
        if t[k] is not None and t['side'] == 'S':
            t[k] = 1 - t[k]
    return t

def before(hitBar, stopBar):
    """היעד הושג לפני הסטופ (אותו נר = הסטופ קודם)"""
    return hitBar >= 0 and (stopBar < 0 or hitBar < stopBar)

def scheme_R(t, target_key, bar_key, stop_key, stopR_key):
    """תוצאה ב-R של הסטופ הנבחר: יעד לפני הסטופ → +יעד/סטופ; סטופ → −1; אחרת שווי שוק בסוף האופק ביחידות של הסטופ הנבחר"""
    tR = t.get(target_key); sR = t.get(stopR_key)
    if tR is None or sR is None or sR <= 0 or tR <= 0:
        return None
    if before(t[bar_key], t[stop_key]):
        return tR / sR
    if t[stop_key] >= 0:
        return -1.0
    return (t['horizonR'] or 0) / sR

def analyze(ts):
    n = len(ts)
    if n == 0:
        return {'n': 0}
    s1 = [t['s1'] if t['s1'] is not None else (t['horizonR'] or 0) for t in ts]
    s4 = [t['s4'] if t['s4'] is not None else (t['horizonR'] or 0) for t in ts]
    out = {'n': n, 'rightDir1R': pct(sum(1 for t in ts if t['b1'] >= 0), n), 'reach2': pct(sum(1 for t in ts if (t['mfeBeforeStop'] or 0) >= 2), n),
           'reach3': pct(sum(1 for t in ts if (t['mfeBeforeStop'] or 0) >= 3), n),
           's1AvgR': round(sum(s1) / n, 3), 's1Win': pct(sum(1 for v in s1 if v > 0), n), 's4AvgR': round(sum(s4) / n, 3), 's4Win': pct(sum(1 for v in s4 if v > 0), n),
           'significant': n >= MIN_N}
    # סטופ פיבו: כמה רחוק מסטופ הקורס, וכמה פעמים נפגע לפני יעד 2R של הקורס
    fsr = [t['fibStopR'] for t in ts if t['fibStopR'] is not None and t['fibStopR'] > 0]
    out['fibStopR'] = {'p50': q(fsr, 0.5), 'p25': q(fsr, 0.25), 'p75': q(fsr, 0.75), 'n': len(fsr)}
    out['fibStopHit'] = pct(sum(1 for t in ts if t['fsBar'] >= 0), n)
    out['courseStopHit'] = pct(sum(1 for t in ts if t['stopBar'] >= 0), n)
    # יעדי פיבו: מרחק ב-R של הקורס, והגעה לפני סטופ הקורס / לפני סטופ הפיבו
    for key, bk, he in (('t0', 't0Bar', 'קצה התנועה (0)'), ('t1', 't1Bar', 'הרחבה 1.272'), ('t2', 't2Bar', 'הרחבה 1.618')):
        vals = [t[key + 'R'] for t in ts if t[key + 'R'] is not None and t[key + 'R'] > 0]
        out[key] = {'he': he, 'medianR': q(vals, 0.5), 'n': len(vals),
                    'hitBeforeCourseStop': pct(sum(1 for t in ts if before(t[bk], t['stopBar'])), n),
                    'hitBeforeFibStop': pct(sum(1 for t in ts if before(t[bk], t['fsBar'])), n)}
    # שיטות: (א) סטופ קורס + יעד פיבו, (ב) סטופ פיבו + יעד פיבו — ממוצע R ביחידות של הסטופ שבשימוש
    schemes = {}
    for name, tk, bk, sk, srk in (
        ('courseStop_t0', 't0R', 't0Bar', 'stopBar', 'one'), ('courseStop_t1', 't1R', 't1Bar', 'stopBar', 'one'), ('courseStop_t2', 't2R', 't2Bar', 'stopBar', 'one'),
        ('fibStop_t0', 't0R', 't0Bar', 'fsBar', 'fibStopR'), ('fibStop_t1', 't1R', 't1Bar', 'fsBar', 'fibStopR'), ('fibStop_t2', 't2R', 't2Bar', 'fsBar', 'fibStopR'),
    ):
        vals = []
        for t in ts:
            tt = dict(t); tt['one'] = 1.0
            v = scheme_R(tt, tk, bk, sk, srk)
            if v is not None:
                vals.append(v)
        if vals:
            schemes[name] = {'n': len(vals), 'avgR': round(sum(vals) / len(vals), 3), 'winRate': pct(sum(1 for v in vals if v > 0), len(vals))}
    out['schemes'] = schemes
    return out

def main():
    d = json.loads((ROOT / 'trades' / 'htt_path_store.json').read_text(encoding='utf-8'))
    T = []
    for name, v in d['combos'].items():
        T += [x for x in (parse(r, name) for r in v.get('rows', [])) if x]
    idx = {k: i for i, k in enumerate(FLAGS)}
    withRet = [t for t in T if t['ret'] is not None]
    zones = {}
    for key, he, fn in ZONES:
        zones[key] = {'he': he, **analyze([t for t in withRet if fn(t['ret'])])}
    rangeZones = {}
    for scope, pk in (('process', 'posR'), ('daily', 'posD'), ('weekly', 'posW')):
        rangeZones[scope] = {}
        for key, he, fn in RANGE_ZONES:
            rangeZones[scope][key] = {'he': he, **analyze([t for t in T if t[pk] is not None and fn(t[pk])])}
    # אזור הזהב כאישור על גבי כל אחד מהאישורים שלנו
    golden = lambda t: t['ret'] is not None and 0.618 <= t['ret'] <= 0.786
    flag_rows = []
    for k in FLAGS:
        base = [t for t in T if t['flags'][idx[k]] == '1']
        g = [t for t in base if golden(t)]; ng = [t for t in base if t['ret'] is not None and not golden(t)]
        if len(g) >= 10 and len(ng) >= 10:
            a, b = analyze(g), analyze(ng)
            flag_rows.append({'flag': k, 'he': FLAG_HE.get(k, k), 'golden': a, 'other': b, 'liftS1': round(a['s1AvgR'] - b['s1AvgR'], 3), 'liftS4': round(a['s4AvgR'] - b['s4AvgR'], 3), 'liftDir': round((a['rightDir1R'] or 0) - (b['rightDir1R'] or 0), 3)})
    flag_rows.sort(key=lambda r: r['liftS4'], reverse=True)
    by_strat = {s: {'golden': analyze([t for t in T if t['strat'] == s and golden(t)]), 'other': analyze([t for t in T if t['strat'] == s and t['ret'] is not None and not golden(t)])} for s in STRAT_HE}
    by_res = {r: {'golden': analyze([t for t in T if t['combo'].endswith('_' + r) and golden(t)]), 'other': analyze([t for t in T if t['combo'].endswith('_' + r) and t['ret'] is not None and not golden(t)])} for r in ('5', '15', '240')}
    ret_dist = collections.Counter()
    for t in withRet:
        for key, he, fn in ZONES:
            if fn(t['ret']):
                ret_dist[key] += 1
    out = {
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'minN': MIN_N, 'nSignals': len(T), 'nWithLeg': len(withRet),
        'zonesHe': {k: he for k, he, _ in ZONES}, 'rangeZonesHe': {k: he for k, he, _ in RANGE_ZONES}, 'stratHe': STRAT_HE,
        'all': analyze(T), 'zones': zones, 'zoneDist': dict(ret_dist), 'rangeZones': rangeZones, 'flagRows': flag_rows, 'byStrat': by_strat, 'byRes': by_res,
    }
    dest = ROOT.parents[1] / 'apps/web/public/htt-backtest'
    (dest / 'fib.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    a = out['all']
    print('signals', len(T), 'with leg', len(withRet), 'zoneDist', dict(ret_dist))
    print('ALL s1', a['s1AvgR'], 's4', a['s4AvgR'], '| fibStopR', a['fibStopR'], '| fibStopHit', a['fibStopHit'], 'courseStopHit', a['courseStopHit'])
    for k, v in a['t0'].items() if False else []: pass
    for key in ('t0', 't1', 't2'):
        print(' ', key, a[key])
    print('  schemes', {k: (v['n'], v['winRate'], v['avgR']) for k, v in a['schemes'].items()})
    for key, v in zones.items():
        print(f"zone {key:<8} n={v['n']:4d} dir={v.get('rightDir1R')} s1={v.get('s1AvgR')} s4={v.get('s4AvgR')} fibStopHit={v.get('fibStopHit')} " + str({k2: (x['winRate'], x['avgR']) for k2, x in v.get('schemes', {}).items()}))
    for scope, zz in rangeZones.items():
        print('range', scope, {k: (v['n'], v.get('rightDir1R'), v.get('s4AvgR')) for k, v in zz.items()})
    print('flags (golden vs other, lift S4):', [(r['he'], r['golden']['n'], r['golden']['s4AvgR'], r['other']['s4AvgR']) for r in flag_rows[:8]])
    print('worst:', [(r['he'], r['golden']['n'], r['golden']['s4AvgR'], r['other']['s4AvgR']) for r in flag_rows[-4:]])

if __name__ == '__main__':
    main()
