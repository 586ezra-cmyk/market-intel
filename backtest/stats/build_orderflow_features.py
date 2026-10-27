# -*- coding: utf-8 -*-
"""דגלי Order Flow אמיתיים לכל עסקה במדידת השנה (קריפטו בלבד: נרות דקה מ-Binance עם נפח קונים תוקפים).
לכל עסקה (נכס × מסגרת × זמן כניסה) מחושבים בנר הטריגר: דלתא בכיוון, דלתא 3 נרות, דלתא גדולה, CVD בכיוון (5 נרות),
דיברגנס CVD בעד/נגד (3 נרות אחרונים), ספיגה בעד/נגד (3 נרות). פלט: trades/trades_v56_of.json  {key: '101010101', ...}"""
import sys, json, csv, pathlib, collections
import numpy as np
sys.path.insert(0, '.')
import build_backtest_report as B
ROOT = pathlib.Path(__file__).resolve().parent
OF_FLAGS = ['ofDeltaOk', 'ofDelta3Ok', 'ofDeltaBig', 'ofCvdOk', 'ofDivFor', 'ofDivAgainst', 'ofAbsorbFor', 'ofAbsorbAgainst', 'ofAvail']
OF_HE = {'ofDeltaOk': 'דלתא של נר הטריגר בכיוון', 'ofDelta3Ok': 'דלתא מצטברת 3 נרות בכיוון', 'ofDeltaBig': 'דלתא גדולה (≥1.5× הממוצע)', 'ofCvdOk': 'CVD אמיתי בכיוון (5 נרות)',
         'ofDivFor': 'דיברגנס CVD בעד העסקה (3 נרות)', 'ofDivAgainst': 'דיברגנס CVD נגד העסקה (3 נרות)', 'ofAbsorbFor': 'ספיגה בעד העסקה (3 נרות)', 'ofAbsorbAgainst': 'ספיגה נגד העסקה (3 נרות)', 'ofAvail': 'יש נתוני Order Flow (קריפטו)'}
SYM_FILE = {'BTC': 'BTCUSDT', 'ETH': 'ETHUSDT', 'SOL': 'SOLUSDT'}
def load_1m(sym):
    f = ROOT / 'trades' / 'binance' / f'{SYM_FILE[sym]}_1m.csv'
    if not f.exists(): return None
    a = np.loadtxt(f, delimiter=',', skiprows=1)
    return a  # columns t,o,h,l,c,vol,buy
