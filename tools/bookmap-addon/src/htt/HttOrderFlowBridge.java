package htt;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import velox.api.layer1.Layer1ApiAdminAdapter;
import velox.api.layer1.Layer1ApiDataAdapter;
import velox.api.layer1.Layer1ApiFinishable;
import velox.api.layer1.Layer1ApiInstrumentListener;
import velox.api.layer1.Layer1ApiProvider;
import velox.api.layer1.annotations.Layer1ApiVersion;
import velox.api.layer1.annotations.Layer1ApiVersionValue;
import velox.api.layer1.annotations.Layer1Attachable;
import velox.api.layer1.annotations.Layer1StrategyName;
import velox.api.layer1.common.ListenableHelper;
import velox.api.layer1.data.InstrumentInfo;
import velox.api.layer1.data.TradeInfo;

/**
 * HTT Order Flow Bridge — תוסף Bookmap (Layer1 API) ששולח לשרת המסחר נרות דקה עם נפח הקונים התוקפים.
 *
 * מה הוא עושה: מאזין לכל עסקה (onTrade) בנכסים הפתוחים ב-Bookmap, צובר לכל דקה: פתיחה/שיא/שפל/סגירה, נפח כולל
 * ונפח הקונים התוקפים (isBidAggressor), ושולח כל 10 שניות ל-POST /api/orderflow/ingest — אותו מבנה כמו נרות ה-Binance,
 * כך שהאתר מציג ל-NQ דלתא, CVD, ספיגה ודיברגנס בדיוק כמו לקריפטו.
 *
 * אבטחה: טוקן האדמין נקרא מהקובץ ~/.config/market-intel/secrets.env (שורת ADMIN_TOKEN=...) — לא מוקלד ולא נשמר בתוסף.
 * אפשר לעקוף עם משתני סביבה HTT_SERVER / HTT_ADMIN_TOKEN.
 *
 * נכסים: רק שורשים מהרשימה ROOTS (כרגע NQ). "NQZ6.CME@BMD" → NQ. עותקי Instrument Copy (@Copy) מתעלמים כדי לא לספור פעמיים.
 */
@Layer1Attachable
@Layer1StrategyName("HTT Order Flow Bridge")
@Layer1ApiVersion(Layer1ApiVersionValue.VERSION2)
public class HttOrderFlowBridge implements Layer1ApiFinishable, Layer1ApiAdminAdapter, Layer1ApiDataAdapter, Layer1ApiInstrumentListener {

    private static final Set<String> ROOTS = Set.of("NQ");
    private static final Pattern FUT = Pattern.compile("^([A-Z]{1,4})[FGHJKMNQUVXZ]\\d{1,2}$");
    private static final long MIN_MS = 60_000L;
    private static final int FLUSH_SECONDS = 10;

