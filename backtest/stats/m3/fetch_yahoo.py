# -*- coding: utf-8 -*-
"""מערכת 3: מוריד נרות דקה (30 הימים האחרונים, מגבלת Yahoo) ונרות 5 דקות (60 יום) ל-NQ=F ו-ES=F.
פלט: data/{NQ,ES}_{1m,5m}.csv  (t[ms], o, h, l, c, vol)"""
import json, time, csv, pathlib, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent / 'data'
ROOT.mkdir(exist_ok=True)
def get(url):
    for a in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:
            print('retry', a, str(e)[:80], flush=True); time.sleep(2 ** a)
    return None
def chunk(sym, iv, p1, p2):
    d = get(f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval={iv}&period1={p1}&period2={p2}&includePrePost=true')
    if not d or not d['chart']['result']: return []
    r = d['chart']['result'][0]; q = r['indicators']['quote'][0]; ts = r.get('timestamp') or []
    return [(t * 1000, o, h, l, c, v or 0) for t, o, h, l, c, v in zip(ts, q['open'], q['high'], q['low'], q['close'], q['volume']) if None not in (o, h, l, c)]
now = int(time.time())
for sym, name in (('NQ=F', 'NQ'), ('ES=F', 'ES')):
    for iv, days, step in (('1m', 29, 7), ('5m', 59, 59)):
        rows = {}
        p1 = now - days * 86400
        while p1 < now:
            p2 = min(now, p1 + step * 86400)
            for row in chunk(sym, iv, p1, p2): rows[row[0]] = row
            p1 = p2; time.sleep(0.4)
        out = sorted(rows.values())
        with open(ROOT / f'{name}_{iv}.csv', 'w', newline='') as f:
            w = csv.writer(f); w.writerow(['t', 'o', 'h', 'l', 'c', 'vol']); w.writerows(out)
        print(name, iv, len(out), 'bars', time.strftime('%Y-%m-%d', time.gmtime(out[0][0] / 1000)) if out else '-', '→', time.strftime('%Y-%m-%d', time.gmtime(out[-1][0] / 1000)) if out else '-', flush=True)
