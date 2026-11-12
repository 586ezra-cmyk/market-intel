# -*- coding: utf-8 -*-
"""מערכת 3 — פירוט לצירופים הבולטים (תדירות, שעות, ימים, סטופ, זמן בעסקה) + רשימת הצירופים שמאחורי בדיקת הכנות.
פלט: ../../32_פירוט_הצירופים_הבולטים_12-11.md"""
import sys, json, pathlib, datetime, zoneinfo, statistics as st, collections
import numpy as np
ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT.parent))
import combos as C
IL = zoneinfo.ZoneInfo('Asia/Jerusalem'); NY = zoneinfo.ZoneInfo('America/New_York')
T, _ = C.B.load()
KI = {k: i for i, k in enumerate(C.KEYS)}
L = []; A = L.append
def y(t, R):
    m = t['mfeBeforeStop'] or 0
    return R if m >= R else (-1 if t['stopBar'] >= 0 else 0)
def sess(dt_ny):
    m = dt_ny.hour * 60 + dt_ny.minute
    if dt_ny.weekday() > 4: return 'סוף שבוע'
    if 570 <= m < 690: return 'פתיחת ניו יורק (16:30–18:30)'
    if 690 <= m < 960: return 'המשך ניו יורק (18:30–23:00)'
    if 180 <= m < 570: return 'לונדון / לפני הפתיחה (10:00–16:30)'
    return 'לילה ואסיה (23:00–10:00)'
