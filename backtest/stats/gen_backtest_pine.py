# -*- coding: utf-8 -*-
"""מייצר את pine/htt_backtest.pine מתוך pine/htt_chart.pine:
המנוע (פאזות, טריגרים, אישורים, מנוע הבקטסט של הגרף) נשאר זהה; במקום הציור — לוג עסקאות עם וקטור אישורים
(תווית לכל עסקה, טקסט "T|..."), ופקודות strategy כדי שה-Strategy Tester של TV יראה את אותן עסקאות."""
import re, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
src = (ROOT / 'pine/htt_chart.pine').read_text(encoding='utf-8')
lines = src.split('\n')
cut = next(i for i, l in enumerate(lines) if l.startswith('// ═══ ציור'))
head = lines[:cut]
assert head[0] == '//@version=6' and head[1].startswith('indicator(')
head[1] = 'strategy("HTT Backtest — בקטסט האישורים", "HTTB", overlay=true, max_labels_count=500, max_lines_count=50, max_boxes_count=50, process_orders_on_close=true, pyramiding=4, initial_capital=1000000, default_qty_type=strategy.fixed, default_qty_value=1, margin_long=0, margin_short=0, calc_on_every_tick=false, close_entries_rule="ANY")'
head.insert(2, '// נגזר אוטומטית מ-htt_chart.pine על ידי backtest/stats/gen_backtest_pine.py — לא לערוך ידנית')

