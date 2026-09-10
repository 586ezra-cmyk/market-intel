# -*- coding: utf-8 -*-
"""מייצר את pine/htt_pathlab.pine — "HTT Path Lab": אינדיקטור שמודד לכל סיגנל (טיסה/כנף/OB/W-M) את מסלול המחיר
אחריו, בלי להגביל לעסקה אחת בכל פעם: לאן הלך, כמה רחוק, מתי הגיע ל-1R/2R/3R, כמה נגד לפני זה (איפה צריך סטופ),
האם הגיע ליעד המבני, ומה היו התוצאות של 6 שיטות ניהול. כל סיגנל נרשם כתווית "P|..." בסוף אופק המדידה.
המנוע (פאזות, טריגרים, אישורים) זהה ל-htt_chart.pine — נלקח ממנו אוטומטית."""
import pathlib, re
ROOT = pathlib.Path(__file__).resolve().parents[2]
src = (ROOT / 'pine/htt_chart.pine').read_text(encoding='utf-8')
lines = src.split('\n')
cut = next(i for i, l in enumerate(lines) if l.startswith('// ═══ ציור'))
head = lines[:cut]
assert head[0] == '//@version=6' and head[1].startswith('indicator(')
head[1] = 'indicator("HTT Path Lab — מסלול המחיר אחרי כל סיגנל", "HTTP", overlay=true, max_labels_count=500, max_lines_count=50, max_boxes_count=50)'
head.insert(2, '// נגזר אוטומטית מ-htt_chart.pine על ידי backtest/stats/gen_pathlab_pine.py — לא לערוך ידנית')

# אותם דגלים כמו ב-gen_backtest_pine.py (חייב להישאר זהה — flags.txt משותף)
gen_bt = (ROOT / 'backtest/stats/gen_backtest_pine.py').read_text(encoding='utf-8')
ns = {}
exec(re.search(r"EVENTS = \[.*?\]\nSTATES = \[.*?\]\n", gen_bt, re.S).group(0), ns)
EVENTS, STATES = ns['EVENTS'], ns['STATES']
FLAGS = [e[0] for e in EVENTS] + [s[0] for s in STATES]
assert FLAGS == [l.strip() for l in (ROOT / 'backtest/stats/flags.txt').read_text(encoding='utf-8').splitlines() if l.strip()]

