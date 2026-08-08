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
  // Count alerts with any resolved outcome (user manual OR auto)
  const rows = db.prepare(`
    SELECT factors_json, outcome, user_outcome, tp1_hit, tp2_hit, tp3_hit, sl_hit
    FROM alerts
    WHERE factors_json IS NOT NULL
      AND (
        user_outcome IN ('win','loss','be')
        OR outcome IN ('tp1','tp2','tp3','sl')
      )
  `).all() as Array<{
    factors_json: string
    outcome: string
    user_outcome: string | null
    tp1_hit: number
    tp2_hit: number
    tp3_hit: number
    sl_hit: number
  }>

  const grouped: Record<string, { tp1: number; tp2: number; sl: number; count: number }> = {}

  for (const row of rows) {
    let factors: string[]
    try {
      factors = JSON.parse(row.factors_json)
    } catch {
      continue
    }
    const key = [...factors].sort().join('|')
    if (!grouped[key]) grouped[key] = { tp1: 0, tp2: 0, sl: 0, count: 0 }
    grouped[key].count++

    // user_outcome takes priority; fall back to automated tp1_hit/sl_hit
    const uo = row.user_outcome
    if (uo === 'win')       grouped[key].tp1++
    else if (uo === 'loss') grouped[key].sl++
    else {
      if (row.tp1_hit) grouped[key].tp1++
      if (row.tp2_hit) grouped[key].tp2++
      if (row.sl_hit)  grouped[key].sl++
    }
  }

  return Object.entries(grouped)
    .filter(([, v]) => v.count >= 3)
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

  const outcomed = (db.prepare(`
    SELECT COUNT(*) as c FROM alerts
    WHERE user_outcome IN ('win','loss','be')
       OR outcome IN ('tp1','tp2','tp3','sl')
  `).get() as { c: number }).c

  // TP1 hit: automated flag OR user said win
  const tp1 = (db.prepare(`
    SELECT COUNT(*) as c FROM alerts
    WHERE tp1_hit = 1 OR user_outcome = 'win'
  `).get() as { c: number }).c

  // TP2 hit: automated flag only (user doesn't distinguish tp1 vs tp2)
  const tp2 = (db.prepare(`
    SELECT COUNT(*) as c FROM alerts WHERE tp2_hit = 1
  `).get() as { c: number }).c

  const tp3 = (db.prepare(`
    SELECT COUNT(*) as c FROM alerts WHERE tp3_hit = 1
  `).get() as { c: number }).c

  // SL hit: automated flag OR user said loss
  const sl = (db.prepare(`
    SELECT COUNT(*) as c FROM alerts
    WHERE sl_hit = 1 OR user_outcome = 'loss'
  `).get() as { c: number }).c

  const pending = (db.prepare(`
    SELECT COUNT(*) as c FROM alerts
    WHERE (outcome IS NULL OR outcome = 'pending')
      AND (user_outcome IS NULL)
  `).get() as { c: number }).c

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