# ---- דגלי אישורים: (שם, ביטוי ללונג, ביטוי לשורט). אירועים = קרו ב-10 הנרות האחרונים; מצבים = בנר הכניסה
EVENTS = [
    ('bos',     'bosUp',      'bosDn'),
    ('choch',   'chochUp',    'chochDn'),
    ('sweep',   'sweepLo',    'sweepHi'),
    ('smt',     'smtBull',    'smtBear'),
    ('ismt',    'ismtBull',   'ismtBear'),
    ('ifvg',    'ifvgBull',   'ifvgBear'),
    ('fvg',     'bullGap',    'bearGap'),
    ('judas',   'judasBull',  'judasBear'),
    ('tweezer', 'twzBull',    'twzBear'),
    ('shake',   'spring',     'utSig'),
    ('volC',    'volC',       'volC'),
    ('lps',     'lpsMark or volDirUp', 'lpsyMark or volDirDn'),
    ('gap',     'gapUp',      'gapDn'),
    ('ob',      'obLong',     'obShort'),
    ('wm',      'wSig',       'mSig'),
    ('ddt',     'ddAny',      'dtAny'),
    ('engulf',  'engulfBull', 'engulfBear'),
    ('bb',      'bbBrkUp',    'bbBrkDn'),
    ('rsi',     'rsiV <= rsiLo', 'rsiV >= rsiHi'),
    ('climax',  'volClimax',  'volClimax'),
    ('fvgAt',   'fvgAtL',     'fvgAtS'),
    ('ifvgAt',  'ifvgAtL',    'ifvgAtS'),
    ('atPool',  'atPoolL',    'atPoolS'),
    ('orBrk',   'orBrkUp',    'orBrkDn'),
    ('jac',     'jacUp',      'jacDn'),
    ('crkRt',   'buttcL',     'rbtiS'),
    ('tso',     'tsoNow and spring', 'tsoNow and utSig'),
    ('qtJudas', 'qtJudasBull', 'qtJudasBear'),
]
STATES = [
    ('test',    'testOK',                       'testOK'),
    ('pd',      'not inPrem',                   'inPrem'),
    ('kz',      'inKZ',                         'inKZ'),
    ('sesLon',  'sesIdx == 1',                  'sesIdx == 1'),
    ('sesNY',   'sesIdx == 2',                  'sesIdx == 2'),
    ('sesAsia', 'sesIdx == 0',                  'sesIdx == 0'),
    ('phC',     'phase == 3',                   'phase == 3'),
    ('phD',     'phase == 4',                   'phase == 4'),
    ('phE',     'phase == 5',                   'phase == 5'),
    ('phAB',    'phase == 1 or phase == 2',     'phase == 1 or phase == 2'),
    ('cDir',    '(phase == 3 or phase == 4) and cIsBull', '(phase == 3 or phase == 4) and not cIsBull'),
    ('clues3',  'clues >= 3',                   'clues >= 3'),
    ('volLow',  'volLow',                       'volLow'),
    ('htfMs',   'htfMs > 0',                    'htfMs < 0'),
    ('htfCD',   '(htfPh == 3 or htfPh == 4) and htfBull == 1', '(htfPh == 3 or htfPh == 4) and htfBull == 0'),
    ('amdD',    'amdPh == "D"',                 'amdPh == "D"'),
    ('conf4',   'confBull >= 4',                'confBear >= 4'),
    ('rrOk',    'ckRRok',                       'ckRRok'),
    ('atEdge',  'atIceL',                       'atCreekS'),
    ('atHtfLvl', 'atHtfL',                      'atHtfS'),
    ('atSesLvl', 'atSesL',                      'atSesS'),
    ('bbSq',    'bbSq',                         'bbSq'),
    ('vixOk',   'vixOkL',                       'vixOkS'),
    ('vixHigh', 'vixHigh',                      'vixHigh'),
    ('vixSpike', 'vixSpike',                    'vixSpike'),
    ('vixDiv',  'vixDivBull',                   'vixDivBear'),
    ('dq2',     'dQ >= 2',                      'dQ >= 2'),
    ('dq3',     'dQ >= 3',                      'dQ >= 3'),
    ('dqMag',   'dqMagnet',                     'dqMagnet'),
    ('cTso',    'cTso and cIsBull',             'cTso and not cIsBull'),
    ('reacc',   'reacc and cIsBull',            'reacc and not cIsBull'),
    ('avwapD',  'close > avwapD',               'close < avwapD'),
    ('avwapRt', 'avwapRtL',                     'avwapRtS'),
    ('cvdOk',   'cvdSlope > 0',                 'cvdSlope < 0'),
    ('cvdDiv',  'cvdDivBull',                   'cvdDivBear'),
    ('qtAccum', 'qtInAccum',                    'qtInAccum'),
    ('qtManip', 'qtInManip',                    'qtInManip'),
    ('qtDist',  'qtInDist',                     'qtInDist'),
    ('qtDayLon', 'qtDayIdx == 1',               'qtDayIdx == 1'),
    ('tdoDisc', 'not na(qtTDO) and close < qtTDO', 'not na(qtTDO) and close > qtTDO'),
    ('tsoDisc', 'not na(qtTSO) and close < qtTSO', 'not na(qtTSO) and close > qtTSO'),
    ('twoDisc', 'not na(qtTWO) and close < qtTWO', 'not na(qtTWO) and close > qtTWO'),
    ('avwTdoSide', 'not na(avwapTDO) and close > avwapTDO', 'not na(avwapTDO) and close < avwapTDO'),
    ('avwTdoRt', 'avwTdoRtL',                   'avwTdoRtS'),
    ('avwWkSide', 'not na(avwapWK) and close > avwapWK', 'not na(avwapWK) and close < avwapWK'),
    ('avwSwRt', 'avwSwRtL',                     'avwSwRtS'),
    ('avwSlope', 'avwSlopeUp',                  'avwSlopeDn'),
    ('avwStack', 'not na(avwapD) and not na(avwapWK) and close > avwapD and close > avwapWK', 'not na(avwapD) and not na(avwapWK) and close < avwapD and close < avwapWK'),
]
FLAGS = [e[0] for e in EVENTS] + [s[0] for s in STATES]

out = []
A = out.append
A('')
A('// ═══ HTT Backtest — הקשר HTF, DD/DT, וקטור אישורים, לוג עסקאות ═══')
A('htfTF = tfMin < 60 ? "240" : tfMin < 240 ? "D" : "W"')
A('[htfMs, htfPh, htfBull] = request.security(syminfo.tickerid, htfTF, [msDir, phase, cIsBull ? 1 : 0], lookahead=barmerge.lookahead_off)')
if 'h4L' not in src[:len('\n'.join(head))]:
    A('[h4H, h4L] = request.security(syminfo.tickerid, "240", [high[1], low[1]], lookahead=barmerge.lookahead_off)')
    A('[dH, dL] = request.security(syminfo.tickerid, "D", [high[1], low[1]], lookahead=barmerge.lookahead_off)')
    A('[wkH, wkL] = request.security(syminfo.tickerid, "W", [high[1], low[1]], lookahead=barmerge.lookahead_off)')
