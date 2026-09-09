# -*- coding: utf-8 -*-
"""מוסיף ל-pine/htt_chart.pine בלוק "סטאפ איכותי": אותם 46 אישורים כמו במעבדה, רמה = אישורי דרגה 1 − אישורים נגד,
תווית רמה ליד הטריגר, alertcondition לרמה 3+, ו-webhook אחד (event htt_setup) עם כל האישורים, הפאזה והתמיכה/התנגדות.
הבלוק מוחלף בכל הרצה (מסומן בכותרת)."""
import pathlib, re, json
ROOT = pathlib.Path(__file__).resolve().parents[2]
gen_bt = (ROOT / 'backtest/stats/gen_backtest_pine.py').read_text(encoding='utf-8')
ns = {}
exec(re.search(r"EVENTS = \[.*?\]\nSTATES = \[.*?\]\n", gen_bt, re.S).group(0), ns)
EVENTS, STATES = ns['EVENTS'], ns['STATES']
lv = json.loads((ROOT / 'apps/web/public/htt-backtest/levels.json').read_text(encoding='utf-8'))
POS, NEG = lv['pos'], lv['neg']
HE = {'bos': 'BOS', 'choch': 'CHoCH', 'sweep': 'חטיפת נזילות', 'smt': 'SMT', 'ismt': 'iSMT', 'ifvg': 'iFVG', 'fvg': 'FVG חדש', 'judas': "ג'ודאס", 'tweezer': 'צבת', 'shake': 'ספרינג/UT', 'volC': 'C ווליום', 'lps': 'LPS', 'gap': 'גאפ', 'ob': 'אורדר בלוק', 'wm': 'W/M', 'ddt': 'DD/DT', 'engulf': 'בולען', 'bb': 'בולינגר', 'rsi': 'RSI', 'climax': 'קליימקס', 'fvgAt': 'מ-FVG', 'ifvgAt': 'מ-iFVG', 'atPool': 'בריכה', 'orBrk': 'פריצת OR', 'test': 'טסט', 'pd': 'פרימיום/דיסקאונט', 'kz': 'קיל-זון', 'sesLon': 'לונדון', 'sesNY': 'ניו-יורק', 'sesAsia': 'אסיה', 'phC': 'פאזה C', 'phD': 'פאזה D', 'phE': 'פאזה E', 'phAB': 'פאזה A/B', 'cDir': 'כיוון C', 'clues3': '3 רמזים', 'volLow': 'ווליום נמוך', 'htfMs': 'מבנה HTF', 'htfCD': 'HTF C/D', 'amdD': 'AMD D', 'conf4': '4+ אישורים', 'rrOk': '1:3', 'atEdge': 'אייס/קריק', 'atHtfLvl': 'רמת HTF', 'atSesLvl': 'רמת סשן', 'bbSq': 'סקוויז'}
src = (ROOT / 'pine/htt_chart.pine').read_text(encoding='utf-8')
HDR = '// ═══ HTT ALERT BLOCK — סטאפ איכותי: 46 אישורים, רמה, webhook אחד (נוצר על ידי gen_chart_alert_block.py) ═══'
if HDR in src:
    src = src[:src.index(HDR)].rstrip('\n') + '\n'
