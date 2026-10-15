# -*- coding: utf-8 -*-
"""סינרגיית פאזה D בשלוש מסגרות (4H / 15m / 5m) באותו כיוון — לבקשת המשתמש (10/9/2026).
קלט: trades/htt_path_store_syn_raw.json (Path Lab v8: שדות 40-45 = פאזה+כיוון ב-4H/15m/5m בזמן הסיגנל, חלונות Replay).
פלט: trades/htt_path_store_syn.json (ממוזג, 365 יום) + public/htt-backtest/synergy.json לאתר."""
import os, json, pathlib, datetime, collections
ROOT = pathlib.Path(__file__).resolve().parent
from build_stats import FLAG_HE, STRAT_HE
from build_path_stats import parse, analyze, MIN_N
from build_year_stats import merge, level_of, brief, POOLS, TF_MS
RAW = os.environ.get('HTT_SYN_RAW', 'htt_path_store_syn_raw.json')
PH_D = 4
STATES = [
    ('D3',     'פאזה D ב-4H + 15m + 5m — כולן באותו כיוון של העסקה'),
    ('D240_15', 'D ב-4H + 15m (5m לא ב-D)'),
    ('D15_5',  'D ב-15m + 5m (4H לא ב-D)'),
    ('D240_5', 'D ב-4H + 5m (15m לא ב-D)'),
    ('D240',   'D רק ב-4H'),
    ('D15',    'D רק ב-15m'),
    ('D5',     'D רק ב-5m'),
    ('none',   'אף מסגרת לא ב-D בכיוון העסקה'),
    ('against3', 'D בשלוש המסגרות נגד כיוון העסקה'),
]

def d_dir(ph, bu):
    """+1 = D של הצטברות (לונג), −1 = D של הפצה (שורט), 0 = לא בפאזה D / לא ידוע"""
    if ph != PH_D or bu not in (0, 1):
        return 0
    return 1 if bu == 1 else -1

def state_of(t):
    side = 1 if t['side'] == 'L' else -1
    d = [t['d240'] == side, t['d15'] == side, t['d5'] == side]
    if all(x == -side for x in (t['d240'], t['d15'], t['d5'])):
        return 'against3'
    if all(d):
        return 'D3'
    if d[0] and d[1]:
        return 'D240_15'
    if d[1] and d[2]:
        return 'D15_5'
    if d[0] and d[2]:
        return 'D240_5'
    if d[0]:
        return 'D240'
    if d[1]:
        return 'D15'
    if d[2]:
        return 'D5'
    return 'none'

import bisect
WARMUP_BARS = int(os.environ.get('HTT_WARMUP', '1500'))
MAX_GAP_BARS = 150   # פעימה כל 100 נרות → פער גדול מזה = מצב לא ידוע (גבול חלון)

def timelines(raw):
    """ציר זמן (time → פאזה, כיוון) לכל נכס×מסגרת משורות H, אחרי זריקת החימום בכל חלון"""
    tl = {}
    for name, cb in raw['combos'].items():
        res = str(cb['res']); tfms = TF_MS[res]
        rows = {}
        for w in sorted([w for w in cb.get('windows', []) if w.get('firstT')], key=lambda w: w['firstT']):
            minT = w['firstT'] + WARMUP_BARS * tfms
            for r in w['rows']:
                if not r.startswith('H|'):
                    continue
                p = r.split('|')
                if len(p) < 4:
                    continue
                t = int(p[1])
                if t < minT or t in rows:
                    continue
                rows[t] = (int(p[2]), int(p[3]), int(p[4]) if len(p) > 4 and p[4].lstrip('-').isdigit() else -1)
        ts = sorted(rows)
        tl[(cb['sym'], res)] = (ts, [rows[t] for t in ts])
    return tl

def state_at(tl, sym, res, tc):
    """המצב במסגרת res כפי שהיה ידוע ב-tc (רק נרות שנסגרו עד tc). מחזיר (פאזה, כיוון) או None"""
    key = (sym, res)
    if key not in tl:
        return None
    ts, vals = tl[key]
    tfms = TF_MS[res]
    i = bisect.bisect_right(ts, tc - tfms) - 1
    if i < 0:
        return None
    if tc - (ts[i] + tfms) > MAX_GAP_BARS * tfms:
        return None
    return vals[i]

def parse_syn(row, combo, tl, sym, res):
    t = parse(row, combo)
    if not t:
        return None
    p = row.split('|')
    tc = t['entryTime'] + TF_MS[res]
    sts = {tf: state_at(tl, sym, tf, tc) for tf in ('240', '15', '5')}
    if any(v is None for v in sts.values()):
        return None
    t['ph240'], t['ph15'], t['ph5'] = sts['240'][0], sts['15'][0], sts['5'][0]
    t['d240'], t['d15'], t['d5'] = (d_dir(*sts['240']), d_dir(*sts['15']), d_dir(*sts['5']))
    # הצלבה עם השדות מ-request.security (רק כשקיימים ולא -1)
    t['xcheck'] = None
    if len(p) >= 46:
        try:
            sec = [int(x) for x in p[40:46]]
            checks = []
            for (ph, bu), tf in ((sec[0:2], '240'), (sec[2:4], '15'), (sec[4:6], '5')):
                if ph >= 0 and tf != res:
                    checks.append(sts[tf][0] == ph)
            if checks:
                t['xcheck'] = all(checks)
        except ValueError:
            pass
    return t

