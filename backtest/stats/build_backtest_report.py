# -*- coding: utf-8 -*-
"""דוח בקטסט מלא על האינדיקטור (המנוע המותקן, שנה אחרונה, 4 נכסים × 3 מסגרות) — מנתוני Path Lab.
מדדים: עסקאות, אחוז הצלחה ביעד 1:3 (סטופ הקורס), ממוצע R (1:3 ובגרירה), פרופיט פקטור, דרודאון מקסימלי ב-R, הלכו נכון, תדירות לשבוע.
פלט: backtest/15_בקטסט_מלא.md + public/htt-backtest/report.json"""
import json, sys, datetime, collections, pathlib
sys.path.insert(0, '.')
from build_path_stats import parse
from build_stats import STRAT_HE, FLAG_HE
ROOT = pathlib.Path(__file__).resolve().parent
FLAGS = [l.strip() for l in open(ROOT / 'flags.txt', encoding='utf-8') if l.strip()]
IDX = {k: i for i, k in enumerate(FLAGS)}
LV = json.loads((ROOT.parents[1] / 'apps/web/public/htt-backtest/levels.json').read_text(encoding='utf-8'))
POS, NEG = LV['pos'], LV['neg']
TF_HE = {'5': '5 דקות', '15': '15 דקות', '240': '4 שעות'}
COURSE = ['F', 'W', 'O', 'M', 'B', 'K', 'P']

def level_of(flags, res=None):
    """רמה = אישורים בעד − אישורים נגד. 5m: רשימת perTf.5 (B); שאר המסגרות: הרשימה הראשית"""
    per = LV.get('perTf', {}).get(str(res) if res is not None else '', None)
    pos = per['pos'] if per else POS
    neg = per['neg'] if per else NEG
    def on(k):
        i = IDX.get(k)
        return i is not None and i < len(flags) and flags[i] == '1'
    return sum(1 for k in pos if on(k)) - sum(1 for k in neg if on(k))

def load():
    d = json.loads((ROOT / 'trades' / 'htt_path_store_year_course.json').read_text(encoding='utf-8'))
    T = []
    for name, v in d['combos'].items():
        for r in v['rows']:
            t = parse(r, name)
            if t:
                t['res'] = v['res']; t['sym'] = v['sym'].split(':')[1].replace('USDT', ''); t['level'] = level_of(t['flags'], v['res']); T.append(t)
    T.sort(key=lambda t: t['entryTime'])
    global NWIN
    NWIN = sum(int(v.get('windows', 0) or 0) for v in d['combos'].values())
    return T, d['exportedAt']

def metrics(ts):
    n = len(ts)
    if n == 0:
        return {'n': 0}
    # מעקב עד הכרעה: כל עסקה נרשמת רק כשהגיעה לסטופ (גם מתקדם) או ליעד. עסקה שלא הוכרעה עד תקרת 1000 נרות
    # נשארת None — לא נספרת ב-R (לא מסמנים אותה לפי שווי שוק), רק בשיעור 'openCap'.
    def val(t, k):
        return t[k]
    s1 = [val(t, 's1') for t in ts if val(t, 's1') is not None]
    s4 = [val(t, 's4') for t in ts if val(t, 's4') is not None]
    wins = sum(1 for t in ts if t['s1'] is not None and t['s1'] >= 2.9); losses = sum(1 for t in ts if t['s1'] is not None and t['s1'] <= -0.9); other = len(s1) - wins - losses
    pos1 = sum(v for v in s1 if v > 0); neg1 = -sum(v for v in s1 if v < 0)
    pos4 = sum(v for v in s4 if v > 0); neg4 = -sum(v for v in s4 if v < 0)
    def maxdd(vals):
        peak = 0.0; cum = 0.0; dd = 0.0
        for v in vals:
            cum += v; peak = max(peak, cum); dd = max(dd, peak - cum)
        return round(dd, 1)
    right = sum(1 for t in ts if t['b1'] >= 0)
    open_cap = sum(1 for t in ts if t['s1'] is None)
    return {'n': n, 'openCap': round(open_cap / n, 3), 'win13': round(wins / max(len(s1), 1), 3), 'loss13': round(losses / max(len(s1), 1), 3), 'open13': round(other / max(len(s1), 1), 3),
            'avgR13': round(sum(s1) / max(len(s1), 1), 3), 'sumR13': round(sum(s1), 1), 'pf13': round(pos1 / neg1, 2) if neg1 else None, 'dd13': maxdd(s1),
            'avgR4': round(sum(s4) / max(len(s4), 1), 3), 'sumR4': round(sum(s4), 1), 'pf4': round(pos4 / neg4, 2) if neg4 else None, 'dd4': maxdd(s4),
            'win4': round(sum(1 for v in s4 if v > 0) / max(len(s4), 1), 3), 'rightDir': round(right / n, 3)}

