'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/layout/Header'
import TabDashboard from '@/components/tabs/TabDashboard'
import TabAlerts from '@/components/tabs/TabAlerts'
import TabStats from '@/components/tabs/TabStats'
import TabAlertSettings from '@/components/tabs/TabAlertSettings'
import TabJournal from '@/components/tabs/TabJournal'
import TabBacktest from '@/components/tabs/TabBacktest'
import TabWatchlist from '@/components/tabs/TabWatchlist'
import TabMatrix from '@/components/tabs/TabMatrix'
import TabHistoryScan from '@/components/tabs/TabHistoryScan'
import TabEconomicCalendar from '@/components/tabs/TabEconomicCalendar'
import TabKnowledgeBase from '@/components/tabs/TabKnowledgeBase'
import TabNotes from '@/components/tabs/TabNotes'
import TabReports from '@/components/tabs/TabReports'
import TabQuickConfluence from '@/components/tabs/TabQuickConfluence'
import TabLearning from '@/components/tabs/TabLearning'
import TabConnections from '@/components/tabs/TabConnections'
import TabHttBacktest from '@/components/tabs/TabHttBacktest'
import TabOrderFlow from '@/components/tabs/TabOrderFlow'
import TabLiveBoard from '@/components/tabs/TabLiveBoard'
import { useWebSocket } from '@/hooks/useWebSocket'

export type TabId =
  | 'dashboard' | 'alerts' | 'stats' | 'alert-settings'
  | 'journal' | 'backtest' | 'watchlist' | 'matrix'
  | 'history-scan' | 'economic-calendar' | 'knowledge-base'
  | 'notes' | 'reports' | 'quick-confluence' | 'learning'
  | 'connections' | 'htt-backtest' | 'orderflow' | 'live-board'

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'connections',        label: 'חיבורים',          icon: '🔌' },
  { id: 'dashboard',         label: 'דשבורד',          icon: '📊' },
  { id: 'live-board',        label: 'לוח החלטה',       icon: '🎛️' },
  { id: 'alerts',            label: 'התראות',           icon: '🔔' },
  { id: 'stats',             label: 'סטטיסטיקה',        icon: '📈' },
  { id: 'alert-settings',    label: 'ניהול התראות',     icon: '⚙️' },
  { id: 'journal',           label: 'יומן מסחר',        icon: '📓' },
  { id: 'backtest',          label: 'בק-טסטינג',        icon: '🔬' },
  { id: 'htt-backtest',      label: 'סטטיסטיקת בקטסט HTT', icon: '🧪' },
  { id: 'orderflow',         label: 'Order Flow',        icon: '🌊' },
  { id: 'watchlist',         label: 'רשימת מעקב',       icon: '👁️' },
  { id: 'matrix',            label: 'מטריצה',           icon: '🗂️' },
  { id: 'history-scan',      label: 'סריקה היסטורית',   icon: '🔍' },
  { id: 'economic-calendar', label: 'דוחות כלכליים',    icon: '📰' },
  { id: 'knowledge-base',    label: 'בסיס ידע',         icon: '📚' },
  { id: 'notes',             label: 'הערות',            icon: '✏️' },
  { id: 'reports',           label: 'דוחות',            icon: '📋' },
  { id: 'quick-confluence',  label: 'קונפלואנס מהיר',   icon: '⚡' },
  { id: 'learning',          label: 'לימודים',           icon: '🎓' },
]

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [solo, setSolo] = useState(false)   // /?tab=live-board&solo=1 — מסך נקי בלי כותרת וטאבים (למסך נפרד)
  useWebSocket()

  // קישור ישיר לטאב: /?tab=htt-backtest
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as TabId | null
    if (t && TABS.some(x => x.id === t)) setActiveTab(t)
    setSolo(new URLSearchParams(window.location.search).get('solo') === '1')
  }, [])

  // Allow tabs to switch programmatically (e.g. from Matrix click)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as TabId
      if (detail) setActiveTab(detail)
    }
    window.addEventListener('switch-tab', handler)
    return () => window.removeEventListener('switch-tab', handler)
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {!solo && <Header />}

      {/* Tab Bar */}
      <div className={`${solo ? 'hidden' : 'flex'} items-center gap-0.5 bg-surface-raised border-b border-surface-border px-4 overflow-x-auto shrink-0`}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Main content — dashboard is full-bleed (manages its own panels) */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'dashboard'         && <TabDashboard />}
        {activeTab !== 'dashboard' && (
          <main className="h-full overflow-auto">
            {activeTab === 'connections'        && <TabConnections />}
            {activeTab === 'alerts'            && <TabAlerts />}
            {activeTab === 'stats'             && <TabStats />}
            {activeTab === 'alert-settings'    && <TabAlertSettings />}
            {activeTab === 'journal'           && <TabJournal />}
            {activeTab === 'backtest'          && <TabBacktest />}
            {activeTab === 'htt-backtest'      && <TabHttBacktest />}
            {activeTab === 'orderflow'         && <TabOrderFlow />}
            {activeTab === 'live-board'        && <TabLiveBoard />}
            {activeTab === 'watchlist'         && <TabWatchlist />}
            {activeTab === 'matrix'            && <TabMatrix />}
            {activeTab === 'history-scan'      && <TabHistoryScan />}
            {activeTab === 'economic-calendar' && <TabEconomicCalendar />}
            {activeTab === 'knowledge-base'    && <TabKnowledgeBase />}
            {activeTab === 'notes'             && <TabNotes />}
            {activeTab === 'reports'           && <TabReports />}
            {activeTab === 'quick-confluence'  && <TabQuickConfluence />}
            {activeTab === 'learning'           && <TabLearning />}
          </main>
        )}
      </div>
    </div>
  )
}
