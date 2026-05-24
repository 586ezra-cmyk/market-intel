import type Database from 'better-sqlite3'

export interface FactorStat {
  factors: string[]
  tp1Rate: number
  tp2Rate: number
  slRate: number
  count: number
}

export interface WinRateSummary {
  totalAlerts: number
  totalOutcomed: number
  tp1Rate: number
  tp2Rate: number
  tp3Rate: number
  slRate: number
  pendingCount: number
  expiredCount: number
}

export function getFactorStats(db: Database.Database): FactorStat[] {
  // Group by factors_json and compute win rates
  const rows = db.prepare(`
    SELECT factors_json, outcome, tp1_hit, tp2_hit, tp3_hit, sl_hit
    FROM alerts
    WHERE outcome != 'pending' AND factors_json IS NOT NULL
  `).all() as Array<{
    factors_json: string
    outcome: string
    tp1_hit: number
    tp2_hit: number
    tp3_hit: number
    sl_hit: number
  }>

  // Group by factors combination
  const grouped: Record<string, { tp1: number; tp2: number; sl: number; count: number }> = {}

  for (const row of rows) {
    let factors: string[]
    try {
      factors = JSON.parse(row.factors_json)
    } catch {
      continue
    }
    // Use sorted join as key for grouping
    const key = [...factors].sort().join('|')
    if (!grouped[key]) grouped[key] = { tp1: 0, tp2: 0, sl: 0, count: 0 }
    grouped[key].count++
    if (row.tp1_hit) grouped[key].tp1++
    if (row.tp2_hit) grouped[key].tp2++
    if (row.sl_hit)  grouped[key].sl++
  }

  return Object.entries(grouped)
    .filter(([, v]) => v.count >= 3)  // minimum 3 samples
    .map(([key, v]) => ({
      factors: key.split('|'),
      tp1Rate: parseFloat(((v.tp1 / v.count) * 100).toFixed(1)),
      tp2Rate: parseFloat(((v.tp2 / v.count) * 100).toFixed(1)),
      slRate:  parseFloat(((v.sl  / v.count) * 100).toFixed(1)),
      count: v.count,
    }))
    .sort((a, b) => b.tp1Rate - a.tp1Rate)
}

export function getTopCombinations(db: Database.Database, limit = 10): FactorStat[] {
  return getFactorStats(db).slice(0, limit)
}

export function getWinRateSummary(db: Database.Database): WinRateSummary {
  const total = (db.prepare('SELECT COUNT(*) as c FROM alerts').get() as { c: number }).c
  const outcomed = (db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE outcome NOT IN ('pending','expired')`).get() as { c: number }).c
  const tp1 = (db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE tp1_hit = 1`).get() as { c: number }).c
  const tp2 = (db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE tp2_hit = 1`).get() as { c: number }).c
  const tp3 = (db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE tp3_hit = 1`).get() as { c: number }).c
  const sl  = (db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE sl_hit = 1`).get() as { c: number }).c
  const pending = (db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE outcome = 'pending'`).get() as { c: number }).c
  const expired = (db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE outcome = 'expired'`).get() as { c: number }).c

  const base = outcomed || 1
  return {
    totalAlerts: total,
    totalOutcomed: outcomed,
    tp1Rate: parseFloat(((tp1 / base) * 100).toFixed(1)),
    tp2Rate: parseFloat(((tp2 / base) * 100).toFixed(1)),
    tp3Rate: parseFloat(((tp3 / base) * 100).toFixed(1)),
    slRate:  parseFloat(((sl  / base) * 100).toFixed(1)),
    pendingCount: pending,
    expiredCount: expired,
  }
}