def detail(rows, M, keys, title):
    idx = [KI[k] for k in keys]; mask = M[:, idx].all(1); ts = [t for t, ok in zip(rows, mask) if ok]
    n = len(ts)
    if not n: A(f'### {title}\nאין עסקאות.'); return
    bars = {(t['entryTime'], t['side']) for t in ts}
    days = collections.Counter(datetime.datetime.fromtimestamp(t['entryTime'] / 1000, NY).date() for t in ts)
    months = {(d.year, d.month) for d in days}
    ses = collections.Counter(sess(datetime.datetime.fromtimestamp(t['entryTime'] / 1000, NY)) for t in ts)
    hrs = collections.Counter(datetime.datetime.fromtimestamp(t['entryTime'] / 1000, IL).hour for t in ts)
    stop = sorted(abs(t['entry'] - t['stop']) for t in ts); med = st.median(stop)
    b1 = [t['b1'] for t in ts if t['b1'] >= 0]; b2 = [t['b2'] for t in ts if t['b2'] >= 0]
    mid = sorted(t['entryTime'] for t in T if t['res'] == ts[0]['res'] and t['sym'] == ts[0]['sym'])
    mid = mid[len(mid) // 2]
    def wr(sub):
        if not sub: return '–'
        return f"{len(sub)} עסקאות · 1:1 {sum(y(t, 1) > 0 for t in sub) / len(sub) * 100:.0f}% · 1:2 {sum(y(t, 2) > 0 for t in sub) / len(sub) * 100:.0f}%"
    rth = [t for t in ts if sess(datetime.datetime.fromtimestamp(t['entryTime'] / 1000, NY)).endswith(('18:30)', '23:00)'))]
    tfm = int(ts[0]['res'])
    A(f'### {title}')
    A(f"- **תדירות:** {n} עסקאות בשנה = **{n / 52:.1f} בשבוע**. הן הופיעו ב-{len(days)} ימים שונים (מתוך כ-250 ימי מסחר), ב-{len(months)} חודשים שונים. ביום שיש — בדרך כלל {st.median(days.values()):.0f}, מקסימום {max(days.values())}." + (f" {n - len(bars)} מהן כפולות (אותו נר, סוג כניסה אחר)." if n != len(bars) else ''))
    A('- **מתי (שעון ישראל):** ' + ' · '.join(f"{k}: {v} ({v / n * 100:.0f}%)" for k, v in ses.most_common()))
    A('- **השעות הנפוצות:** ' + ' · '.join(f"{h:02d}:00 ({v})" for h, v in hrs.most_common(4)))
    A(f"- **בשעות שלך (16:30–23:00):** {wr(rth)}")
    A(f"- **כיוון:** לונג {wr([t for t in ts if t['side'] == 'L'])} | שורט {wr([t for t in ts if t['side'] == 'S'])}")
    A(f"- **סטופ:** חציון {med:.0f} נק' (רבעונים {stop[n // 4]:.0f}–{stop[3 * n // 4]:.0f}) → ב-300$: {max(0, int(150 // med))} חוזי מיקרו" + (' (פחות מחוזה אחד — הסטופ רחב מדי ל-300$)' if med > 150 else ''))
    A(f"- **זמן עד היעד:** 1:1 אחרי {st.median(b1) * tfm:.0f} דק' בחציון" + (f"; 1:2 אחרי {st.median(b2) * tfm:.0f} דק'" if b2 else '') + '.')
    A(f"- **יציבות:** חצי ראשון {wr([t for t in ts if t['entryTime'] < mid])} | חצי שני {wr([t for t in ts if t['entryTime'] >= mid])}")
    A('')
A('# פירוט הצירופים הבולטים + הצירופים שמאחורי בדיקת הכנות (12.11.2026)')
A('> נאסדק, נר 5 דקות, שנה אחרונה (5,621 עסקאות). הסטופ = סטופ הקורס. השעות בשעון ישראל. "בשעות שלך" = סשן ניו יורק 16:30–23:00.')
A(''); A('## א. הסבר על כל אישור')
for nm, tx in (('C ווליום', 'נר עם ווליום חריג (קליימקס) בזמן פאזה C של וויקוף — כלומר בזמן הניעור. נחשב אם קרה ב-10 הנרות האחרונים.'),
               ('כניסת אורדר בלוק', 'סוג הכניסה: המחיר חזר לאזור האורדר בלוק (עומק 21%) וסגר חזרה מעליו.'),
               ('כניסת טיסה', 'סוג הכניסה: שבירת מבנה (BOS) בכיוון, בפאזה D.'),
               ('איכות D ≥ 3 / ≥ 2', 'ציון 0–4 לפאזה D לפי "חוקי הברזל": (1) התיקון בווליום נמוך מהדחיפה; (2) התיקון רדוד — עד חצי מהדחיפה; (3) נר הדחיפה בווליום מעל הממוצע; (4) המחיר נדבק לקו הקריק/אייס. ≥3 = לפחות שלושה מתוך ארבעה.'),
               ('רבע חלוקה', 'תורת הרבעים: מחזור של 90 דקות מחולק לרבעים; "חלוקה" = הרבע שבא מיד אחרי רבע המניפולציה — שם אמורה לבוא התנועה האמיתית.'),
               ('צבת', 'שני נרות עם שפל כמעט זהה (עד נקודה), הראשון אדום והשני ירוק עם גוף גדול. ב-10 הנרות האחרונים.'),
               ('פריצת בולינגר', 'סגירה מחוץ לרצועת בולינגר אחרי התכווצות של 6 נרות לפחות. ב-10 הנרות האחרונים.'),
               ('התכווצות בולינגר', 'הרצועות צרות עכשיו (רוחב בתחתית 20% של 100 הנרות האחרונים) — השוק דחוס.'),
               ('פריצת טווח פתיחה', 'סגירה מעבר לשיא/שפל של טווח הפתיחה של הסשן. ב-10 הנרות האחרונים.'),
               ('מבנה מסגרת גבוהה תואם', 'כיוון המבנה (BOS אחרון) במסגרת הגבוהה זהה לכיוון העסקה.'),
               ('כניסה מ-iFVG', 'המחיר חזר ל-FVG שנשבר והתהפך (iFVG) ונכנסים ממנו. ב-10 הנרות האחרונים.'),
               ('VIX תומך', 'מדד הפחד מתחת לממוצע 20 שלו בלונג (או מעליו בשורט).'),
               ('POC זז בכיוון', 'מרכז הנפח של היום (POC) זז בכיוון העסקה ב-12 הנרות האחרונים.'),
               ('BOS', 'שבירת מבנה בכיוון ב-10 הנרות האחרונים.'), ('LPS', 'נקודת התמיכה האחרונה של וויקוף (או נר ווליום בכיוון) ב-10 הנרות האחרונים.')):
    A(f'- **{nm}:** {tx}')
rows = [t for t in T if t['res'] == '5' and t['sym'] == 'NQ1!']; M, Q = C.build(rows)
A(''); A('## ב. שמונת הצירופים מהטבלה — תדירות, שעות, סטופ')
for title, keys in (('לבד · C ווליום', ['volC']), ('לבד · כניסת אורדר בלוק', ['T:O']), ('2 · איכות D ≥ 3 + רבע חלוקה', ['dq3', 'qtDist']), ('2 · איכות D ≥ 3 + כניסת טיסה', ['dq3', 'T:F']),
                    ('3 · צבת + פריצת בולינגר + איכות D ≥ 2', ['tweezer', 'bb', 'dq2']), ('3 · פריצת טווח פתיחה + מבנה מסגרת גבוהה תואם + איכות D ≥ 3', ['orBrk', 'htfMs', 'dq3']),
                    ('4 · כניסה מ-iFVG + התכווצות בולינגר + VIX תומך + POC זז בכיוון', ['ifvgAt', 'bbSq', 'vixOk', 'pocTrend']), ('4 · BOS + LPS + מבנה מסגרת גבוהה תואם + איכות D ≥ 3', ['bos', 'lps', 'htfMs', 'dq3'])):
    detail(rows, M, keys, title)
A('## ג. הצירופים שמאחורי בדיקת הכנות')
A('לכל שורה בטבלת הכנות: הצירופים שנבחרו כ"טובים ביותר" לפי חצי השנה הראשון בלבד (יעד 1:2), ומה כל אחד מהם עשה בחצי השני. מוצגים 15 הראשונים מתוך 50.')
POOLS = {'נאסדק': lambda t: t['sym'] == 'NQ1!', 'כל הנכסים': lambda t: True, 'ביטקוין': lambda t: t['sym'] == 'BTC'}
MINS = {('נאסדק', '5'): 40, ('נאסדק', '15'): 30, ('כל הנכסים', '5'): 60, ('כל הנכסים', '240'): 20, ('ביטקוין', '5'): 30}
for pn, tf, k in (('נאסדק', '5', 2), ('נאסדק', '5', 3), ('נאסדק', '5', 4), ('נאסדק', '15', 3), ('כל הנכסים', '5', 4), ('כל הנכסים', '240', 3), ('ביטקוין', '5', 4)):
    rs = [t for t in T if t['res'] == tf and POOLS[pn](t)]; Mx, Qx = C.build(rs); min_n = MINS[(pn, tf)]; min_half = max(6, min_n // 3)
    rate = Mx.mean(0); keep = [i for i, kk in enumerate(C.KEYS) if kk not in C.SKIP and Mx[:, i].sum() >= min_n and rate[i] <= 0.95]
    seen = {}; cols = []
    for i in keep:
        h = Mx[:, i].tobytes()
        if h not in seen: seen[h] = i; cols.append(i)
    idx, g = C.enum(Mx[:, cols], Qx, k, min_n); m = C.metrics(g)
    ok = (m['n1'] >= min_half) & (m['n2'] >= min_half); order = np.argsort(-np.where(ok, m['e12h1'], -9))[:50]
    A(f"\n### {pn} · {C.TFN[tf]} · {k} אישורים — 50 הטובים: חצי ראשון {m['e12h1'][order].mean():+.2f}R → חצי שני {m['e12h2'][order].mean():+.2f}R")
    A('| # | אישורים | חצי ראשון: עסקאות · R | חצי שני: עסקאות · R |'); A('|---|---|---|---|')
    cnt = collections.Counter()
    for r, o in enumerate(order):
        for x in idx[o]: cnt[C.HE.get(C.KEYS[cols[int(x)]], '')] += 1
        if r < 15: A(f"| {r + 1} | {' + '.join(C.HE.get(C.KEYS[cols[int(x)]], '') for x in idx[o])} | {int(m['n1'][o])} · {m['e12h1'][o]:+.2f} | {int(m['n2'][o])} · **{m['e12h2'][o]:+.2f}** |")
    A('\nהאישורים שחוזרים הכי הרבה ב-50: ' + ' · '.join(f'{nm} ({c})' for nm, c in cnt.most_common(6)))
(ROOT.parent.parent / '32_פירוט_הצירופים_הבולטים_12-11.md').write_text('\n'.join(L) + '\n', encoding='utf8')
print('\n'.join(L))
