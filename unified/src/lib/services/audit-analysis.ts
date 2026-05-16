/**
 * Audit analysis — takes parsed members from an uploaded CSV and produces
 * a comprehensive retention report. Pure function: no I/O, no DB calls.
 *
 * Inputs come straight from parseMemberFile().
 * Output gets stored as JSONB in the audits table and rendered on the
 * /audit/[reportId] page.
 */
import { scoreChurnRisk, type ChurnScore } from './churn-engine'
import type { ParsedMember, ParseSummary } from '@/lib/csv/parse-members'

// Industry default if the export has no monthly-value column.
const DEFAULT_MONTHLY_FEE_GBP = 40

export interface ScoredMember extends ParsedMember {
  riskScore: number
  riskBand: 'low' | 'medium' | 'high'
  factors: string[]
  sleeperCategory: ChurnScore['sleeperCategory']
  interventionType: ChurnScore['interventionType']
  daysSinceLastVisit: number | null
  daysOverdue: number | null
  monthlyValueEstimate: number
}

export interface AuditReport {
  // High-level counts
  totals: {
    rowsParsed: number
    activeMembers: number
    cancelledMembers: number
    frozenMembers: number
    sleeperMembers: number
  }
  // Risk distribution
  risk: {
    high: number
    medium: number
    low: number
    highRiskPercent: number
  }
  // Sleeper buckets (intervention windows)
  sleepers: {
    light: number // 14-20 days
    deep: number // 21-45 days
    critical: number // 46-60 days (manual call)
    lost: number // 60+ days
  }
  // Revenue
  revenue: {
    monthlyRevenueAtRisk: number // £ from high-risk members
    monthlyRevenueDeepSleepers: number // £ from 21-45 day sleepers (rescuable)
    monthlyRevenueOverdue: number // £ from payment-overdue members
    avgMonthlyFee: number
    monthlyFeeAssumed: boolean // true if no monthlyValue column existed
  }
  // Visit / payment health
  visits: {
    medianDaysSinceVisit: number | null
    p25DaysSinceVisit: number | null
    p75DaysSinceVisit: number | null
    membersWithNoVisitData: number
    membersZeroVisits30d: number
  }
  payments: {
    overdueCount: number
    overdueRecoveryStage1: number
    overdueRecoveryStage2: number
    overdueRecoveryStage3: number
  }
  // New member health
  newMemberDropoutRisk: number // joined < 30 days ago, zero visits
  // Top action lists (max 25 each)
  topDeepSleepers: ScoredMember[]
  topPaymentOverdue: ScoredMember[]
  topNewMemberRisk: ScoredMember[]
  // Recommendations
  actionPlan: ActionItem[]
  // Diagnostics
  parseSummary: ParseSummary
}

export interface ActionItem {
  priority: 1 | 2 | 3 | 4 | 5
  title: string
  body: string
  estimatedRevenueImpact: number | null
}

const MAX_LIST_LEN = 25

