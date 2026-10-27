# -*- coding: utf-8 -*-
"""מוריד נרות דקה מ-Binance (ציבורי, בלי מפתח) ל-400 הימים האחרונים, כולל נפח קונים תוקפים (takerBuyBase) → דלתא לכל דקה.
פלט: trades/binance/{SYMBOL}_1m.csv  (t,o,h,l,c,vol,buy)  — דלתא = 2*buy - vol"""
import sys, time, json, csv, pathlib, urllib.request, urllib.parse, datetime
ROOT = pathlib.Path(__file__).resolve().parent
SYMS = sys.argv[1:] or ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
DAYS = 400
def get(url):
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'htt-orderflow/1.0'}), timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            wait = 2 ** attempt; print('retry', attempt, str(e)[:80], 'sleep', wait, flush=True); time.sleep(wait)
    raise SystemExit('giving up')
for sym in SYMS:
    out = ROOT / 'trades' / 'binance' / f'{sym}_1m.csv'
    start = int((datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=DAYS)).timestamp() * 1000)
    rows = 0; t0 = time.time()
    with open(out, 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['t', 'o', 'h', 'l', 'c', 'vol', 'buy'])
        cur = start
        while True:
            q = urllib.parse.urlencode({'symbol': sym, 'interval': '1m', 'startTime': cur, 'limit': 1000})
            data = get('https://api.binance.com/api/v3/klines?' + q)
            if not data: break
            for k in data:
                w.writerow([k[0], k[1], k[2], k[3], k[4], k[5], k[9]])
            rows += len(data); cur = data[-1][0] + 60000
            if len(data) < 1000: break
            time.sleep(0.12)
    print(sym, rows, 'candles', round(time.time() - t0), 's', flush=True)
print('done')
