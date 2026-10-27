# -*- coding: utf-8 -*-
"""בונה את stats.json לאתר מתוך לוגי העסקאות (backtest/stats/trades/*.json, מ-reportData של TradingView).
כל עסקה: e (כניסה: c=הערה עם וקטור האישורים, p, tm, b), x (יציאה: c="F|T"/"F|S"/"F|C", p, tm, b), tp (רווח: v, p=אחוז),
rn (ראן-אפ מקסימלי: p=אחוז מהכניסה), dd (דרודאון מקסימלי בעסקה: p). R מחושב מהסטופ שבהערה."""
import json, glob, pathlib, itertools, math, datetime
ROOT = pathlib.Path(__file__).resolve().parent
FLAGS = [l.strip() for l in (ROOT / 'flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]
FLAG_HE = {
    'pocRt': 'ריטסט POC של היום (טריגר P)', 'pocAt': 'על ה-POC של היום (נגיעה וסגירה בכיוון)', 'pocSide': 'בצד הנכון של POC היום', 'vaIn': 'בתוך אזור הערך של היום', 'vaCheap': 'בצד הזול של אזור הערך', 'pocTrend': 'POC היום זז בכיוון (12 נרות)', 'ema12Ok': 'EMA 12 — בצד הנכון ובשיפוע בכיוון', 'ema12Side': 'בצד הנכון של EMA 12', 'jac': 'JAC/FTI — קפיצה מעבר לקריק/אייס', 'crkRt': 'BUTTC/RBTI — ריטסט הקריק/אייס', 'tso': 'ניעור סופי (TSO/TUT)',
    'dq2': 'איכות D ≥ 2 (חוקי הברזל)', 'dq3': 'איכות D ≥ 3 (חוקי הברזל)', 'dqMag': 'מגנט לקריק/אייס (התכווצות על הקו)', 'avwapD': 'בצד הנכון של AVWAP יומי', 'avwapRt': 'ריטסט AVWAP יומי', 'cvdOk': 'CVD בכיוון (5 נרות)', 'cvdDiv': 'דיברגנס CVD (20 נרות)', 'qtJudas': "ג'ודאס של הרבע (תורת הרבעים)", 'qtAccum': "רבע צבירה (90 דק')", 'qtManip': "רבע מניפולציה (90 דק')", 'qtDist': "רבע חלוקה (90 דק')", 'qtDayLon': 'רבע יומי 2 (לונדון, מניפולציה של היום)', 'tdoDisc': 'בצד הזול של True Day Open', 'tsoDisc': 'בצד הזול של True Session Open', 'twoDisc': 'בצד הזול של True Weekly Open', 'avwTdoSide': 'בצד הנכון של AVWAP מ-True Day Open', 'avwTdoRt': 'ריטסט AVWAP מ-True Day Open', 'avwWkSide': 'בצד הנכון של AVWAP שבועי', 'avwSwRt': 'ריטסט AVWAP מהסווינג האחרון', 'avwSlope': 'שיפוע AVWAP יומי בכיוון', 'avwStack': 'מעל/מתחת גם AVWAP יומי וגם שבועי', 'cTso': 'C עם ניעור סופי', 'reacc': 'איסוף/פיזור חוזר (עם המגמה)',
    'bos': 'BOS', 'choch': 'CHoCH', 'sweep': 'חטיפת נזילות', 'smt': 'SMT', 'ismt': 'iSMT', 'ifvg': 'iFVG', 'fvg': 'FVG נוצר עכשיו (10 נרות)',
    'judas': 'ג\'ודאס', 'tweezer': 'צבת', 'shake': 'ספרינג/UT', 'volC': 'C ווליום (V)', 'lps': 'LPS/LPSY', 'gap': 'גאפ',
    'ob': 'אורדר בלוק', 'wm': 'W/M', 'ddt': 'DD/DT', 'engulf': 'נר בולען', 'bb': 'פריצת בולינגר', 'rsi': 'RSI בקצה',
    'climax': 'ווליום קליימקס', 'test': 'טסט ✓', 'pd': 'דיסקאונט/פרימיום', 'kz': 'קיל-זון', 'sesLon': 'סשן לונדון',
    'sesNY': 'סשן ניו-יורק', 'sesAsia': 'סשן אסיה', 'phC': 'פאזה C', 'phD': 'פאזה D', 'phE': 'פאזה E', 'phAB': 'פאזה A/B',
    'cDir': 'כיוון C תואם', 'clues3': '3+ רמזים', 'volLow': 'ווליום נמוך', 'htfMs': 'מבנה HTF תואם', 'htfCD': 'HTF ב-C/D תואם',
    'amdD': 'AMD D', 'conf4': '4+ אישורים', 'rrOk': 'יחס 1:3 אפשרי',
    'fvgAt': 'כניסה מ-FVG (כל גיל)', 'ifvgAt': 'כניסה מ-iFVG', 'atPool': 'בריכת נזילות (שוויון)', 'orBrk': 'פריצת טווח פתיחה',
    'atEdge': 'הגיע לאייס/קריק', 'atHtfLvl': 'רמת 4H/יומי/שבועי', 'atSesLvl': 'רמת סשן/אסיה', 'bbSq': 'התכווצות בולינגר',
    'vixOk': 'VIX תומך (מתחת/מעל ממוצע 20 לפי הכיוון)', 'vixHigh': 'VIX מעל 20', 'vixSpike': 'זינוק VIX (10%+ ביום)', 'vixDiv': 'דיברגנס VIX מול הנכס',
}
STRAT_HE = {'F': 'טיסה', 'W': 'שבירת כנף', 'O': 'אורדר בלוק', 'M': 'W/M', 'B': 'פריצה (BOS/CHoCH)', 'P': 'ריטסט POC של היום (Volume Profile)', 'K': 'ריטסט הקריק/אייס (BUTTC/RBTI)', 'G': 'טיסה — סטופ מתחת ל-BOS', 'R': 'אורדר בלוק בריטסט (21%)', 'X': '3 אישורים = טריגר'}
SES_HE = {0: 'אסיה', 1: 'לונדון', 2: 'ניו-יורק', 3: 'מחוץ לסשן'}
PH_HE = {0: '—', 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E'}
TARGET_R = 3.0
MIN_N = 20

def row_to_trade(row):
    ec, ep, etm, eb, xc, xp, xtm, xb, rnp, ddp = row
    t = {'e': {'c': ec, 'p': ep, 'tm': etm, 'b': eb}, 'rn': {'p': rnp} if rnp is not None else None, 'dd': {'p': ddp} if ddp is not None else None}
    if xc:
        t['x'] = {'c': xc, 'p': xp, 'tm': xtm, 'b': xb}
    return t

def parse_trade(t, combo):
    ec = str(t['e'].get('c', ''))
    parts = ec.split('|')
    if len(parts) < 8:
        return None
    strat, side, flags, ses, ph, conf, stop, tgt = parts[:8]
    entry = float(t['e']['p']); stop = float(stop); tgt = float(tgt)
    risk = abs(entry - stop)
    if risk <= 0:
        return None
    exit_p = float(t['x']['p']) if t.get('x') else None
    xc = str(t['x'].get('c', '')) if t.get('x') else ''
    is_long = side == 'L'
    r = None
    kind = xc.split('|')[-1] if xc else ''
    if exit_p is not None:
        r = (exit_p - entry) / risk if is_long else (entry - exit_p) / risk
        # סגירה של המנוע שלנו (TV לא הספיק): התוצאה לפי המנוע — CW = יעד, CL = סטופ
        if kind == 'CW':
            r = TARGET_R
        elif kind == 'CL':
            r = -1.0
        elif kind == 'T':
            r = TARGET_R
        elif kind == 'S':
            r = -1.0
    mfe = (float(t['rn']['p']) * entry) / risk if t.get('rn') else None
    mae = -(float(t['dd']['p']) * entry) / risk if t.get('dd') else None
    outcome = 'open' if exit_p is None else ('win' if r is not None and r >= TARGET_R * 0.9 else ('loss' if r is not None and r <= -0.5 else 'flat'))
    if outcome == 'win' and mfe is not None:
        mfe = min(mfe, TARGET_R)
    return {
        'combo': combo, 'strat': strat, 'side': side, 'entryTime': int(t['e']['tm']), 'exitTime': int(t['x']['tm']) if t.get('x') else None,
        'entry': entry, 'stop': stop, 'target': tgt, 'exit': exit_p, 'exitKind': xc.split('|')[-1] if xc else 'open',
        'r': round(r, 2) if r is not None else None, 'mfe': round(mfe, 2) if mfe is not None else None, 'mae': round(mae, 2) if mae is not None else None,
        'bars': (int(t['x']['b']) - int(t['e']['b'])) if t.get('x') else None,
        'flags': flags, 'ses': int(ses), 'phase': int(ph), 'conf': int(conf), 'outcome': outcome,
    }

def agg(trades):
    closed = [t for t in trades if t['outcome'] != 'open' and t['r'] is not None]
    n = len(closed)
    if n == 0:
        return {'n': 0, 'open': len(trades) - n}
    wins = sum(1 for t in closed if t['outcome'] == 'win')
    rs = [t['r'] for t in closed]
    gross_w = sum(r for r in rs if r > 0); gross_l = -sum(r for r in rs if r < 0)
    eq = 0.0; peak = 0.0; mdd = 0.0
    for r in rs:
        eq += r; peak = max(peak, eq); mdd = max(mdd, peak - eq)
    mfes = [t['mfe'] for t in closed if t['mfe'] is not None]
    return {
        'n': n, 'open': len(trades) - n, 'wins': wins, 'winRate': round(wins / n, 3), 'avgR': round(sum(rs) / n, 3), 'sumR': round(sum(rs), 1),
        'profitFactor': round(gross_w / gross_l, 2) if gross_l > 0 else None, 'maxDD_R': round(mdd, 1),
        'avgMFE': round(sum(mfes) / len(mfes), 2) if mfes else None,
        'mfe1R': round(sum(1 for m in mfes if m >= 1) / len(mfes), 3) if mfes else None,
        'mfe2R': round(sum(1 for m in mfes if m >= 2) / len(mfes), 3) if mfes else None,
        'significant': n >= MIN_N,
    }

def main():
    files = sorted(glob.glob(str(ROOT / 'trades' / '*.json')))
    datasets = []
    for f in files:
        d = json.loads(pathlib.Path(f).read_text(encoding='utf-8'))
        if 'combos' in d:  # קובץ store: {combos: {name: payload}}
            datasets += [v for v in d['combos'].values() if v.get('rows') or v.get('trades')]
        elif not str(d.get('name', pathlib.Path(f).stem)).startswith('_'):
            datasets.append(d)
    all_trades = []; combos = {}
    for d in datasets:
        name = d.get('name')
        raw = d.get('trades') or [row_to_trade(r) for r in d.get('rows', [])]
        ts = [x for x in (parse_trade(t, name) for t in raw) if x]
        combos[name] = {'sym': d.get('sym'), 'res': d.get('res'), 'nBars': d.get('nBars'), 'firstTrade': min((t['entryTime'] for t in ts), default=None), 'lastT': (d.get('lastT') or 0) * 1000, 'collectedAt': d.get('collectedAt'), 'stats': agg(ts)}
        all_trades += ts
    by = lambda key: {k: agg(list(g)) for k, g in itertools.groupby(sorted(all_trades, key=key), key=key)}
    by_strat = by(lambda t: t['strat'])
    by_ses = by(lambda t: t['ses'])
    by_phase = by(lambda t: t['phase'])
    by_side = by(lambda t: t['side'])
    by_res = by(lambda t: t['combo'].split('_')[-1])
    by_sym = by(lambda t: t['combo'].rsplit('_', 1)[0])
    base = agg(all_trades)
    # לכל אישור: עם / בלי
    flag_rows = []
    for i, name in enumerate(FLAGS):
        with_ = [t for t in all_trades if len(t['flags']) > i and t['flags'][i] == '1']
        without = [t for t in all_trades if len(t['flags']) > i and t['flags'][i] == '0']
        a, b = agg(with_), agg(without)
        flag_rows.append({'flag': name, 'he': FLAG_HE.get(name, name), 'with': a, 'without': b,
                          'liftR': round((a.get('avgR') or 0) - (b.get('avgR') or 0), 3) if a.get('n') and b.get('n') else None,
                          'liftWin': round((a.get('winRate') or 0) - (b.get('winRate') or 0), 3) if a.get('n') and b.get('n') else None})
    flag_rows.sort(key=lambda r: (r['with'].get('n', 0) >= MIN_N, r['liftR'] or -9), reverse=True)
    # שילובים של 2 ו-3 אישורים (רק דגלים עם מספיק דגימות)
    cand = [i for i, name in enumerate(FLAGS) if sum(1 for t in all_trades if len(t['flags']) > i and t['flags'][i] == '1') >= MIN_N]
    combos_rows = []
    for k in (2, 3):
        for idxs in itertools.combinations(cand, k):
            sub = [t for t in all_trades if all(t['flags'][i] == '1' for i in idxs)]
            if len(sub) < MIN_N:
                continue
            a = agg(sub)
            combos_rows.append({'flags': [FLAGS[i] for i in idxs], 'he': [FLAG_HE.get(FLAGS[i], FLAGS[i]) for i in idxs], 'stats': a})
    combos_rows.sort(key=lambda r: (r['stats'].get('avgR') or -9), reverse=True)
    top_combos = combos_rows[:25]
    top_mfe = sorted(combos_rows, key=lambda r: (r['stats'].get('avgMFE') or -9), reverse=True)[:15]
    # לפי אסטרטגיה × אישור (רק לונג/שורט ביחד)
    strat_flag = {}
    for s in STRAT_HE:
        st_tr = [t for t in all_trades if t['strat'] == s]
        rows = []
        for i, name in enumerate(FLAGS):
            w = [t for t in st_tr if t['flags'][i] == '1']
            if len(w) >= MIN_N:
                rows.append({'flag': name, 'he': FLAG_HE.get(name, name), 'stats': agg(w)})
        rows.sort(key=lambda r: (r['stats'].get('avgR') or -9), reverse=True)
        strat_flag[s] = rows[:10]
    out = {
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'targetR': TARGET_R, 'minN': MIN_N,
        'flags': [{'key': f, 'he': FLAG_HE.get(f, f)} for f in FLAGS], 'stratHe': STRAT_HE, 'sesHe': SES_HE, 'phHe': PH_HE,
        'base': base, 'combos': combos, 'byStrat': by_strat, 'bySes': by_ses, 'byPhase': by_phase, 'bySide': by_side, 'byRes': by_res, 'bySym': by_sym,
        'flagRows': flag_rows, 'topCombos': top_combos, 'topMFE': top_mfe, 'stratFlag': strat_flag,
        'trades': sorted(all_trades, key=lambda t: t['entryTime'], reverse=True)[:3000],
    }
    dest = ROOT.parents[1] / 'apps/web/public/htt-backtest'
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'stats.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    print('combos', len(combos), 'trades', len(all_trades), 'base', base)

if __name__ == '__main__':
    main()