export function analyseAudit(members: ParsedMember[], parseSummary: ParseSummary): AuditReport {
  // 1. Score every member.
  const scored: ScoredMember[] = members.map((m) => {
    const score = scoreChurnRisk(m)
    return {
      ...m,
      riskScore: score.riskScore,
      riskBand: score.riskBand,
      factors: score.factors,
      sleeperCategory: score.sleeperCategory,
      interventionType: score.interventionType,
      daysSinceLastVisit: score.daysSinceLastVisit,
      daysOverdue: score.daysOverdue,
      monthlyValueEstimate: m.monthlyValue ?? DEFAULT_MONTHLY_FEE_GBP,
    }
  })

  // 2. Bucket counts.
  let active = 0,
    cancelled = 0,
    frozen = 0,
    sleeper = 0
  for (const m of scored) {
    if (m.status === 'cancelled') cancelled++
    else if (m.status === 'frozen') frozen++
    else if (m.status === 'sleeper') sleeper++
    else active++
  }

  // 3. Risk distribution (only on non-cancelled).
  const live = scored.filter((m) => m.status !== 'cancelled')
  let highRisk = 0,
    medRisk = 0,
    lowRisk = 0
  for (const m of live) {
    if (m.riskBand === 'high') highRisk++
    else if (m.riskBand === 'medium') medRisk++
    else lowRisk++
  }

  // 4. Sleeper buckets (intervention windows).
  let lightSleeper = 0,
    deepSleeper = 0,
    criticalSleeper = 0,
    lostSleeper = 0
  for (const m of live) {
    const d = m.daysSinceLastVisit
    if (d === null) continue
    if (d >= 60) lostSleeper++
    else if (d >= 46) criticalSleeper++
    else if (d >= 21) deepSleeper++
    else if (d >= 14) lightSleeper++
  }

  // 5. Revenue calculations.
  const monthlyFeeAssumed = members.every((m) => m.monthlyValue === null)
  const avgFee =
    scored.length === 0
      ? DEFAULT_MONTHLY_FEE_GBP
      : scored.reduce((acc, m) => acc + m.monthlyValueEstimate, 0) / scored.length

  const highRiskMembers = live.filter((m) => m.riskBand === 'high')
  const monthlyRevenueAtRisk = sumMonthly(highRiskMembers)

  const deepSleeperMembers = live.filter(
    (m) => m.sleeperCategory === 'deep' && (m.daysSinceLastVisit ?? 0) < 46,
  )
  const monthlyRevenueDeepSleepers = sumMonthly(deepSleeperMembers)

  const overdueMembers = live.filter((m) => m.daysOverdue !== null)
  const monthlyRevenueOverdue = sumMonthly(overdueMembers)

  // 6. Visit percentiles.
  const visitDays = live
    .map((m) => m.daysSinceLastVisit)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)
  const medianDaysSinceVisit = percentile(visitDays, 0.5)
  const p25DaysSinceVisit = percentile(visitDays, 0.25)
  const p75DaysSinceVisit = percentile(visitDays, 0.75)
  const membersWithNoVisitData = live.filter((m) => m.daysSinceLastVisit === null).length
  const membersZeroVisits30d = live.filter((m) => m.visitCount30d === 0).length

  // 7. Payment health.
  let stage1 = 0,
    stage2 = 0,
    stage3 = 0
  for (const m of overdueMembers) {
    const d = m.daysOverdue ?? 0
    if (d >= 15) stage3++
    else if (d >= 8) stage2++
    else stage1++
  }

  // 8. New-member dropout risk.
  const now = new Date()
  const newMemberDropoutRisk = live.filter((m) => {
    if (!m.joinDate) return false
    const daysSinceJoin = Math.floor((now.getTime() - m.joinDate.getTime()) / 86_400_000)
    return daysSinceJoin <= 30 && m.visitCount30d === 0
  }).length

  // 9. Action lists.
  const topDeepSleepers = [...deepSleeperMembers]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, MAX_LIST_LEN)
  const topPaymentOverdue = [...overdueMembers]
    .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0))
    .slice(0, MAX_LIST_LEN)
  const topNewMemberRisk = live
    .filter((m) => {
      if (!m.joinDate) return false
      const daysSinceJoin = Math.floor((now.getTime() - m.joinDate.getTime()) / 86_400_000)
      return daysSinceJoin <= 60 && m.visitCount30d <= 2
    })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, MAX_LIST_LEN)

  // 10. Recommendations.
  const actionPlan = buildActionPlan({
    deepSleeperCount: deepSleeper,
    monthlyRevenueDeepSleepers,
    overdueStage1: stage1,
    overdueStage2: stage2,
    overdueStage3: stage3,
    monthlyRevenueOverdue,
    newMemberDropoutRisk,
    highRiskCount: highRisk,
    monthlyRevenueAtRisk,
    membersZeroVisits30d,
  })

  return {
    totals: {
      rowsParsed: members.length,
      activeMembers: active,
      cancelledMembers: cancelled,
      frozenMembers: frozen,
      sleeperMembers: sleeper,
    },
    risk: {
      high: highRisk,
      medium: medRisk,
      low: lowRisk,
      highRiskPercent: live.length ? Math.round((highRisk / live.length) * 100) : 0,
    },
    sleepers: {
      light: lightSleeper,
      deep: deepSleeper,
      critical: criticalSleeper,
      lost: lostSleeper,
    },
    revenue: {
      monthlyRevenueAtRisk: Math.round(monthlyRevenueAtRisk),
      monthlyRevenueDeepSleepers: Math.round(monthlyRevenueDeepSleepers),
      monthlyRevenueOverdue: Math.round(monthlyRevenueOverdue),
      avgMonthlyFee: Math.round(avgFee),
      monthlyFeeAssumed,
    },
    visits: {
      medianDaysSinceVisit,
      p25DaysSinceVisit,
      p75DaysSinceVisit,
      membersWithNoVisitData,
      membersZeroVisits30d,
    },
    payments: {
      overdueCount: overdueMembers.length,
      overdueRecoveryStage1: stage1,
      overdueRecoveryStage2: stage2,
      overdueRecoveryStage3: stage3,
    },
    newMemberDropoutRisk,
    topDeepSleepers: redact(topDeepSleepers),
    topPaymentOverdue: redact(topPaymentOverdue),
    topNewMemberRisk: redact(topNewMemberRisk),
    actionPlan,
    parseSummary,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sumMonthly(list: ScoredMember[]): number {
  return list.reduce((acc, m) => acc + m.monthlyValueEstimate, 0)
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))
  return sorted[idx]
}

