# -*- coding: utf-8 -*-
"""מייצר את pine/htt_snapshot.pine — "HTT Snapshot": שולח לאתר, בכל סגירת נר, צילום מצב של כל האישורים (לונג ושורט),
הפאזה, סוג הכניסה הפעיל, הסטופ המבני והרמות (כדי שהאתר יחשב "כמה חסר"). התראה אחת לכל מסגרת זמן (1m, 5m, 15m, 1H, 4H, D).
המנוע והדגלים זהים ל-htt_chart.pine / Path Lab — נלקחים מהם אוטומטית, כך ש-HTT Master עצמו לא משתנה.
הבדל יחיד במנוע: הסשנים והקיל-זונים מוגדרים בשעון ניו יורק (America/New_York) — סשן ניו יורק = 9:30–16:00 (16:30–23:00 בישראל).
גם כותב את apps/server/src/services/httFlagKeys.ts (סדר הדגלים — מקור אמת אחד לשרת)."""
import pathlib, re, runpy
ROOT = pathlib.Path(__file__).resolve().parents[2]
runpy.run_path(str(ROOT / 'backtest/stats/gen_pathlab_pine.py'))            # מרענן את pine/htt_pathlab.pine מהמנוע הנוכחי
lab = (ROOT / 'pine/htt_pathlab.pine').read_text(encoding='utf-8').split('\n')
cut = next(i for i, l in enumerate(lab) if l.startswith('// ── מעקב מסלול'))
head = lab[:cut]
assert head[0] == '//@version=6' and head[1].startswith('indicator(')
head[1] = 'indicator("HTT Snapshot — צילום מצב לאתר", "HTTS", overlay=true, max_labels_count=50, max_lines_count=50, max_boxes_count=50)'
head[2] = '// נגזר אוטומטית מ-htt_chart.pine על ידי backtest/stats/gen_snapshot_pine.py — לא לערוך ידנית'
src = '\n'.join(head)
# ── סשנים בשעון ניו יורק (עמיד לשעון קיץ) ──
SES = {
    'sesAsia = input.session("0200-1000", "אסיה", group=gS)': 'sesAsia = input.session("1800-0300", "אסיה (שעון ניו יורק)", group=gS)',
    'sesLon  = input.session("1000-1800", "לונדון", group=gS)': 'sesLon  = input.session("0300-0930", "לונדון (שעון ניו יורק)", group=gS)',
    'sesNY   = input.session("1800-0100", "ניו יורק", group=gS)': 'sesNY   = input.session("0930-1600", "ניו יורק (שעון ניו יורק)", group=gS)',
    'kzLon = input.string("0900-1200", "קיל-זון לונדון (שעון ישראל)", group=gS)': 'kzLon = input.string("0200-0500", "קיל-זון לונדון (שעון ניו יורק)", group=gS)',
    'kzNY = input.string("1400-1700", "קיל-זון ניו-יורק (שעון ישראל)", group=gS)': 'kzNY = input.string("0700-1000", "קיל-זון ניו-יורק (שעון ניו יורק)", group=gS)',
}
for a, b in SES.items():
    assert a in src, a
    src = src.replace(a, b)
for nm in ('sesAsia', 'sesLon,', 'sesLon', 'sesNY,', 'sesNY', 'kzLon', 'kzNY'):
    src = re.sub(r'(time\(timeframe\.period, ' + re.escape(nm) + r'\s*,?\s*)"Asia/Jerusalem"\)', r'\1"America/New_York")', src)
