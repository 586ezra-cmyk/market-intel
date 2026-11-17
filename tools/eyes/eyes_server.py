# -*- coding: utf-8 -*-
"""עיניים (Eyes) — local, read-only Bookmap reader.

When ON: every FAST cadence it captures the Bookmap window (screencapture, no input is
ever sent to Bookmap), reads numbers with Apple Vision (./ocr), shows them on a local
page and logs the numbers (never images). Every MODEL interval it asks the local
`claude` CLI to describe what is seen. When OFF it does nothing.

Run:   python3 eyes_server.py [--port 8770] [--image test.png]   (or env HTT_EYES_PORT)
Data:  ~/.local/share/htt-eyes/  (logs/, tmp/)  — outside the repo.
"""
import argparse
import base64
import csv
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fast_reader import FastReader  # noqa: E402

# ---------------- browser origins allowed to call this helper (CORS) ----------------
# The site page runs in the user's browser and talks straight to 127.0.0.1 — nothing goes
# through Vercel/Railway. Any other Origin is refused. The helper's own page
# (http://127.0.0.1:<port>, http://localhost:<port>) is always allowed.
ALLOWED_ORIGINS = (
    "https://market-intel-web-henna.vercel.app",
    "http://localhost:3005",
    "http://localhost:3000",
    "http://127.0.0.1:3005",
    "http://127.0.0.1:3000",
)
CORS_PATHS = ("/state", "/start", "/stop", "/settings")
CORS_MAX_AGE_S = 600

# ---------------- constants (thresholds for the experimental flags) ----------------
FLAG_WINDOW_S = 120          # look-back for both flags
FLAG_MIN_COVER_S = 90        # need at least this much history inside the window
DIVERGE_PRICE_PTS = 10.0     # (a) price moved >= this many points one way ...
DIVERGE_CVD = 50             # ... while CVD moved >= this the other way
PRESSURE_DELTA = 300         # (b) |min_delta| or max_delta of the current bar >= this ...
PRESSURE_RANGE_PTS = 8.0     # ... while the price range over the window <= this
CHANGE_LOOKBACK_S = 60       # "מה השתנה" compares with ~this many seconds ago

MAX_RUN_S = 5 * 3600         # auto-stop after 5 hours
NO_WINDOW_STOP_S = 120       # auto-stop when Bookmap window missing this long
MODEL_TIMEOUT_S = 90
# zoom / scale change: the Bookmap CVD gauge depends on the visible range, so it jumps on zoom
CVD_JUMP_RESET = 500         # CVD change between two consecutive reads that counts as a zoom jump ...
ZOOM_PRICE_STILL_PTS = 5.0   # ... while price moved less than this many points
ZOOM_NOTE = "זום השתנה — CVD התחיל מחדש"

CLAUDE_BIN = os.environ.get("HTT_EYES_CLAUDE_BIN") or os.path.expanduser("~/.local/bin/claude")
MODELS = {"haiku": "claude-haiku-5-5", "sonnet": "claude-sonnet-5-5"}
ALLOWED = {"interval_s": (10, 15, 20, 30, 40), "fast_every_s": (1, 2, 3, 5), "model": ("haiku", "sonnet")}

DATA = os.environ.get("HTT_EYES_DATA") or os.path.expanduser("~/.local/share/htt-eyes")
LOG_DIR = os.path.join(DATA, "logs")
TMP_DIR = os.path.join(DATA, "tmp")
FRAME = os.path.join(TMP_DIR, "frame.png")
SETTINGS_FILE = os.path.join(DATA, "settings.json")
WINLIST_BIN = os.path.join(HERE, "winlist")

CSV_HEADER = ["ts", "price", "cvd", "vol_imb_pct", "bar_max_delta", "bar_delta",
              "bar_min_delta", "bar_volume", "source"]

MODEL_PROMPT = """You are looking at ONE screenshot of the Bookmap trading app (NQ futures).
A separate OCR already reads: last price, CVD gauge, Volume Imb. gauge and the bar statistics tables. Do NOT repeat those.
Report ONLY what you can actually see, as JSON, no prose, no markdown fences:
{
 "bands": [price, ...],              // up to 4 strongest (brightest / thickest) liquidity bands on the heatmap, as ladder prices
 "cob_above": [[price, size], ...],  // the 3 largest resting sizes in the COB column ABOVE the last price
 "cob_below": [[price, size], ...],  // the 3 largest resting sizes in the COB column BELOW the last price
 "big_trades": [[price, "buy"|"sell", size], ...], // biggest trade bubbles/arrows on the chart, size null if unreadable (green=buy, red=sell)
 "footprint": {"max_volume_price": price, "delta": "positive"|"negative"|"unclear"}, // last footprint column
 "sentence_he": "one short neutral Hebrew sentence describing what is seen"
}
Use null for anything you cannot read. Never give trading advice, never say buy/sell/enter/exit in the sentence — describe only."""


