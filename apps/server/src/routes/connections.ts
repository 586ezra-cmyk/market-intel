import { Router, Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { getDb } from '../db/client'


// ─── Pine Script (embedded — always in sync with server deploy) ───────────────
// Version: v2 — Volume Climax (Percentile) + BB + iFVG + semicolon-free
const PINE_SCRIPT = `// ============================================================
// ICT Master Indicator — מערכת מסחר חכמה
// Combines: Market Structure + FVG + iFVG + Liquidity + SMT + iSMT +
//           Wyckoff + Kill Zones + Dealing Range + Session H/L +
//           Order Block + Judas Swing + Po3 + Opening Range +
//           Bollinger Bands + Volume Climax (Percentile-Based)
//
// Pine Script v6
// Usage: Add this ONE indicator to your chart.
//        Set ONE alert with "any alert() call" → your webhook URL.
// ============================================================
//@version=6
indicator("ICT Master — מסחר חכם", overlay=true, max_bars_back=500,
          max_lines_count=200, max_boxes_count=100, max_labels_count=200)

// ─── SETTINGS ────────────────────────────────────────────────────────────────
grpWebhook = "⚙️ Webhook"
secret      = input.string("dev-secret", "Secret",           group=grpWebhook)

grpDisplay  = "🎨 תצוגה"
showStruct  = input.bool(true,  "מבנה שוק (BOS/CHoCH)",     group=grpDisplay)
showFVG     = input.bool(true,  "FVG + iFVG",                group=grpDisplay)
showLiq     = input.bool(true,  "נזילות (Equal H/L)",         group=grpDisplay)
showRange   = input.bool(true,  "Dealing Range",               group=grpDisplay)
showKZ      = input.bool(true,  "Kill Zones",                  group=grpDisplay)
showWyckoff = input.bool(true,  "Wyckoff",                     group=grpDisplay)
showSMT     = input.bool(true,  "SMT",                         group=grpDisplay)
showISMT    = input.bool(true,  "iSMT (2-candle)",            group=grpDisplay)
showOB      = input.bool(true,  "Order Block",                 group=grpDisplay)
showOR      = input.bool(true,  "Opening Range + Po3",         group=grpDisplay)

grpBB       = "📊 Bollinger Bands"
showBB      = input.bool(true,  "Bollinger Bands",             group=grpBB)
bbLength    = input.int(20,     "Length",                      group=grpBB, minval=1)
bbMult      = input.float(2.0,  "Multiplier",                  group=grpBB, minval=0.1)

grpVol      = "📈 Volume Climax"
showVolume  = input.bool(true,  "סימון ווליום קיצוני",          group=grpVol)
volLookback = input.int(250,    "חלון השוואה (נרות)",           group=grpVol, minval=50, maxval=500,
                                tooltip="250 נרות ≈ שנה ב-15m | 365 ב-1h | 52 ב-1D")
volClimaxPct = input.int(95,    "סף Climax (%)",                group=grpVol, minval=80, maxval=99,
                                tooltip="95 = טופ 5% | 99 = טופ 1%")
volLowPct    = input.int(15,    "סף נמוך — No Supply/Demand (%)", group=grpVol, minval=1, maxval=30)

grpSMT      = "⚡ SMT / iSMT"
asset2      = input.symbol("BINANCE:ETHUSDT", "Correlated asset", group=grpSMT)

grpConf     = "🎯 Confluence"
minFactors  = input.int(2, "Minimum factors for alert", minval=1, maxval=6, group=grpConf)
requireKZ   = input.bool(true, "Require Kill Zone",           group=grpConf)

// ─── HELPERS ─────────────────────────────────────────────────────────────────
h      = hour(time, "UTC")
atr    = ta.atr(14)

isLondon = h >= 7  and h < 11
isNY     = h >= 13 and h < 16
isAsian  = h >= 20 or  h < 4
isKZ     = isLondon or isNY

// ─── VOLUME — Percentile-Based ────────────────────────────────────────────────
volRank      = ta.percentrank(volume, volLookback)   // 0–100 percentile over lookback
volIsClimax  = volRank >= volClimaxPct               // top 5% by default
volIsLow     = volRank <= volLowPct                  // bottom 15% by default

isBullCandle = close >= open
isBearCandle = close < open

// Volume Climax types
sellingClimax  = showVolume and volIsClimax and isBearCandle   // SC — Phase A down
buyingClimax   = showVolume and volIsClimax and isBullCandle   // BC — Phase A up
noSupply       = showVolume and volIsLow    and isBullCandle   // weak up = No Supply → bearish
noDemand       = showVolume and volIsLow    and isBearCandle   // weak down = No Demand → bullish test

// Visual — background highlight for climax candles (subtle)
bgcolor(sellingClimax ? color.new(color.red,    88) : na, title="Selling Climax")
bgcolor(buyingClimax  ? color.new(color.green,  88) : na, title="Buying Climax")
bgcolor(noSupply      ? color.new(color.orange, 90) : na, title="No Supply")
bgcolor(noDemand      ? color.new(color.lime,   90) : na, title="No Demand")

// Labels for climax
if sellingClimax
    label.new(bar_index, low - atr * 0.8, "💥 SC",
              style=label.style_label_up, color=color.new(color.red, 20),
              textcolor=color.white, size=size.small,
              tooltip="Selling Climax — ווליום קיצוני שורטי | דרגה: " + str.tostring(math.round(volRank)) + "%")
if buyingClimax
    label.new(bar_index, high + atr * 0.8, "💥 BC",
              style=label.style_label_down, color=color.new(color.green, 20),
              textcolor=color.white, size=size.small,
              tooltip="Buying Climax — ווליום קיצוני לונגי | דרגה: " + str.tostring(math.round(volRank)) + "%")
if noSupply
    label.new(bar_index, high + atr * 0.5, "NS",
              style=label.style_label_down, color=color.new(color.orange, 30),
              textcolor=color.white, size=size.tiny,
              tooltip="No Supply — ווליום נמוך בעליה | " + str.tostring(math.round(volRank)) + "%")
if noDemand
    label.new(bar_index, low - atr * 0.5, "ND",
              style=label.style_label_up, color=color.new(color.lime, 30),
              textcolor=color.black, size=size.tiny,
              tooltip="No Demand — ווליום נמוך בירידה | " + str.tostring(math.round(volRank)) + "%")

// ─── KILL ZONES ───────────────────────────────────────────────────────────────
bgcolor(showKZ and isLondon ? color.new(color.blue,  92) : na, title="London KZ")
bgcolor(showKZ and isNY     ? color.new(color.green, 92) : na, title="NY KZ")

if showKZ and isLondon and not isLondon[1]
    label.new(bar_index, high + atr, "🇬🇧 London KZ",
              style=label.style_label_down, color=color.new(color.blue, 40),
              textcolor=color.white, size=size.tiny)
if showKZ and isNY and not isNY[1]
    label.new(bar_index, high + atr, "🗽 NY KZ",
              style=label.style_label_down, color=color.new(color.green, 40),
              textcolor=color.white, size=size.tiny)

// ─── DEALING RANGE ────────────────────────────────────────────────────────────
isLowTF   = timeframe.in_seconds() <= 900

var float asianH   = na
var float asianL   = na
var bool  wasAsian = false

if isAsian and not wasAsian
    asianH   := high
    asianL   := low
    wasAsian := true
else if isAsian
    asianH := math.max(asianH, high)
    asianL := math.min(asianL, low)
else
    wasAsian := false

ph5  = ta.pivothigh(high, 5, 5)
pl5  = ta.pivotlow(low, 5, 5)
var float swingH = na
var float swingL = na
if not na(ph5)
    swingH := ph5
if not na(pl5)
    swingL := pl5

rangeH   = isLowTF ? asianH : swingH
rangeL   = isLowTF ? asianL : swingL
rangeMid = not na(rangeH) and not na(rangeL) ? (rangeH + rangeL) / 2 : na

// Premium / Discount relative to Dealing Range
inPremium  = not na(rangeMid) and close > rangeMid
inDiscount = not na(rangeMid) and close < rangeMid
rangePos   = not na(rangeH) and not na(rangeL) and (rangeH - rangeL) > 0 ? math.round((close - rangeL) / (rangeH - rangeL) * 100) : 50
dealingZone = inPremium ? "premium" : inDiscount ? "discount" : "midpoint"

if showRange and barstate.islast and not na(rangeH)
    box.new(bar_index - 80, rangeH, bar_index + 20, rangeL,
            border_color=color.new(color.blue, 60),
            bgcolor=color.new(color.blue, 97))
    line.new(bar_index - 80, rangeMid, bar_index + 20, rangeMid,
             color=color.new(color.blue, 50), style=line.style_dashed)

// ─── MARKET STRUCTURE ────────────────────────────────────────────────────────
var float lastSH    = na
var float lastSL    = na
var string msTrend  = "neutral"

if not na(ph5)
    lastSH := ph5
if not na(pl5)
    lastSL := pl5

bullBOS   = not na(lastSH) and close > lastSH and msTrend == "bullish"
bullCHoCH = not na(lastSH) and close > lastSH and msTrend != "bullish"
bearBOS   = not na(lastSL) and close < lastSL and msTrend == "bearish"
bearCHoCH = not na(lastSL) and close < lastSL and msTrend != "bearish"

if bullBOS or bullCHoCH
    msTrend := "bullish"
if bearBOS or bearCHoCH
    msTrend := "bearish"

hasBOS    = bullBOS or bearBOS or bullCHoCH or bearCHoCH
structDir = (bullBOS or bullCHoCH) ? "bullish" : "bearish"

if showStruct
    if bullBOS
        label.new(bar_index, low  - atr*0.5, "BOS ▲",   style=label.style_label_up,   color=color.new(color.green,  20), textcolor=color.white, size=size.tiny)
    if bullCHoCH
        label.new(bar_index, low  - atr*0.5, "CHoCH ▲", style=label.style_label_up,   color=color.new(color.lime,   10), textcolor=color.black, size=size.tiny)
    if bearBOS
        label.new(bar_index, high + atr*0.5, "BOS ▼",   style=label.style_label_down, color=color.new(color.red,    20), textcolor=color.white, size=size.tiny)
    if bearCHoCH
        label.new(bar_index, high + atr*0.5, "CHoCH ▼", style=label.style_label_down, color=color.new(color.orange, 10), textcolor=color.black, size=size.tiny)

// ─── FVG ─────────────────────────────────────────────────────────────────────
bullFVG = low > high[2] and math.abs(close[1] - open[1]) > 1.5 * atr[1]
bearFVG = high < low[2] and math.abs(close[1] - open[1]) > 1.5 * atr[1]

if showFVG
    if bullFVG
        box.new(bar_index - 2, low,    bar_index + 50, high[2], border_color=color.new(color.green, 60), bgcolor=color.new(color.green, 92))
    if bearFVG
        box.new(bar_index - 2, low[2], bar_index + 50, high,    border_color=color.new(color.red,   60), bgcolor=color.new(color.red,   92))

hasFVG   = bullFVG or bearFVG
fvgDir   = bullFVG ? "bullish" : "bearish"

// ─── iFVG (Inverse FVG — retest of a filled gap) ─────────────────────────────
var float bullFVGtop = na
var float bullFVGbot = na
var float bearFVGtop = na
var float bearFVGbot = na

if bullFVG
    bullFVGtop := low
    bullFVGbot := high[2]
if bearFVG
    bearFVGtop := low[2]
    bearFVGbot := high

// Bullish iFVG: price drops back into bullish FVG zone = discount retest
bullIFVG = showFVG and not na(bullFVGbot) and low <= bullFVGtop and close >= bullFVGbot and close > open
// Bearish iFVG: price rises back into bearish FVG zone = premium retest
bearIFVG = showFVG and not na(bearFVGtop) and high >= bearFVGbot and close <= bearFVGtop and close < open

hasIFVG  = bullIFVG or bearIFVG
ifvgDir  = bullIFVG ? "bullish" : "bearish"

if bullIFVG
    label.new(bar_index, low  - atr*0.4, "iFVG ▲", style=label.style_label_up,   color=color.new(color.teal, 30), textcolor=color.white, size=size.tiny)
if bearIFVG
    label.new(bar_index, high + atr*0.4, "iFVG ▼", style=label.style_label_down, color=color.new(color.teal, 30), textcolor=color.white, size=size.tiny)

// ─── LIQUIDITY ────────────────────────────────────────────────────────────────
tol         = close * 0.0005
eqHigh      = math.abs(high - ta.highest(high, 20)[1]) < tol
eqLow       = math.abs(low  - ta.lowest(low,  20)[1])  < tol
sweepH      = not na(lastSH) and high > lastSH and close < lastSH
sweepL      = not na(lastSL) and low  < lastSL and close > lastSL
hasLiqSweep = sweepH or sweepL
sweepDir    = sweepH ? "bearish" : "bullish"

if showLiq
    if eqHigh
        line.new(bar_index - 1, high, bar_index + 20, high, color=color.new(color.yellow, 40), style=line.style_dotted)
    if eqLow
        line.new(bar_index - 1, low,  bar_index + 20, low,  color=color.new(color.yellow, 40), style=line.style_dotted)
    if sweepH
        label.new(bar_index, high + atr*0.3, "⚡ Sweep H", style=label.style_label_down, color=color.new(color.red,   30), textcolor=color.white, size=size.tiny)
    if sweepL
        label.new(bar_index, low  - atr*0.3, "⚡ Sweep L", style=label.style_label_up,   color=color.new(color.green, 30), textcolor=color.white, size=size.tiny)

// ─── SMT ─────────────────────────────────────────────────────────────────────
[b_h, b_l, b_c] = request.security(asset2, timeframe.period, [high, low, close])

var float sPH1 = na
var float sPH2 = na
var float sPL1 = na
var float sPL2 = na
var float pPH1 = na
var float pPH2 = na
var float pPL1 = na
var float pPL2 = na

ph3  = ta.pivothigh(high, 3, 3)
pl3  = ta.pivotlow(low, 3, 3)
ph3b = ta.pivothigh(b_h, 3, 3)
pl3b = ta.pivotlow(b_l, 3, 3)

if not na(ph3)
    pPH1 := sPH1
    sPH1 := ph3
if not na(ph3b)
    pPH2 := sPH2
    sPH2 := ph3b
if not na(pl3)
    pPL1 := sPL1
    sPL1 := pl3
if not na(pl3b)
    pPL2 := sPL2
    sPL2 := pl3b

bearSMT  = showSMT and not na(sPH1) and not na(pPH1) and sPH1 > pPH1 and not na(sPH2) and sPH2 <= pPH2
bullSMT  = showSMT and not na(sPL1) and not na(pPL1) and sPL1 < pPL1 and not na(sPL2) and sPL2 >= pPL2
hasSMT   = bearSMT or bullSMT
smtDir   = bearSMT ? "bearish" : "bullish"

if bearSMT
    label.new(bar_index, high + atr, "⚡ SMT ▼", style=label.style_label_down, color=color.new(color.fuchsia, 20), textcolor=color.white, size=size.small)
if bullSMT
    label.new(bar_index, low  - atr, "⚡ SMT ▲", style=label.style_label_up,   color=color.new(color.fuchsia, 20), textcolor=color.white, size=size.small)

// ─── iSMT (2-candle) ─────────────────────────────────────────────────────────
validISMTtf = timeframe.in_seconds() <= 3600
bearISMT = showISMT and validISMTtf and high  > high[1] and close  < high[1] and not (b_h > b_h[1] and b_c > b_h[1])
bullISMT = showISMT and validISMTtf and low   < low[1]  and close  > low[1]  and not (b_l < b_l[1] and b_c < b_l[1])
hasISMT  = bearISMT or bullISMT
ismtDir  = bearISMT ? "bearish" : "bullish"

if bearISMT
    label.new(bar_index, high + atr*0.8, "⚡ iSMT ▼", style=label.style_label_down, color=color.new(color.fuchsia, 10), textcolor=color.white, size=size.small)
if bullISMT
    label.new(bar_index, low  - atr*0.8, "⚡ iSMT ▲", style=label.style_label_up,   color=color.new(color.fuchsia, 10), textcolor=color.white, size=size.small)

// ─── WYCKOFF ─────────────────────────────────────────────────────────────────
wRangeH  = ta.highest(high, 20)[1]
wRangeL  = ta.lowest(low,  20)[1]

// Spring: sweep below range low + close back inside + bullish candle + NO supply (low volume = authentic spring)
// Upthrust: sweep above range high + close back inside + bearish candle + NO demand
spring   = showWyckoff and low < wRangeL and close > wRangeL and close > open and (volIsLow or not volIsClimax)
upthrust = showWyckoff and high > wRangeH and close < wRangeH and close < open and (volIsLow or not volIsClimax)

// Selling Climax + Buying Climax as Wyckoff Phase A markers
wyckoffSC = showWyckoff and sellingClimax and low <= wRangeL
wyckoffBC = showWyckoff and buyingClimax  and high >= wRangeH

hasWyckoff   = spring or upthrust or wyckoffSC or wyckoffBC
wyckoffPhase = spring or wyckoffSC ? "accumulation" : "distribution"

if spring
    label.new(bar_index, low  - atr * 1.2, "🌱 Spring",    style=label.style_label_up,   color=color.new(color.green, 20), textcolor=color.white)
if upthrust
    label.new(bar_index, high + atr * 1.2, "⬆ Upthrust",   style=label.style_label_down, color=color.new(color.red,   20), textcolor=color.white)
if wyckoffSC
    label.new(bar_index, low  - atr * 1.5, "📉 Wyckoff SC", style=label.style_label_up,   color=color.new(color.red,   10), textcolor=color.white, size=size.normal)
if wyckoffBC
    label.new(bar_index, high + atr * 1.5, "📈 Wyckoff BC", style=label.style_label_down, color=color.new(color.green, 10), textcolor=color.white, size=size.normal)

// ─── ORDER BLOCK ─────────────────────────────────────────────────────────────
bullDisp2 = math.abs(close - open) > 1.5 * atr and close > open and close > high[1]
bearDisp2 = math.abs(close - open) > 1.5 * atr and close < open and close < low[1]
bullOB2   = showOB and bullDisp2 and close[3] < open[3]
bearOB2   = showOB and bearDisp2 and close[3] > open[3]
hasOB     = bullOB2 or bearOB2
obDir     = bullOB2 ? "bullish" : "bearish"

if bullOB2
    box.new(bar_index - 3, math.max(open[3], close[3]), bar_index + 60, math.min(open[3], close[3]), border_color=color.new(color.green, 50), bgcolor=color.new(color.green, 90))
if bearOB2
    box.new(bar_index - 3, math.max(open[3], close[3]), bar_index + 60, math.min(open[3], close[3]), border_color=color.new(color.red,   50), bgcolor=color.new(color.red,   90))

// ─── BOLLINGER BANDS ─────────────────────────────────────────────────────────
bbBasis  = ta.sma(close, bbLength)
bbStdDev = ta.stdev(close, bbLength)
bbUpper  = bbBasis + bbMult * bbStdDev
bbLower  = bbBasis - bbMult * bbStdDev
bbWidth  = bbUpper - bbLower
bbWidthMA = ta.sma(bbWidth, 20)

aboveBBupper = close > bbUpper
belowBBlower = close < bbLower
bbSqueeze    = bbWidth < bbWidthMA * 0.75

plot(showBB ? bbUpper : na, "BB Upper", color.new(color.purple, 40), 1)
plot(showBB ? bbBasis : na, "BB Basis", color.new(color.purple, 65), 1, plot.style_cross)
plot(showBB ? bbLower : na, "BB Lower", color.new(color.purple, 40), 1)

// ─── OPENING RANGE + Po3 ─────────────────────────────────────────────────────
var float londonORH = na
var float londonORL = na
var bool  londonCap = false
var float nyORH     = na
var float nyORL     = na
var bool  nyCap     = false

isLOR = h == 7  and minute(time, "UTC") < 15
isNOR = h == 13 and minute(time, "UTC") < 15

if isLOR and not londonCap
    londonORH := high
    londonORL := low
    londonCap := true
else if isLOR
    londonORH := math.max(londonORH, high)
    londonORL := math.min(londonORL, low)
else if not isLOR
    londonCap := false

if isNOR and not nyCap
    nyORH := high
    nyORL := low
    nyCap := true
else if isNOR
    nyORH := math.max(nyORH, high)
    nyORL := math.min(nyORL, low)
else if not isNOR
    nyCap := false

plot(showOR and not isLOR and not na(londonORH) ? londonORH : na, "London OR H", color.new(color.blue, 30),  1, plot.style_linebr)
plot(showOR and not isLOR and not na(londonORL) ? londonORL : na, "London OR L", color.new(color.blue, 30),  1, plot.style_linebr)
plot(showOR and not isNOR  and not na(nyORH)    ? nyORH     : na, "NY OR H",     color.new(color.green, 30), 1, plot.style_linebr)
plot(showOR and not isNOR  and not na(nyORL)    ? nyORL     : na, "NY OR L",     color.new(color.green, 30), 1, plot.style_linebr)

judasBull = showOR and not na(londonORL) and not isLOR and low < londonORL and close > londonORL and close > open
judasBear = showOR and not na(londonORH) and not isLOR and high > londonORH and close < londonORH and close < open
nyJBull   = showOR and not na(nyORL) and not isNOR and low < nyORL and close > nyORL and close > open
nyJBear   = showOR and not na(nyORH) and not isNOR and high > nyORH and close < nyORH and close < open
hasJudas  = judasBull or judasBear or nyJBull or nyJBear

if judasBull or nyJBull
    label.new(bar_index, low - atr, "🎭 Judas ▲", style=label.style_label_up,   color=color.new(color.teal, 20), textcolor=color.white, size=size.small)
if judasBear or nyJBear
    label.new(bar_index, high+atr,  "🎭 Judas ▼", style=label.style_label_down, color=color.new(color.teal, 20), textcolor=color.white, size=size.small)

// ─── CONFLUENCE ENGINE ────────────────────────────────────────────────────────
directionBull = (bullBOS or bullCHoCH or bullISMT or bullSMT or sweepL or judasBull or nyJBull or spring or wyckoffSC or bullIFVG or bullOB2)
directionBear = (bearBOS or bearCHoCH or bearISMT or bearSMT or sweepH or judasBear or nyJBear or upthrust or wyckoffBC or bearIFVG or bearOB2)

confluenceDir = directionBull and not directionBear ? "bullish" : directionBear and not directionBull ? "bearish" : "neutral"

// Volume climax adds 1 factor to confluence (strong signal)
hasVolClimax = sellingClimax or buyingClimax

// Count confirmed factors (max 1 per category)
factorCount = (hasBOS        ? 1 : 0) +
              (hasLiqSweep   ? 1 : 0) +
              (hasFVG         ? 1 : 0) +
              (hasSMT         ? 1 : 0) +
              (hasISMT        ? 1 : 0) +
              (hasWyckoff     ? 1 : 0) +
              (hasOB          ? 1 : 0) +
              (hasIFVG        ? 1 : 0) +
              (hasVolClimax   ? 1 : 0)

confluenceOK = factorCount >= minFactors and (not requireKZ or isKZ) and confluenceDir != "neutral"

// ─── ALERTS ───────────────────────────────────────────────────────────────────
// Uses alert() (not alertcondition) — accepts dynamic series strings.
// In TradingView: create ONE alert → condition = "any alert() call" → webhook URL.

if hasBOS
    alert('{"secret":"' + secret + '","event":"structure","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"type":"' + (bullBOS ? "BOS" : bullCHoCH ? "CHoCH" : bearBOS ? "BOS" : "CHoCH") + '","direction":"' + structDir + '","price":' + str.tostring(close) + ',"confirmed":true}', alert.freq_once_per_bar_close)

if hasFVG
    alert('{"secret":"' + secret + '","event":"fvg_created","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"direction":"' + fvgDir + '","topPrice":' + str.tostring(bullFVG ? low : low[2]) + ',"bottomPrice":' + str.tostring(bullFVG ? high[2] : high) + '}', alert.freq_once_per_bar_close)

if hasIFVG
    alert('{"secret":"' + secret + '","event":"ifvg","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"direction":"' + ifvgDir + '","price":' + str.tostring(close) + '}', alert.freq_once_per_bar_close)

if hasLiqSweep
    alert('{"secret":"' + secret + '","event":"liquidity_sweep","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"high":' + str.tostring(high) + ',"low":' + str.tostring(low) + ',"close":' + str.tostring(close) + '}', alert.freq_once_per_bar_close)

if hasSMT or hasISMT
    alert('{"secret":"' + secret + '","event":"smt","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"asset1":"' + syminfo.ticker + '","asset1Price":' + str.tostring(close) + ',"asset2":"ETHUSDT","asset2Price":' + str.tostring(b_c) + '}', alert.freq_once_per_bar_close)

if spring or wyckoffSC
    alert('{"secret":"' + secret + '","event":"wyckoff","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"phase":"accumulation","subtype":"' + (wyckoffSC ? "selling_climax" : "spring") + '","volRank":' + str.tostring(math.round(volRank)) + ',"confidence":0.80}', alert.freq_once_per_bar_close)

if upthrust or wyckoffBC
    alert('{"secret":"' + secret + '","event":"wyckoff","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"phase":"distribution","subtype":"' + (wyckoffBC ? "buying_climax" : "upthrust") + '","volRank":' + str.tostring(math.round(volRank)) + ',"confidence":0.80}', alert.freq_once_per_bar_close)

if hasOB
    alert('{"secret":"' + secret + '","event":"order_block","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"direction":"' + obDir + '","price":' + str.tostring(close) + '}', alert.freq_once_per_bar_close)

if aboveBBupper or belowBBlower
    alert('{"secret":"' + secret + '","event":"bb_break","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"direction":"' + (aboveBBupper ? "bullish" : "bearish") + '","bbUpper":' + str.tostring(math.round(bbUpper, 2)) + ',"bbLower":' + str.tostring(math.round(bbLower, 2)) + ',"price":' + str.tostring(close) + '}', alert.freq_once_per_bar_close)

if sellingClimax or buyingClimax
    alert('{"secret":"' + secret + '","event":"volume_climax","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"type":"' + (sellingClimax ? "selling_climax" : "buying_climax") + '","direction":"' + (sellingClimax ? "bearish" : "bullish") + '","volRank":' + str.tostring(math.round(volRank)) + ',"price":' + str.tostring(close) + ',"inKillZone":' + str.tostring(isKZ) + ',"dealingZone":"' + dealingZone + '"}', alert.freq_once_per_bar_close)

if noSupply or noDemand
    alert('{"secret":"' + secret + '","event":"volume_low","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"type":"' + (noSupply ? "no_supply" : "no_demand") + '","direction":"' + (noSupply ? "bearish" : "bullish") + '","volRank":' + str.tostring(math.round(volRank)) + ',"price":' + str.tostring(close) + '}', alert.freq_once_per_bar_close)

// ★ MASTER confluence alert — full payload
if confluenceOK
    alert('{"secret":"' + secret + '","event":"confluence","symbol":"' + syminfo.ticker + '","timeframe":"' + timeframe.period + '","time":' + str.tostring(time) + ',"direction":"' + confluenceDir + '","currentPrice":' + str.tostring(close) + ',"factorCount":' + str.tostring(factorCount) + ',"inKillZone":' + str.tostring(isKZ) + ',"killZone":"' + (isLondon ? "london" : isNY ? "ny" : "none") + '","dealingZone":"' + dealingZone + '","rangePosition":' + str.tostring(rangePos) + ',"hasBOSorCHoCH":' + str.tostring(hasBOS) + ',"hasLiquiditySweep":' + str.tostring(hasLiqSweep) + ',"hasFVG":' + str.tostring(hasFVG) + ',"hasIFVG":' + str.tostring(hasIFVG) + ',"hasSMT":' + str.tostring(hasSMT) + ',"hasISMT":' + str.tostring(hasISMT) + ',"hasWyckoff":' + str.tostring(hasWyckoff) + ',"wyckoffPhase":"' + wyckoffPhase + '","hasOB":' + str.tostring(hasOB) + ',"hasJudas":' + str.tostring(hasJudas) + ',"aboveBBupper":' + str.tostring(aboveBBupper) + ',"belowBBlower":' + str.tostring(belowBBlower) + ',"bbSqueeze":' + str.tostring(bbSqueeze) + ',"volRank":' + str.tostring(math.round(volRank)) + ',"hasVolClimax":' + str.tostring(hasVolClimax) + ',"volType":"' + (sellingClimax ? "SC" : buyingClimax ? "BC" : noSupply ? "NS" : noDemand ? "ND" : "normal") + '"}', alert.freq_once_per_bar_close)
`

const router = Router()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSetting(key: string, fallback = ''): string {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? fallback
  } catch { return fallback }
}

