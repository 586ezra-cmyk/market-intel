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