out = []
A = out.append
A('')
A(HDR)
A('gQ = "סטאפ איכותי (התראה אחת עם כל האישורים)"')
A('qOn = input.bool(true, "לחשב רמה ולסמן ליד הטריגר", group=gQ)')
A('qMinLbl = input.int(2, "תווית רמה על הגרף מרמה", minval=0, maxval=10, group=gQ)')
A('qMinWH = input.int(1, "webhook: לשלוח סטאפ מרמה", minval=0, maxval=10, group=gQ)')
A('qBrk = input.bool(true, "טריגר פריצה (BOS/CHoCH בפאזה C/E) — נמדד: כמו שאר הטריגרים כשמסננים לפי רמה", group=gQ)')
A('[htfMs, htfPh, htfBull] = request.security(syminfo.tickerid, tfMin < 60 ? "240" : tfMin < 240 ? "D" : "W", [msDir, phase, cIsBull ? 1 : 0], lookahead=barmerge.lookahead_off)')
A('''// אזורי FVG מהקופסאות של הגרף עצמו (כל גיל): נגיעה באזור פעיל בכיוון העסקה
fvgAtL = false
fvgAtS = false
ifvgAtL = false
ifvgAtS = false
if array.size(fvgBx) > 0
    for qi = 0 to array.size(fvgBx) - 1
        qt = array.get(fvgTop, qi)
        qb = array.get(fvgBot, qi)
        qd = array.get(fvgDir, qi)
        qv = array.get(fvgInv, qi)
        if bar_index > box.get_left(array.get(fvgBx, qi)) + 2
            if qd == 1 and low <= qt and close > qb
                if qv
                    ifvgAtL := true
                else
                    fvgAtL := true
            if qd == -1 and high >= qb and close < qt
                if qv
                    ifvgAtS := true
                else
                    fvgAtS := true
ddAny = w4Start or wDStart or wWStart
dtAny = m4Start or mDStart or mWStart
atIceL = phase > 0 and not na(rLo) and low <= rLo + tol * 2 and close >= rLo - tol
atCreekS = phase > 0 and not na(rHi) and high >= rHi - tol * 2 and close <= rHi + tol
f_qnear(float px, float lvl) => not na(lvl) and math.abs(px - lvl) <= tol * 2
atHtfL = f_qnear(low, h4L) or f_qnear(low, dL) or f_qnear(low, wkL)
atHtfS = f_qnear(high, h4H) or f_qnear(high, dH) or f_qnear(high, wkH)
atSesL = f_qnear(low, prevSesL) or f_qnear(low, asiaL)
atSesS = f_qnear(high, prevSesH) or f_qnear(high, asiaH)
atPoolL = f_qnear(low, poolLo)
atPoolS = f_qnear(high, poolHi)
orBrkUp = not inOR and not na(orH) and close > orH and close[1] <= orH
orBrkDn = not inOR and not na(orL) and close < orL and close[1] >= orL
recN = 10''')
for name, lexp, sexp in EVENTS:
    A(f'qL_{name} = ta.barssince({lexp}) <= recN')
    A(f'qS_{name} = ta.barssince({sexp}) <= recN')
for name, lexp, sexp in STATES:
    A(f'qL_{name} = {lexp}')
    A(f'qS_{name} = {sexp}')
# רמה
A('qLvlL = ' + ' + '.join(f'(qL_{k} ? 1 : 0)' for k in POS) + ' - (' + ' + '.join(f'(qL_{k} ? 1 : 0)' for k in NEG) + ')')
A('qLvlS = ' + ' + '.join(f'(qS_{k} ? 1 : 0)' for k in POS) + ' - (' + ' + '.join(f'(qS_{k} ? 1 : 0)' for k in NEG) + ')')
# רשימות מפתחות (JSON) ושמות (עברית) לכל כיוון
allkeys = [e[0] for e in EVENTS] + [s[0] for s in STATES]
A('f_qlist(bool isL, bool wantPos) =>')
A('    string s = ""')
for k in allkeys:
    group = 'POS' if k in POS else ('NEG' if k in NEG else 'INFO')
    cond = f'(isL ? qL_{k} : qS_{k})'
    if group == 'NEG':
        A(f'    if not wantPos and {cond}')
    else:
        A(f'    if wantPos and {cond}')
    A(f'        s += (s == "" ? "" : ",") + "\\"{k}\\""')
A('    s')
A('f_qhe(bool isL) =>')
A('    string s = ""')
for k in allkeys:
    if k in NEG: continue
    A(f'    if (isL ? qL_{k} : qS_{k})')
    A(f'        s += (s == "" ? "" : " · ") + "{HE[k]}"')
