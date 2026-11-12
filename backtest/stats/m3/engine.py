# -*- coding: utf-8 -*-
"""מערכת 3 — מנוע בדיקת הקונספט: אזור של מסגרת גבוהה (15m / 1H) + טריגר בנר הביצוע (1m או 5m) + סטופ צמוד.
הכללים: backtest/29_כללי_המדידה_מערכת_3_12-11.md.  שימוש:  python3 engine.py BTC 1 | NQ 1 | NQ 5 | BTC 5
פלט: data/trades_{SYM}_{TF}m.json  (כל עסקה מועמדת + תוצאה לכל שיטת יציאה).
שורט מחושב על סדרת מחירים הפוכה (‎-מחיר), כך שכל הלוגיקה כתובה פעם אחת ללונג. אין הצצה קדימה: אזור נכנס לתוקף רק אחרי
שנר המסגרת הגבוהה נסגר; פיבוט של 2/2 מאושר רק שני נרות אחריו; הכניסה בסגירת נר הטריגר וההערכה מהנר הבא."""
import sys, csv, json, bisect, datetime, zoneinfo, pathlib
import numpy as np
ROOT = pathlib.Path(__file__).resolve().parent
DATA = ROOT / 'data'
NY = zoneinfo.ZoneInfo('America/New_York')
RTH0, RTH1 = 570, 960          # 9:30–16:00 ניו יורק
LAST_ENTRY = 945               # אין כניסות ב-15 הדקות האחרונות
EP_TIMEOUT = 30                # נרות ביצוע מאז השפל עד שהאפיזודה פגה
COOL = 10                      # נרות צינון אחרי כניסה מאותו אזור
MAX_ENTRIES = 2

def load(sym, tf):
    if sym in ('BTC', 'ETH'):
        p = ROOT.parent / 'trades' / 'binance' / f'{sym}USDT_1m.csv'; cache = DATA / f'{sym}_1m.npy'
        if cache.exists(): a = np.load(cache)
        else:
            a = np.loadtxt(p, delimiter=',', skiprows=1); np.save(cache, a)
        d = dict(t=a[:, 0].astype(np.int64), o=a[:, 1], h=a[:, 2], l=a[:, 3], c=a[:, 4], v=a[:, 5], buy=a[:, 6])
        if tf > 1: d = resample_dict(d, tf)
        return d
    p = DATA / f'{sym}_{tf}m.csv'
    a = np.loadtxt(p, delimiter=',', skiprows=1)
    return dict(t=a[:, 0].astype(np.int64), o=a[:, 1], h=a[:, 2], l=a[:, 3], c=a[:, 4], v=a[:, 5], buy=None)

def groups(t, ms):
    key = t // ms
    starts = np.flatnonzero(np.r_[True, key[1:] != key[:-1]])
    ends = np.r_[starts[1:], len(t)] - 1
    return starts, ends

def resample_dict(d, tf):
    s, e = groups(d['t'], tf * 60000)
    out = dict(t=d['t'][s], o=d['o'][s], h=np.maximum.reduceat(d['h'], s), l=np.minimum.reduceat(d['l'], s), c=d['c'][e], v=np.add.reduceat(d['v'], s))
    out['buy'] = np.add.reduceat(d['buy'], s) if d.get('buy') is not None else None
    return out

def rma(x, n):
    out = np.full(len(x), np.nan)
    if len(x) <= n: return out
    s = float(np.mean(x[:n])); out[n - 1] = s; a = 1.0 / n
    for i in range(n, len(x)):
        s += a * (x[i] - s); out[i] = s
    return out

def atr(h, l, c, n=14):
    pc = np.r_[c[0], c[:-1]]
    tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
    return rma(tr, n)

def pivots(x, n, high=True):
    """אינדקסים p שבהם x[p] הוא קיצון של n נרות מכל צד (מאושר ב-p+n)."""
    out = []
    for p in range(n, len(x) - n):
        w = x[p - n:p + n + 1]
        if (high and x[p] >= w.max()) or (not high and x[p] <= w.min()): out.append(p)
    return out

def ny_fields(t):
    """דקה ביום (ניו יורק), יום בשבוע, ומפתח יום-מסחר (מתחלף ב-18:00 ניו יורק)."""
    nymin = np.empty(len(t), np.int32); wd = np.empty(len(t), np.int8); dkey = np.empty(len(t), np.int32)
    cache = {}
    for i, ms in enumerate(t):
        hk = ms // 3600000
        off = cache.get(hk)
        if off is None:
            off = int(datetime.datetime.fromtimestamp(hk * 3600, NY).utcoffset().total_seconds()); cache[hk] = off
        loc = ms // 1000 + off
        nymin[i] = (loc % 86400) // 60
        day = loc // 86400
        wd[i] = (day + 3) % 7            # 1970-01-01 = יום חמישי → 0 = יום שני
        dkey[i] = (loc + 6 * 3600) // 86400
    return nymin, wd, dkey