def now_iso():
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def ensure_dirs():
    for d in (DATA, LOG_DIR, TMP_DIR):
        os.makedirs(d, mode=0o700, exist_ok=True)


def remove_frame():
    for p in (FRAME, FRAME + ".new.png"):
        try:
            os.remove(p)
        except FileNotFoundError:
            pass


# ---------------- Bookmap window + capture (read-only) ----------------
def find_bookmap_window():
    try:
        p = subprocess.run([WINLIST_BIN], capture_output=True, text=True, timeout=5)
        wins = json.loads(p.stdout or "[]")
    except Exception:
        return None
    wins = [w for w in wins if w.get("layer", 0) == 0 and "bookmap" in w.get("title", "").lower()
            and "configure" not in w.get("title", "").lower() and w.get("w", 0) > 400]
    if not wins:
        return None
    return max(wins, key=lambda w: w["w"] * w["h"])


def capture(win_id):
    tmp = FRAME + ".new.png"
    p = subprocess.run(["screencapture", "-x", "-o", "-l", str(win_id), tmp],
                       capture_output=True, text=True, timeout=10)
    if p.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 1000:
        try:
            os.remove(tmp)
        except FileNotFoundError:
            pass
        return False
    os.replace(tmp, FRAME)  # one temp frame, always overwritten
    return True


# ---------------- model reader (claude CLI) ----------------
def call_model(png_bytes, model_key):
    """Returns (dict|None, error_he|None, logged_out: bool, seconds)."""
    t0 = time.time()
    if not os.path.exists(CLAUDE_BIN):
        return None, "הכלי claude לא נמצא במחשב", False, 0
    msg = {"type": "user", "message": {"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png",
                                      "data": base64.b64encode(png_bytes).decode("ascii")}},
        {"type": "text", "text": MODEL_PROMPT}]}}
    cmd = [CLAUDE_BIN, "-p", "--input-format", "stream-json", "--output-format", "stream-json",
           "--verbose", "--model", MODELS[model_key], "--tools", "", "--no-session-persistence",
           "--strict-mcp-config", "--disable-slash-commands",
           "--system-prompt", "You read screenshots and answer with JSON only."]
    try:
        p = subprocess.run(cmd, input=json.dumps(msg) + "\n", capture_output=True, text=True,
                           timeout=MODEL_TIMEOUT_S, cwd=TMP_DIR)
    except subprocess.TimeoutExpired:
        return None, "קריאת המודל לקחה יותר מדי זמן", False, time.time() - t0
    secs = time.time() - t0
    result, is_err = None, False
    for line in p.stdout.splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get("type") == "result":
            result = ev.get("result") or ""
            is_err = bool(ev.get("is_error"))
    blob = ((result or "") + "\n" + p.stderr[-2000:]).lower()
    if "not logged in" in blob or "run /login" in blob or "please log in" in blob:
        return None, "הכלי claude לא מחובר — צריך להתחבר בטרמינל", True, secs
    if result is None or is_err:
        return None, "קריאת המודל נכשלה", False, secs
    s = result.strip()
    a, b = s.find("{"), s.rfind("}")
    if a < 0 or b <= a:
        return None, "המודל לא החזיר JSON", False, secs
    try:
        data = json.loads(s[a:b + 1])
    except ValueError:
        return None, "המודל החזיר JSON לא תקין", False, secs
    return data, None, False, secs