out = []
A = out.append
A('')
A('// ═══ HTT Path Lab — הקשר HTF, DD/DT, דגלים, מעקב מסלול ═══')
A('horizon = input.int(120, "אופק מדידה (נרות אחרי הסיגנל)", minval=20, maxval=500)')
A('htfTF = tfMin < 60 ? "240" : tfMin < 240 ? "D" : "W"')
A('[htfMs, htfPh, htfBull] = request.security(syminfo.tickerid, htfTF, [msDir, phase, cIsBull ? 1 : 0], lookahead=barmerge.lookahead_off)')
A('[h4H, h4L] = request.security(syminfo.tickerid, "240", [high[1], low[1]], lookahead=barmerge.lookahead_off)')
A('[dH, dL] = request.security(syminfo.tickerid, "D", [high[1], low[1]], lookahead=barmerge.lookahead_off)')
A('[wkH, wkL] = request.security(syminfo.tickerid, "W", [high[1], low[1]], lookahead=barmerge.lookahead_off)')
# DD/DT — זהה לאסטרטגיה
A(re.search(r"A\('''ch240 = ta\.change.*?recN = 10'''\)", gen_bt, re.S).group(0)[5:-4])
A('// אירועים: קרו ב-recN הנרות האחרונים')
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
A('''// ── מעקב מסלול: מערכים מקבילים, סיגנל = שורה ──
var string[] kT = array.new<string>()
var bool[] kL = array.new<bool>()
var float[] kE = array.new<float>()
var float[] kS = array.new<float>()
var float[] kRk = array.new<float>()
var float[] kTg = array.new<float>()
var int[] kB0 = array.new<int>()
var int[] kT0 = array.new<int>()
var string[] kFl = array.new<string>()
var int[] kSes = array.new<int>()
var int[] kPh = array.new<int>()
var int[] kCf = array.new<int>()
var float[] kMFE = array.new<float>()
var float[] kMAE = array.new<float>()
var float[] kMFEs = array.new<float>()
var int[] kStopBar = array.new<int>()
var int[] kB1 = array.new<int>()
var int[] kB2 = array.new<int>()
var int[] kB3 = array.new<int>()
var float[] kMAEb1 = array.new<float>()
var float[] kMAEb2 = array.new<float>()
var int[] kTgBar = array.new<int>()
var float[] kHH = array.new<float>()
var float[] s1 = array.new<float>()
var float[] s2 = array.new<float>()
var float[] s3 = array.new<float>()
var float[] s4 = array.new<float>()
var float[] s5 = array.new<float>()
var float[] s6 = array.new<float>()
var bool[] be2 = array.new<bool>()
var bool[] be3 = array.new<bool>()
var float[] st4 = array.new<float>()
var float[] st6 = array.new<float>()
var float[] kFS = array.new<float>()
var float[] kF0 = array.new<float>()
var float[] kF1 = array.new<float>()
var float[] kF2 = array.new<float>()
var float[] kRet = array.new<float>()
var float[] kPosR = array.new<float>()
var float[] kPosD = array.new<float>()
var float[] kPosW = array.new<float>()
var int[] kFSBar = array.new<int>()
var int[] kF0Bar = array.new<int>()
var int[] kF1Bar = array.new<int>()
var int[] kF2Bar = array.new<int>()
var label[] pLogs = array.new<label>()
// ── פיבונאצ'י לפי הקורס (4-5, 4-6): תנועה אחת, מפתיל לפתיל — מהפיבוט האחרון עד הקיצון שאחריו. אזור הזהב 0.618–0.786 (+0.5).
// סטופ פיבו = מעבר ל-1.0 (תחילת התנועה). יעדים: 0 (קצה התנועה = נזילות), 1.272 ו-1.618 (הרחבות). מיקום בטווח: תהליך/100 נרות, יומי, שבועי (25-9)
legLenL = not na(lastPLi) ? math.max(1, math.min(bar_index - lastPLi + 1, 500)) : 1
legLenS = not na(lastPHi) ? math.max(1, math.min(bar_index - lastPHi + 1, 500)) : 1
legHiL = ta.highest(high, legLenL)
legLoS = ta.lowest(low, legLenS)
f_rm(int i) =>
    array.remove(kT, i), array.remove(kL, i), array.remove(kE, i), array.remove(kS, i), array.remove(kRk, i), array.remove(kTg, i)
    array.remove(kB0, i), array.remove(kT0, i), array.remove(kFl, i), array.remove(kSes, i), array.remove(kPh, i), array.remove(kCf, i)
    array.remove(kMFE, i), array.remove(kMAE, i), array.remove(kMFEs, i), array.remove(kStopBar, i), array.remove(kB1, i), array.remove(kB2, i), array.remove(kB3, i)
    array.remove(kMAEb1, i), array.remove(kMAEb2, i), array.remove(kTgBar, i), array.remove(kHH, i)
    array.remove(s1, i), array.remove(s2, i), array.remove(s3, i), array.remove(s4, i), array.remove(s5, i), array.remove(s6, i)
    array.remove(be2, i), array.remove(be3, i), array.remove(st4, i), array.remove(st6, i)
    array.remove(kFS, i), array.remove(kF0, i), array.remove(kF1, i), array.remove(kF2, i), array.remove(kRet, i), array.remove(kPosR, i), array.remove(kPosD, i), array.remove(kPosW, i)
    array.remove(kFSBar, i), array.remove(kF0Bar, i), array.remove(kF1Bar, i), array.remove(kF2Bar, i)
f_add(string typ, bool isL, float stopPx, float entryPx) =>
    rk = math.abs(entryPx - stopPx)
    ok = rk > 0 and (isL ? entryPx > stopPx : entryPx < stopPx)
    if ok
        // יעד מבני: הצד השני של הטווח בתהליך, אחרת בריכת נזילות, אחרת קיצון 100 נרות. חייב להיות מעבר לכניסה
        float tg = isL ? (phase > 0 and not na(rHi) and rHi > entryPx ? rHi : not na(poolHi) and poolHi > entryPx ? poolHi : hi100 > entryPx ? hi100 : na) : (phase > 0 and not na(rLo) and rLo < entryPx ? rLo : not na(poolLo) and poolLo < entryPx ? poolLo : lo100 < entryPx ? lo100 : na)
        array.push(kT, typ), array.push(kL, isL), array.push(kE, entryPx), array.push(kS, stopPx), array.push(kRk, rk), array.push(kTg, tg)
        array.push(kB0, bar_index), array.push(kT0, time), array.push(kFl, f_flags(isL)), array.push(kSes, sesIdx), array.push(kPh, phase), array.push(kCf, isL ? confBull : confBear)
        array.push(kMFE, 0.0), array.push(kMAE, 0.0), array.push(kMFEs, 0.0), array.push(kStopBar, -1), array.push(kB1, -1), array.push(kB2, -1), array.push(kB3, -1)
        array.push(kMAEb1, 0.0), array.push(kMAEb2, 0.0), array.push(kTgBar, -1), array.push(kHH, entryPx)
        array.push(s1, float(na)), array.push(s2, float(na)), array.push(s3, float(na)), array.push(s4, float(na)), array.push(s5, float(na)), array.push(s6, float(na))
        array.push(be2, false), array.push(be3, false), array.push(st4, stopPx), array.push(st6, stopPx)
        float legLo = isL ? lastPL : legLoS
        float legHi = isL ? legHiL : lastPH
        float leg = legHi - legLo
        bool legOk = not na(legLo) and not na(legHi) and leg > 0
        float ret = legOk ? (isL ? (legHi - entryPx) / leg : (entryPx - legLo) / leg) : na
        float fs = legOk ? (isL ? legLo * (1 - stopBuf / 100.0) : legHi * (1 + stopBuf / 100.0)) : na
        float t0 = legOk ? (isL ? legHi : legLo) : na
        float t1 = legOk ? (isL ? legHi + 0.272 * leg : legLo - 0.272 * leg) : na
        float t2 = legOk ? (isL ? legHi + 0.618 * leg : legLo - 0.618 * leg) : na
        float posR = pdHi > pdLo ? (entryPx - pdLo) / (pdHi - pdLo) : na
        float posD = dH > dL ? (entryPx - dL) / (dH - dL) : na
        float posW = wkH > wkL ? (entryPx - wkL) / (wkH - wkL) : na
        array.push(kFS, fs), array.push(kF0, t0), array.push(kF1, t1), array.push(kF2, t2), array.push(kRet, ret), array.push(kPosR, posR), array.push(kPosD, posD), array.push(kPosW, posW)
        array.push(kFSBar, -1), array.push(kF0Bar, -1), array.push(kF1Bar, -1), array.push(kF2Bar, -1)
        if array.size(kT) > 80
            f_rm(0)
    ok
f_s(float v) => na(v) ? "n" : str.tostring(v, "#.##")
// ── עדכון כל הסיגנלים הפתוחים (הנר הנוכחי = נר אחרי הסיגנל) ──
if array.size(kT) > 0
    for i = array.size(kT) - 1 to 0
        isL = array.get(kL, i)
        e = array.get(kE, i)
        rk = array.get(kRk, i)
        bars = bar_index - array.get(kB0, i)
        fav = (isL ? high - e : e - low) / rk
        adv = (isL ? e - low : high - e) / rk
        stopHit = adv >= 1
        wasStopped = array.get(kStopBar, i) >= 0
        if not wasStopped and not stopHit
            array.set(kMFEs, i, math.max(array.get(kMFEs, i), fav))
        if not wasStopped and stopHit
            array.set(kStopBar, i, bars)
        array.set(kMFE, i, math.max(array.get(kMFE, i), fav))
        array.set(kMAE, i, math.max(array.get(kMAE, i), adv))
        alive = not wasStopped and not stopHit
        if array.get(kB1, i) < 0
            array.set(kMAEb1, i, math.max(array.get(kMAEb1, i), adv))
            if alive and fav >= 1
                array.set(kB1, i, bars)
        if array.get(kB2, i) < 0
            array.set(kMAEb2, i, math.max(array.get(kMAEb2, i), adv))
            if alive and fav >= 2
                array.set(kB2, i, bars)
        if array.get(kB3, i) < 0 and alive and fav >= 3
            array.set(kB3, i, bars)
        tg = array.get(kTg, i)
        if array.get(kTgBar, i) < 0 and alive and not na(tg) and (isL ? high >= tg : low <= tg)
            array.set(kTgBar, i, bars)
        fsPx = array.get(kFS, i)
        if array.get(kFSBar, i) < 0 and not na(fsPx) and (isL ? low <= fsPx : high >= fsPx)
            array.set(kFSBar, i, bars)
        if array.get(kF0Bar, i) < 0 and not na(array.get(kF0, i)) and (isL ? high >= array.get(kF0, i) : low <= array.get(kF0, i))
            array.set(kF0Bar, i, bars)
        if array.get(kF1Bar, i) < 0 and not na(array.get(kF1, i)) and (isL ? high >= array.get(kF1, i) : low <= array.get(kF1, i))
            array.set(kF1Bar, i, bars)
        if array.get(kF2Bar, i) < 0 and not na(array.get(kF2, i)) and (isL ? high >= array.get(kF2, i) : low <= array.get(kF2, i))
            array.set(kF2Bar, i, bars)
        // S1: סטופ הקורס + יעד 1:3
        if na(array.get(s1, i))
            if stopHit
                array.set(s1, i, -1.0)
            else if fav >= 3
                array.set(s1, i, 3.0)
        // S2: חצי ב-1R + סטופ לאיזון, חצי ב-3R · S3: חצי ב-1R + איזון, חצי ב-2R
        atBE = isL ? low <= e : high >= e
        if na(array.get(s2, i))
            if not array.get(be2, i)
                if stopHit
                    array.set(s2, i, -1.0)
                else if fav >= 1
                    array.set(be2, i, true)
                    if fav >= 3
                        array.set(s2, i, 2.0)
            else if atBE
                array.set(s2, i, 0.5)
            else if fav >= 3
                array.set(s2, i, 2.0)
        if na(array.get(s3, i))
            if not array.get(be3, i)
                if stopHit
                    array.set(s3, i, -1.0)
                else if fav >= 1
                    array.set(be3, i, true)
                    if fav >= 2
                        array.set(s3, i, 1.5)
            else if atBE
                array.set(s3, i, 0.5)
            else if fav >= 2
                array.set(s3, i, 1.5)
        // S4: איזון אחרי 1R ואז גרירה לפי פיבוטים · S6: איזון אחרי 1R ואז שנדלייר (קיצון − 1R)
        if na(array.get(s4, i))
            stp = array.get(st4, i)
            if isL ? low <= stp : high >= stp
                array.set(s4, i, (isL ? stp - e : e - stp) / rk)
            else
                if array.get(kB1, i) >= 0
                    stp := isL ? math.max(stp, e) : math.min(stp, e)
                    if isL and not na(lastPL) and lastPL > stp and lastPL < close
                        stp := lastPL
                    if not isL and not na(lastPH) and lastPH < stp and lastPH > close
                        stp := lastPH
                array.set(st4, i, stp)
        hh = isL ? math.max(array.get(kHH, i), high) : math.min(array.get(kHH, i), low)
        array.set(kHH, i, hh)
        if na(array.get(s6, i))
            stp = array.get(st6, i)
            if isL ? low <= stp : high >= stp
                array.set(s6, i, (isL ? stp - e : e - stp) / rk)
            else if array.get(kB1, i) >= 0
                stp := isL ? math.max(stp, math.max(e, hh - rk)) : math.min(stp, math.min(e, hh + rk))
                array.set(st6, i, stp)
        // S5: סטופ הקורס + יעד מבני
        if na(array.get(s5, i)) and not na(tg)
            if stopHit
                array.set(s5, i, -1.0)
            else if array.get(kTgBar, i) == bars
                array.set(s5, i, (isL ? tg - e : e - tg) / rk)
        // סוף האופק: רישום
        if bars >= horizon
            curR = (isL ? close - e : e - close) / rk
            tgR = na(tg) ? float(na) : (isL ? tg - e : e - tg) / rk
            txt = "P|" + array.get(kT, i) + "|" + (isL ? "L" : "S") + "|" + str.tostring(array.get(kT0, i)) + "|" + str.tostring(e, "#.####") + "|" + str.tostring(array.get(kS, i), "#.####") + "|" + f_s(tgR) + "|" + array.get(kFl, i) + "|" + str.tostring(array.get(kSes, i)) + "|" + str.tostring(array.get(kPh, i)) + "|" + str.tostring(array.get(kCf, i)) + "|" + f_s(array.get(kMFE, i)) + "|" + f_s(array.get(kMAE, i)) + "|" + f_s(array.get(kMFEs, i)) + "|" + str.tostring(array.get(kStopBar, i)) + "|" + str.tostring(array.get(kB1, i)) + "|" + str.tostring(array.get(kB2, i)) + "|" + str.tostring(array.get(kB3, i)) + "|" + f_s(array.get(kMAEb1, i)) + "|" + f_s(array.get(kMAEb2, i)) + "|" + str.tostring(array.get(kTgBar, i)) + "|" + f_s(array.get(s1, i)) + "|" + f_s(array.get(s2, i)) + "|" + f_s(array.get(s3, i)) + "|" + f_s(array.get(s4, i)) + "|" + f_s(array.get(s5, i)) + "|" + f_s(array.get(s6, i)) + "|" + f_s(curR) + "|" + f_s(array.get(kRet, i)) + "|" + f_s(na(array.get(kFS, i)) ? float(na) : (isL ? e - array.get(kFS, i) : array.get(kFS, i) - e) / rk) + "|" + f_s(na(array.get(kF0, i)) ? float(na) : (isL ? array.get(kF0, i) - e : e - array.get(kF0, i)) / rk) + "|" + f_s(na(array.get(kF1, i)) ? float(na) : (isL ? array.get(kF1, i) - e : e - array.get(kF1, i)) / rk) + "|" + f_s(na(array.get(kF2, i)) ? float(na) : (isL ? array.get(kF2, i) - e : e - array.get(kF2, i)) / rk) + "|" + str.tostring(array.get(kFSBar, i)) + "|" + str.tostring(array.get(kF0Bar, i)) + "|" + str.tostring(array.get(kF1Bar, i)) + "|" + str.tostring(array.get(kF2Bar, i)) + "|" + f_s(array.get(kPosR, i)) + "|" + f_s(array.get(kPosD, i)) + "|" + f_s(array.get(kPosW, i))
            lb = label.new(bar_index, close, txt, xloc=xloc.bar_index, style=label.style_none, textcolor=color.new(color.white, 100), size=size.tiny)
            array.push(pLogs, lb)
            if array.size(pLogs) > 490
                label.delete(array.shift(pLogs))
            f_rm(i)
// ── סיגנלים חדשים (אותם טריגרים וסטופים כמו במנוע הבקטסט של הגרף) ──
buf2 = stopBuf / 100.0
if flyLong or flyShort
    f_add("F", flyLong, flyLong ? math.min(nz(cExt, low), nz(lastPL, low)) * (1 - buf2) : math.max(nz(cExt, high), nz(lastPH, high)) * (1 + buf2), close)
    // G = טיסה עם הסטופ של המשתמש: מתחת לשפל שיצר את ה-BOS/צ'וץ' (הפיבוט האחרון), לא הנמוך מבין שניהם
    f_add("G", flyLong, flyLong ? nz(lastPL, low) * (1 - buf2) : nz(lastPH, high) * (1 + buf2), close)
if wingLong or wingShort
    f_add("W", wingLong, wingLong ? nz(lastPL, low) * (1 - buf2) : nz(lastPH, high) * (1 + buf2), close)
if obLong or obShort
    f_add("O", obLong, obLong ? obLBot * (1 - buf2) : obSTop * (1 + buf2), close)
if wSig or mSig
    f_add("M", wSig, wSig ? nz(wLow2, low) * (1 - buf2) : nz(mHigh2, high) * (1 + buf2), close)
// R = אורדר בלוק בכניסה בריטסט (הקורס 12-6: לימיט 21% לתוך הבלוק מהקצה הקרוב, סטופ מעבר לקצה הרחוק), עד 30 נרות להתמלא
var float[] pdPx = array.new<float>()
var float[] pdSt = array.new<float>()
var int[] pdBar = array.new<int>()
var bool[] pdL = array.new<bool>()
var int obRetSignals = 0
var int obRetFills = 0
if obLong or obShort
    obRetSignals += 1
    array.push(pdPx, obLong ? obLTop - 0.21 * (obLTop - obLBot) : obSBot + 0.21 * (obSTop - obSBot))
    array.push(pdSt, obLong ? obLBot * (1 - buf2) : obSTop * (1 + buf2))
    array.push(pdBar, bar_index)
    array.push(pdL, obLong)
if array.size(pdPx) > 0
    for pi = array.size(pdPx) - 1 to 0
        pL = array.get(pdL, pi)
        pPx = array.get(pdPx, pi)
        if bar_index - array.get(pdBar, pi) > 30
            array.remove(pdPx, pi), array.remove(pdSt, pi), array.remove(pdBar, pi), array.remove(pdL, pi)
        else if bar_index > array.get(pdBar, pi) and (pL ? low <= pPx : high >= pPx)
            obRetFills += 1
            f_add("R", pL, array.get(pdSt, pi), pPx)
            array.remove(pdPx, pi), array.remove(pdSt, pi), array.remove(pdBar, pi), array.remove(pdL, pi)
// X = "3 אישורים = טריגר" (המשתמש): אישור חדש מגיע כשכבר יש 3+ אישורים בכיוון. סטופ מתחת למבנה שיצר את האישורים (פיבוט אחרון / שפל 10 נרות)
xCntL = (evL_bos ? 1 : 0) + (evL_choch ? 1 : 0) + (evL_sweep ? 1 : 0) + (evL_smt ? 1 : 0) + (evL_ismt ? 1 : 0) + (evL_ifvg ? 1 : 0) + (evL_fvg ? 1 : 0) + (evL_judas ? 1 : 0) + (evL_tweezer ? 1 : 0) + (evL_shake ? 1 : 0) + (evL_volC ? 1 : 0) + (evL_lps ? 1 : 0) + (evL_gap ? 1 : 0) + (evL_ob ? 1 : 0) + (evL_wm ? 1 : 0) + (evL_ddt ? 1 : 0) + (evL_bb ? 1 : 0) + (evL_fvgAt ? 1 : 0) + (evL_ifvgAt ? 1 : 0) + (evL_atPool ? 1 : 0) + (evL_orBrk ? 1 : 0) + (evL_climax ? 1 : 0) + (atIceL ? 1 : 0) + (atHtfL ? 1 : 0) + (atSesL ? 1 : 0) + (testOK ? 1 : 0)
xCntS = (evS_bos ? 1 : 0) + (evS_choch ? 1 : 0) + (evS_sweep ? 1 : 0) + (evS_smt ? 1 : 0) + (evS_ismt ? 1 : 0) + (evS_ifvg ? 1 : 0) + (evS_fvg ? 1 : 0) + (evS_judas ? 1 : 0) + (evS_tweezer ? 1 : 0) + (evS_shake ? 1 : 0) + (evS_volC ? 1 : 0) + (evS_lps ? 1 : 0) + (evS_gap ? 1 : 0) + (evS_ob ? 1 : 0) + (evS_wm ? 1 : 0) + (evS_ddt ? 1 : 0) + (evS_bb ? 1 : 0) + (evS_fvgAt ? 1 : 0) + (evS_ifvgAt ? 1 : 0) + (evS_atPool ? 1 : 0) + (evS_orBrk ? 1 : 0) + (evS_climax ? 1 : 0) + (atCreekS ? 1 : 0) + (atHtfS ? 1 : 0) + (atSesS ? 1 : 0) + (testOK ? 1 : 0)
var int xLastL = -100
var int xLastS = -100
xL = xCntL >= 3 and xCntL > xCntL[1] and bar_index - xLastL > 10 and barstate.isconfirmed
xS = xCntS >= 3 and xCntS > xCntS[1] and bar_index - xLastS > 10 and barstate.isconfirmed
if xL
    xLastL := bar_index
    f_add("X", true, math.min(nz(lastPL, low), lo10) * (1 - buf2), close)
if xS
    xLastS := bar_index
    f_add("X", false, math.max(nz(lastPH, high), hi10) * (1 + buf2), close)
// טריגר פריצה (בקשת המשתמש): BOS/CHoCH בפאזה C או E, סטופ מעבר לפיבוט האחרון
brkL = (bosUp or chochUp) and (phase == 3 or phase == 5) and barstate.isconfirmed
brkS = (bosDn or chochDn) and (phase == 3 or phase == 5) and barstate.isconfirmed
if brkL or brkS
    f_add("B", brkL, brkL ? nz(lastPL, low) * (1 - buf2) : nz(lastPH, high) * (1 + buf2), close)
var int firstT = na
if na(firstT)
    firstT := time
var label metaLb = na
// כל תוויות הלוג מוזזות לנר האחרון: ה-API של הגרף חושף רק ציורים בטווח הנראה
if barstate.islast and array.size(pLogs) > 0
    for j = 0 to array.size(pLogs) - 1
        label.set_x(array.get(pLogs, j), bar_index)
if barstate.islast
    label.delete(metaLb)
    metaLb := label.new(bar_index, close, "META|" + syminfo.tickerid + "|" + timeframe.period + "|" + str.tostring(bar_index + 1) + "|" + str.tostring(firstT) + "|" + str.tostring(time) + "|open" + str.tostring(array.size(kT)) + "|obRet" + str.tostring(obRetFills) + "/" + str.tostring(obRetSignals), xloc=xloc.bar_index, style=label.style_none, textcolor=color.new(color.white, 100), size=size.tiny)''')
text = '\n'.join(head + out) + '\n'
(ROOT / 'pine/htt_pathlab.pine').write_text(text, encoding='utf-8')
print('ok', text.count('\n'), 'lines')
