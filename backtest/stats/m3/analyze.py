# -*- coding: utf-8 -*-
"""מערכת 3 — ניתוח תוצאות המנוע: לפי מודל, תקרת סטופ, שיטת יציאה, אישורים, שעה + סימולציית יום ב-300$ סיכון.
שימוש: python3 analyze.py  →  מדפיס טבלאות Markdown (נשמרות ב-data/report.md)."""
import json, pathlib, statistics as st
ROOT = pathlib.Path(__file__).resolve().parent / 'data'
RISK_USD = 300.0
NQ_COST_PTS = 1.25             # עמלה + החלקה לחוזה, בנקודות
MODEL_HE = {'A': 'שינוי מבנה באזור', 'B': 'FVG של דקה באזור', 'S': 'חטיפה והחזרה של רמה', 'N': 'בסיס: שינוי מבנה בלי אזור'}
EXITS = (('r11', 'x11', '1:1'), ('r12', 'x12', '1:2'), ('rh', 'xh', 'חצי + איזון'))
out = []
def P(s=''): out.append(s); print(s)

def load(name):
    d = json.load(open(ROOT / f'trades_{name}.json')); seen = {}; T = []
    for t in sorted(d['trades'], key=lambda r: (r['t'], -int(r['sub']) if r['sub'].isdigit() else 0)):
        k = (t['i'], t['side'], t['model'])
        if k in seen:
            seen[k]['tf2'] = True; continue          # אותו טריגר משני אזורים (15m + 1H) = עסקה אחת, מסומנת "שני אזורים"
        t['tf2'] = False; seen[k] = t; T.append(t)
    return d, T

def cost_r(t, sym, fee):
    return NQ_COST_PTS / t['risk'] if sym == 'NQ' else fee / t['riskPct']

def stat(ts, key, sym, fee=0.0):
    if not ts: return None
    r = [t[key] - cost_r(t, sym, fee) for t in ts]; g = [t[key] for t in ts]
    target = {'r11': 1.0, 'r12': 2.0}.get(key)
    win = sum(1 for x in g if (x >= target if target else x > 0)) / len(g)
    return dict(n=len(ts), win=win, gross=sum(g) / len(g), net=sum(r) / len(r))

def row(label, ts, sym, days, fee=0.0):
    if len(ts) < 8: return f'| {label} | {len(ts)} | – | – | – | – | – | – |'
    a = stat(ts, 'r11', sym, fee); b = stat(ts, 'r12', sym, fee); c = stat(ts, 'rh', sym, fee)
    return f"| {label} | {len(ts)} | {len(ts) / days:.2f} | {a['win'] * 100:.0f}% | {a['net']:+.2f} | {b['win'] * 100:.0f}% | {b['net']:+.2f} | {c['net']:+.2f} |"
HEAD = '| {} | עסקאות | ליום | 1:1 הצלחה | 1:1 נטו (R) | 1:2 הצלחה | 1:2 נטו (R) | חצי+איזון נטו (R) |\n|---|---|---|---|---|---|---|---|'

