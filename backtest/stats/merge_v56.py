# -*- coding: utf-8 -*-
"""ממזג ייצוא ראשי של האספן עם ייצוא של ריצה חוזרת: צירוף שקיים בריצה החוזרת (בלי שגיאות) מחליף את הצירוף בראשי."""
import json, pathlib, sys, datetime
ROOT = pathlib.Path(__file__).resolve().parent
main = json.load(open(ROOT / 'trades/htt_path_store_v56_main_raw.json', encoding='utf-8'))
rerun = json.load(open(ROOT / sys.argv[1], encoding='utf-8')) if len(sys.argv) > 1 else {'combos': {}, 'log': []}
for k, v in rerun['combos'].items():
    ok_new = [w for w in v['windows'] if not w.get('error')]
    ok_old = [w for w in main['combos'].get(k, {'windows': []})['windows'] if not w.get('error')]
    cov_new = min((w['firstT'] for w in ok_new), default=None); cov_old = min((w['firstT'] for w in ok_old), default=None)
    if cov_new and (not cov_old or cov_new <= cov_old):
        main['combos'][k] = v; print('replaced', k, 'coverage from', datetime.datetime.utcfromtimestamp(cov_new / 1000).date())
    else:
        print('kept main for', k)
main['log'] = main.get('log', []) + ['rerun: ' + x for x in rerun.get('log', [])]
main['exportedAt'] = max(main.get('exportedAt', 0), rerun.get('exportedAt', 0))
out = ROOT / 'trades/htt_path_store_v56_raw.json'
out.write_text(json.dumps(main, ensure_ascii=False), encoding='utf-8')
for k, v in main['combos'].items():
    ok = [w for w in v['windows'] if not w.get('error')]
    first = min((w['firstT'] for w in ok), default=None)
    print(f"  {k:14s} {len(ok):2d} ok windows rows={sum(w.get('n',0) for w in ok):6d} from {datetime.datetime.utcfromtimestamp(first/1000).date() if first else '?'}")
print('written', out.name, round(out.stat().st_size / 1e6, 1), 'MB')
