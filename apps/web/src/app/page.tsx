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
import { useWebSocket } from '@/hooks/useWebSocket'

export type TabId =
  | 'dashboard' | 'alerts' | 'stats' | 'alert-settings'
  | 'journal' | 'backtest' | 'watchlist' | 'matrix'
  | 'history-scan' | 'economic-calendar' | 'knowledge-base'
  | 'notes' | 'reports' | 'quick-confluence' | 'learning'

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'dashboard',         label: 'דשבורד',          icon: '📊' },
  { id: 'alerts',            label: 'התראות',           icon: '🔔' },
  { id: 'stats',             label: 'סטטיסטיקה',        icon: '📈' },
  { id: 'alert-settings',    label: 'ניהול התראות',     icon: '⚙️' },
  { id: 'journal',           label: 'יומן מסחר',        icon: '📓' },
  { id: 'backtest',          label: 'בק-טסטינג',        icon: '🔬' },
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
  useWebSocket()

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
      <Header />

      {/* Tab Bar */}
      <div className="flex items-center gap-0.5 bg-surface-raised border-b border-surface-border px-4 overflow-x-auto shrink-0">
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
            {activeTab === 'alerts'            && <TabAlerts />}
            {activeTab === 'stats'             && <TabStats />}
            {activeTab === 'alert-settings'    && <TabAlertSettings />}
            {activeTab === 'journal'           && <TabJournal />}
            {activeTab === 'backtest'          && <TabBacktest />}
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