def day_sim(ts, sym, rk, xk, cap, fee=0.0, max_trades=5, max_losses=2, goal=1000.0):
    """עסקה אחת בכל רגע, עד 5 ביום, נעילה אחרי 2 הפסדים, עצירה ביעד. מחזיר רשימת רווח יומי בדולרים (רק ימים עם עסקה)."""
    by = {}
    for t in ts: by.setdefault(t['t'] // 86400000, []).append(t)   # סשן ניו יורק נמצא כולו באותו יום UTC
    days = {}; ntr = 0; wins = 0
    for dk, lst in by.items():
        pnl = 0.0; losses = 0; n = 0; free = -1
        for t in sorted(lst, key=lambda r: r['i']):
            if n >= max_trades or losses >= max_losses or pnl >= goal: break
            if t['i'] <= free: continue
            if sym == 'NQ':
                if t['risk'] > cap: continue
                c = min(5, int(150 // t['risk']))
                if c < 1: continue
                usd = c * 2 * (t[rk] * t['risk'] - NQ_COST_PTS)
            else:
                if t['riskPct'] > cap: continue
                usd = RISK_USD * (t[rk] - fee / t['riskPct'])
            pnl += usd; n += 1; ntr += 1; free = t[xk]
            if usd < 0: losses += 1
            else: wins += 1
        if n: days[dk] = pnl
    return days, ntr, wins

def sim_row(label, ts, sym, total_days, rk, xk, cap, fee=0.0):
    days, ntr, wins = day_sim(ts, sym, rk, xk, cap, fee)
    if ntr < 8: return f'| {label} | {ntr} | – | – | – | – | – | – | – |'
    v = [days[k] for k in sorted(days)]; cum = 0; peak = 0; dd = 0
    for x in v:
        cum += x; peak = max(peak, cum); dd = max(dd, peak - cum)
    per_day = sum(v) / total_days
    return (f"| {label} | {ntr} | {ntr / total_days:.1f} | {wins / ntr * 100:.0f}% | {per_day:+.0f}$ | {sum(1 for x in v if x > 0) / total_days * 100:.0f}% | "
            f"{sum(1 for x in v if x >= 1000) / total_days * 100:.0f}% | {min(v):+.0f}$ | {dd:.0f}$ |")
SIM_HEAD = '| {} | עסקאות | ליום | הצלחה | ממוצע ליום | ימים ירוקים | ימים ≥1,000$ | היום הגרוע | ירידה מקסימלית |\n|---|---|---|---|---|---|---|---|---|'

def report(name, sym, tf, caps, cap_fmt, fees):
    d, T = load(name); days = d['days']; fee = fees[0]
    span = f"{days} ימי מסחר"
    P(f"\n## {'נאסדק' if sym == 'NQ' else 'ביטקוין'} · נר ביצוע {tf} דק' · {span}")
    if sym == 'BTC': P(f"> נטו כאן = אחרי עמלה של {fee:.2f}% לעסקה מלאה. ברוטו ורמות עמלה אחרות — בטבלת העמלות למטה.")
    P('\n### לפי מודל (כל גדלי הסטופ)'); P(HEAD.format('מודל'))
    for m in 'ABSN':
        ts = [t for t in T if t['model'] == m]
        if ts: P(row(f"{MODEL_HE[m]} · סטופ חציוני {st.median(t['risk'] if sym == 'NQ' else t['riskPct'] for t in ts):{'.0f' if sym == 'NQ' else '.2f'}}{' נק' if sym == 'NQ' else '%'}", ts, sym, days, fee))
    Z = [t for t in T if t['model'] in 'AB']; ZS = [t for t in T if t['model'] in 'ABS']
    P('\n### לפי תקרת סטופ (שלושת המודלים יחד: A + B + S)'); P(HEAD.format('סטופ'))
    for c in caps:
        P(row(f'עד {cap_fmt(c)}', [t for t in ZS if (t['risk'] if sym == 'NQ' else t['riskPct']) <= c], sym, days, fee))
    P('\n### אישורים (A + B + S, כל גדלי הסטופ) — עם לעומת בלי'); P(HEAD.format('אישור'))
    def fl(lab, f):
        w = [t for t in ZS if f(t) is True]; wo = [t for t in ZS if f(t) is False]
        P(row(lab + ' — כן', w, sym, days, fee)); P(row(lab + ' — לא', wo, sym, days, fee))
    fl('מבנה 1H בכיוון', lambda t: t['ms'] == 1 if t['ms'] != 0 else None)
    fl('SMT מול הצמד', lambda t: t['smt'])
    fl('בצד הנכון של VWAP', lambda t: t['vw'])
    if sym == 'BTC':
        fl('דלתא של נר הטריגר בכיוון', lambda t: t['d1']); fl('דלתא 3 נרות בכיוון', lambda t: t['d3'])
    P(row('אזור = אורדר בלוק', [t for t in Z if t['ob']], sym, days, fee)); P(row('אזור = FVG רגיל', [t for t in Z if not t['ob']], sym, days, fee))
    P(row('אזור של 1H (או 15m+1H)', [t for t in Z if t['sub'] == '60' or t['tf2']], sym, days, fee)); P(row('אזור של 15m בלבד', [t for t in Z if t['sub'] == '15' and not t['tf2']], sym, days, fee))
    for nm in ('PD', 'ON', 'OR', 'H1'):
        P(row('חטיפה: ' + {'PD': 'יום קודם', 'ON': 'לילה', 'OR': 'טווח פתיחה', 'H1': 'פיבוט של שעה'}[nm], [t for t in T if t['model'] == 'S' and t['sub'] == nm], sym, days, fee))
    P(row('לונג', [t for t in ZS if t['side'] == 'L'], sym, days, fee)); P(row('שורט', [t for t in ZS if t['side'] == 'S'], sym, days, fee))
    P('\n### לפי שעה (שעון ניו יורק; ישראל = +7) — A + B + S'); P(HEAD.format('שעה'))
    for a, b, lab in ((570, 630, '9:30–10:30'), (630, 690, '10:30–11:30'), (690, 780, '11:30–13:00'), (780, 870, '13:00–14:30'), (870, 960, '14:30–16:00')):
        P(row(lab, [t for t in ZS if a <= t['m'] < b], sym, days, fee))
    if sym == 'BTC':
        h = sorted(ZS, key=lambda t: t['t']); mid = h[len(h) // 2]['t']
        P('\n### יציבות: חצי ראשון מול חצי שני של התקופה (A + B + S)'); P(HEAD.format('תקופה'))
        P(row('חצי ראשון', [t for t in ZS if t['t'] < mid], sym, days / 2, fee)); P(row('חצי שני', [t for t in ZS if t['t'] >= mid], sym, days / 2, fee))
        P('\n### השפעת העמלות (A + B + S, סטופ עד 0.15%)'); P('| עמלה לעסקה מלאה | 1:1 נטו (R) | 1:2 נטו (R) | חצי+איזון נטו (R) |\n|---|---|---|---|')
        sub = [t for t in ZS if t['riskPct'] <= 0.15]
        for f in (0.0,) + fees + (0.2,):
            if sub: P(f"| {f:.2f}% | {stat(sub, 'r11', sym, f)['net']:+.2f} | {stat(sub, 'r12', sym, f)['net']:+.2f} | {stat(sub, 'rh', sym, f)['net']:+.2f} |")
    P(f"\n### סימולציית יום — 300$ סיכון, עד 5 עסקאות, נעילה אחרי 2 הפסדים, עצירה ב-1,000$"); P(SIM_HEAD.format('הגדרה'))
    for mods, ml in (('ABS', 'כל המודלים'), ('AB', 'אזורים בלבד'), ('S', 'חטיפות בלבד'), ('N', 'בסיס בלי אזור')):
        ts = [t for t in T if t['model'] in mods]
        for c in caps[-3:] if mods == 'ABS' else caps[-1:]:
            for rk, xk, el in EXITS:
                P(sim_row(f'{ml} · סטופ עד {cap_fmt(c)} · יציאה {el}', ts, sym, days, rk, xk, c, fee))
    return d, T

P('# מערכת 3 — תוצאות בקטסט הקונספט (מנוע Python, נרות דקה) · 12.11.2026')
P('> הכללים: `backtest/29_כללי_המדידה_מערכת_3_12-11.md`. "נטו" = אחרי עלויות. R = יחידות סיכון (R אחד = 300$). 1:1 צריך מעל 50% הצלחה, 1:2 מעל 33%.')
report('NQ_1m', 'NQ', 1, (15, 30, 50, 75, 150), lambda c: f"{c} נק'", (0.0,))
report('NQ_5m', 'NQ', 5, (30, 50, 75, 150), lambda c: f"{c} נק'", (0.0,))
report('BTC_1m', 'BTC', 1, (0.10, 0.15, 0.25, 0.50), lambda c: f'{c:.2f}%', (0.04, 0.10))
report('BTC_5m', 'BTC', 5, (0.15, 0.25, 0.50, 1.00), lambda c: f'{c:.2f}%', (0.04, 0.10))
open(ROOT / 'report.md', 'w', encoding='utf8').write('\n'.join(out) + '\n')
