// אספן חלונות Replay ל-Path Lab — להדביק בקונסול של טאב הגרף (TradingView) ואז לקרוא window.__rwStep() שוב ושוב.
// (שוחזר 15.10.2026 מתיעוד HANDOFF; __plCollect קורא את תוויות הסטאדי "HTT Path Lab": META|… ושורות P/H מופרדות ב-"\n")
(() => {
  const W = (window.__rw = window.__rw || {});
  W.cfg = { overlapBars: 2500, coverDays: 372, maxWin: { '5': 17, '15': 8, '240': 1 }, tfMs: { '5': 300000, '15': 900000, '240': 14400000 } };
  const SYMS = [['CME_MINI:NQ1!', 'NQ1'], ['BINANCE:BTCUSDT', 'BTCUSDT'], ['BINANCE:ETHUSDT', 'ETHUSDT'], ['BINANCE:SOLUSDT', 'SOLUSDT']];
  W.combos = [];
  for (const [sym, nm] of SYMS) for (const res of ['15', '5', '240']) W.combos.push([sym, res, nm + '_' + res]);
  W.ci = 0; W.state = 'init'; W.store = {}; W.log = []; W.last = null; W.stable = 0; W.polls = 0; W.busy = false;

  // ── קריאת התוויות של הסטאדי ───────────────────────────────────────────────
  window.__plLabels = () => {
    const c = TradingViewApi.activeChart();
    const model = c._chartWidget.model().model();
    const out = [];
    for (const src of model.dataSources()) {
      const md = src.metaInfo && src.metaInfo();
      const nm = (md && (md.description || md.shortDescription)) || '';
      if (!/Path Lab/.test(nm)) continue;
      // תוויות: מחפשים בכל המאפיינים של הסטאדי אובייקטים עם text
      const seen = new Set();
      const walk = (o, d) => {
        if (!o || typeof o !== 'object' || d > 6 || seen.has(o)) return;
        seen.add(o);
        if (typeof o.text === 'string' && (o.text.startsWith('META|') || o.text.startsWith('P|') || o.text.startsWith('H|'))) out.push(o.text);
        else if (typeof o.text === 'function') { try { const t = o.text(); if (typeof t === 'string' && (t.startsWith('META|') || t.startsWith('P|') || t.startsWith('H|'))) out.push(t); } catch (e) {} }
        for (const k of Object.keys(o)) { if (/label|_labels|data|_data|items|_items|views|_views/i.test(k)) walk(o[k], d + 1); }
      };
      walk(src, 0);
    }
    return out;
  };
  window.__plCollect = () => {
    const texts = window.__plLabels();
    let meta = null; const rows = [];
    for (const t of texts) for (const ln of t.split('\n')) {
      if (ln.startsWith('META|')) meta = ln; else if (ln.startsWith('P|') || ln.startsWith('H|')) rows.push(ln);
    }
    return meta ? { meta, rows } : null;
  };

  // ── מכונת המצבים ────────────────────────────────────────────────────────────
  window.__rwStep = async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const v = x => (x && typeof x === 'object' && typeof x.value === 'function') ? x.value() : x;
    const c = TradingViewApi.activeChart();
    const r = await TradingViewApi.replayApi();
    const inR = () => v(c._chartWidget.model().isInReplay());
    const stopR = async () => { try { const p = r.stopReplay(); if (p && typeof p.then === 'function') await Promise.race([p, wait(6000)]); } catch (e) { W.log.push('stop ' + String(e).slice(0, 60)); } await wait(4000); };
    const t0 = Date.now();
    const out = { state: W.state, ci: W.ci };
    try {
      if (W.state === 'done' || W.state === 'idle') return out;
      const [sym, res, name] = W.combos[W.ci];
      out.name = name;
      if (W.state === 'init') {
        if (inR()) await stopR();
        if (c.symbol() !== sym) { c.setSymbol(sym); await wait(5000); }
        if (c.resolution() !== res) { c.setResolution(res); await wait(5000); }
        W.store[name] = { name, sym, res, windows: [], retry: 0 };
        W.state = 'poll'; W.last = null; W.stable = 0; W.polls = 0; out.did = 'init'; out.inReplay = inR();
        return out;
      }
      if (W.state === 'poll') {
        const S = W.store[name];
        let committed = false, w = null;
        while (Date.now() - t0 < 30000) {
          const col = window.__plCollect();
          W.polls++;
          if (col && col.meta && c.symbol() === sym && c.resolution() === res) {
            const parts = col.meta.split('|');
            const sig = col.rows.length + ':' + parts.slice(2, 7).join('|');
            if (W.last === sig) W.stable++; else W.stable = 0;
            W.last = sig;
            if (W.stable >= 1) {
              const firstT = Number(parts[4]), lastT = Number(parts[5]);
              w = { meta: col.meta, bars: Number(parts[3]), firstT, lastT, rows: col.rows, n: col.rows.length, replay: inR(), at: Date.now() };
              S.windows.push(w); committed = true; break;
            }
          }
          if (W.polls > 60) { W.log.push('timeout ' + name + ' w' + S.windows.length); w = { error: 'timeout', rows: [], firstT: null }; S.windows.push(w); committed = true; break; }
          await wait(2500);
        }
        if (!committed) { out.did = 'polling'; out.sig = W.last; return out; }
        if (S.windows.length === 1 && w.replay) {
          // החלון הראשון חייב להיות חי
          S.retry++;
          if (S.retry > 2) { S.windows[0] = { error: 'not-live', rows: [], firstT: null }; W.ci++; W.state = W.ci >= W.combos.length ? 'done' : 'init'; out.did = 'giveup'; return out; }
          S.windows.pop(); await stopR(); W.last = null; W.stable = 0; W.polls = 0; out.did = 'retry-live'; return out;
        }
        out.did = 'commit w' + S.windows.length + ' n=' + (w.n || 0) + ' ' + (w.firstT ? new Date(w.firstT).toISOString().slice(0, 10) + '..' + new Date(w.lastT).toISOString().slice(0, 10) : 'err');
        const coverDays = w.firstT ? (Date.now() - w.firstT) / 86400000 : 9999;
        const maxWin = W.cfg.maxWin[res] || 1;
        if (!w.firstT || coverDays >= W.cfg.coverDays || S.windows.length >= maxWin) {
          W.ci++; W.state = W.ci >= W.combos.length ? 'done' : 'init'; out.next = W.state; return out;
        }
        const nextT = w.firstT + W.cfg.overlapBars * W.cfg.tfMs[res];
        try {
          if (!v(r.isReplayToolbarVisible())) r.showReplayToolbar();
          await wait(800);
          const p = r.selectDate(nextT);
          if (p && typeof p.then === 'function') await Promise.race([p, wait(8000)]);
        } catch (e) { W.log.push('select ' + String(e).slice(0, 60)); }
        W.last = null; W.stable = 0; W.polls = 0;
        await wait(3000);
        return out;
      }
    } catch (e) { W.log.push('err ' + String(e).slice(0, 100)); out.err = String(e).slice(0, 100); }
    return out;
  };
  window.__rwSafeStep = () => { if (W.busy) return 'busy'; W.busy = true; Promise.resolve(window.__rwStep()).catch(e => W.log.push('err ' + String(e).slice(0, 80))).finally(() => { W.busy = false; }); return 'started'; };

  // ── כפתור ייצוא ללוח ─────────────────────────────────────────────────────────
  if (!document.getElementById('__btDl')) {
    const b = document.createElement('button');
    b.id = '__btDl'; b.textContent = 'COPY R STORE';
    Object.assign(b.style, { position: 'fixed', top: '6px', right: '240px', zIndex: 999999, padding: '6px 10px', background: '#0a84ff', color: '#fff', border: 0, borderRadius: '6px', cursor: 'pointer' });
    b.onclick = () => { const json = JSON.stringify({ exportedAt: Date.now(), cfg: W.cfg, combos: W.store, log: W.log }); navigator.clipboard.writeText(json).then(() => { b.textContent = 'COPIED ' + (json.length / 1e6).toFixed(1) + 'MB'; }).catch(e => { b.textContent = 'ERR ' + e; }); };
    document.body.appendChild(b);
  }
  return 'collector ready: combos ' + W.combos.length;
})();