function setSetting(key: string, value: string) {
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now)
}

// Effective webhook secret: ENV overrides DB (ENV = production lock-down)
export function getWebhookSecret(): string {
  if (process.env.TV_WEBHOOK_SECRET) return process.env.TV_WEBHOOK_SECRET
  return getSetting('tv_webhook_secret', 'dev-secret')
}

// ─── GET /api/connections ─────────────────────────────────────────────────────
// Returns everything the UI needs — secret is masked but present

router.get('/', (_req: Request, res: Response) => {
  const db = getDb()

  const secret = getWebhookSecret()
  const serverUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : getSetting('server_url', '')

  const webhookUrl = serverUrl
    ? `${serverUrl}/webhook/tradingview`
    : ''

  // Last 20 webhook logs
  const logs = db.prepare(`
    SELECT id, payload, received_at
    FROM webhook_log
    ORDER BY received_at DESC
    LIMIT 20
  `).all() as Array<{ id: string; payload: string; received_at: number }>

  const parsedLogs = logs.map(row => {
    let event = '?'; let symbol = '?'; let ok = true
    try {
      const p = JSON.parse(row.payload)
      event  = p.event  ?? p.type ?? '?'
      symbol = p.symbol ?? '?'
    } catch { ok = false }
    return { id: row.id, event, symbol, receivedAt: row.received_at, ok }
  })

  const telegramOk = !!(getSetting('telegram_token') && getSetting('telegram_chat_id'))

  res.json({
    webhookUrl,
    serverUrl,
    // Show first 6 chars + asterisks so user can confirm it matches
    secretPreview: secret.slice(0, 6) + '••••••••••••••••••',
    secretLength: secret.length,
    envOverride: !!process.env.TV_WEBHOOK_SECRET,
    webhookLogs: parsedLogs,
    telegram: {
      ok: telegramOk,
      token:    getSetting('telegram_token')        ? '••••••••' : '',
      chatId:   getSetting('telegram_chat_id'),
      topics: {
        daily:  getSetting('telegram_topic_daily',  '0'),
        weekly: getSetting('telegram_topic_weekly', '0'),
        high:   getSetting('telegram_topic_high',   '0'),
        news:   getSetting('telegram_topic_news',   '0'),
      },
    },
  })
})