/** Mask the back half of email/phone so the report never displays PII in full. */
function redact(list: ScoredMember[]): ScoredMember[] {
  return list.map((m) => ({
    ...m,
    email: m.email ? maskEmail(m.email) : null,
    phone: m.phone ? maskPhone(m.phone) : null,
  }))
}

function maskEmail(e: string): string {
  const [user, domain] = e.split('@')
  if (!domain) return e
  const visible = user.slice(0, Math.min(2, user.length))
  return `${visible}${'•'.repeat(Math.max(2, user.length - 2))}@${domain}`
}

function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, '')
  if (digits.length <= 4) return p
  return `${digits.slice(0, digits.length - 4).replace(/./g, '•')}${digits.slice(-4)}`
}

function buildActionPlan(stats: {
  deepSleeperCount: number
  monthlyRevenueDeepSleepers: number
  overdueStage1: number
  overdueStage2: number
  overdueStage3: number
  monthlyRevenueOverdue: number
  newMemberDropoutRisk: number
  highRiskCount: number
  monthlyRevenueAtRisk: number
  membersZeroVisits30d: number
}): ActionItem[] {
  const items: ActionItem[] = []

  if (stats.deepSleeperCount > 0) {
    items.push({
      priority: 1,
      title: `Call the ${stats.deepSleeperCount} deep sleepers this week`,
      body: `These members haven't visited in 21–45 days — the sweet spot. A friendly call from a real human (or AI cancel-save) saves ~70% of them. Each save protects ${formatGbp(stats.monthlyRevenueDeepSleepers / Math.max(1, stats.deepSleeperCount))}/month in recurring revenue.`,
      estimatedRevenueImpact: stats.monthlyRevenueDeepSleepers,
    })
  }

  if (stats.overdueStage3 > 0) {
    items.push({
      priority: 2,
      title: `Recover ${stats.overdueStage3} accounts at final-notice stage`,
      body: `These members are 15+ days overdue. Send a "we want you back" offer with a one-time payment plan. ${formatGbp(stats.monthlyRevenueOverdue)} of monthly revenue is currently outstanding.`,
      estimatedRevenueImpact: stats.monthlyRevenueOverdue,
    })
  }

  if (stats.newMemberDropoutRisk > 0) {
    items.push({
      priority: 2,
      title: `Rescue ${stats.newMemberDropoutRisk} new members who haven't shown up`,
      body: `Members who joined in the last 30 days and have zero visits are highest-priority. A welcome session or buddy-up offer in week 2 dramatically improves first-90-day retention.`,
      estimatedRevenueImpact: null,
    })
  }

  if (stats.overdueStage2 > 0) {
    items.push({
      priority: 3,
      title: `Send recovery reminders to ${stats.overdueStage2} accounts (8–14 days late)`,
      body: `An automated, warm-tone WhatsApp reminder converts 30–50% of these without escalation.`,
      estimatedRevenueImpact: null,
    })
  }

  if (stats.membersZeroVisits30d > 0) {
    items.push({
      priority: 3,
      title: `Re-engage ${stats.membersZeroVisits30d} members with zero visits this month`,
      body: `Cohort messaging: a class invite, a new-equipment announcement, or a buddy day. Track who responds and prioritise the rest for human follow-up.`,
      estimatedRevenueImpact: null,
    })
  }

  if (stats.highRiskCount > 0) {
    items.push({
      priority: 4,
      title: `Set up daily risk alerts in your CRM`,
      body: `Right now ${stats.highRiskCount} members are in the high-risk band. A daily 02:00 batch job (GymIQ does this for you) flags anyone hitting the 14- or 21-day intervention window so staff can act before the member quits.`,
      estimatedRevenueImpact: stats.monthlyRevenueAtRisk,
    })
  }

  // Always include a "tidy your data" recommendation
  items.push({
    priority: 5,
    title: 'Audit your data once a month',
    body: 'A 60-second upload here every 4 weeks gives you a trend line you can show your team. Most operators see a 10–20% drop in revenue-at-risk within two months once they start running this on cadence.',
    estimatedRevenueImpact: null,
  })

  return items.sort((a, b) => a.priority - b.priority).slice(0, 10)
}

function formatGbp(n: number): string {
  if (!Number.isFinite(n)) return '£0'
  return `£${Math.round(n).toLocaleString('en-GB')}`
}