class Zone:
    __slots__ = ('tf', 'k', 'bot', 'top', 'ob', 'st')
    def __init__(s, tf, k, bot, top, ob):
        s.tf, s.k, s.bot, s.top, s.ob = tf, k, bot, top, ob
        s.st = {m: [False, 0.0, -1, 0, -1] for m in ('A', 'B')}   # in_ep, dip_low, dip_i, entries, cool_until

def run_side(sign, d, pair, exec_tf, is_crypto):
    """מריץ את כל הלוגיקה ללונג על סדרה מכוונת (sign=-1 → סדרה הפוכה = שורט)."""
    t = d['t']; n = len(t)
    if sign > 0: O, H, L, C = d['o'], d['h'], d['l'], d['c']
    else:        O, H, L, C = -d['o'], -d['l'], -d['h'], -d['c']
    V = d['v']
    delta = None if d.get('buy') is None else sign * (2 * d['buy'] - d['v'])
    pL = None
    if pair is not None: pL = pair['l'] if sign > 0 else -pair['h']
    nymin, wd, dkey = d['_ny']
    absC = d['c']
    a1 = atr(H, L, C)
    buf = (lambda i: absC[i] * 0.0001) if is_crypto else (lambda i: 1.0)
    # ── פיבוטים של נר הביצוע (2/2) ──
    ph = pivots(H, 2, True)
    # ── מסגרות גבוהות ──
    zones = []; msdir = np.zeros(n, np.int8)
    for tf in (15, 60):
        s, e = groups(t, tf * 60000)
        ho, hh, hl, hc = O[s], np.maximum.reduceat(H, s), np.minimum.reduceat(L, s), C[e]
        ha = atr(hh, hl, hc)
        hp = pivots(hh, 5, True); lastPH = np.full(len(hh), np.nan); j = 0; cur = np.nan
        for k in range(len(hh)):
            while j < len(hp) and hp[j] + 5 <= k: cur = hh[hp[j]]; j += 1
            lastPH[k] = cur
        for k in range(10, len(hh) - 1):          # הנר האחרון עשוי להיות לא שלם
            a = ha[k]
            if not a == a: continue
            if hh[k - 1] - hl[k - 1] >= 1.2 * a and hl[k] - hh[k - 2] >= 0.5 * a:
                sq = (hh[k - 9:k - 1].max() - hl[k - 9:k - 1].min()) <= 2.5 * ha[k - 1]
                ob = bool(sq and (not lastPH[k] == lastPH[k] or hc[k] > lastPH[k]))
                zones.append((int(e[k]) + 1, Zone(tf, k, float(hh[k - 2]), float(hl[k]), ob)))
        if tf == 15: comp15_end, c15, e15 = e, hc, e
        else:
            comp60_end, c60 = e, hc
            # מבנה 1H: שבירת פיבוט 3/3 אחרון
            p_hi = pivots(hh, 3, True); p_lo = pivots(hl, 3, False); ih = il = 0; lph = lpl = np.nan; dr = 0
            for k in range(len(hh)):
                while ih < len(p_hi) and p_hi[ih] + 3 <= k: lph = hh[p_hi[ih]]; ih += 1
                while il < len(p_lo) and p_lo[il] + 3 <= k: lpl = hl[p_lo[il]]; il += 1
                if lph == lph and hc[k] > lph: dr = 1
                elif lpl == lpl and hc[k] < lpl: dr = -1
                a0 = int(e[k]) + 1; b0 = int(e[k + 1]) + 1 if k + 1 < len(e) else n
                msdir[a0:b0] = dr
            h1_lo = [(int(e[p + 3]) + 1, float(hl[p])) for p in p_lo if p + 3 < len(e)]   # (תקף מאינדקס, רמה)
    zones.sort(key=lambda z: z[0])
    ends = {15: comp15_end, 60: comp60_end}; closes = {15: c15, 60: c60}
    # ── רמות יומיות, VWAP, סוף סשן ──
    pdl = np.full(n, np.nan); onl = np.full(n, np.nan); orl = np.full(n, np.nan); vwap = np.full(n, np.nan); eod = np.full(n, -1, np.int64)
    prev_day_low = np.nan; cur_key = None; day_low = np.inf; on_low = np.inf; or_low = np.inf; pv = vv = 0.0
    for i in range(n):
        if dkey[i] != cur_key:
            prev_day_low = day_low if day_low < np.inf else np.nan
            cur_key = dkey[i]; day_low = np.inf; on_low = np.inf; or_low = np.inf; pv = vv = 0.0
        m = nymin[i]
        if RTH0 <= m < RTH1:
            pdl[i] = prev_day_low
            if on_low < np.inf: onl[i] = on_low
            if m < RTH0 + 15: or_low = min(or_low, L[i])
            elif or_low < np.inf: orl[i] = or_low
            w = V[i] + 1e-9; pv += (H[i] + L[i] + C[i]) / 3 * w; vv += w; vwap[i] = pv / vv
        else: on_low = min(on_low, L[i])
        day_low = min(day_low, L[i])
    last = -1; lk = None
    for i in range(n - 1, -1, -1):
        if RTH0 <= nymin[i] < RTH1:
            if dkey[i] != lk: lk = dkey[i]; last = i
            eod[i] = last
    prev30 = np.full(n, np.nan)
    if n > 31:
        sw = np.lib.stride_tricks.sliding_window_view(L, 30).min(axis=1); prev30[30:] = sw[:n - 30]
    trades = []
    def ref_high(dip_i, i):
        j = bisect.bisect_left(ph, dip_i) - 1
        if j >= 0 and ph[j] >= dip_i - 20 and ph[j] + 2 <= i: return H[ph[j]]
        return float(H[dip_i - 3:dip_i].max()) if dip_i >= 3 else None
    def walk(i, e, s):
        r = e - s; t1, t2, t3 = e + r, e + 2 * r, e + 3 * r; j1 = j2 = j3 = js = -1; mfe = 0.0; end = int(eod[i]); amb = False
        for j in range(i + 1, end + 1):
            if L[j] <= s: js = j; amb = bool(j1 < 0 and H[j] >= t1); break
            hh_ = H[j]
            if hh_ >= t1 and j1 < 0: j1 = j
            if hh_ >= t2 and j2 < 0: j2 = j
            if hh_ >= t3: j3 = j; mfe = 3.0; break
            if (hh_ - e) / r > mfe: mfe = (hh_ - e) / r
        end_r = float((C[end] - e) / r)
        def fixed(jt, R):
            if jt >= 0: return R, jt
            if js >= 0: return -1.0, js
            return end_r, end
        r11, x11 = fixed(j1, 1.0); r12, x12 = fixed(j2, 2.0)
        if j1 < 0: rh, xh = r11, x11
        else:
            rest, xh = end_r, end
            for j in range(j1 + 1, end + 1):
                if L[j] <= e: rest, xh = 0.0, j; break
                if H[j] >= t3: rest, xh = 3.0, j; break
            rh = 0.5 + 0.5 * rest
        return dict(r11=r11, x11=int(x11), r12=r12, x12=int(x12), rh=float(rh), xh=int(xh), mfe=float(mfe), stopped=js >= 0, amb=amb)
    def fire(model, sub, i, dip_low, dip_i, ob=False):
        m = nymin[i]
        if not (RTH0 <= m < LAST_ENTRY) or wd[i] > 4 or eod[i] <= i: return
        e = float(C[i]); s = float(dip_low - buf(i)); risk = e - s
        if risk <= 0: return
        smt = None
        if pL is not None and dip_i >= 60:
            w0 = L[dip_i - 60:dip_i - 2]; p0 = pL[dip_i - 60:dip_i - 2]; p1 = pL[dip_i - 2:i + 1]
            if not (np.isnan(p0).any() or np.isnan(p1).any()): smt = bool(L[dip_i] < w0.min() and p1.min() > p0.min())
        a5 = a1[i]
        tr = dict(i=int(i), t=int(t[i]), side='L' if sign > 0 else 'S', model=model, sub=sub, ob=bool(ob), entry=float(absC[i]), risk=float(risk),
                  riskPct=float(risk / absC[i] * 100), m=int(m), ms=int(msdir[i]), vw=bool(C[i] > vwap[i]) if vwap[i] == vwap[i] else None, smt=smt,
                  d1=None if delta is None else bool(delta[i] > 0), d3=None if delta is None else bool(delta[i - 2:i + 1].sum() > 0),
                  atrR=float(risk / a5) if a5 == a5 and a5 > 0 else None, bars=int(i - dip_i))
        tr.update(walk(i, e, s)); trades.append(tr)
    # ── לולאה ראשית ──
    active = []; zp = 0; k15 = k60 = -1; h1p = 0; h1_levels = []; sweep = {}; used = set(); base = [False, 0.0, -1, -1]
    for i in range(3, n):
        while zp < len(zones) and zones[zp][0] <= i: active.append(zones[zp][1]); zp += 1
        for tf in (15, 60):
            k = int(np.searchsorted(ends[tf], i, 'left')) - 1       # הנר האחרון של המסגרת שנסגר לפני i
            if k != (k15 if tf == 15 else k60):
                if tf == 15: k15 = k
                else: k60 = k
                if k >= 0:
                    cl = closes[tf][k]; active = [z for z in active if not (z.tf == tf and (cl < z.bot or k - z.k > 200))]
        lo = L[i]; cl_ = C[i]
        for z in active:
            touch = lo <= z.top
            for mdl in ('A', 'B'):
                s = z.st[mdl]
                if s[3] >= MAX_ENTRIES: continue
                if touch and i > s[4]:
                    if not s[0]: s[0] = True; s[1] = lo; s[2] = i
                    elif lo < s[1]: s[1] = lo; s[2] = i
                if not s[0]: continue
                if i - s[2] > EP_TIMEOUT: s[0] = False; continue
                ok = False
                if mdl == 'A':
                    rh_ = ref_high(s[2], i); ok = rh_ is not None and cl_ > rh_
                else:
                    ok = L[i] > H[i - 2] and a1[i] == a1[i] and (H[i - 1] - L[i - 1]) >= 1.2 * a1[i] and s[2] >= i - 10
                if ok:
                    fire(mdl, str(z.tf), i, s[1], s[2], z.ob); s[3] += 1; s[0] = False; s[4] = i + COOL
        # חטיפה והחזרה של רמה (פעם אחת לכל רמה ביום)
        m = nymin[i]
        if RTH0 <= m < LAST_ENTRY:
            cands = [('PD', pdl[i]), ('ON', onl[i]), ('OR', orl[i])]
            for name, lv in cands:
                if not lv == lv: continue
                key = (int(dkey[i]), name)
                if key in used: continue
                if name == 'PD' and onl[i] == onl[i] and onl[i] < lv: used.add(key); continue      # נלקח כבר בלילה
                st = sweep.get(key)
                if st is None:
                    if lo < lv: st = sweep[key] = [i, lo, i]
                    else: continue
                elif lo < st[1]: st[1] = lo; st[2] = i
                if cl_ > lv: fire('S', name, i, st[1], st[2]); used.add(key); sweep.pop(key, None)
                elif i - st[0] >= 5: used.add(key); sweep.pop(key, None)
        while h1p < len(h1_lo) and h1_lo[h1p][0] <= i: h1_levels.append([h1_lo[h1p][1], None]); h1p += 1; h1_levels = h1_levels[-3:]
        keep = []
        for lvst in h1_levels:
            lv, st = lvst
            if st is None:
                if lo < lv: st = lvst[1] = [i, lo, i]
                else: keep.append(lvst); continue
            elif lo < st[1]: st[1] = lo; st[2] = i
            if cl_ > lv: fire('S', 'H1', i, st[1], st[2])
            elif i - st[0] < 5: keep.append(lvst)
        h1_levels = keep
        # בסיס להשוואה: אותו שינוי מבנה, בלי אזור — אחרי שפל של 30 נרות
        if not base[0]:
            if i > base[3] and prev30[i] == prev30[i] and lo < prev30[i]: base[0] = True; base[1] = lo; base[2] = i
        else:
            if lo < base[1]: base[1] = lo; base[2] = i
            if i - base[2] > 15: base[0] = False
            else:
                rh_ = ref_high(base[2], i)
                if rh_ is not None and cl_ > rh_: fire('N', '-', i, base[1], base[2]); base[0] = False; base[3] = i + COOL
    return trades

