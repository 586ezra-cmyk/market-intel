# -*- coding: utf-8 -*-
"""Fast reader for a Bookmap window capture: Apple Vision OCR (./ocr) + geometry anchors.

Read-only. It only reads a PNG file. Values are located by anchoring on labels
(time axis, price ladder, "CVD", "Volume Imb.") found by OCR, never by fixed pixels.
A value that fails a sanity check is returned as None ("לא נקרא").
"""
import json
import os
import re
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OCR_BIN = os.path.join(HERE, "ocr")

LAYOUT_TTL_S = 60          # re-run the full-frame pass at least this often
PRICE_MAX_JUMP = 0.02      # price must be within +-2% of previous reading
PRICE_UNMARKED_JUMP = 0.004  # ...and within 0.4% when the last-trade marker did not confirm the row
ZOOM_SCALE_CHANGE = 0.15   # ladder px-per-point (or time-axis px-per-minute) change that counts as a zoom change
ZOOM_CONFIRM_READS = 2     # a new ladder step / scale must repeat this many reads in a row before it counts
CROP_SCALE = 3             # upscale factor for value crops

_MINUS = {"−": "-", "–": "-", "—": "-", "~": "-"}
_TIME_RE = re.compile(r"^(\d{1,2})[:;.](\d{2})$")
_INT_RE = re.compile(r"^-?\d+$")
_LADDER_RE = re.compile(r"^\d{4,6}(\.\d{1,2})?$")
_PCT_RE = re.compile(r"^([-+]?)(\d{1,3}(?:\.\d+)?)%$")


def run_ocr(path, crops=None, scale=1):
    """crops: (x, y, w, h) or (x, y, w, h, scale) in image pixels."""
    cmd = [OCR_BIN, path, "--scale", str(scale)]
    for c in crops or []:
        arg = ",".join(str(int(round(v))) for v in c[:4])
        if len(c) > 4:
            arg += "@%g" % c[4]
        cmd += ["--crop", arg]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if p.returncode != 0:
        raise RuntimeError("ocr failed: " + p.stderr.strip()[:200])
    d = json.loads(p.stdout)
    for it in d["items"]:
        it["s"] = clean(it["t"])
        it["cx"] = it["x"] + it["w"] / 2
        it["cy"] = it["y"] + it["h"] / 2
        it["r"] = it["x"] + it["w"]
    return d


def clean(t):
    s = t.strip()
    for k, v in _MINUS.items():
        s = s.replace(k, v)
    s = s.replace(" ", "").replace(",", "")
    s = s.strip(":;·•¡÷|!'\"`_()[]")
    if s.startswith("-") and len(s) > 1:
        s = "-" + s[1:].lstrip("-")
    return s