assert src.count('"America/New_York")') >= 5 and 'sesNY,   "Asia/Jerusalem"' not in src
assert not re.search(r'^\s*alert(condition)?\(', src, re.M), 'המנוע לא אמור להכיל התראות'
chart = (ROOT / 'pine/htt_chart.pine').read_text(encoding='utf-8')
stopL = re.search(r'^qStopL = (.+)$', chart, re.M).group(1); stopS = re.search(r'^qStopS = (.+)$', chart, re.M).group(1)
FLAGS = [l.strip() for l in (ROOT / 'backtest/stats/flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]
# ── הרמות שנשלחות (שם קצר → ביטוי Pine). האתר מחשב מהן את המרחק לכל אישור ──
LEVELS = [
    ('rHi', 'rHi'), ('rLo', 'rLo'), ('pH', 'lastPH'), ('pL', 'lastPL'), ('h4H', 'h4H'), ('h4L', 'h4L'), ('dH', 'dH'), ('dL', 'dL'), ('wH', 'wkH'), ('wL', 'wkL'),
    ('obL', 'obLLive ? obLvlL : na'), ('obLs', 'obLLive ? obLBot : na'), ('obS', 'obSLive ? obLvlS : na'), ('obSs', 'obSLive ? obSTop : na'),
    ('sesH', 'prevSesH'), ('sesL', 'prevSesL'), ('asH', 'asiaH'), ('asL', 'asiaL'), ('plH', 'poolHi'), ('plL', 'poolLo'), ('orH', 'orH'), ('orL', 'orL'),
    ('poc', 'pocNow'), ('vah', 'vah'), ('val', 'val'), ('avD', 'avwapD'), ('avW', 'avwapWK'), ('avT', 'avwapTDO'), ('bbU', 'bbU'), ('bbL', 'bbL'),
    ('wgU', 'wingUp'), ('wgD', 'wingDn'), ('jac', 'jacLvl'), ('lo20', 'lo20'), ('hi20', 'hi20'), ('p2', 'snA2c'), ('p2lo', 'a2lo20'), ('p2hi', 'a2hi20'),
    ('fLt', 'snFLt'), ('fLb', 'snFLb'), ('fSb', 'snFSb'), ('fSt', 'snFSt'), ('iLt', 'snILt'), ('iLb', 'snILb'), ('iSb', 'snISb'), ('iSt', 'snISt'), ('ema', 'ema12'),
]
out = [src, '']
A = out.append
A('// ═══ HTT Snapshot — צילום מצב בכל סגירת נר (event htt_snapshot) ═══')
A('gSnap = "צילום מצב לאתר"')
A('snapOn = input.bool(true, "לשלוח צילום מצב בכל סגירת נר (alert() — לבחור \'Any alert() function call\')", group=gSnap)')
A('snA2c = smtOn ? request.security(smtSym, timeframe.period, close, lookahead=barmerge.lookahead_off) : na')
A('''// האזורים הקרובים ביותר: FVG / iFVG שתומך מלמטה (ללונג) ושמתנגד מלמעלה (לשורט). מרחק 0 = המחיר בתוך האזור
f_snZones() =>
    float qfLt = na
    float qfLb = na
    float qfSb = na
    float qfSt = na
    float qiLt = na
    float qiLb = na
    float qiSb = na
    float qiSt = na
    float dFL = 1e18
    float dFS = 1e18
    float dIL = 1e18
    float dIS = 1e18
    if array.size(zTop) > 0
        for zi = 0 to array.size(zTop) - 1
            zt = array.get(zTop, zi)
            zb = array.get(zBot, zi)
            zd = array.get(zDir, zi)
            zv = array.get(zInv, zi)
            if zd == 1 and close >= zb
                d = math.max(0.0, close - zt)
                if not zv and d < dFL
                    dFL := d
                    qfLt := zt
                    qfLb := zb
                if zv and d < dIL
                    dIL := d
                    qiLt := zt
                    qiLb := zb
            if zd == -1 and close <= zt
                d = math.max(0.0, zb - close)
                if not zv and d < dFS
                    dFS := d
                    qfSb := zb
                    qfSt := zt
                if zv and d < dIS
                    dIS := d
                    qiSb := zb
                    qiSt := zt
    [qfLt, qfLb, qfSb, qfSt, qiLt, qiLb, qiSb, qiSt]
[snFLt, snFLb, snFSb, snFSt, snILt, snILb, snISb, snISt] = f_snZones()''')
A('snBrkL = (bosUp or chochUp) and (phase == 3 or phase == 5) and barstate.isconfirmed')
A('snBrkS = (bosDn or chochDn) and (phase == 3 or phase == 5) and barstate.isconfirmed')
A('snTrL = flyLong ? "F" : wingLong ? "W" : obLong ? "O" : wSig ? "M" : buttcL ? "K" : pRtL ? "P" : snBrkL ? "B" : ""')
A('snTrS = flyShort ? "F" : wingShort ? "W" : obShort ? "O" : mSig ? "M" : rbtiS ? "K" : pRtS ? "P" : snBrkS ? "B" : ""')
A('qBufQ = stopBuf / 100.0')
A('qBrkL = snBrkL')
A('qBrkS = snBrkS')
A('snStL = ' + stopL)
A('snStS = ' + stopS)
A('f_snN(float v) => na(v) ? "null" : str.tostring(v, format.mintick)')
A('f_snK(string k, float v) => na(v) ? "" : "\\"" + k + "\\":" + str.tostring(v, format.mintick) + ","')
A('f_snLv() =>')
A('    string s = ""')
for k, expr in LEVELS:
    A(f'    s += f_snK("{k}", {expr})')
A('    str.length(s) > 0 ? str.substring(s, 0, str.length(s) - 1) : ""')
A('''// המחרוזות נבנות בגוף הראשי ולא בתוך f_snMsg — מגבלת 254 "אלמנטים חיצוניים" לפונקציה
snL = f_flags(true)
snS = f_flags(false)
snLv = f_snLv()
f_snMsg() =>
    string j = "{\\"secret\\":\\"" + secret + "\\",\\"event\\":\\"htt_snapshot\\",\\"v\\":1,\\"symbol\\":\\"" + syminfo.ticker + "\\",\\"timeframe\\":\\"" + timeframe.period + "\\",\\"time\\":" + str.tostring(time) + ",\\"tc\\":" + str.tostring(time_close)
    j += ",\\"price\\":" + f_snN(close) + ",\\"hi\\":" + f_snN(high) + ",\\"lo\\":" + f_snN(low) + ",\\"L\\":\\"" + snL + "\\",\\"S\\":\\"" + snS + "\\""
    j += ",\\"phase\\":" + str.tostring(phase) + ",\\"cBull\\":" + (cIsBull ? "1" : "0") + ",\\"ms\\":" + str.tostring(msDir) + ",\\"htfMs\\":" + str.tostring(nz(htfMs, 0)) + ",\\"htfPh\\":" + str.tostring(nz(htfPh, 0)) + ",\\"dq\\":" + str.tostring(dQ)
    j += ",\\"rsi\\":" + (na(rsiV) ? "null" : str.tostring(rsiV, "#.#")) + ",\\"atr\\":" + f_snN(atr) + ",\\"vix\\":" + (na(vixC) ? "null" : str.tostring(vixC, "#.##"))
    j += ",\\"trL\\":\\"" + snTrL + "\\",\\"trS\\":\\"" + snTrS + "\\",\\"stL\\":" + f_snN(snStL) + ",\\"stS\\":" + f_snN(snStS)
    j += ",\\"lv\\":{" + snLv + "}}"
    j
if snapOn and barstate.isconfirmed
    alert(f_snMsg(), alert.freq_once_per_bar_close)
// חיווי קטן על הגרף: הסקריפט חי, וכמה אישורים דולקים עכשיו לכל כיוון
f_snCount(string s) =>
    int c = 0
    for i = 0 to str.length(s) - 1
        c += str.substring(s, i, i + 1) == "1" ? 1 : 0
    c
var table snTb = table.new(position.bottom_right, 1, 1)
if barstate.islast
    table.cell(snTb, 0, 0, "HTTS · " + timeframe.period + " · לונג " + str.tostring(f_snCount(snL)) + " · שורט " + str.tostring(f_snCount(snS)), text_color=color.white, bgcolor=color.new(color.teal, 40), text_size=size.small)
plot(close, "מחיר", display=display.none)''')
(ROOT / 'pine/htt_snapshot.pine').write_text('\n'.join(out) + '\n', encoding='utf-8')
import sys, json
sys.path.insert(0, str(ROOT / 'backtest/stats'))
from build_stats import FLAG_HE
GROUPS = {
    'וויקוף': ['shake', 'volC', 'lps', 'test', 'phC', 'phD', 'phE', 'phAB', 'cDir', 'tso', 'cTso', 'reacc', 'jac', 'crkRt', 'dq2', 'dq3', 'dqMag', 'clues3', 'engulf', 'climax', 'volLow'],
    'מבנה': ['bos', 'choch', 'htfMs', 'htfCD', 'wm', 'ddt', 'ob', 'conf4', 'rrOk', 'atEdge', 'atHtfLvl', 'atSesLvl', 'atPool', 'orBrk'],
    'נזילות ו-FVG': ['sweep', 'judas', 'fvg', 'ifvg', 'fvgAt', 'ifvgAt', 'gap', 'pd', 'kz'],
    'SMT': ['smt', 'ismt'],
    'תורת הרבעים': ['qtJudas', 'qtAccum', 'qtManip', 'qtDist', 'qtDayLon', 'tdoDisc', 'tsoDisc', 'twoDisc'],
    'AVWAP ו-EMA': ['avwapD', 'avwapRt', 'avwTdoSide', 'avwTdoRt', 'avwWkSide', 'avwSwRt', 'avwSlope', 'avwStack', 'ema12Ok', 'ema12Side'],
    'ווליום ו-POC': ['cvdOk', 'cvdDiv', 'pocRt', 'pocAt', 'pocSide', 'vaIn', 'vaCheap', 'pocTrend'],
    'סשנים': ['sesLon', 'sesNY', 'sesAsia', 'amdD'],
    'VIX': ['vixOk', 'vixHigh', 'vixSpike', 'vixDiv'],
    'מתנדים': ['bb', 'bbSq', 'rsi', 'tweezer'],
}
G = {k: g for g, ks in GROUPS.items() for k in ks}
assert all(k in G for k in FLAGS), [k for k in FLAGS if k not in G]
J = lambda o: json.dumps(o, ensure_ascii=False)
ts = ['// נוצר אוטומטית על ידי backtest/stats/gen_snapshot_pine.py — לא לערוך ידנית.', '// סדר הדגלים במחרוזות L / S של אירוע htt_snapshot (זהה ל-backtest/stats/flags.txt ול-f_flags ב-Pine).',
      'export const HTT_FLAG_KEYS: readonly string[] = ' + J(FLAGS), '',
      '// שם בעברית לכל אישור', 'export const HTT_FLAG_NAMES: Record<string, string> = ' + J({k: FLAG_HE.get(k, k) for k in FLAGS}), '',
      '// קבוצה לכל אישור (לתצוגה בלוח)', 'export const HTT_FLAG_GROUP: Record<string, string> = ' + J({k: G[k] for k in FLAGS}), '',
      'export const HTT_GROUP_ORDER: readonly string[] = ' + J(list(GROUPS)), '',
      '// שמות הרמות בשדה lv של אירוע htt_snapshot', 'export const HTT_LEVEL_KEYS: readonly string[] = ' + J([k for k, _ in LEVELS]), '']
(ROOT / 'apps/server/src/services/httFlagKeys.ts').write_text('\n'.join(ts), encoding='utf-8')
n = len(out[0].split('\n')) + sum(len(str(x).split('\n')) for x in out[1:])
print('ok', n, 'lines', len(FLAGS), 'flags', len(LEVELS), 'levels')
