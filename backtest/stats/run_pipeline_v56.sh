#!/bin/zsh
# צינור אחרי איסוף Path Lab: לוח ההעתקה (COPY R STORE) → קובץ raw → year/nested/synergy/report → JSON לאתר + מסמך 15
set -e
cd "/Users/zrstyt/מערכת מסחר/backtest/stats"
RAW=trades/htt_path_store_v56_raw.json
if [ "$1" != "--skip-clipboard" ]; then LANG=en_US.UTF-8 pbpaste > $RAW; fi
python3 - <<'PY'
import json
d = json.load(open('trades/htt_path_store_v56_raw.json', encoding='utf-8'))
ws = [(k, w) for k, v in d['combos'].items() for w in v['windows']]
print('combos', len(d['combos']), '| windows', len(ws), '| rows', sum(w.get('n', 0) for _, w in ws), '| errors', sum(1 for _, w in ws if w.get('error')))
for k, v in d['combos'].items():
    print(' ', k, len(v['windows']), 'windows,', sum(w.get('n', 0) for w in v['windows']), 'rows', [w.get('error') for w in v['windows'] if w.get('error')])
PY
cp $RAW trades/htt_path_store_year_raw.json
cp $RAW trades/htt_path_store_syn_raw.json
python3 build_year_stats.py
python3 build_nested_stats.py
python3 build_backtest_report.py
HTT_STORE=htt_path_store_year_course.json HTT_SUFFIX=_year python3 rank_confirmations.py
HTT_STORE=htt_path_store_year_course.json HTT_SUFFIX=_year python3 build_combos.py
echo "pipeline done: $(date)"