A('    s')
A('''f_qsr(bool isL) =>
    string s = ""
    if isL ? atIceL : atCreekS
        s += (s == "" ? "" : ",") + (isL ? "\\"ice\\"" : "\\"creek\\"")
    if isL ? atHtfL : atHtfS
        s += (s == "" ? "" : ",") + "\\"htf\\""
    if isL ? atSesL : atSesS
        s += (s == "" ? "" : ",") + "\\"ses\\""
    if isL ? atPoolL : atPoolS
        s += (s == "" ? "" : ",") + "\\"pool\\""
    if isL ? fvgAtL : fvgAtS
        s += (s == "" ? "" : ",") + "\\"fvg\\""
    if isL ? ifvgAtL : ifvgAtS
        s += (s == "" ? "" : ",") + "\\"ifvg\\""
    if isL ? obLong : obShort
        s += (s == "" ? "" : ",") + "\\"ob\\""
    s
// טריגרים: ארבעת סוגי הכניסה שנמדדו + (אופציונלי) פריצה
qBufQ = stopBuf / 100.0
qBrkL = qBrk and (bosUp or chochUp) and (phase == 3 or phase == 5) and barstate.isconfirmed
qBrkS = qBrk and (bosDn or chochDn) and (phase == 3 or phase == 5) and barstate.isconfirmed
qTrigL = flyLong ? "F" : wingLong ? "W" : obLong ? "O" : wSig ? "M" : qBrkL ? "B" : ""
qTrigS = flyShort ? "F" : wingShort ? "W" : obShort ? "O" : mSig ? "M" : qBrkS ? "B" : ""
qStopL = flyLong ? math.min(nz(cExt, low), nz(lastPL, low)) * (1 - qBufQ) : wingLong ? nz(lastPL, low) * (1 - qBufQ) : obLong ? obLBot * (1 - qBufQ) : wSig ? nz(wLow2, low) * (1 - qBufQ) : nz(lastPL, low) * (1 - qBufQ)
qStopS = flyShort ? math.max(nz(cExt, high), nz(lastPH, high)) * (1 + qBufQ) : wingShort ? nz(lastPH, high) * (1 + qBufQ) : obShort ? obSTop * (1 + qBufQ) : mSig ? nz(mHigh2, high) * (1 + qBufQ) : nz(lastPH, high) * (1 + qBufQ)
qSigL = qOn and qTrigL != "" and close > qStopL
qSigS = qOn and qTrigS != "" and close < qStopS
qLvl = qSigL ? qLvlL : qSigS ? qLvlS : 0
qTgtL = close + (close - qStopL) * targetR
qTgtS = close - (qStopS - close) * targetR
// תווית רמה ליד הטריגר (מרמה qMinLbl), עם כל האישורים ב-tooltip
if (qSigL or qSigS) and qLvl >= qMinLbl and not cleanMode
    qTxt = "רמה " + str.tostring(qLvl)
    qTip = (qSigL ? "לונג · " : "שורט · ") + "טריגר " + (qSigL ? qTrigL : qTrigS) + " · פאזה " + phName + "\\nאישורים: " + f_qhe(qSigL) + "\\nרמה = אישורי דרגה 1 פחות אישורים נגד. סטופ " + str.tostring(qSigL ? qStopL : qStopS, format.mintick) + " · יעד 1:3 " + str.tostring(qSigL ? qTgtL : qTgtS, format.mintick)
    label.new(bar_index, qSigL ? low : high, qTxt, xloc=xloc.bar_index, yloc=qSigL ? yloc.belowbar : yloc.abovebar, style=qSigL ? label.style_label_up : label.style_label_down, color=color.new(qLvl >= 4 ? color.lime : qLvl >= 2 ? color.teal : color.gray, 20), textcolor=color.white, size=size.small, tooltip=qTip)
alertcondition((qSigL or qSigS) and qLvl >= 3, "HTT · סטאפ איכותי רמה 3+", "סטאפ איכותי רמה 3+ — RSI {{plot(\\"RSI\\")}} · {{ticker}} {{interval}} — הפירוט ב-webhook/באתר")
alertcondition((qSigL or qSigS) and qLvl >= 5, "HTT · סטאפ זהב רמה 5+", "סטאפ זהב רמה 5+ — RSI {{plot(\\"RSI\\")}} · {{ticker}} {{interval}}")
// webhook אחד עם הכל: האתר מסנן לפי htt_min_score ושולח לטלגרם
if sendWH and (qSigL or qSigS) and qLvl >= qMinWH
    qJ = "{\\"secret\\":\\"" + secret + "\\",\\"event\\":\\"htt_setup\\",\\"symbol\\":\\"" + syminfo.ticker + "\\",\\"timeframe\\":\\"" + timeframe.period + "\\",\\"time\\":" + str.tostring(time) + ",\\"direction\\":\\"" + (qSigL ? "long" : "short") + "\\",\\"trigger\\":\\"" + (qSigL ? qTrigL : qTrigS) + "\\",\\"price\\":" + str.tostring(close) + ",\\"stop\\":" + str.tostring(qSigL ? qStopL : qStopS) + ",\\"target\\":" + str.tostring(qSigL ? qTgtL : qTgtS) + ",\\"score\\":" + str.tostring(qLvl) + ",\\"confirmations\\":[" + f_qlist(qSigL, true) + "],\\"negatives\\":[" + f_qlist(qSigL, false) + "],\\"phase\\":\\"" + phName + "\\",\\"sr\\":[" + f_qsr(qSigL) + "],\\"session\\":\\"" + sesName + "\\",\\"inKillZone\\":" + (inKZ ? "true" : "false") + ",\\"rsi\\":" + str.tostring(rsiV, "#.#") + "}"
    alert(qJ, alert.freq_once_per_bar_close)''')
(ROOT / 'pine/htt_chart.pine').write_text(src + '\n'.join(out) + '\n', encoding='utf-8')
print('chart alert block written;', (src + '\n'.join(out)).count('\n'), 'lines')