def main():
    T, exported = load()
    days = 365
    weeks = days / 7
    out = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'days': days, 'nSignals': len(T)}
    syms = sorted(set(t['sym'] for t in T))
    out['all'] = metrics(T)
    out['byTf'] = {tf: metrics([t for t in T if t['res'] == tf]) for tf in ('240', '15', '5')}
    out['bySym'] = {s: metrics([t for t in T if t['sym'] == s]) for s in syms}
    out['bySymTf'] = {s: {tf: metrics([t for t in T if t['sym'] == s and t['res'] == tf]) for tf in ('240', '15', '5')} for s in syms}
    out['byStratTf'] = {st: {tf: metrics([t for t in T if t['strat'] == st and t['res'] == tf]) for tf in ('240', '15', '5', 'all') if tf != 'all'} for st in COURSE}
    for st in COURSE:
        out['byStratTf'][st]['all'] = metrics([t for t in T if t['strat'] == st])
    out['bySide'] = {s: metrics([t for t in T if t['side'] == s]) for s in ('L', 'S')}
    out['byLevel'] = {}
    for tf in ('240', '15', '5'):
        out['byLevel'][tf] = {}
        for k in range(0, 7):
            sub = [t for t in T if t['res'] == tf and t['level'] >= k]
            m = metrics(sub); m['perWeek'] = round(len(sub) / weeks / 4, 1)  # לנכס
            out['byLevel'][tf][str(k)] = m
    months = collections.defaultdict(list)
    for t in T:
        months[datetime.datetime.utcfromtimestamp(t['entryTime'] / 1000).strftime('%Y-%m')].append(t)
    def mval(t, k):
        return t[k]
    out['byMonth'] = {m: {'n': len(v), 'sumR4': round(sum(mval(t, 's4') for t in v if mval(t, 's4') is not None), 1), 'sumR13': round(sum(mval(t, 's1') for t in v if mval(t, 's1') is not None), 1),
                          'avgR4': round(sum(mval(t, 's4') for t in v if mval(t, 's4') is not None) / max(1, sum(1 for t in v if mval(t, 's4') is not None)), 3)} for m, v in sorted(months.items())}
    # הזרם המומלץ: 4H רמה 3+, 15m רמה 4+, 5m רק OB בריטסט/K/W-M ברמה 2+ (הצעה) — כמה עסקאות ומה נותן
    rec = [t for t in T if (t['res'] == '240' and t['level'] >= 3) or (t['res'] == '15' and t['level'] >= 4) or (t['res'] == '5' and t['strat'] in ('O', 'K', 'M') and t['level'] >= 2)]
    out['recommended'] = dict(metrics(rec), perWeekAll=round(len(rec) / weeks, 1))
    out['recommendedByTf'] = {tf: metrics([t for t in rec if t['res'] == tf]) for tf in ('240', '15', '5')}
    (ROOT.parents[1] / 'apps/web/public/htt-backtest/report.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    # markdown
    L = []
    L.append(f"# בקטסט מלא — HTT Master v54 (המנוע המותקן) · שנה אחרונה · 4 נכסים × 3 מסגרות\n")
    L.append(f"> נוצר {datetime.datetime.now().strftime('%d/%m/%Y %H:%M')} מנתוני Path Lab ({NWIN} חלונות Replay). {len(T):,} עסקאות של טריגרי הקורס (טיסה, כנף, אורדר בלוק, W/M, פריצה, ריטסט קריק).")
    L.append("> **הגדרות:** כניסה בסגירת נר הטריגר · סטופ לפי הקורס · 1:3 = יעד קבוע 3R (\"הצלחה\" = היעד נפגע, \"סטופ\" = הסטופ נפגע, אין \"פתוח\" — כל עסקה נעקבה עד סטופ או יעד) · גרירה = איזון אחרי 1R ואז גרירה מתחת/מעל הפיבוט האחרון · R = יחידת סיכון · PF = פרופיט פקטור · DD = דרודאון מקסימלי ב-R (רצף כרונולוגי) · הלכו נכון = הגיעו ל-1R לפני הסטופ.\n")
    L.append("> **מעקב:** כל עסקה נעקבת עד שהיא מגיעה לסטופ (כולל סטופ מתקדם) או ליעד — לא נחתכת אחרי מספר נרות. תקרה טכנית 1000 נרות; עסקה שלא הוכרעה עד אז לא נספרת ב-R ומופיעה רק כאחוז 'פתוח'.")
    def row(name, m):
        if not m or not m.get('n'):
            return f"| {name} | 0 | | | | | | | | |"
        return f"| {name} | {m['n']:,} | {m['win13']*100:.0f}% | {m['loss13']*100:.0f}% | {m['avgR13']:+.2f} | {m['pf13'] if m['pf13'] is not None else '—'} | {m['avgR4']:+.2f} | {m['win4']*100:.0f}% | {m['pf4'] if m['pf4'] is not None else '—'} | {m['dd4']} | {m['rightDir']*100:.0f}% |"
    hdr = "| | עסקאות | הצלחה 1:3 | סטופ 1:3 | R ממוצע 1:3 | PF 1:3 | R ממוצע גרירה | רווחיות גרירה | PF גרירה | DD גרירה | הלכו נכון |\n|---|---|---|---|---|---|---|---|---|---|---|"
    L.append("## 1. סיכום לפי מסגרת זמן"); L.append(hdr)
    L.append(row('הכול', out['all']))
    for tf in ('240', '15', '5'):
        L.append(row(TF_HE[tf], out['byTf'][tf]))
    L.append(row('לונג', out['bySide']['L'])); L.append(row('שורט', out['bySide']['S']))
    L.append("\n## 2. לפי טריגר ומסגרת"); L.append(hdr)
    for st in COURSE:
        for tf in ('240', '15', '5'):
            L.append(row(f"{STRAT_HE.get(st, st)} · {TF_HE[tf]}", out['byStratTf'][st][tf]))
    L.append("\n## 3. לפי נכס"); L.append(hdr)
    for s in syms:
        L.append(row(s, out['bySym'][s]))
        for tf in ('240', '15', '5'):
            L.append(row(f"{s} · {TF_HE[tf]}", out['bySymTf'][s][tf]))
    L.append("\n## 4. לפי רמת ההתראה (אישורי דרגה 1 פחות נגד) — תדירות = עסקאות לשבוע לנכס"); 
    L.append("| מסגרת | רמה | עסקאות | לשבוע לנכס | הצלחה 1:3 | R ממוצע 1:3 | R ממוצע גרירה | PF גרירה | הלכו נכון |\n|---|---|---|---|---|---|---|---|---|")
    for tf in ('240', '15', '5'):
        for k in range(0, 7):
            m = out['byLevel'][tf][str(k)]
            if m['n'] >= 20:
                L.append(f"| {TF_HE[tf]} | {k}+ | {m['n']:,} | {m['perWeek']} | {m['win13']*100:.0f}% | {m['avgR13']:+.2f} | {m['avgR4']:+.2f} | {m['pf4'] if m['pf4'] is not None else '—'} | {m['rightDir']*100:.0f}% |")
    L.append("\n## 5. הזרם המומלץ (4 שעות רמה 3+, 15 דקות רמה 4+, 5 דקות רק אורדר בלוק/ריטסט/W-M ברמה 2+)"); L.append(hdr)
    L.append(row(f"הכול ({out['recommended']['perWeekAll']} עסקאות לשבוע, כל הנכסים)", out['recommended']))
    for tf in ('240', '15', '5'):
        L.append(row(TF_HE[tf], out['recommendedByTf'][tf]))
    L.append("\n## 6. לפי חודש (סכום R בגרירה / ב-1:3, כל העסקאות)")
    L.append("| חודש | עסקאות | סכום R גרירה | ממוצע R גרירה | סכום R 1:3 |\n|---|---|---|---|---|")
    for m, v in out['byMonth'].items():
        L.append(f"| {m} | {v['n']:,} | {v['sumR4']:+.1f} | {v['avgR4']:+.2f} | {v['sumR13']:+.1f} |")
    (ROOT.parents[1] / 'backtest' / '15_בקטסט_מלא.md').write_text('\n'.join(L) + '\n', encoding='utf-8')
    print('\n'.join(L))

if __name__ == '__main__':
    main()