def aggregate(a, tf_min):
    span = tf_min * 60000
    key = (a[:, 0] // span).astype(np.int64)
    uniq, idx = np.unique(key, return_index=True)
    n = len(uniq)
    o = a[idx, 1]; c = np.empty(n); h = np.empty(n); l = np.empty(n); vol = np.empty(n); delta = np.empty(n)
    ends = np.r_[idx[1:], len(a)]
    for i in range(n):
        s = a[idx[i]:ends[i]]
        h[i] = s[:, 2].max(); l[i] = s[:, 3].min(); c[i] = s[-1, 4]; vol[i] = s[:, 5].sum(); delta[i] = (2 * s[:, 6] - s[:, 5]).sum()
    return {'t': uniq * span, 'o': o, 'h': h, 'l': l, 'c': c, 'vol': vol, 'delta': delta, 'cvd': np.cumsum(delta)}
def roll_max(x, w):  # max of previous w values (excluding current)
    out = np.full(len(x), np.nan)
    for i in range(1, len(x)):
        lo = max(0, i - w); out[i] = x[lo:i].max() if i > lo else np.nan
    return out
def roll_min(x, w):
    out = np.full(len(x), np.nan)
    for i in range(1, len(x)):
        lo = max(0, i - w); out[i] = x[lo:i].min() if i > lo else np.nan
    return out
def roll_mean(x, w):
    out = np.full(len(x), np.nan); cs = np.cumsum(np.r_[0.0, x])
    for i in range(1, len(x)):
        lo = max(0, i - w); out[i] = (cs[i] - cs[lo]) / (i - lo) if i > lo else np.nan
    return out
T, _ = B.load()
out = {}
stats = collections.defaultdict(lambda: collections.defaultdict(list))
for sym in ('BTC', 'ETH', 'SOL'):
    a = load_1m(sym)
    if a is None: print('no data for', sym); continue
    for tf in ('5', '15', '240'):
        bars = aggregate(a, int(tf))
        t = bars['t']; d = bars['delta']; cvd = bars['cvd']; h = bars['h']; l = bars['l']; vol = bars['vol']; rng = h - l
        absd = np.abs(d); avgAbsD = roll_mean(absd, 20); avgV = roll_mean(vol, 20); avgR = roll_mean(rng, 20)
        hi20 = roll_max(h, 20); lo20 = roll_min(l, 20); cvdHi20 = roll_max(cvd, 20); cvdLo20 = roll_min(cvd, 20)
        divBull = (l < lo20) & (cvd > cvdLo20); divBear = (h > hi20) & (cvd < cvdHi20)
        absorb = (vol >= 2 * avgV) & (rng <= 0.6 * avgR)
        absBull = absorb & (d < 0); absBear = absorb & (d >= 0)   # מוכרים נספגו = שורי; קונים נספגו = דובי
        trades = [x for x in T if x['sym'] == sym and x['res'] == tf]
        for x in trades:
            i = int(np.searchsorted(t, x['entryTime'], side='right') - 1)
            key = f"{sym}|{tf}|{x['strat']}|{x['entryTime']}"
            if i < 25 or i >= len(t) or t[i] != x['entryTime'] - (x['entryTime'] % (int(tf) * 60000)):
                out[key] = '0' * (len(OF_FLAGS) - 1) + '0'; continue
            L = x['side'] == 'L'; sgn = 1 if L else -1
            w3 = slice(max(0, i - 2), i + 1)
            f = {
                'ofDeltaOk': sgn * d[i] > 0,
                'ofDelta3Ok': sgn * d[max(0, i - 2):i + 1].sum() > 0,
                'ofDeltaBig': absd[i] >= 1.5 * avgAbsD[i] if not np.isnan(avgAbsD[i]) else False,
                'ofCvdOk': sgn * (cvd[i] - cvd[i - 5]) > 0,
                'ofDivFor': bool((divBull if L else divBear)[w3].any()),
                'ofDivAgainst': bool((divBear if L else divBull)[w3].any()),
                'ofAbsorbFor': bool((absBull if L else absBear)[w3].any()),
                'ofAbsorbAgainst': bool((absBear if L else absBull)[w3].any()),
                'ofAvail': True,
            }
            out[key] = ''.join('1' if f[k] else '0' for k in OF_FLAGS)
            if x['strat'] != 'P' and x['s4'] is not None:
                for k in OF_FLAGS[:-1]: stats[(tf, k, f[k])]['s4'].append(x['s4'])
        print(sym, tf, len(trades), 'trades matched', sum(1 for x in trades if out[f"{sym}|{tf}|{x['strat']}|{x['entryTime']}"][-1] == '1'), flush=True)
json.dump({'flags': OF_FLAGS, 'he': OF_HE, 'byKey': out}, open(ROOT / 'trades' / 'trades_v56_of.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('=== Order Flow flags: R גרירה with vs without (course triggers without P, crypto only) ===')
for tf in ('240', '15', '5'):
    for k in OF_FLAGS[:-1]:
        w = stats[(tf, k, True)]['s4']; wo = stats[(tf, k, False)]['s4']
        if w and wo: print(f"{tf:>3s} {k:16s} with {np.mean(w):+.3f} (n={len(w):5d}) | without {np.mean(wo):+.3f} (n={len(wo):5d}) | lift {np.mean(w) - np.mean(wo):+.3f}")