// ─── GET /api/connections/secret ─────────────────────────────────────────────
// Returns the FULL secret (for copy button)

router.get('/secret', (_req: Request, res: Response) => {
  if (process.env.TV_WEBHOOK_SECRET) {
    return res.json({ secret: process.env.TV_WEBHOOK_SECRET, envOverride: true })
  }
  res.json({ secret: getSetting('tv_webhook_secret', 'dev-secret'), envOverride: false })
})

// ─── POST /api/connections/regenerate-secret ──────────────────────────────────

router.post('/regenerate-secret', (_req: Request, res: Response) => {
  if (process.env.TV_WEBHOOK_SECRET) {
    return res.status(400).json({
      ok: false,
      error: 'הסוד מוגדר כמשתנה סביבה (TV_WEBHOOK_SECRET) — שנה אותו ב-Railway',
    })
  }
  const newSecret = randomBytes(16).toString('hex')   // 32-char hex
  setSetting('tv_webhook_secret', newSecret)
  res.json({ ok: true, secret: newSecret })
})

// ─── POST /api/connections/server-url ────────────────────────────────────────

router.post('/server-url', (req: Request, res: Response) => {
  const { url } = req.body as { url?: string }
  if (!url) return res.status(400).json({ ok: false, error: 'url required' })
  setSetting('server_url', url.replace(/\/$/, ''))
  res.json({ ok: true })
})