    private final Layer1ApiProvider provider;
    private final String server;
    private final String token;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ScheduledExecutorService exec = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "htt-orderflow-bridge");
        t.setDaemon(true);
        return t;
    });

    private final Object lock = new Object();
    /** alias → פרטי הנכס (pips להמרת מחיר, שורש לסימול בשרת) */
    private final Map<String, Instrument> instruments = new HashMap<>();
    /** symbol בשרת (NQ) → הנר הנוכחי */
    private final Map<String, Bar> current = new HashMap<>();
    /** נרות שנסגרו ועדיין לא נשלחו */
    private final Map<String, List<Bar>> pending = new HashMap<>();
    private long sent = 0, failures = 0;
    private String lastError = "";

    private static final class Instrument {
        final String symbol; final double pips;
        Instrument(String symbol, double pips) { this.symbol = symbol; this.pips = pips; }
    }

    private static final class Bar {
        final long t; double o, h, l, c, vol, buy;
        Bar(long t, double px) { this.t = t; o = h = l = c = px; }
        String json() {
            return String.format(Locale.ROOT, "{\"t\":%d,\"o\":%s,\"h\":%s,\"l\":%s,\"c\":%s,\"vol\":%s,\"buy\":%s}", t, d(o), d(h), d(l), d(c), d(vol), d(buy));
        }
        private static String d(double v) { return String.format(Locale.ROOT, "%.4f", v); }
    }

    public HttOrderFlowBridge(Layer1ApiProvider provider) {
        this.provider = provider;
        String[] cfg = loadConfig();
        this.server = cfg[0];
        this.token = cfg[1];
        ListenableHelper.addListeners(provider, this);
        exec.scheduleAtFixedRate(this::flushSafe, FLUSH_SECONDS, FLUSH_SECONDS, TimeUnit.SECONDS);
        log("started → " + server + (token.isEmpty() ? " (אין טוקן! ADMIN_TOKEN חסר ב-secrets.env)" : " (טוקן נטען)"));
    }

    // ─── הגדרות: ~/.config/market-intel/secrets.env או משתני סביבה ───
    private static String[] loadConfig() {
        String server = System.getenv("HTT_SERVER");
        String token = System.getenv("HTT_ADMIN_TOKEN");
        try {
            Path p = Paths.get(System.getProperty("user.home"), ".config", "market-intel", "secrets.env");
            if (Files.exists(p)) {
                for (String line : Files.readAllLines(p, StandardCharsets.UTF_8)) {
                    String s = line.trim();
                    if (s.startsWith("#") || !s.contains("=")) continue;
                    if (s.startsWith("export ")) s = s.substring(7).trim();
                    int i = s.indexOf('=');
                    String k = s.substring(0, i).trim();
                    String v = s.substring(i + 1).trim();
                    if (v.length() >= 2 && (v.startsWith("\"") && v.endsWith("\"") || v.startsWith("'") && v.endsWith("'"))) v = v.substring(1, v.length() - 1);
                    if (k.equals("ADMIN_TOKEN") && (token == null || token.isEmpty())) token = v;
                    if (k.equals("BACKEND_URL") && (server == null || server.isEmpty())) server = v;
                }
            }
        } catch (IOException e) {
            log("secrets.env read failed: " + e.getMessage());
        }
        if (server == null || server.isEmpty()) server = "https://marketserver-production.up.railway.app";
        if (token == null) token = "";
        return new String[] { server.replaceAll("/+$", ""), token };
    }

    // ─── נכסים ───
    @Override
    public void onInstrumentAdded(String alias, InstrumentInfo info) {
        String symbol = symbolFor(alias, info.symbol);
        if (symbol == null) return;
        synchronized (lock) {
            instruments.put(alias, new Instrument(symbol, info.pips));
        }
        log("tracking " + alias + " → " + symbol + " (pips " + info.pips + ")");
    }

    @Override
    public void onInstrumentRemoved(String alias) {
        synchronized (lock) { instruments.remove(alias); }
    }

    @Override public void onInstrumentNotFound(String symbol, String exchange, String type) { }
    @Override public void onInstrumentAlreadySubscribed(String symbol, String exchange, String type) { }

    /** "NQZ6.CME@BMD" / "NQZ6" → NQ; עותקים (@Copy, @TM…) ושורשים שלא ברשימה → null */
    static String symbolFor(String alias, String symbol) {
        if (alias.contains("@") && !alias.endsWith("@BMD")) return null;
        String s = symbol == null ? alias : symbol;
        int dot = s.indexOf('.');
        if (dot > 0) s = s.substring(0, dot);
        int at = s.indexOf('@');
        if (at > 0) s = s.substring(0, at);
        Matcher m = FUT.matcher(s.toUpperCase(Locale.ROOT));
        String root = m.matches() ? m.group(1) : s.toUpperCase(Locale.ROOT);
        return ROOTS.contains(root) ? root : null;
    }

    // ─── עסקאות ───
    @Override
    public void onTrade(String alias, double price, int size, TradeInfo tradeInfo) {
        if (tradeInfo != null && tradeInfo.isOtc) return;
        Instrument ins;
        synchronized (lock) { ins = instruments.get(alias); }
        if (ins == null || size <= 0) return;
        double px = price * ins.pips;
        long t = (System.currentTimeMillis() / MIN_MS) * MIN_MS;
        boolean buy = tradeInfo != null && tradeInfo.isBidAggressor;
        synchronized (lock) {
            Bar b = current.get(ins.symbol);
            if (b == null || b.t != t) {
                if (b != null) pending.computeIfAbsent(ins.symbol, k -> new ArrayList<>()).add(b);
                b = new Bar(t, px);
                current.put(ins.symbol, b);
            }
            b.h = Math.max(b.h, px);
            b.l = Math.min(b.l, px);
            b.c = px;
            b.vol += size;
            if (buy) b.buy += size;
        }
    }

    // ─── שליחה לשרת ───
    private void flushSafe() {
        try { flush(); } catch (Exception e) { failures++; lastError = e.toString(); log("flush failed: " + e); }
    }

    private void flush() throws IOException, InterruptedException {
        if (token.isEmpty()) return;
        Map<String, List<Bar>> batch = new HashMap<>();
        synchronized (lock) {
            for (Map.Entry<String, List<Bar>> e : pending.entrySet()) batch.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).addAll(e.getValue());
            pending.clear();
            // גם הנר הנוכחי (חלקי) — השרת מחליף אותו בכל שליחה (INSERT OR REPLACE), כך שהאתר מתעדכן תוך כדי הדקה
            for (Map.Entry<String, Bar> e : current.entrySet()) batch.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(copy(e.getValue()));
        }
        for (Map.Entry<String, List<Bar>> e : batch.entrySet()) {
            if (e.getValue().isEmpty()) continue;
            StringBuilder sb = new StringBuilder("{\"symbol\":\"").append(e.getKey()).append("\",\"bars\":[");
            for (int i = 0; i < e.getValue().size(); i++) { if (i > 0) sb.append(','); sb.append(e.getValue().get(i).json()); }
            sb.append("]}");
            HttpRequest req = HttpRequest.newBuilder(URI.create(server + "/api/orderflow/ingest"))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token)
                .POST(HttpRequest.BodyPublishers.ofString(sb.toString(), StandardCharsets.UTF_8))
                .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                sent += e.getValue().size();
            } else {
                failures++;
                lastError = "HTTP " + res.statusCode() + " " + res.body();
                log("server answered " + res.statusCode() + ": " + (res.body().length() > 160 ? res.body().substring(0, 160) : res.body()));
                synchronized (lock) { // נשמור את הנרות הסגורים לניסיון הבא
                    for (Bar b : e.getValue()) if (current.get(e.getKey()) == null || b.t != current.get(e.getKey()).t) pending.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(b);
                }
            }
        }
    }

    private static Bar copy(Bar b) {
        Bar c = new Bar(b.t, b.o);
        c.h = b.h; c.l = b.l; c.c = b.c; c.vol = b.vol; c.buy = b.buy;
        return c;
    }

    @Override
    public void finish() {
        exec.shutdownNow();
        ListenableHelper.removeListeners(provider, this);
        log("stopped (sent " + sent + " bars, failures " + failures + (lastError.isEmpty() ? "" : ", last: " + lastError) + ")");
    }

    private static void log(String s) {
        System.out.println("[HTT Order Flow Bridge] " + s);
    }
}