def main():
    sym = sys.argv[1]; tf = int(sys.argv[2])
    d = load(sym, tf); pair_sym = {'BTC': 'ETH', 'NQ': 'ES'}[sym]; p = load(pair_sym, tf)
    idx = {int(x): k for k, x in enumerate(p['t'])}
    al = dict(l=np.full(len(d['t']), np.nan), h=np.full(len(d['t']), np.nan))
    for i, x in enumerate(d['t']):
        k = idx.get(int(x))
        if k is not None: al['l'][i] = p['l'][k]; al['h'][i] = p['h'][k]
    d['_ny'] = ny_fields(d['t'])
    out = []
    for sign in (1, -1): out += run_side(sign, d, al, tf, sym == 'BTC')
    out.sort(key=lambda r: r['t'])
    days = len(set(int(k) for k, m, w in zip(d['_ny'][2], d['_ny'][0], d['_ny'][1]) if RTH0 <= m < RTH1 and w <= 4))
    json.dump(dict(sym=sym, tf=tf, days=days, first=int(d['t'][0]), last=int(d['t'][-1]), trades=out), open(DATA / f'trades_{sym}_{tf}m.json', 'w'))
    print(sym, f'{tf}m', 'bars', len(d['t']), 'session days', days, 'trades', len(out), {m: sum(1 for r in out if r['model'] == m) for m in 'ABSN'})

if __name__ == '__main__': main()