A('''ch240 = ta.change(time("240"))
chD = ta.change(time("D"))
chW = ta.change(time("W"))
dblTol = close * dblTolPct / 100
var float run4L = na
var float run4H = na
var float runDL = na
var float runDH = na
var float runWL = na
var float runWH = na
if nz(ch240, 0) != 0 or na(run4L)
    run4L := low
    run4H := high
else
    run4L := math.min(run4L, low)
    run4H := math.max(run4H, high)
if nz(chD, 0) != 0 or na(runDL)
    runDL := low
    runDH := high
else
    runDL := math.min(runDL, low)
    runDH := math.max(runDH, high)
if nz(chW, 0) != 0 or na(runWL)
    runWL := low
    runWH := high
else
    runWL := math.min(runWL, low)
    runWH := math.max(runWH, high)
var bool wm4Fired = false
var bool wmDFired = false
var bool wmWFired = false
if nz(ch240, 0) != 0
    wm4Fired := false
if nz(chD, 0) != 0
    wmDFired := false
if nz(chW, 0) != 0
    wmWFired := false
f_dblW(float lvl, float runL) => not na(lvl) and math.abs(runL - lvl) <= dblTol and low <= lvl + dblTol and close > lvl
f_dblM(float lvl, float runH) => not na(lvl) and math.abs(runH - lvl) <= dblTol and high >= lvl - dblTol and close < lvl
w4Start = tfMin <= 60 and not wm4Fired and f_dblW(h4L, run4L)
m4Start = tfMin <= 60 and not wm4Fired and f_dblM(h4H, run4H)
wDStart = tfMin < 240 and not wmDFired and f_dblW(dL, runDL)
mDStart = tfMin < 240 and not wmDFired and f_dblM(dH, runDH)
wWStart = tfMin < 1440 and not wmWFired and f_dblW(wkL, runWL)
mWStart = tfMin < 1440 and not wmWFired and f_dblM(wkH, runWH)
if w4Start or m4Start
    wm4Fired := true
if wDStart or mDStart
    wmDFired := true
if wWStart or mWStart
    wmWFired := true
ddAny = w4Start or wDStart or wWStart
dtAny = m4Start or mDStart or mWStart
// אזורי FVG פעילים (אותם כללים כמו הקופסאות בגרף): נלקח בסגירה → הופך ל-iFVG; iFVG שמולא בפתיל → נמחק. "FVG לא חייב להיות טרי" (המשתמש)
var float[] zTop = array.new<float>()
var float[] zBot = array.new<float>()
var int[] zDir = array.new<int>()
var bool[] zInv = array.new<bool>()
var int[] zBar = array.new<int>()
if bullGap or bearGap
    array.push(zTop, bullGap ? low : pBodyBot)
    array.push(zBot, bullGap ? pBodyTop : high)
    array.push(zDir, bullGap ? 1 : -1)
    array.push(zInv, false)
    array.push(zBar, bar_index)
    if array.size(zTop) > 40
        array.shift(zTop), array.shift(zBot), array.shift(zDir), array.shift(zInv), array.shift(zBar)
fvgAtL = false
fvgAtS = false
ifvgAtL = false
ifvgAtS = false
if array.size(zTop) > 0
    for zi = array.size(zTop) - 1 to 0
        zt = array.get(zTop, zi)
        zb = array.get(zBot, zi)
        zd = array.get(zDir, zi)
        zv = array.get(zInv, zi)
        zTaken = zd == 1 ? close < zb : close > zt
        zFilled = zd == 1 ? low <= zb : high >= zt
        if (zv and (zTaken or zFilled)) or bar_index - array.get(zBar, zi) > fvgMaxAge
            array.remove(zTop, zi), array.remove(zBot, zi), array.remove(zDir, zi), array.remove(zInv, zi), array.remove(zBar, zi)
        else if zTaken and bar_index > array.get(zBar, zi)
            array.set(zInv, zi, true)
            array.set(zDir, zi, -zd)
        else if bar_index > array.get(zBar, zi)
            touchL = zd == 1 and low <= zt and close > zb
            touchS = zd == -1 and high >= zb and close < zt
            if touchL
                if zv
                    ifvgAtL := true
                else
                    fvgAtL := true
            if touchS
                if zv
                    ifvgAtS := true
                else
                    fvgAtS := true
// תמיכה/התנגדות: אייס/קריק של התהליך, רמות 4H/יומי/שבועי, רמות סשן/אסיה, בריכות נזילות, פריצת טווח פתיחה, התכווצות בולינגר
atIceL = phase > 0 and not na(rLo) and low <= rLo + tol * 2 and close >= rLo - tol
atCreekS = phase > 0 and not na(rHi) and high >= rHi - tol * 2 and close <= rHi + tol
f_near(float px, float lvl) => not na(lvl) and math.abs(px - lvl) <= tol * 2
atHtfL = f_near(low, h4L) or f_near(low, dL) or f_near(low, wkL)
atHtfS = f_near(high, h4H) or f_near(high, dH) or f_near(high, wkH)
atSesL = f_near(low, prevSesL) or f_near(low, asiaL)
atSesS = f_near(high, prevSesH) or f_near(high, asiaH)
atPoolL = f_near(low, poolLo)
atPoolS = f_near(high, poolHi)
orBrkUp = not inOR and not na(orH) and close > orH and close[1] <= orH
orBrkDn = not inOR and not na(orL) and close < orL and close[1] >= orL
// VIX (מדד הפחד) — משטר יומי: רמה, מעל/מתחת ממוצע 20, זינוק, ודיברגנס מול הנכס (הנכס שיא 5 ימים בלי שה-VIX עשה שפל 5 ימים)
[vixC, vixMA, vixChg, vixLo5, vixHi5] = request.security("TVC:VIX", "D", [close, ta.sma(close, 20), (close / close[1] - 1) * 100, ta.lowest(low, 5), ta.highest(high, 5)], lookahead=barmerge.lookahead_off)
[dHi5, dLo5, dHiNow, dLoNow] = request.security(syminfo.tickerid, "D", [ta.highest(high, 5)[1], ta.lowest(low, 5)[1], high, low], lookahead=barmerge.lookahead_off)
vixHigh = not na(vixC) and vixC >= 20
vixSpike = not na(vixChg) and vixChg >= 10
vixOkL = not na(vixC) and not na(vixMA) and vixC < vixMA
vixOkS = not na(vixC) and not na(vixMA) and vixC > vixMA
vixDivBear = not na(dHi5) and dHiNow > dHi5 and not na(vixLo5) and vixC > vixLo5
vixDivBull = not na(dLo5) and dLoNow < dLo5 and not na(vixHi5) and vixC < vixHi5
// ─── AVWAP (VWAP מעוגן לתחילת יום המסחר) + CVD (דלתא מצטברת מנרות נמוכים) — למדידה לפני שילוב (1.15) ───
var float avPV = 0.0
var float avVV = 0.0
if ta.change(time("D")) != 0
    avPV := 0.0
    avVV := 0.0
avPV += hlc3 * volume
avVV += volume
avwapD = avVV > 0 ? avPV / avVV : na
avwapRtL = ta.barssince(low <= avwapD and close > avwapD) <= 2
avwapRtS = ta.barssince(high >= avwapD and close < avwapD) <= 2
cvdLtf = tfMin <= 5 ? "1" : tfMin <= 15 ? "5" : tfMin <= 60 ? "15" : "30"
cvdArr = request.security_lower_tf(syminfo.tickerid, cvdLtf, close >= open ? volume : -volume)
cvdLast = array.size(cvdArr) > 0 ? array.sum(cvdArr) : (close >= open ? volume : -volume)
var float cvd = 0.0
if ta.change(time("D")) != 0
    cvd := 0.0
cvd += nz(cvdLast)
cvdSlope = cvd - cvd[5]
cvLo20 = ta.lowest(low, 20)
cvHi20 = ta.highest(high, 20)
cvdLo20 = ta.lowest(cvd, 20)
cvdHi20 = ta.highest(cvd, 20)
cvdDivBull = low <= cvLo20[1] and cvd > cvdLo20[1]
cvdDivBear = high >= cvHi20[1] and cvd < cvdHi20[1]
recN = 10''')
A('// אירועים: קרו ב-recN הנרות האחרונים (ta.barssince ברמה העליונה)')
for name, lexp, sexp in EVENTS:
    A(f'evL_{name} = ta.barssince({lexp}) <= recN')
    A(f'evS_{name} = ta.barssince({sexp}) <= recN')