# ---------------- engine ----------------
class Eyes:
    def __init__(self, image=None):
        self.image = image
        self.lock = threading.Lock()
        self.reader = FastReader()
        self.settings = {"interval_s": 20, "fast_every_s": 2, "model": "haiku"}
        self._load_settings()
        self.running = False
        self.thread = None
        self.stop_evt = threading.Event()
        self.model_thread = None
        self.reset_state()

    def reset_state(self):
        self.since = None
        self.stop_reason = None
        self.fast = None
        self.model = None
        self.model_busy = False
        self.history = deque(maxlen=2000)
        self.counters = {"fast_reads": 0, "model_calls": 0, "model_skipped": 0}
        self.errors = deque(maxlen=5)
        self.model_error = None
        self.logged_out_at = None
        self.window = None
        self.last_model_try = 0
        self.cvd_reset_ts = None   # CVD history before this is ignored (zoom changed)
        self.zoom = None           # last zoom reset {"ts", "ts_iso", "reason"}

    def _load_settings(self):
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as f:
                self.apply_settings(json.load(f), save=False)
        except Exception:
            pass

    def apply_settings(self, s, save=True):
        bad = []
        for k, allowed in ALLOWED.items():
            if k in s:
                v = s[k]
                if k != "model":
                    try:
                        v = int(v)
                    except (TypeError, ValueError):
                        bad.append(k)
                        continue
                if v in allowed:
                    self.settings[k] = v
                else:
                    bad.append(k)
        if save:
            ensure_dirs()
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(self.settings, f)
        return bad

    def err(self, he):
        self.errors.append({"ts": now_iso(), "msg": he})

    # ---- control ----
    def start(self):
        with self.lock:
            if self.running:
                return
            ensure_dirs()
            self.reset_state()
            self.reader = FastReader()
            self.running = True
            self.since = time.time()
            self.stop_evt.clear()
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()

    def stop(self, reason="נעצר ידנית"):
        with self.lock:
            if not self.running:
                return
            self.running = False
            self.stop_reason = reason
            self.stop_evt.set()
        t = self.thread
        if t and t is not threading.current_thread():
            t.join(timeout=15)
        remove_frame()

    # ---- worker ----
    def _get_frame(self):
        if self.image:
            shutil.copyfile(self.image, FRAME + ".new.png")
            os.replace(FRAME + ".new.png", FRAME)
            self.window = {"title": "file: " + os.path.basename(self.image)}
            return True
        if self.window is None or time.time() - self.window.get("_t", 0) > 30:
            w = find_bookmap_window()
            if w:
                w["_t"] = time.time()
            self.window = w
        if not self.window:
            return False
        if capture(self.window["id"]):
            return True
        self.window = None
        return False

    def _loop(self):
        missing_since = None
        while not self.stop_evt.is_set():
            t0 = time.time()
            if t0 - self.since > MAX_RUN_S:
                threading.Thread(target=self.stop, args=("עצירה אוטומטית אחרי 5 שעות",), daemon=True).start()
                return
            try:
                ok = self._get_frame()
            except Exception as e:
                ok = False
                self.err("שגיאת צילום: %s" % e)
            if not ok:
                missing_since = missing_since or t0
                if t0 - missing_since > NO_WINDOW_STOP_S:
                    threading.Thread(target=self.stop, args=("חלון Bookmap לא נמצא במשך 2 דקות",),
                                     daemon=True).start()
                    return
                with self.lock:
                    self.err("חלון Bookmap לא נמצא (או שאין הרשאת הקלטת מסך)")
            else:
                missing_since = None
                self._fast_tick()
                self._maybe_model()
            wait = self.settings["fast_every_s"] - (time.time() - t0)
            self.stop_evt.wait(max(0.05, wait))

    def _fast_tick(self):
        try:
            r = self.reader.read(FRAME)
        except Exception as e:
            with self.lock:
                self.err("שגיאת קריאה מהירה: %s" % str(e)[:120])
            return
        ts = time.time()
        r["ts"] = ts
        r["ts_iso"] = now_iso()
        zoom = r.get("zoom")
        if not zoom and r["cvd"] is not None and r["price"] is not None:
            with self.lock:
                prev = next((h for h in reversed(self.history)
                             if h["cvd"] is not None and h["price"] is not None), None)
            if (prev and (self.cvd_reset_ts is None or prev["ts"] >= self.cvd_reset_ts)
                    and abs(r["cvd"] - prev["cvd"]) > CVD_JUMP_RESET
                    and abs(r["price"] - prev["price"]) < ZOOM_PRICE_STILL_PTS):
                zoom = "CVD קפץ %+d בקריאה אחת והמחיר כמעט לא זז" % (r["cvd"] - prev["cvd"])
        if zoom:
            r["zoom"] = zoom
            r["notes"] = [ZOOM_NOTE] + list(r.get("notes") or [])
            self.reader.layout = None  # re-anchor gauges on the next read
            with self.lock:
                self.cvd_reset_ts = ts
                self.zoom = {"ts": ts, "ts_iso": r["ts_iso"], "reason": zoom}
        bar = r.get("bar") or {}
        row = [r["ts_iso"], r["price"], r["cvd"], r["vol_imb_pct"], bar.get("max_delta"),
               bar.get("delta"), bar.get("min_delta"), bar.get("volume"),
               "file" if self.image else "ocr"]
        try:
            path = os.path.join(LOG_DIR, dt.date.today().isoformat() + ".csv")
            new = not os.path.exists(path)
            with open(path, "a", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                if new:
                    w.writerow(CSV_HEADER)
                if zoom:  # marker row: CVD before and after this line are not comparable
                    w.writerow([r["ts_iso"], "", "", "", "", "", "", "", "zoom_reset"])
                w.writerow(["" if v is None else v for v in row])
        except OSError as e:
            self.err("שגיאת כתיבת יומן: %s" % e)
        with self.lock:
            self.fast = r
            self.history.append(r)
            self.counters["fast_reads"] += 1

    def _maybe_model(self):
        now = time.time()
        if now - self.last_model_try < self.settings["interval_s"]:
            return
        self.last_model_try = now
        if self.model_busy:
            self.counters["model_skipped"] += 1
            return
        try:
            with open(FRAME, "rb") as f:
                png = f.read()
        except OSError:
            return
        self.model_busy = True
        self.model_thread = threading.Thread(target=self._model_job, args=(png, self.settings["model"]),
                                             daemon=True)
        self.model_thread.start()

    def _model_job(self, png, model_key):
        try:
            with self.lock:
                self.counters["model_calls"] += 1
            try:
                data, err, logged_out, secs = call_model(png, model_key)
            except Exception as e:  # never let a failed call stop the next retry
                data, err, logged_out, secs = None, "קריאת המודל נכשלה: %s" % str(e)[:100], False, 0
            del png
            with self.lock:
                if logged_out:
                    self.logged_out_at = time.time()
                if err:
                    self.model_error = err
                    return
                self.model_error = None
                self.logged_out_at = None
                self.model = {"ts": time.time(), "ts_iso": now_iso(), "model": model_key,
                              "secs": round(secs, 1), "data": data}
            try:
                path = os.path.join(LOG_DIR, dt.date.today().isoformat() + ".model.jsonl")
                with open(path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"ts": now_iso(), "model": model_key, "secs": round(secs, 1),
                                        "data": data}, ensure_ascii=False) + "\n")
            except OSError:
                pass
        finally:
            self.model_busy = False

    # ---- derived: changes + experimental flags ----
    def _window(self, seconds):
        now = time.time()
        return [h for h in self.history if now - h["ts"] <= seconds]

    def derived(self):
        out = {"changes": [], "flags": []}
        cur = self.fast
        if not cur:
            return out
        hist = list(self.history)
        # what changed vs ~60 s ago
        rz = self.cvd_reset_ts or 0
        old = None
        for h in hist:
            if cur["ts"] - h["ts"] >= CHANGE_LOOKBACK_S:
                old = h
        if self.zoom and cur["ts"] - self.zoom["ts"] <= CHANGE_LOOKBACK_S:
            out["changes"].append("%s (%s)" % (ZOOM_NOTE, self.zoom["ts_iso"][11:19]))
        if old:
            secs = int(cur["ts"] - old["ts"])
            if cur["price"] is not None and old["price"] is not None:
                out["changes"].append("מחיר: %+.2f נק' ב-%d שניות" % (cur["price"] - old["price"], secs))
            if cur["cvd"] is not None and old["cvd"] is not None and old["ts"] >= rz:
                out["changes"].append("CVD: %+d ב-%d שניות" % (cur["cvd"] - old["cvd"], secs))
            if cur["vol_imb_pct"] is not None and old["vol_imb_pct"] is not None:
                out["changes"].append("Volume Imb: %+.0f%% ב-%d שניות" % (cur["vol_imb_pct"] - old["vol_imb_pct"], secs))
            cb, ob = (cur.get("bar") or {}).get("bar"), (old.get("bar") or {}).get("bar")
            if cb and ob and cb != ob:
                out["changes"].append("נפתח נר 5 דקות חדש (%s)" % cb)
        # flags (experimental)
        win = [h for h in hist if cur["ts"] - h["ts"] <= FLAG_WINDOW_S]
        pw = [h for h in win if h["price"] is not None]
        if pw and pw[-1]["ts"] - pw[0]["ts"] >= FLAG_MIN_COVER_S:
            prices = [h["price"] for h in pw]
            rng = max(prices) - min(prices)
            cw = [h for h in pw if h["cvd"] is not None and h["ts"] >= rz]
            if len(cw) >= 2 and cw[-1]["ts"] - cw[0]["ts"] >= FLAG_MIN_COVER_S:
                dp = cw[-1]["price"] - cw[0]["price"]
                dc = cw[-1]["cvd"] - cw[0]["cvd"]
                if (dp >= DIVERGE_PRICE_PTS and dc <= -DIVERGE_CVD) or (dp <= -DIVERGE_PRICE_PTS and dc >= DIVERGE_CVD):
                    out["flags"].append({"name": "מחיר נגד CVD",
                                         "text": "ב-2 הדקות האחרונות המחיר זז %+.2f נק' וה-CVD זז %+d — בכיוונים הפוכים" % (dp, dc)})
            bar = cur.get("bar") or {}
            if bar.get("is_last") and rng <= PRESSURE_RANGE_PTS and (
                    abs(bar.get("min_delta") or 0) >= PRESSURE_DELTA or (bar.get("max_delta") or 0) >= PRESSURE_DELTA):
                out["flags"].append({"name": "לחץ בלי תזוזה",
                                     "text": "בנר %s: מקס' דלתא %s / מינ' דלתא %s, והמחיר נע רק %.2f נק' ב-2 דקות" % (
                                         bar.get("bar") or "", bar.get("max_delta"), bar.get("min_delta"), rng)})
        return out

    def state(self):
        with self.lock:
            now = time.time()
            fast = dict(self.fast) if self.fast else None
            if fast:
                fast["age_s"] = round(now - fast["ts"], 1)
            model = dict(self.model) if self.model else None
            if model:
                model["age_s"] = round(now - model["ts"], 1)
            d = self.derived()
            return {"running": self.running,
                    "since": dt.datetime.fromtimestamp(self.since).strftime("%H:%M:%S") if self.since else None,
                    "run_s": int(now - self.since) if (self.since and self.running) else None,
                    "stop_reason": self.stop_reason, "settings": dict(self.settings),
                    "file_mode": bool(self.image),
                    "window": (self.window or {}).get("title"),
                    "fast": fast, "model": model, "model_busy": self.model_busy,
                    "model_error": self.model_error,
                    "logged_out": bool(self.logged_out_at),
                    "zoom_reset": ({"ts_iso": self.zoom["ts_iso"], "reason": self.zoom["reason"],
                                    "age_s": round(now - self.zoom["ts"], 1)} if self.zoom else None),
                    "changes": d["changes"], "alerts": d["flags"],
                    "counters": dict(self.counters), "errors": list(self.errors),
                    "frame_exists": os.path.exists(FRAME)}


