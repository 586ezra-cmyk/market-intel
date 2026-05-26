'use client'

import { useState, useEffect, useCallback } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectionsData {
  webhookUrl: string
  serverUrl: string
  secretPreview: string
  secretLength: number
  envOverride: boolean
  webhookLogs: Array<{ id: string; event: string; symbol: string; receivedAt: number; ok: boolean }>
  telegram: {
    ok: boolean
    token: string
    chatId: string
    topics: { daily: string; weekly: string; high: string; news: string }
  }
}

// ─── Pine Script templates ────────────────────────────────────────────────────

function buildTemplates(secret: string, webhookUrl: string) {
  const base = { secret, symbol: '{{ticker}}', timeframe: '{{interval}}', time: '{{timenow}}' }

  return {
    fvg: {
      label: 'FVG',
      color: 'text-blue-400',
      desc: 'Fair Value Gap — נוצר כשיש פער בין נרות',
      json: JSON.stringify({
        ...base,
        event: 'fvg_created',
        direction: '{{plot_0}}',   // 1=bullish, -1=bearish (from Pine)
        topPrice: '{{plot_1}}',
        bottomPrice: '{{plot_2}}',
      }, null, 2),
    },
    structure: {
      label: 'BOS/CHoCH',
      color: 'text-yellow-400',
      desc: 'שבירת מבנה שוק',
      json: JSON.stringify({
        ...base,
        event: 'structure',
        type: '{{plot_0}}',        // "BOS" or "CHoCH"
        direction: '{{plot_1}}',   // "bullish" or "bearish"
        price: '{{plot_2}}',
        confirmed: true,
      }, null, 2),
    },
    liquidity: {
      label: 'Liquidity',
      color: 'text-purple-400',
      desc: 'רמות נזילות — Equal Highs/Lows',
      json: JSON.stringify({
        ...base,
        event: 'liquidity',
        type: '{{plot_0}}',        // "buy_side" or "sell_side"
        price: '{{plot_1}}',
        firstTime: '{{plot_2}}',
      }, null, 2),
    },
    sweep: {
      label: 'Liquidity Sweep',
      color: 'text-red-400',
      desc: 'ניקוי נזילות — wick מעבר לרמה וחזרה',
      json: JSON.stringify({
        ...base,
        event: 'liquidity_sweep',
        high: '{{high}}',
        low: '{{low}}',
        close: '{{close}}',
      }, null, 2),
    },
    smt: {
      label: 'SMT',
      color: 'text-emerald-400',
      desc: 'Smart Money Technique — דיברגנס בין BTC ל-ETH',
      json: JSON.stringify({
        ...base,
        event: 'smt',
        asset1: '{{ticker}}',
        asset1Price: '{{close}}',
        asset1High: '{{high}}',
        asset1Low: '{{low}}',
        asset2: '{{plot_0}}',      // שם הנכס השני מה-Pine
        asset2Price: '{{plot_1}}',
        asset2High: '{{plot_2}}',
        asset2Low: '{{plot_3}}',
      }, null, 2),
    },
    ifvg: {
      label: 'iFVG',
      color: 'text-teal-400',
      desc: 'Inverse FVG — ריטסט של פער שהתמלא',
      json: JSON.stringify({
        ...base,
        event: 'ifvg',
        direction: '{{plot_0}}',   // "bullish" or "bearish"
        price: '{{close}}',
      }, null, 2),
    },
    ob: {
      label: 'Order Block',
      color: 'text-pink-400',
      desc: 'Order Block — נר אחרון לפני displacement',
      json: JSON.stringify({
        ...base,
        event: 'order_block',
        direction: '{{plot_0}}',   // "bullish" or "bearish"
        price: '{{close}}',
      }, null, 2),
    },
    confluence: {
      label: 'Confluence (כולם)',
      color: 'text-orange-400',
      desc: 'כל האישורים ביחד — ה-alert הראשי',
      json: JSON.stringify({
        ...base,
        event: 'confluence',
        direction: '{{plot_0}}',
        currentPrice: '{{close}}',
        factorCount: '{{plot_1}}',
        inKillZone: '{{plot_2}}',
        killZone: '{{plot_3}}',
        dealingZone: '{{plot_4}}',
        rangePosition: '{{plot_5}}',
        hasBOSorCHoCH: '{{plot_6}}',
        hasLiquiditySweep: '{{plot_7}}',
        hasFVG: '{{plot_8}}',
        hasIFVG: '{{plot_9}}',
        hasSMT: '{{plot_10}}',
        hasISMT: '{{plot_11}}',
        hasWyckoff: '{{plot_12}}',
        wyckoffPhase: '{{plot_13}}',
        hasOB: '{{plot_14}}',
        hasJudas: '{{plot_15}}',
        aboveBBupper: '{{plot_16}}',
        belowBBlower: '{{plot_17}}',
        bbSqueeze: '{{plot_18}}',
      }, null, 2),
    },
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text, label = 'העתק' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={copy}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        copied
          ? 'bg-green-700 text-green-100'
          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
      }`}
    >
      {copied ? '✓ הועתק' : label}
    </button>
  )
}

function SectionCard({ title, status, children }: {
  title: string; status?: 'ok' | 'error' | 'warn' | 'idle'; children: React.ReactNode
}) {
  const dot = status === 'ok'    ? 'bg-green-500'
            : status === 'error' ? 'bg-red-500'
            : status === 'warn'  ? 'bg-yellow-500'
            : 'bg-gray-500'
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2 h-2 rounded-full ${dot}`} />
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TabConnections() {
  const [data, setData]               = useState<ConnectionsData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [fullSecret, setFullSecret]   = useState('')
  const [showSecret, setShowSecret]   = useState(false)
  const [activeTemplate, setTemplate] = useState<keyof ReturnType<typeof buildTemplates>>('confluence')
  const [pineScript, setPineScript]   = useState('')
  const [showPine, setShowPine]       = useState(false)
  const [loadingPine, setLoadingPine] = useState(false)
  const [serverUrlInput, setServerUrlInput] = useState('')
  const [savingUrl, setSavingUrl]     = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [testing, setTesting]         = useState(false)
  const [testResult, setTestResult]   = useState<string | null>(null)

  // Telegram form state
  const [tgToken,   setTgToken]   = useState('')
  const [tgChatId,  setTgChatId]  = useState('')
  const [tgDaily,   setTgDaily]   = useState('')
  const [tgWeekly,  setTgWeekly]  = useState('')
  const [tgHigh,    setTgHigh]    = useState('')
  const [tgNews,    setTgNews]    = useState('')
  const [savingTg,  setSavingTg]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/connections`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d: ConnectionsData = await r.json()
      setData(d)
      setServerUrlInput(d.serverUrl || '')
      setTgChatId(d.telegram.chatId || '')
      setTgDaily(d.telegram.topics.daily || '')
      setTgWeekly(d.telegram.topics.weekly || '')
      setTgHigh(d.telegram.topics.high || '')
      setTgNews(d.telegram.topics.news || '')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleShowSecret = async () => {
    if (showSecret) { setShowSecret(false); return }
    try {
      const r = await fetch(`${API}/api/connections/secret`)
      const d = await r.json()
      setFullSecret(d.secret)
      setShowSecret(true)
    } catch { setFullSecret('שגיאה בטעינה') }
  }

  const handleRegenerate = async () => {
    if (!confirm('לייצר Secret חדש? כל התראות TradingView הקיימות יפסיקו לעבוד עד שתעדכן את הסוד שם.')) return
    setRegenerating(true)
    try {
      const r = await fetch(`${API}/api/connections/regenerate-secret`, { method: 'POST' })
      const d = await r.json()
      if (!d.ok) { alert(d.error); return }
      setFullSecret(d.secret)
      setShowSecret(true)
      setData(prev => prev ? { ...prev, secretPreview: d.secret.slice(0, 6) + '••••••••••••••••••' } : prev)
    } finally {
      setRegenerating(false)
    }
  }

  const handleSaveUrl = async () => {
    setSavingUrl(true)
    try {
      await fetch(`${API}/api/connections/server-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: serverUrlInput }),
      })
      await load()
    } finally {
      setSavingUrl(false)
    }
  }

  const handleTestWebhook = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await fetch(`${API}/api/connections/test-webhook`, { method: 'POST' })
      const d = await r.json()
      setTestResult(d.ok ? '✅ נשלחה כניסת בדיקה — בדוק את ה-Inbox למטה' : '❌ שגיאה')
      await load() // refresh logs
    } catch {
      setTestResult('❌ לא הצלחנו להתחבר לשרת')
    } finally {
      setTesting(false)
    }
  }

  const handleLoadPineScript = async () => {
    if (pineScript) { setShowPine(v => !v); return }
    setLoadingPine(true)
    try {
      const r = await fetch(`${API}/api/connections/pine-script`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const txt = await r.text()
      setPineScript(txt)
      setShowPine(true)
    } catch (e: any) {
      alert(`שגיאה בטעינת Pine Script: ${e.message}`)
    } finally {
      setLoadingPine(false)
    }
  }

  const handleSaveTelegram = async () => {
    setSavingTg(true)
    try {
      await fetch(`${API}/api/connections/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token:       tgToken || undefined,
          chatId:      tgChatId,
          topicDaily:  tgDaily,
          topicWeekly: tgWeekly,
          topicHigh:   tgHigh,
          topicNews:   tgNews,
        }),
      })
      await load()
    } finally {
      setSavingTg(false)
    }
  }

  // ── Templates
  const secret      = showSecret ? fullSecret : (data?.secretPreview ?? '••••••••••••••••••••••••')
  const templates   = buildTemplates(
    showSecret ? fullSecret : 'YOUR_SECRET',
    data?.webhookUrl ?? 'https://your-server.railway.app/webhook/tradingview',
  )
  const tpl         = templates[activeTemplate]
  const webhookUrl  = data?.webhookUrl || ''

  if (loading) return (
    <div className="p-6 text-center text-gray-400 text-sm">טוען...</div>
  )

  if (error) return (
    <div className="p-6">
      <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 text-sm text-red-300">
        ❌ לא ניתן להתחבר לשרת: <code className="ml-2 font-mono">{error}</code>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        ודא שהשרת פועל ב-<code>{API}</code>
      </p>
    </div>
  )

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-100">🔌 חיבורים</h2>
        <button onClick={load} className="text-xs text-gray-500 hover:text-gray-300">רענן</button>
      </div>

      {/* ── TradingView Webhook ─────────────────────────────────────────── */}
      <SectionCard
        title="TradingView Webhook"
        status={webhookUrl ? 'ok' : 'warn'}
      >
        {/* Server URL */}
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1">URL של השרת (Railway)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={serverUrlInput}
              onChange={e => setServerUrlInput(e.target.value)}
              placeholder="https://market-server-production.up.railway.app"
              className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1.5
                         text-xs text-gray-200 font-mono placeholder:text-gray-600"
            />
            <button
              onClick={handleSaveUrl}
              disabled={savingUrl}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded"
            >
              {savingUrl ? '...' : 'שמור'}
            </button>
          </div>
        </div>

        {/* Webhook URL (auto-built) */}
        {webhookUrl && (
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1">Webhook URL — העתק לטרייד ויו</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5
                               text-xs text-green-300 font-mono overflow-x-auto whitespace-nowrap">
                {webhookUrl}
              </code>
              <CopyButton text={webhookUrl} />
            </div>
          </div>
        )}

        {/* Secret */}
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1">
            Secret Token
            {data?.envOverride && (
              <span className="mr-2 text-yellow-400">(מוגדר מ-ENV, לא ניתן לשנות כאן)</span>
            )}
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5
                             text-xs font-mono text-gray-300 overflow-x-auto whitespace-nowrap">
              {showSecret ? fullSecret : (data?.secretPreview ?? '••••••••••••••••••••')}
            </code>
            <button
              onClick={handleShowSecret}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
            >
              {showSecret ? 'הסתר' : 'הצג'}
            </button>
            {showSecret && <CopyButton text={fullSecret} />}
            {!data?.envOverride && (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-red-900 text-gray-300 hover:text-red-300 rounded"
              >
                {regenerating ? '...' : 'חדש'}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-600">
            הכנס את הסוד הזה בשדה ה-Message של כל Alert בטרייד ויו (ראה תבנית למטה)
          </p>
        </div>

        {/* Test button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleTestWebhook}
            disabled={testing}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
          >
            {testing ? '⏳ שולח...' : '🧪 שלח בדיקה'}
          </button>
          {testResult && <span className="text-xs text-gray-300">{testResult}</span>}
        </div>

        {/* Webhook Inbox */}
        {data && data.webhookLogs.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">📥 הודעות אחרונות</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {data.webhookLogs.map(log => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 py-1 px-2 rounded text-xs bg-gray-900"
                >
                  <span className={log.ok ? 'text-green-500' : 'text-red-500'}>
                    {log.ok ? '●' : '●'}
                  </span>
                  <span className="text-gray-500 font-mono tabular-nums">
                    {new Date(log.receivedAt).toLocaleTimeString('he-IL')}
                  </span>
                  <span className="text-gray-400 font-mono">{log.symbol}</span>
                  <span className="text-gray-300">{log.event}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {data && data.webhookLogs.length === 0 && (
          <p className="mt-3 text-xs text-gray-600">
            אין הודעות עדיין — לחץ "שלח בדיקה" כדי לוודא שהשרת פועל
          </p>
        )}
      </SectionCard>

      {/* ── Pine Script Templates ────────────────────────────────────────── */}
      <SectionCard title="תבניות Pine Script — העתק לשדה Alert Message" status="idle">
        <p className="text-xs text-gray-500 mb-3">
          צור Alert בטרייד ויו, בחר את ה-Condition שלך, ובשדה Message הדבק את הקוד המתאים.
          TradingView ימלא אוטומטית את <code className="bg-gray-700 px-1 rounded">&#123;&#123;ticker&#125;&#125;</code> וכד'.
        </p>

        {/* Template selector */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(Object.entries(templates) as [keyof typeof templates, typeof tpl][]).map(([key, t]) => (
            <button
              key={key}
              onClick={() => setTemplate(key)}
              className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                activeTemplate === key
                  ? 'bg-blue-700 border-blue-500 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <span className={t.color}>{t.label}</span>
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-500 mb-2">{tpl.desc}</p>

        {/* JSON display */}
        <div className="relative">
          <pre className="bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono
                          text-gray-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {tpl.json}
          </pre>
          <div className="absolute top-2 left-2">
            <CopyButton text={tpl.json} />
          </div>
        </div>

        <p className="mt-2 text-xs text-gray-600">
          ⚠️ החלף את <code className="bg-gray-700 px-1 rounded">{'{{plot_0}}'}</code> לפי מה שה-Pine Script שלך מוציא
        </p>
      </SectionCard>

      {/* ── Pine Script Download ────────────────────────────────────────── */}
      <SectionCard title="📄 ICT Master — Pine Script לטרייד ויו" status="idle">
        <p className="text-xs text-gray-400 mb-3">
          הקוד שמריץ את כל הזיהויים על גרף TradingView ושולח webhooks לשרת.
          מכיל: FVG, BOS/CHoCH, Liquidity, Kill Zones, SMT/iSMT, Wyckoff, Order Block, Judas Swing.
        </p>
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={handleLoadPineScript}
            disabled={loadingPine}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded"
          >
            {loadingPine ? '⏳ טוען...' : showPine ? 'הסתר קוד' : '📋 הצג קוד Pine Script'}
          </button>
          {pineScript && <CopyButton text={pineScript} label="העתק הכל" />}
        </div>

        {showPine && pineScript && (
          <pre className="bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono
                          text-green-300 overflow-x-auto max-h-80 overflow-y-auto leading-relaxed whitespace-pre">
            {pineScript}
          </pre>
        )}

        <div className="mt-3 space-y-1.5 text-xs text-gray-500">
          <p>📌 <strong className="text-gray-400">שלב 1:</strong> פתח Pine Script Editor בטרייד ויו → לחץ "+" → New indicator</p>
          <p>📌 <strong className="text-gray-400">שלב 2:</strong> העתק את כל הקוד → הדבק → שמור ולחץ "Add to chart"</p>
          <p>📌 <strong className="text-gray-400">שלב 3:</strong> בהגדרות ה-Indicator → שנה <code className="bg-gray-700 px-1 rounded">Secret</code> לסוד שלך (ראה למעלה)</p>
          <p>📌 <strong className="text-gray-400">שלב 4:</strong> צור Alert → Condition: <em>ICT Master ← Any Alert</em> → Webhook URL → Message: אוטומטי</p>
        </div>
      </SectionCard>

      {/* ── Telegram ─────────────────────────────────────────────────────── */}
      <SectionCard
        title="Telegram Bot"
        status={data?.telegram.ok ? 'ok' : 'warn'}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Bot Token</label>
            <input
              type="password"
              value={tgToken}
              onChange={e => setTgToken(e.target.value)}
              placeholder={data?.telegram.token ? '••••••••  (מוגדר)' : 'הכנס Bot Token מ-@BotFather'}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5
                         text-xs text-gray-200 font-mono placeholder:text-gray-600"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Chat ID / Supergroup ID</label>
            <input
              type="text"
              value={tgChatId}
              onChange={e => setTgChatId(e.target.value)}
              placeholder="-100123456789"
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5
                         text-xs text-gray-200 font-mono placeholder:text-gray-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {([
              ['topicDaily',  'מסחר יומי (Topic ID)',   tgDaily,  setTgDaily],
              ['topicWeekly', 'מסחר שבועי (Topic ID)',  tgWeekly, setTgWeekly],
              ['topicHigh',   'דירוגים 7+ (Topic ID)',  tgHigh,   setTgHigh],
              ['topicNews',   'דוחות כלכליים (Topic)', tgNews,   setTgNews],
            ] as [string, string, string, (v: string) => void][]).map(([, label, val, setter]) => (
              <div key={label}>
                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                <input
                  type="text"
                  value={val}
                  onChange={e => setter(e.target.value)}
                  placeholder="0"
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5
                             text-xs text-gray-200 font-mono placeholder:text-gray-600"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSaveTelegram}
              disabled={savingTg}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded"
            >
              {savingTg ? '...' : 'שמור'}
            </button>
            {data?.telegram.ok ? (
              <span className="text-xs text-green-400">✅ Telegram מוגדר</span>
            ) : (
              <span className="text-xs text-yellow-500">⚠️ Telegram לא מוגדר עדיין</span>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Setup guide ──────────────────────────────────────────────────── */}
      <SectionCard title="🗺️ מדריך הגדרה — 4 צעדים" status="idle">
        <ol className="space-y-3 text-xs text-gray-400 list-none">
          {[
            ['1', 'הכנס את ה-URL של השרת ב-Railway למעלה ולחץ שמור — ה-Webhook URL יתמלא אוטומטית'],
            ['2', 'בטרייד ויו: פתח Pine Script Editor → הדבק את הקוד שנבנה (יגיע בהמשך) → Add to Chart'],
            ['3', 'צור Alert בטרייד ויו: Condition → ICT Master → Webhook URL → Message (מהתבניות למעלה)'],
            ['4', 'לחץ "שלח בדיקה" — אם רואים ● ב-Inbox, הכל עובד ✅'],
          ].map(([num, text]) => (
            <li key={num} className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-700 flex items-center
                               justify-center text-gray-300 font-bold text-xs">{num}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  )
}