// ─── POST /api/connections/telegram ──────────────────────────────────────────

router.post('/telegram', (req: Request, res: Response) => {
  const { token, chatId, topicDaily, topicWeekly, topicHigh, topicNews } = req.body as Record<string, string>
  if (token    !== undefined) setSetting('telegram_token',        token)
  if (chatId   !== undefined) setSetting('telegram_chat_id',      chatId)
  if (topicDaily  !== undefined) setSetting('telegram_topic_daily',   topicDaily)
  if (topicWeekly !== undefined) setSetting('telegram_topic_weekly',  topicWeekly)
  if (topicHigh   !== undefined) setSetting('telegram_topic_high',    topicHigh)
  if (topicNews   !== undefined) setSetting('telegram_topic_news',    topicNews)
  res.json({ ok: true })
})

// ─── GET /api/connections/pine-script ────────────────────────────────────────
// Returns the ICT Master Pine Script — embedded directly in server code,
// always in sync with this deploy. No file I/O, no "file not found" errors.

router.get('/pine-script', (_req: Request, res: Response) => {
  res.type('text/plain').send(PINE_SCRIPT)
})

// ─── POST /api/connections/test-webhook ──────────────────────────────────────
// Injects a fake webhook_log entry so the user sees the inbox working

router.post('/test-webhook', (_req: Request, res: Response) => {
  const db = getDb()
  const testPayload = JSON.stringify({
    event: 'test_ping',
    symbol: 'BTCUSDT',
    timeframe: '15m',
    secret: '[hidden]',
    time: Math.floor(Date.now() / 1000),
  })
  db.prepare(`INSERT INTO webhook_log (id, payload, received_at) VALUES (?, ?, ?)`)
    .run(randomBytes(8).toString('hex'), testPayload, Date.now())
  res.json({ ok: true, message: 'test entry added to webhook log' })
})

export default router
