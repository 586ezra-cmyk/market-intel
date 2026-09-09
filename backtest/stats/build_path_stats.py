# -*- coding: utf-8 -*-
"""ניתוח מסלול המחיר אחרי כל סיגנל (HTT Path Lab): לאן הלכו העסקאות, איפה צריך סטופ, איפה לקחת רווח,
ומה נתנו 6 שיטות ניהול. קלט: backtest/stats/trades/htt_path_store.json (תוויות "P|..." מ-TradingView).
פלט: apps/web/public/htt-backtest/path.json לאתר."""
import json, pathlib, statistics, itertools, datetime, collections
ROOT = pathlib.Path(__file__).resolve().parent
FLAGS = [l.strip() for l in (ROOT / 'flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]
from build_stats import FLAG_HE, STRAT_HE, SES_HE, PH_HE  # אותם שמות בעברית
SCHEMES = {
    's1': 'סטופ הקורס + יעד 1:3',
    's2': 'חצי ב-1R + סטופ לאיזון, חצי ב-3R',
    's3': 'חצי ב-1R + סטופ לאיזון, חצי ב-2R',
    's4': 'איזון אחרי 1R ואז גרירה לפי פיבוטים',
    's5': 'סטופ הקורס + יעד מבני (טווח/נזילות)',
    's6': 'איזון אחרי 1R ואז שנדלייר (קיצון פחות 1R)',
}
LEVELS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6]
MIN_N = 20

def fnum(s):
    return None if s in ('n', '', None) else float(s)

def parse(row, combo):
    p = row.split('|')
    if len(p) < 28 or p[0] != 'P':
        return None
    (_, typ, side, t0, entry, stop, tgtR, flags, ses, ph, conf, mfe, mae, mfes, stopBar, b1, b2, b3, maeb1, maeb2, tgBar,
     s1, s2, s3, s4, s5, s6, horR) = p[:28]
    return {
        'combo': combo, 'strat': typ, 'side': side, 'entryTime': int(t0), 'entry': float(entry), 'stop': float(stop),
        'tgtR': fnum(tgtR), 'flags': flags, 'ses': int(ses), 'phase': int(ph), 'conf': int(conf),
        'mfe': fnum(mfe), 'mae': fnum(mae), 'mfeBeforeStop': fnum(mfes), 'stopBar': int(stopBar),
        'b1': int(b1), 'b2': int(b2), 'b3': int(b3), 'maeBefore1R': fnum(maeb1), 'maeBefore2R': fnum(maeb2), 'tgBar': int(tgBar),
        's1': fnum(s1), 's2': fnum(s2), 's3': fnum(s3), 's4': fnum(s4), 's5': fnum(s5), 's6': fnum(s6), 'horizonR': fnum(horR),
    }

def pct(a, b):
    return round(a / b, 3) if b else None

def q(vals, p):
    if not vals:
        return None
    vals = sorted(vals)
    k = max(0, min(len(vals) - 1, int(round(p * (len(vals) - 1)))))
    return round(vals[k], 2)

def analyze(ts):
    n = len(ts)
    if n == 0:
        return {'n': 0}
    reach = {str(L): pct(sum(1 for t in ts if (t['mfeBeforeStop'] or 0) >= L), n) for L in LEVELS}       # עם סטופ הקורס
    reach_free = {str(L): pct(sum(1 for t in ts if (t['mfe'] or 0) >= L), n) for L in LEVELS}            # בלי סטופ (אופק בלבד)
    stopped = sum(1 for t in ts if t['stopBar'] >= 0)
    stopped_then_went = sum(1 for t in ts if t['stopBar'] >= 0 and (t['mfe'] or 0) >= 2)                  # נעצר ואז הלך 2R בכיוון
    right_dir = sum(1 for t in ts if t['b1'] >= 0)                                                           # הגיע ל-1R לפני הסטופ
    with_tg = [t for t in ts if t['tgtR'] is not None and t['tgtR'] > 0]
    tg_hit = sum(1 for t in with_tg if t['tgBar'] >= 0)
    # סטופ: כמה נגד הלכו העסקאות שבסוף הגיעו ל-1R / 2R (ביחידות של סטופ הקורס)
    adv1 = [t['maeBefore1R'] for t in ts if t['b1'] >= 0 and t['maeBefore1R'] is not None]
    adv2 = [t['maeBefore2R'] for t in ts if t['b2'] >= 0 and t['maeBefore2R'] is not None]
    # סטופ צר/רחב: יעד 2R, סטופ m×סטופ הקורס. תוצאה ביחידות של הסטופ החדש
    stop_scan = []
    for m in (0.5, 0.75, 1.0, 1.25, 1.5, 2.0):
        wins = sum(1 for t in ts if (t['mfe'] or 0) >= 2 and (t['maeBefore2R'] if t['maeBefore2R'] is not None else 9) < m)
        p = wins / n
        stop_scan.append({'stopMult': m, 'winRate': round(p, 3), 'expR': round(p * (2 / m) - (1 - p), 2)})
    # שיטות ניהול
    schemes = {}
    def val(t, k):  # שיטה שלא הוכרעה עד סוף האופק = שווי שוק בסוף האופק (בחצי השני אם כבר נלקח חצי)
        v = t[k]
        if v is not None:
            return v
        if k == 's5' and not (t['tgtR'] and t['tgtR'] > 0):
            return None
        h = t['horizonR']
        if h is None:
            return None
        if k in ('s2', 's3') and t['b1'] >= 0:
            return 0.5 + 0.5 * h
        return h
    for k, he in SCHEMES.items():
        vals = [val(t, k) for t in ts]
        vals = [v for v in vals if v is not None]
        if vals:
            schemes[k] = {'he': he, 'n': len(vals), 'avgR': round(sum(vals) / len(vals), 3), 'winRate': pct(sum(1 for v in vals if v > 0), len(vals)),
                          'sumR': round(sum(vals), 1)}
    # יעדים: תוחלת ליעד יחיד לפי עקומת ההגעה עם סטופ הקורס
    tp_scan = [{'target': L, 'reach': reach[str(L)], 'expR': round((reach[str(L)] or 0) * L - (1 - (reach[str(L)] or 0)), 2)} for L in LEVELS]
    best_tp = max(tp_scan, key=lambda x: x['expR'])
    return {
        'n': n, 'rightDir1R': pct(right_dir, n), 'reach': reach, 'reachFree': reach_free, 'stopped': pct(stopped, n), 'stoppedThenWent2R': pct(stopped_then_went, n),
        'withTarget': len(with_tg), 'targetHit': pct(tg_hit, len(with_tg)), 'targetMedianR': q([t['tgtR'] for t in with_tg], 0.5),
        'advBefore1R': {'p50': q(adv1, 0.5), 'p70': q(adv1, 0.7), 'p80': q(adv1, 0.8), 'p90': q(adv1, 0.9), 'n': len(adv1)},
        'advBefore2R': {'p50': q(adv2, 0.5), 'p70': q(adv2, 0.7), 'p80': q(adv2, 0.8), 'p90': q(adv2, 0.9), 'n': len(adv2)},
        'stopScan': stop_scan, 'tpScan': tp_scan, 'bestTP': best_tp, 'schemes': schemes,
        'medianBarsTo1R': q([t['b1'] for t in ts if t['b1'] >= 0], 0.5), 'medianBarsTo2R': q([t['b2'] for t in ts if t['b2'] >= 0], 0.5),
        'significant': n >= MIN_N,
    }

def main():
    d = json.loads((ROOT / 'trades' / 'htt_path_store.json').read_text(encoding='utf-8'))
    T = []
    for name, v in d['combos'].items():
        T += [x for x in (parse(r, name) for r in v.get('rows', [])) if x]
    idx = {k: i for i, k in enumerate(FLAGS)}
    groups = {
        'all': analyze(T),
        'byStrat': {s: analyze([t for t in T if t['strat'] == s]) for s in STRAT_HE},
        'byRes': {r: analyze([t for t in T if t['combo'].endswith('_' + r)]) for r in ('5', '15', '240')},
        'bySym': {s: analyze([t for t in T if t['combo'].rsplit('_', 1)[0] == s]) for s in sorted(set(t['combo'].rsplit('_', 1)[0] for t in T))},
        'bySide': {s: analyze([t for t in T if t['side'] == s]) for s in ('L', 'S')},
        'bySes': {str(s): analyze([t for t in T if t['ses'] == s]) for s in (0, 1, 2, 3)},
        'byPhase': {str(p): analyze([t for t in T if t['phase'] == p]) for p in range(6)},
    }
    # לפי אישור (עם): רק שדות תמציתיים
    flag_rows = []
    for k in FLAGS:
        sub = [t for t in T if t['flags'][idx[k]] == '1']
        if len(sub) >= MIN_N:
            a = analyze(sub)
            flag_rows.append({'flag': k, 'he': FLAG_HE.get(k, k), 'n': a['n'], 'rightDir1R': a['rightDir1R'], 'reach2': a['reach']['2'], 'reach3': a['reach']['3'],
                              'bestScheme': max(a['schemes'].items(), key=lambda kv: kv[1]['avgR'])[0] if a['schemes'] else None,
                              'bestSchemeR': max((v['avgR'] for v in a['schemes'].values()), default=None), 's1R': a['schemes'].get('s1', {}).get('avgR')})
    flag_rows.sort(key=lambda r: (r['bestSchemeR'] or -9), reverse=True)
    # הסטאפים המובילים מהבקטסט (זוגות דגלים) — מה הניהול הטוב ביותר להם
    named = [
        ('judas', 'kz'), ('ifvg', 'phE'), ('bb', 'kz'), ('choch', 'phE'), ('tweezer', 'htfMs'), ('judas', 'sesLon'), ('htfMs', 'kz'), ('volC',), ('conf4',),
    ]
    setups = []
    for ks in named:
        sub = [t for t in T if all(t['flags'][idx[k]] == '1' for k in ks)]
        if len(sub) >= MIN_N:
            a = analyze(sub)
            setups.append({'flags': list(ks), 'he': [FLAG_HE.get(k, k) for k in ks], 'stats': a})
    out = {
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'minN': MIN_N, 'levels': LEVELS, 'schemesHe': SCHEMES,
        'stratHe': STRAT_HE, 'sesHe': SES_HE, 'phHe': PH_HE, 'nSignals': len(T), 'groups': groups, 'flagRows': flag_rows, 'setups': setups,
        'combos': {name: {'sym': v.get('sym'), 'res': v.get('res'), 'n': len(v.get('rows', []))} for name, v in d['combos'].items()},
    }
    dest = ROOT.parents[1] / 'apps/web/public/htt-backtest'
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'path.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    a = groups['all']
    print('signals', len(T), '| right dir (1R before stop)', a['rightDir1R'], '| reach 2R', a['reach']['2'], '3R', a['reach']['3'], '| target hit', a['targetHit'], 'of', a['withTarget'])
    print('adv before 1R p50/p80', a['advBefore1R']['p50'], a['advBefore1R']['p80'], '| stopped then went 2R', a['stoppedThenWent2R'])
    print('schemes', {k: (v['n'], v['winRate'], v['avgR']) for k, v in a['schemes'].items()})
    print('stopScan', a['stopScan'])
    print('bestTP', a['bestTP'])

if __name__ == '__main__':
    main()