# ---------------- HTTP ----------------
EYES = None
PAGE = r"""<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>עיניים</title>
<style>
:root{--bg:#0f1318;--card:#171d24;--line:#26303b;--fg:#e8edf2;--dim:#8b98a6;--on:#16a34a;--off:#475569;--red:#ef4444;--amber:#f59e0b;--buy:#22c55e;--sell:#f87171}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.45 -apple-system,"SF Pro Text","Arial Hebrew",Arial,sans-serif}
main{max-width:640px;margin:0 auto;padding:14px 16px 40px}
h1{font-size:22px;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;gap:8px}
h1 small{font-size:13px;color:var(--dim);font-weight:400}
#toggle{width:100%;font-size:28px;font-weight:700;padding:18px;border-radius:14px;border:0;cursor:pointer;color:#fff;background:var(--off)}
#toggle.on{background:var(--on)}
#toggle:disabled{opacity:.6}
#status{margin:10px 2px 14px;color:var(--dim);font-size:15px}
#status b{color:var(--fg)}
.stale{color:var(--red)!important;font-weight:700}
.err{color:var(--red);font-size:15px;margin-top:4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:0 0 12px}
.card h2{font-size:16px;color:var(--dim);margin:0 0 8px;font-weight:600;display:flex;justify-content:space-between;gap:8px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}
.k{font-size:13px;color:var(--dim)}
.v{font-size:30px;font-weight:700;font-variant-numeric:tabular-nums}
.v.small{font-size:22px}
.na{color:var(--dim);font-size:16px;font-weight:400}
.pos{color:var(--buy)}.neg{color:var(--sell)}
ul{margin:4px 0;padding-inline-start:20px}
li{margin:2px 0}
.num{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums}
.tag{display:inline-block;font-size:12px;padding:1px 7px;border-radius:8px;background:#3b2f10;color:var(--amber);margin-inline-start:6px}
.flag{border-inline-start:4px solid var(--amber);padding:4px 10px;margin:6px 0;background:#1f1a10;border-radius:6px}
.sentence{font-size:20px;margin:8px 0 4px}
.settings label{display:flex;justify-content:space-between;align-items:center;margin:6px 0;font-size:16px;gap:8px}
select{font-size:16px;background:#0b0f14;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:4px 8px}
.foot{color:var(--dim);font-size:13px;margin-top:6px}
@media (max-width:420px){.v{font-size:24px}.v.small{font-size:19px}}
</style>
</head>
<body>
<main>
<h1>עיניים <small>קריאה בלבד · לא לוחץ ולא שולח פקודות</small></h1>
<button id="toggle" type="button">התחל עיניים</button>
<div id="status">כבוי</div>

<section class="card">
  <h2><span>מספרים חיים</span><span id="fastAge" class="k"></span></h2>
  <div class="grid">
    <div><div class="k">מחיר אחרון</div><div class="v num" id="price">—</div></div>
    <div><div class="k">CVD</div><div class="v num" id="cvd">—</div></div>
    <div><div class="k">Volume Imb.</div><div class="v small num" id="imb">—</div></div>
    <div><div class="k" id="barTitle">נר 5 דקות · ווליום</div><div class="v small num" id="barVol">—</div></div>
    <div style="grid-column:1/-1"><div class="k">מקס׳ דלתא / דלתא / מינ׳ דלתא</div><div class="v small num" id="barD">—</div></div>
  </div>
  <div id="fastNotes" class="foot"></div>
</section>

<section class="card">
  <h2><span>מה השתנה (כדקה)</span></h2>
  <ul id="changes"><li class="na">אין עדיין מספיק נתונים</li></ul>
</section>

<section class="card">
  <h2><span>תמונת מצב <span class="k">(מודל)</span></span><span id="modelAge" class="k"></span></h2>
  <div id="model" class="na">עוד לא התקבלה קריאה</div>
  <div id="modelErr" class="err"></div>
</section>

<section class="card">
  <h2><span>דגלים <span class="tag">ניסיוני</span></span></h2>
  <div id="flags" class="na">אין דגלים כרגע</div>
  <div class="foot">״מחיר נגד CVD״: ב-2 דקות המחיר זז 10 נק׳ ומעלה לכיוון אחד וה-CVD זז 50 ומעלה לכיוון השני. ״לחץ בלי תזוזה״: בנר הנוכחי מקס׳/מינ׳ דלתא 300 ומעלה והמחיר נע עד 8 נק׳ ב-2 דקות. תיאור בלבד, לא המלצה.</div>
</section>

<section class="card settings">
  <h2><span>הגדרות</span></h2>
  <label>קריאת מודל כל <select id="interval_s"><option>10</option><option>15</option><option>20</option><option>30</option><option>40</option></select> שניות</label>
  <label>קריאה מהירה כל <select id="fast_every_s"><option>1</option><option>2</option><option>3</option><option>5</option></select> שניות</label>
  <label>מודל <select id="model"><option value="haiku">Haiku (מהיר)</option><option value="sonnet">Sonnet</option></select></label>
  <div class="foot">היומן (מספרים בלבד, בלי תמונות): <span class="num">~/.local/share/htt-eyes/logs</span></div>
</section>
</main>
<script>
"use strict";
const $ = id => document.getElementById(id);
const NA = '<span class="na">לא נקרא</span>';
let busy = false, settingsLoaded = false;
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function fmt(v,d){ if(v===null||v===undefined||v==="") return NA; const n=Number(v); if(!isFinite(n)) return NA;
  return n.toLocaleString("en-US",{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); }
function signed(v){ if(v===null||v===undefined) return NA; const n=Number(v); if(!isFinite(n)) return NA;
  const cls=n>0?"pos":n<0?"neg":""; return '<span class="'+cls+'">'+(n>0?"+":"")+n.toLocaleString("en-US")+'</span>'; }
function post(path, body){ return fetch(path,{method:"POST",headers:{"X-Eyes":"1","Content-Type":"application/json"},body:body?JSON.stringify(body):""}); }
function pairList(a){ if(!Array.isArray(a)||!a.length) return NA;
  return a.map(p=>Array.isArray(p)?'<span class="num">'+esc(p[0]??"?")+" × "+esc(p[1]??"?")+'</span>':esc(p)).join(" · "); }
function trades(a){ if(!Array.isArray(a)||!a.length) return NA;
  return a.map(t=>{ if(!Array.isArray(t)) return esc(t);
    const side=t[1]==="buy"?'<span class="pos">קונה</span>':t[1]==="sell"?'<span class="neg">מוכר</span>':esc(t[1]??"?");
    return '<span class="num">'+esc(t[0]??"?")+'</span> '+side+(t[2]!=null?' <span class="num">'+esc(t[2])+'</span>':""); }).join(" · "); }
function render(s){
  const t=$("toggle"); t.textContent=s.running?"עצור":"התחל עיניים"; t.classList.toggle("on",s.running);
  let st;
  if(s.running){
    const age=s.fast?s.fast.age_s:null;
    st='פועל מ-<b>'+esc(s.since)+'</b>'+(s.file_mode?' (מצב קובץ)':'')+' · עדכון אחרון: '+
       (age===null?'—':'<span class="'+(age>10?"stale":"")+'">לפני '+Math.round(age)+' שנ׳</span>')+
       ' · קריאות מודל: <b>'+s.counters.model_calls+'</b>'+(s.model_busy?' (רץ…)':'');
    if(s.window) st+='<div class="foot">חלון: '+esc(s.window)+'</div>';
    if(s.errors&&s.errors.length){ const e=s.errors[s.errors.length-1]; st+='<div class="err">'+esc(e.msg)+'</div>'; }
  } else {
    st='כבוי'+(s.stop_reason?' · '+esc(s.stop_reason):'');
  }
  $("status").innerHTML=st;
  const f=s.fast;
  if(f){
    $("price").innerHTML=fmt(f.price,2); $("cvd").innerHTML=signed(f.cvd);
    $("imb").innerHTML=(f.vol_imb_pct===null?NA:signed(f.vol_imb_pct)+"%");
    const b=f.bar;
    if(b){ $("barTitle").textContent="נר 5 דקות "+(b.bar||"")+(b.is_last?"":" (קודם)")+" · ווליום";
      $("barVol").innerHTML=fmt(b.volume); $("barD").innerHTML=signed(b.max_delta)+" / "+signed(b.delta)+" / "+signed(b.min_delta); }
    else { $("barTitle").textContent="נר 5 דקות · ווליום"; $("barVol").innerHTML=NA; $("barD").innerHTML=NA; }
    $("fastAge").textContent="קריאה ב-"+(f.ms||"?")+" מ״ש";
    $("fastNotes").textContent=(f.notes||[]).join(" · ");
  }
  $("changes").innerHTML=(s.changes&&s.changes.length)?s.changes.map(c=>"<li>"+esc(c)+"</li>").join(""):'<li class="na">אין עדיין מספיק נתונים</li>';
  const m=s.model;
  if(m&&m.data){ const d=m.data, fp=d.footprint||{};
    const fpd=fp.delta==="positive"?'<span class="pos">חיובית</span>':fp.delta==="negative"?'<span class="neg">שלילית</span>':'לא ברור';
    $("model").innerHTML='<div class="sentence">'+esc(d.sentence_he||"")+'</div><ul>'+
      '<li>פסי נזילות חזקים: '+(Array.isArray(d.bands)&&d.bands.length?'<span class="num">'+d.bands.map(esc).join(" · ")+'</span>':NA)+'</li>'+
      '<li>COB מעל המחיר: '+pairList(d.cob_above)+'</li>'+
      '<li>COB מתחת למחיר: '+pairList(d.cob_below)+'</li>'+
      '<li>עסקאות גדולות: '+trades(d.big_trades)+'</li>'+
      '<li>פוטפרינט אחרון: ווליום מקסימלי ב-<span class="num">'+esc(fp.max_volume_price??"?")+'</span>, דלתא '+fpd+'</li></ul>';
    $("modelAge").textContent=m.ts_iso.slice(11,19)+" · לפני "+Math.round(m.age_s)+" שנ׳ · "+m.model+" "+m.secs+" שנ׳";
  }
  $("modelErr").textContent=s.model_error||"";
  $("flags").innerHTML=(s.alerts&&s.alerts.length)?s.alerts.map(a=>'<div class="flag"><b>'+esc(a.name)+'</b> — '+esc(a.text)+'</div>').join(""):'<span class="na">אין דגלים כרגע</span>';
  if(!settingsLoaded){ for(const k of ["interval_s","fast_every_s","model"]) $(k).value=String(s.settings[k]); settingsLoaded=true; }
}
async function poll(){ try{ const r=await fetch("/state",{cache:"no-store"}); render(await r.json()); }
  catch(e){ $("status").innerHTML='<span class="err">השרת לא עונה — הפעל שוב את start.command</span>'; } }
$("toggle").addEventListener("click", async()=>{ if(busy) return; busy=true; $("toggle").disabled=true;
  try{ await post($("toggle").classList.contains("on")?"/stop":"/start"); await poll(); } finally{ busy=false; $("toggle").disabled=false; } });
for(const k of ["interval_s","fast_every_s","model"]) $(k).addEventListener("change", async()=>{
  const v=$(k).value; await post("/settings",{[k]: k==="model"?v:Number(v)}); });
poll(); setInterval(poll,1000);
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "eyes/1"

    def log_message(self, fmt, *args):
        pass

    _cors = None  # Origin to reflect for this request (only an allowed one)

    def _host_ok(self):
        host = (self.headers.get("Host") or "").split(":")[0]
        return host in ("127.0.0.1", "localhost")

    def _origin_ok(self):
        """No Origin header (curl, same-origin GET) is fine. A present Origin must be listed."""
        origin = self.headers.get("Origin")
        self._cors = None
        if origin is None:
            return True
        port = self.server.server_address[1]
        own = ("http://127.0.0.1:%d" % port, "http://localhost:%d" % port)
        if origin in ALLOWED_ORIGINS or origin in own:
            self._cors = origin
            return True
        return False

    def _cors_headers(self):
        if self._cors:
            self.send_header("Access-Control-Allow-Origin", self._cors)
            self.send_header("Vary", "Origin")

    def do_OPTIONS(self):
        if not self._host_ok() or not self._origin_ok() or not self._cors or self.path not in CORS_PATHS:
            self._cors = None
            return self._send(403, {"error": "origin"})
        self.send_response(204)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type, x-eyes")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", str(CORS_MAX_AGE_S))
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline'")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self._host_ok():
            return self._send(403, {"error": "host"})
        if not self._origin_ok():
            return self._send(403, {"error": "origin"})
        if self.path == "/":
            return self._send(200, PAGE, "text/html; charset=utf-8")
        if self.path == "/state":
            return self._send(200, EYES.state())
        self._send(404, {"error": "not found"})

    def do_POST(self):
        # custom header => browsers must preflight; only ALLOWED_ORIGINS pass the preflight and this check
        if not self._host_ok() or not self._origin_ok() or self.headers.get("X-Eyes") != "1":
            return self._send(403, {"error": "forbidden"})
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(min(n, 10000)) if n else b""
        if self.path == "/start":
            EYES.start()
            return self._send(200, {"ok": True})
        if self.path == "/stop":
            EYES.stop()
            return self._send(200, {"ok": True})
        if self.path == "/settings":
            try:
                body = json.loads(raw or b"{}")
            except ValueError:
                return self._send(400, {"error": "json"})
            bad = EYES.apply_settings(body if isinstance(body, dict) else {})
            return self._send(400 if bad else 200, {"ok": not bad, "bad": bad, "settings": EYES.settings})
        self._send(404, {"error": "not found"})


def main():
    global EYES
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("HTT_EYES_PORT") or 8770))
    ap.add_argument("--image", help="test mode: read this PNG instead of capturing Bookmap")
    a = ap.parse_args()
    if a.image and not os.path.isfile(a.image):
        sys.exit("image not found")
    ensure_dirs()
    EYES = Eyes(image=os.path.abspath(a.image) if a.image else None)
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print("eyes: http://127.0.0.1:%d %s" % (a.port, "(file mode)" if a.image else ""), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        EYES.stop("השרת נסגר")
        remove_frame()
        srv.server_close()


if __name__ == "__main__":
    main()