def _median(v):
    v = sorted(v)
    return v[len(v) // 2] if v else None


def find_layout(d):
    """Full-frame anchors. Returns dict or raises ValueError with Hebrew reason."""
    W, H = d["w"], d["h"]
    items = d["items"]
    # ladder: biggest x-cluster of 4-6 digit prices
    lad = [i for i in items if _LADDER_RE.match(i["s"])]
    clusters = {}
    for i in lad:
        clusters.setdefault(int(i["x"] // 12), []).append(i)
    merged = {}
    for k, v in clusters.items():
        merged.setdefault(k, []).extend(v)
        merged.setdefault(k + 1, []).extend(v)
    best = max(merged.values(), key=len) if merged else []
    if len(best) < 5:
        raise ValueError("לא נמצא סולם המחירים")
    lx = min(i["x"] for i in best)
    lr = max(i["r"] for i in best)
    ltop = min(i["y"] for i in best)
    lbot = max(i["y"] + i["h"] for i in best)
    lh = _median([i["h"] for i in best]) or 16
    ladder = (lx - 12, max(0, ltop - 3 * lh), (lr - lx) + 18, (lbot - ltop) + 6 * lh)
    # time axis: HH:MM labels left of the ladder, lower part of window -> px-per-minute fit
    tl = [i for i in items if _TIME_RE.match(i["s"]) and i["r"] < lx + 40 and i["cy"] > H * 0.4]
    axis = None
    if len(tl) >= 2:
        ay = _median([i["y"] for i in tl])
        tl = sorted([i for i in tl if abs(i["y"] - ay) < 12], key=lambda i: i["cx"])
        pts = []
        for i in tl:
            m = _TIME_RE.match(i["s"])
            pts.append((i["cx"], int(m.group(1)) * 60 + int(m.group(2))))
        ratios = [(b[0] - a[0]) / (b[1] - a[1]) for a, b in zip(pts, pts[1:]) if b[1] > a[1]]
        ppm = _median(ratios)
        if ppm and ppm > 0:
            # anchor: the label agreeing best with the others
            def err(p):
                return sum(abs((q[0] - p[0]) - (q[1] - p[1]) * ppm) for q in pts)
            x0, m0 = min(pts, key=err)
            th = _median([i["h"] for i in tl]) or 16
            axis = {"y": ay, "ppm": ppm, "spacing": 5 * ppm, "row_h": th * 1.1, "x0": x0, "m0": m0}
    # gauges
    def gauge(pred):
        labs = [i for i in items if pred(i["s"]) and i["x"] > lx]
        if not labs:
            return None
        g = max(labs, key=lambda i: i["y"])
        k = lh / 16.0  # scale by ladder text height (zoom / window size)
        return (g["cx"] - 75 * k, g["y"] - 8 * k, 150 * k, 62 * k)
    cvd = gauge(_is_cvd)
    imb = gauge(_is_imb)
    return {"size": (W, H), "ladder": ladder, "lx": lx, "axis": axis,
            "cvd": cvd, "imb": imb, "t": time.time()}


def _is_cvd(s):
    return s.upper() == "CVD"


def _is_imb(s):
    s = s.lower()
    return s.startswith("volume") or "imb" in s or "lmb" in s


def bar_label(ax, x):
    m = ax["m0"] + (x - ax["x0"]) / ax["ppm"]
    m = int(m // 5 * 5) % (24 * 60)
    return "%02d:%02d" % (m // 60, m % 60)


def _num(s):
    return int(s) if _INT_RE.match(s) else None


def _value_below_label(items, label_pred, value_fn):
    labs = [i for i in items if label_pred(i["s"])]
    if not labs:
        return None
    lab = labs[0]
    cands = []
    for i in items:
        if i is lab:
            continue
        v = value_fn(i["s"])
        if v is None:
            continue
        dy = i["cy"] - lab["cy"]
        hh = max(lab["h"], 10)
        if 0 < dy < 4 * hh and abs(i["cx"] - lab["cx"]) < 4 * hh:
            cands.append((dy, v))
    return min(cands)[1] if cands else None


def _pct(s):
    m = _PCT_RE.match(s)
    if not m:
        return None
    v = float(m.group(2))
    return -v if m.group(1) == "-" else v


def _rows(items):
    """Cluster item centre-y into rows; returns sorted list of row y."""
    ys = sorted(i["cy"] for i in items)
    hs = _median([i["h"] for i in items]) or 12
    rows = []
    for y in ys:
        if rows and y - rows[-1][-1] < 0.6 * hs:
            rows[-1].append(y)
        else:
            rows.append([y])
    return [sum(r) / len(r) for r in rows], hs


def read_tables(path, lay):
    """Right-most bar-statistics table whose 4 rows read and agree. Returns (dict|None, note|None)."""
    ax = lay.get("axis")
    if not ax:
        return None, "אין ציר זמן"
    sp, ay = ax["spacing"], ax["y"]
    th = ax["row_h"] / 1.1
    top = ay - 7.5 * th
    right_lim = lay["lx"] - 2
    left = max(0, right_lim - 3.3 * sp)
    band = run_ocr(path, [(left, top, right_lim - left, ay - top)], scale=2)
    nums = [i for i in band["items"] if _num(i["s"]) is not None]
    if not nums:
        return None, "לא נמצאו טבלאות"
    nums.sort(key=lambda i: i["r"])
    cols = []
    for i in nums:
        if cols and i["r"] - cols[-1][-1]["r"] < 0.18 * sp:
            cols[-1].append(i)
        else:
            cols.append([i])
    edges = [max(i["r"] for i in c) for c in cols][-2:]
    cw = min(0.85 * sp, 160)
    rb, hb = _rows(nums)
    rb = [r for r in rb if r < ay - 0.3 * hb]
    if len(rb) >= 4:
        top = rb[-4] - 1.1 * hb  # tight crop around the 4 table rows reads lone digits better
    crops = []
    for e in edges:  # a wide and a narrow crop per column: Vision misses lone digits differently
        crops.append((e - cw + 4, top, cw + 8, ay - top))
        crops.append((e - 0.3 * cw, top, 0.3 * cw + 8, ay - top))
    res = run_ocr(path, crops, scale=CROP_SCALE)
    allnums = [i for i in res["items"] if _num(i["s"]) is not None] + nums
    rows, hs = _rows(allnums)
    rows = [r for r in rows if r < ay - 0.3 * hs][-4:]
    if len(rows) < 4:
        return None, "טבלה לא נקראה במלואה"
    for e in reversed(edges):
        col = [i for i in res["items"] if e - cw - 2 <= i["r"] <= e + 10 and _num(i["s"]) is not None]
        got = {}
        for i in col:
            k = min(range(4), key=lambda j: abs(rows[j] - i["cy"]))
            if abs(rows[k] - i["cy"]) < 0.6 * hs:
                got.setdefault(k, set()).add(_num(i["s"]))
        if len(got) != 4 or any(len(v) != 1 for v in got.values()):
            continue  # a row missing, or two crops disagree -> do not guess
        mx, de, mn, vol = [next(iter(got[k])) for k in range(4)]
        if not (vol > 0 and mn <= de <= mx and max(abs(mx), abs(mn)) <= vol and vol < 2_000_000):
            continue
        return {"max_delta": mx, "delta": de, "min_delta": mn, "volume": vol,
                "bar": bar_label(ax, e - 0.5 * sp),
                "is_last": e == edges[-1]}, None
    return None, "טבלה לא נקראה במלואה"


_CONFUSE = str.maketrans({"Z": "2", "z": "2", "O": "0", "o": "0", "S": "5", "s": "5", "l": "1", "I": "1", "B": "8"})


def digitize(s):
    """Fix common letter/digit confusions only in tokens that are mostly digits."""
    d = sum(ch.isdigit() for ch in s)
    if d >= 4 and d >= 0.75 * len(s.replace(".", "")):
        return s.translate(_CONFUSE)
    return s


def merge_split_decimals(items):
    """Vision sometimes splits '27656.75' into '27656' and '.75'. Join them."""
    items = [dict(i, s=digitize(i["s"])) for i in items]
    out, used = [], set()
    for a in items:
        if id(a) in used:
            continue
        if re.match(r"^\d{4,6}$", a["s"]):
            for b in items:
                if b is a or id(b) in used or not re.match(r"^\.\d{1,2}$", b["s"]):
                    continue
                if abs(b["cy"] - a["cy"]) < 0.5 * a["h"] and -2 <= b["x"] - a["r"] < 0.6 * a["h"]:
                    a = dict(a, s=a["s"] + b["s"], w=b["r"] - a["x"], r=b["r"])
                    a["cx"] = a["x"] + a["w"] / 2
                    used.add(id(b))
                    break
        out.append(a)
    return out


def read_price(all_items, L, prev, meta=None):
    """Last price = the highlighted ladder box. Ladder labels form a regular grid
    (value multiple of a step, y linear in value). The box is the label that is off-grid,
    and its y must sit where the grid fit predicts. Fallback: the "N (N)" last-trade
    marker left of the ladder at the same height picks the on-grid label."""
    items = merge_split_decimals([i for i in all_items if L[0] - 5 <= i["cx"] <= L[0] + L[2] + 5])
    col = [i for i in items if _LADDER_RE.match(i["s"])]
    if len(col) < 4:
        return None, "סולם המחירים לא נקרא"
    for i in col:
        i["v"] = float(i["s"])
    vals = sorted(set(i["v"] for i in col))
    diffs = [round(b - a, 2) for a, b in zip(vals, vals[1:]) if b - a > 0]
    cnt = {}
    for d in diffs:
        cnt[d] = cnt.get(d, 0) + 1
    step = max(cnt, key=lambda d: (cnt[d], -d)) if cnt else None
    if not step:
        return None, "סולם המחירים לא נקרא"

    def on_grid(v):
        q = v / step
        return abs(q - round(q)) < 1e-6
    grid = [i for i in col if on_grid(i["v"])]
    if len(grid) < 3:
        return None, "סולם המחירים לא נקרא"
    n = len(grid)
    mv = sum(i["v"] for i in grid) / n
    my = sum(i["cy"] for i in grid) / n
    sxx = sum((i["v"] - mv) ** 2 for i in grid)
    if sxx == 0:
        return None, "סולם המחירים לא נקרא"
    b = sum((i["v"] - mv) * (i["cy"] - my) for i in grid) / sxx
    a = my - b * mv
    if meta is not None:  # layout signature for zoom detection
        meta["step"] = step
        meta["px_per_pt"] = abs(b)
    hs = _median([i["h"] for i in grid]) or 12
    # drop misread grid labels (far from the line)
    def fits(i):
        return abs(a + b * i["v"] - i["cy"]) < 0.7 * hs
    off = [i for i in col if (not on_grid(i["v"]) or re.search(r"\.\d\d$", i["s"]))
           and abs(i["v"] * 4 - round(i["v"] * 4)) < 1e-6 and fits(i)]
    # last-trade marker like "3 (3)" left of the ladder: it sits only on the last-price row.
    # The mouse crosshair draws its own off-grid price label on the ladder; without the marker the two are
    # indistinguishable, so the marker row always wins (19.11.2026: price was stuck on the crosshair label).
    marks = [i for i in all_items if re.search(r"\d+\s*\(\d+\)", i.get("t", i["s"])) and i["cx"] < L[0] + 20]
    if marks:
        near = [i for i in off if any(abs(i["cy"] - m["cy"]) < 0.8 * hs for m in marks)]
        if len(near) == 1:
            near[0]["marked"] = True
            return near[0], None
        cand = [i for i in grid if any(abs(i["cy"] - m["cy"]) < 0.6 * hs for m in marks) and fits(i)]
        if len(cand) == 1:
            cand[0]["marked"] = True
            return cand[0], None
    if len(off) == 1:
        return off[0], None
    if len(off) > 1:
        if prev:
            return min(off, key=lambda i: abs(i["v"] - prev)), None
        return None, "מחיר לא חד-משמעי"
    return None, "מחיר לא נקרא"


def _rel_change(a, b):
    return abs(a - b) / max(abs(b), 1e-9)


class FastReader:
    def __init__(self):
        self.layout = None
        self.prev_price = None
        self.prev_ts = None
        self.sig = None          # accepted {"step", "px_per_pt"} of the price ladder
        self.sig_pending = None  # (candidate sig, consecutive count)
        self.prev_ppm = None     # time-axis px-per-minute from the last full-frame pass

    def _zoom_check(self, meta):
        """Returns a reason string when the ladder step / scale changed (confirmed), else None."""
        if "step" not in meta:
            return None
        if self.sig is None:
            self.sig = dict(meta)
            return None
        same = (abs(meta["step"] - self.sig["step"]) < 1e-9
                and _rel_change(meta["px_per_pt"], self.sig["px_per_pt"]) <= ZOOM_SCALE_CHANGE)
        if same:
            self.sig_pending = None
            return None
        cand, n = self.sig_pending or (meta, 0)
        if abs(cand["step"] - meta["step"]) < 1e-9 and _rel_change(meta["px_per_pt"], cand["px_per_pt"]) <= ZOOM_SCALE_CHANGE:
            n += 1
        else:
            cand, n = meta, 1
        if n < ZOOM_CONFIRM_READS:
            self.sig_pending = (cand, n)
            return None
        old = self.sig
        self.sig, self.sig_pending = dict(meta), None
        if abs(old["step"] - meta["step"]) > 1e-9:
            return "מרווח סולם המחירים השתנה (%g → %g)" % (old["step"], meta["step"])
        return "קנה המידה של סולם המחירים השתנה"

    def read(self, path):
        t0 = time.time()
        out = {"price": None, "cvd": None, "vol_imb_pct": None, "bar": None, "notes": [], "zoom": None}
        lay = self.layout
        if lay is None or time.time() - lay["t"] > LAYOUT_TTL_S:
            d = run_ocr(path)
            try:
                lay = find_layout(d)
            except ValueError as e:
                self.layout = None
                out["notes"].append(str(e))
                out["ms"] = int((time.time() - t0) * 1000)
                return out
            self.layout = lay
            ppm = (lay.get("axis") or {}).get("ppm")
            if ppm and self.prev_ppm and _rel_change(ppm, self.prev_ppm) > ZOOM_SCALE_CHANGE:
                out["zoom"] = "קנה המידה של ציר הזמן השתנה"
            if ppm:
                self.prev_ppm = ppm
        lad = lay["ladder"]
        # strip left of the ladder: the last-trade marker "N (N)" that identifies the last-price row
        mark_strip = (max(0, lad[0] - 140), lad[1], 150, lad[3])     # narrower strips cut the parentheses and the marker is lost
        crops = [lad, mark_strip] + [c for c in (lay["cvd"], lay["imb"]) if c]
        d = run_ocr(path, crops, scale=CROP_SCALE)
        items = d["items"]
        meta = {}
        box, pnote = read_price(items, lay["ladder"], self.prev_price, meta)
        z = self._zoom_check(meta)
        if z and not out.get("zoom"):
            out["zoom"] = z
        out["ladder"] = meta or None
        price = None
        if box is not None:
            # authority: a tight crop of the highlighted box read at 3 scales; >=2 valid reads, all equal,
            # the value must be on the 0.25 tick and within 1 point of where the box was found
            h = box["h"]
            # second try with a wider crop: when the ladder crop cut the decimals (".75"), the box is found too narrow
            for wmul in (2.2, 3.5):
                r = (box["x"] - 0.4 * h, box["y"] - 0.5 * h, box["w"] + wmul * h, 2.0 * h)
                chk = run_ocr(path, [r + (2,), r + (3,), r + (4,)])
                reads = [float(i["s"]) for i in merge_split_decimals(chk["items"]) if _LADDER_RE.match(i["s"])]
                if (len(reads) >= 2 and max(reads) - min(reads) < 1e-9 and abs(reads[0] * 4 - round(reads[0] * 4)) < 1e-9
                        and abs(reads[0] - box["v"]) < 1.0):
                    price = reads[0]
                    break
            if price is None:
                pnote = "מחיר לא אושר בקריאה שנייה"
        if pnote:
            out["notes"].append(pnote)
        L = lay["ladder"]
        # a price confirmed by the last-trade marker may move up to PRICE_MAX_JUMP; an unconfirmed one (it could be the
        # crosshair label) only PRICE_UNMARKED_JUMP while the previous reading is fresh
        marked = bool(box and box.get("marked"))
        fresh = self.prev_ts is not None and time.time() - self.prev_ts < 20
        limit = PRICE_MAX_JUMP if (marked or not fresh) else PRICE_UNMARKED_JUMP
        if price is not None and self.prev_price and abs(price / self.prev_price - 1) > limit:
            out["notes"].append("מחיר נדחה (קפיצה חריגה)")
            price = None
        if price is not None and not marked:
            out["notes"].append("מחיר בלי סימון העסקה האחרונה")
        if price is not None and not (1000 <= price <= 200000):
            price = None
        if price is not None:
            self.prev_price = price
            self.prev_ts = time.time()
        out["price"] = price
        gauge_items = [i for i in items if i["cx"] > L[0] + L[2]]
        cvd = _value_below_label(gauge_items, _is_cvd, _num)
        if cvd is not None and abs(cvd) > 5_000_000:
            cvd = None
        out["cvd"] = cvd
        imb = _value_below_label(gauge_items, _is_imb, _pct)
        if imb is not None and abs(imb) > 100:
            imb = None
        out["vol_imb_pct"] = imb
        try:
            bar, note = read_tables(path, lay)
        except Exception as e:  # keep the rest of the reading
            bar, note = None, "שגיאת טבלה"
        out["bar"] = bar
        if note:
            out["notes"].append(note)
        if price is None and cvd is None:
            self.layout = None  # force a fresh full-frame pass next time
        out["ms"] = int((time.time() - t0) * 1000)
        return out


if __name__ == "__main__":
    import sys
    for p in sys.argv[1:]:
        r = FastReader()
        a = r.read(p)          # cold (full-frame pass)
        b = r.read(p)          # warm (cached layout)
        print(json.dumps({"file": os.path.basename(p), "cold_ms": a["ms"], "warm_ms": b["ms"],
                          "price": b["price"], "cvd": b["cvd"], "imb": b["vol_imb_pct"],
                          "bar": b["bar"], "notes": b["notes"]}, ensure_ascii=False))