A('f_flags(bool isL) =>')
A('    string s = ""')
for name, _, _ in EVENTS:
    A(f'    s += (isL ? evL_{name} : evS_{name}) ? "1" : "0"')
for name, lexp, sexp in STATES:
    A(f'    s += (isL ? ({lexp}) : ({sexp})) ? "1" : "0"')
A('    s')
A('// ── פקודות strategy: עסקה אחת בכל פעם (TV עובד בפוזיציה נטו — כניסה הפוכה של סוג אחר הייתה סוגרת את הקודמת). ההערה של הכניסה נושאת את וקטור האישורים ──')
TYPES = [('f', 'F', 'טיסה'), ('w', 'W', 'כנף'), ('o', 'O', 'OB'), ('wm', 'M', 'W/M')]
for p_, P, heb in TYPES:
    A(f'''// ── {heb} ──
{p_}New = {p_}N > {p_}N[1]
{p_}Closed = ({p_}St[1] == 1 and {p_}St == 0) or ({p_}New and {p_}St == 0)
if {p_}New and strategy.position_size == 0
    strategy.entry("{P}", {p_}L ? strategy.long : strategy.short, comment="{P}|" + ({p_}L ? "L" : "S") + "|" + f_flags({p_}L) + "|" + str.tostring(sesIdx) + "|" + str.tostring(phase) + "|" + str.tostring({p_}L ? confBull : confBear) + "|" + str.tostring({p_}S, "#.####") + "|" + str.tostring({p_}T, "#.####"))
    strategy.exit("{P}x", "{P}", stop={p_}S, limit={p_}T, comment_profit="{P}|T", comment_loss="{P}|S")
{p_}Won = {p_}W > {p_}W[1]
if {p_}Closed and not {p_}New and strategy.opentrades > 0 and strategy.opentrades.entry_id(0) == "{P}"
    strategy.close("{P}", comment="{P}|C" + ({p_}Won ? "W" : "L"))''')
A('// ── מטא: תווית אחת בנר האחרון (מספר נרות + ספירות המנוע) ──')
A('var int firstT = na')
A('if na(firstT)')
A('    firstT := time')
A('var label metaLb = na')
A('if barstate.islast')
A('    label.delete(metaLb)')
A('    metaLb := label.new(bar_index, close, "META|" + syminfo.tickerid + "|" + timeframe.period + "|" + str.tostring(bar_index + 1) + "|" + str.tostring(firstT) + "|" + str.tostring(time) + "|F" + str.tostring(fN) + "/" + str.tostring(fW) + "|W" + str.tostring(wN) + "/" + str.tostring(wW) + "|O" + str.tostring(oN) + "/" + str.tostring(oW) + "|M" + str.tostring(wmN) + "/" + str.tostring(wmW), xloc=xloc.bar_index, style=label.style_none, textcolor=color.new(color.white, 100), size=size.tiny)')
text = '\n'.join(head + out) + '\n'
(ROOT / 'pine/htt_backtest.pine').write_text(text, encoding='utf-8')
(ROOT / 'backtest/stats/flags.txt').write_text('\n'.join(FLAGS) + '\n', encoding='utf-8')
print('ok', text.count('\n'), 'lines;', len(FLAGS), 'flags')
