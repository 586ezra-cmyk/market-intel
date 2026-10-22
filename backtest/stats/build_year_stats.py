# -*- coding: utf-8 -*-
"""בדיקת שנה — כל האישורים בכל מסגרות הזמן (HTT Path Lab בחלונות Replay).
קלט: trades/htt_path_store_year_raw.json (ייצוא מהדפדפן: חלונות replay לכל צירוף נכס×TF).
פלט: trades/htt_path_store_year.json (חנות ממוזגת בפורמט הרגיל, 365 יום אחרונים) + public/htt-backtest/year.json לאתר."""
import os, json, pathlib, datetime, collections
ROOT = pathlib.Path(__file__).resolve().parent
from build_stats import FLAG_HE, STRAT_HE, SES_HE, PH_HE
from build_path_stats import parse, analyze, MIN_N
FLAGS = [l.strip() for l in (ROOT / 'flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]
WARMUP_BARS = int(os.environ.get('HTT_WARMUP', '1500'))   # נרות חימום בתחילת כל חלון — הסיגנלים שם לא בשלים (המנוע בלי היסטוריה)
TF_MS = {'5': 300000, '15': 900000, '240': 14400000}
DAYS = int(os.environ.get('HTT_DAYS', '365'))
LEVELS = json.loads((ROOT.parents[1] / 'apps/web/public/htt-backtest/levels.json').read_text(encoding='utf-8'))
POS, NEG = LEVELS['pos'], LEVELS['neg']
IDX = {k: i for i, k in enumerate(FLAGS)}

def merge(store):
    now = store['exportedAt']
    combos, coverage = {}, {}
    for name, cb in store['combos'].items():
        res = str(cb['res']); tfms = TF_MS[res]
        wins = sorted([w for w in cb.get('windows', []) if w.get('firstT')], key=lambda w: w['firstT'])
        rows, dup, agree = {}, 0, 0
        for w in wins:
            minT = w['firstT'] + WARMUP_BARS * tfms
            for r in w['rows']:
                p = r.split('|')
                if len(p) < 28 or p[0] != 'P':
                    continue
                t = int(p[3])
                if t < minT:
                    continue
                key = (p[1], p[2], t)
                if key in rows:
                    dup += 1
                    q = rows[key].split('|')
                    if q[11:14] == p[11:14]:
                        agree += 1
                    # אותה עסקה בשני חלונות: מעדיפים את הגרסה שהוכרעה (יותר שדות s1..s6 מלאים)
                    if sum(1 for x in p[21:27] if x != '') > sum(1 for x in q[21:27] if x != ''):
                        rows[key] = r
                    continue
                rows[key] = r
        cutoff = now - DAYS * 86400000
        sel = [r for (typ, side, t), r in sorted(rows.items(), key=lambda kv: kv[0][2]) if t >= cutoff]
        first = min((t for (_, _, t) in rows), default=None); last = max((t for (_, _, t) in rows), default=None)
        combos[name] = {'name': name, 'sym': cb['sym'], 'res': res, 'rows': sel, 'meta': wins[-1]['meta'] if wins else None,
                        'windows': len(wins), 'collectedAt': now}
        coverage[name] = {'sym': cb['sym'], 'res': res, 'windows': len(wins), 'bars': sum(w.get('bars', 0) for w in wins),
                          'from': first, 'to': last, 'nAll': len(rows), 'n365': len(sel), 'dup': dup, 'agree': agree,
                          'errors': sum(1 for w in cb.get('windows', []) if w.get('error'))}
    return combos, coverage

def level_of(flags, res=None):
    """רמה = אישורים בעד − אישורים נגד. 5m: רשימת perTf.5 (B); שאר המסגרות: הרשימה הראשית"""
    per = LEVELS.get('perTf', {}).get(str(res) if res is not None else '', None)
    pos = per['pos'] if per else POS
    neg = per['neg'] if per else NEG
    def on(k):
        i = IDX.get(k)
        return i is not None and i < len(flags) and flags[i] == '1'
    return sum(1 for k in pos if on(k)) - sum(1 for k in neg if on(k))

def s4(a):
    return a.get('schemes', {}).get('s4', {}).get('avgR') if a.get('n') else None

def brief(ts):
    a = analyze(ts)
    if a['n'] == 0:
        return {'n': 0}
    return {'n': a['n'], 'rightDir1R': a['rightDir1R'], 'reach2': a['reach']['2'], 'reach3': a['reach']['3'],
            's1R': a['schemes'].get('s1', {}).get('avgR'), 's4R': s4(a), 's4Win': a['schemes'].get('s4', {}).get('winRate'),
            'advP80': a['advBefore1R']['p80']}

POOLS = {
    'course': {'he': 'טריגרים של הקורס — טיסה, כנף, אורדר בלוק, W/M, פריצה, ריטסט קריק', 'types': ['F', 'W', 'O', 'M', 'B', 'K', 'P']},
    'x': {'he': '"3 אישורים = טריגר" (כל אישור שלישי בכיוון)', 'types': ['X']},
}

def pool_stats(T, TFS, syms):
    base = {tf: brief([t for t in T if t['res'] == tf]) for tf in TFS}
    base['all'] = brief(T)
    baseSym = {s: {tf: brief([t for t in T if t['sym'] == s and t['res'] == tf]) for tf in TFS} for s in syms}
    for s in syms:
        baseSym[s]['all'] = brief([t for t in T if t['sym'] == s])
    flag_rows = []
    for k in FLAGS:
        i = IDX[k]
        row = {'flag': k, 'he': FLAG_HE.get(k, k), 'byTf': {}, 'bySym': {}}
        for tf in TFS:
            b = brief([t for t in T if t['res'] == tf and t['flags'][i] == '1'])
            if b['n'] >= MIN_N and b.get('s4R') is not None and base[tf].get('s4R') is not None:
                b['lift'] = round(b['s4R'] - base[tf]['s4R'], 2)
            row['byTf'][tf] = b
        for s in syms:
            b = brief([t for t in T if t['sym'] == s and t['flags'][i] == '1'])
            if b['n'] >= MIN_N and b.get('s4R') is not None and baseSym[s]['all'].get('s4R') is not None:
                b['lift'] = round(b['s4R'] - baseSym[s]['all']['s4R'], 2)
            row['bySym'][s] = b
        ba = brief([t for t in T if t['flags'][i] == '1'])
        if ba['n'] >= MIN_N and ba.get('s4R') is not None and base['all'].get('s4R') is not None:
            ba['lift'] = round(ba['s4R'] - base['all']['s4R'], 2)
        row['all'] = ba
        lifts = [row['byTf'][tf].get('lift') for tf in TFS if row['byTf'][tf].get('n', 0) >= MIN_N]
        row['stable'] = f"{sum(1 for l in lifts if l is not None and l > 0)}/{len(lifts)}" if lifts else None
        flag_rows.append(row)
    flag_rows.sort(key=lambda r: (r['all'].get('lift') if r['all'].get('lift') is not None else -9), reverse=True)
    levels = {}
    for tf in TFS + ['all']:
        pool = [t for t in T if tf == 'all' or t['res'] == tf]
        levels[tf] = {str(k): brief([t for t in pool if t['level'] >= k]) for k in range(0, 7)}
    return {'nSignals': len(T), 'base': base, 'baseSym': baseSym, 'flagRows': flag_rows, 'levels': levels}

def main():
    raw = json.loads((ROOT / 'trades' / 'htt_path_store_year_raw.json').read_text(encoding='utf-8'))
    combos, coverage = merge(raw)
    (ROOT / 'trades' / 'htt_path_store_year.json').write_text(json.dumps({'exportedAt': raw['exportedAt'], 'combos': combos}, ensure_ascii=False), encoding='utf-8')
    # חנות מסוננת לטריגרים של הקורס בלבד — לניתוחי הדירוג/הצירופים הקיימים (HTT_STORE=htt_path_store_year_course.json)
    course = {n: dict(v, rows=[r for r in v['rows'] if r.split('|')[1] in POOLS['course']['types']]) for n, v in combos.items()}
    (ROOT / 'trades' / 'htt_path_store_year_course.json').write_text(json.dumps({'exportedAt': raw['exportedAt'], 'combos': course}, ensure_ascii=False), encoding='utf-8')
    T = []
    for name, v in combos.items():
        for r in v['rows']:
            t = parse(r, name)
            if t:
                t['res'] = v['res']; t['sym'] = v['sym']; t['level'] = level_of(t['flags'], v['res']); t['month'] = datetime.datetime.utcfromtimestamp(t['entryTime'] / 1000).strftime('%Y-%m')
                T.append(t)
    TFS = ['5', '15', '240']
    syms = sorted(set(t['sym'] for t in T))
    pools = {}
    for key, pdef in POOLS.items():
        sub = [t for t in T if t['strat'] in pdef['types']]
        pools[key] = dict(pdef, **pool_stats(sub, TFS, syms))
    strat_rows = {}
    for s in STRAT_HE:
        strat_rows[s] = {tf: brief([t for t in T if t['strat'] == s and t['res'] == tf]) for tf in TFS}
        strat_rows[s]['all'] = brief([t for t in T if t['strat'] == s])
    months = collections.defaultdict(lambda: collections.Counter())
    for t in T:
        if t['strat'] in POOLS['course']['types']:
            months[t['month']][t['res']] += 1
    out = {
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'days': DAYS, 'warmupBars': WARMUP_BARS, 'minN': MIN_N,
        'nSignals': len(T), 'flagsHe': FLAG_HE, 'stratHe': STRAT_HE, 'pos': POS, 'neg': NEG,
        'coverage': coverage, 'pools': pools, 'stratRows': strat_rows, 'months': {m: dict(c) for m, c in sorted(months.items())},
    }
    dest = ROOT.parents[1] / 'apps/web/public/htt-backtest'
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'year.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    print('signals', len(T), '| pools', {k: (v['nSignals'], {tf: (b.get('n'), b.get('s4R')) for tf, b in v['base'].items()}) for k, v in pools.items()})
    for name, cv in coverage.items():
        print(name, 'windows', cv['windows'], 'bars', cv['bars'], 'from', cv['from'] and datetime.datetime.utcfromtimestamp(cv['from'] / 1000).date(), 'to', cv['to'] and datetime.datetime.utcfromtimestamp(cv['to'] / 1000).date(), 'n365', cv['n365'], 'dup', cv['dup'], 'agree', cv['agree'], 'err', cv['errors'])

if __name__ == '__main__':
    main()