def main():
    raw = json.loads((ROOT / 'trades' / RAW).read_text(encoding='utf-8'))
    combos, coverage = merge(raw)
    (ROOT / 'trades' / 'htt_path_store_syn.json').write_text(json.dumps({'exportedAt': raw['exportedAt'], 'combos': combos}, ensure_ascii=False), encoding='utf-8')
    tl = timelines(raw)
    print('timelines', {f"{k[0].split(':')[1]}_{k[1]}": len(v[0]) for k, v in tl.items()})
    T = []
    nUnknown = 0
    for name, v in combos.items():
        for r in v['rows']:
            t = parse_syn(r, name, tl, v['sym'], v['res'])
            if not t:
                nUnknown += 1
                continue
            if t:
                t['res'] = v['res']; t['sym'] = v['sym']; t['level'] = level_of(t['flags'], v['res'])
                t['state'] = state_of(t)
                T.append(t)
    syms = sorted(set(t['sym'] for t in T))
    TFS = ['5', '15', '240']
    out_pools = {}
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
            for k in ('all',):
                if row[k]['n'] >= MIN_N and row[k].get('s4R') is not None and base['all'].get('s4R') is not None:
                    row[k]['lift'] = round(row[k]['s4R'] - base['all']['s4R'], 2)
            for s in ('L', 'S'):
                b = row['bySide'][s]
                if b['n'] >= MIN_N and b.get('s4R') is not None and base[s].get('s4R') is not None:
                    b['lift'] = round(b['s4R'] - base[s]['s4R'], 2)
            rows.append(row)
        # D3 לפי רמת ההתראה
        d3 = [t for t in P if t['state'] == 'D3']
        levels = {str(k): brief([t for t in d3 if t['level'] >= k]) for k in range(0, 6)}
        # D3 לפי אישור נוסף (top lifts)
        flags_in_d3 = []
        FLAGS = [l.strip() for l in (ROOT / 'flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]
        base_d3 = brief(d3)
        for i, k in enumerate(FLAGS):
            sub = [t for t in d3 if t['flags'][i] == '1']
            b = brief(sub)
            if b['n'] >= MIN_N and b.get('s4R') is not None and base_d3.get('s4R') is not None:
                b['lift'] = round(b['s4R'] - base_d3['s4R'], 2)
                flags_in_d3.append({'flag': k, 'he': FLAG_HE.get(k, k), **b})
        flags_in_d3.sort(key=lambda r: r['lift'], reverse=True)
        out_pools[key] = dict(pdef, nSignals=len(P), base=base, rows=rows, d3Levels=levels, d3Flags=flags_in_d3)
    # כמה זמן השוק בסינרגיה: לפי סיגנלי 5m (הרזולוציה הגבוהה ביותר) — חלק הסיגנלים ב-D3 לכל כיוון, לפי נכס
    time_share = {}
    for s in syms:
        P5 = [t for t in T if t['sym'] == s and t['res'] == '5']
        n = len(P5) or 1
        time_share[s] = {'n5': len(P5), 'd3Long': round(sum(1 for t in P5 if t['d240'] == 1 and t['d15'] == 1 and t['d5'] == 1) / n, 3),
                         'd3Short': round(sum(1 for t in P5 if t['d240'] == -1 and t['d15'] == -1 and t['d5'] == -1) / n, 3),
                         'anyD240': round(sum(1 for t in P5 if t['d240'] != 0) / n, 3), 'anyD15': round(sum(1 for t in P5 if t['d15'] != 0) / n, 3), 'anyD5': round(sum(1 for t in P5 if t['d5'] != 0) / n, 3)}
    xc = [t['xcheck'] for t in T if t['xcheck'] is not None]
    xcheck = {'n': len(xc), 'agree': round(sum(1 for x in xc if x) / len(xc), 3) if xc else None}
    print('unknown-state signals dropped', nUnknown, '| security cross-check', xcheck)
    out = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'minN': MIN_N, 'nSignals': len(T), 'nUnknown': nUnknown, 'xcheck': xcheck, 'statesHe': dict(STATES),
           'stratHe': STRAT_HE, 'pools': out_pools, 'timeShare': time_share, 'coverage': coverage}
    dest = ROOT.parents[1] / 'apps/web/public/htt-backtest'
    (dest / 'synergy.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    for key, P in out_pools.items():
        print('\n== pool', key, P['nSignals'], 'base', {k: (v.get('n'), v.get('s4R'), v.get('rightDir1R')) for k, v in P['base'].items()})
        for r in P['rows']:
            print(f"  {r['state']:9s} n={r['all']['n']:6d} share={r['share']} R={r['all'].get('s4R')} lift={r['all'].get('lift')} dir={r['all'].get('rightDir1R')} | L n={r['bySide']['L']['n']} R={r['bySide']['L'].get('s4R')} | S n={r['bySide']['S']['n']} R={r['bySide']['S'].get('s4R')} | tf " + ' '.join(f"{tf}:{b['n']}/{b.get('s4R')}" for tf, b in r['byTf'].items()))
        print('  D3 levels', {k: (v['n'], v.get('s4R')) for k, v in P['d3Levels'].items()})
        print('  D3 top flags', [(f['he'][:16], f['n'], f['lift']) for f in P['d3Flags'][:6]])
    print('time share', time_share)

if __name__ == '__main__':
    main()
