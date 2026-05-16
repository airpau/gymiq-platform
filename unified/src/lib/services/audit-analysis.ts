/**
 * Audit analysis — takes parsed members from an uploaded CSV and produces
 * a comprehensive retention + business report. Pure function: no I/O, no
 * DB calls, no AI.
 *
 * SLEEPER PHILOSOPHY:
 *   The traditional "let sleeping dogs lie" advice — never contact members
 *   who pay but don't visit — is being debunked by recent industry data
 *   (Motionsoft, IHRSA / Health & Fitness Association, GymMaster). 23% of
 *   all gym cancellations come from non-use. A single warm email + offer to
 *   dormant members has been shown to reduce monthly cancellations ~80%.
 *
 *   So this analysis does NOT recommend "do not contact" for any segment.
 *   Instead it stratifies by intervention window and proposes a *tone* and
 *   *offer* appropriate to each:
 *     • 14–20 days: friendly check-in, low pressure
 *     • 21–45 days: personal call, real human, save offer if needed
 *     • 46–60 days: empathetic "we miss you" + free month trial
 *     • 60+ days  : win-back campaign — class invite + 30-day reset offer
 *
 *   The only "do not contact" we keep is for *cancelled* members, where
 *   re-marketing belongs in a separate win-back flow with a longer cooldown.
 */
import { scoreChurnRisk, type ChurnScore } from './churn-engine'
import type { ParsedMember, ParseSummary } from '@/lib/csv/parse-members'

// Industry default if the export has no monthly-value column and no
// extractable price in any plan-name string.
const DEFAULT_MONTHLY_FEE_GBP = 40

// Estimated average member tenure in months (rough industry assumption used
// for LTV when the export has no join-date column). Health & Fitness
// Association data suggests ~12–24 months; we pick the lower end for
// conservativeness.
const DEFAULT_TENURE_MONTHS = 14

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
    /** Active + frozen + sleeper — anyone still on the books */
    liveMembers: number
  }

  // Revenue — the headline business metrics
  revenue: {
    totalMonthlyRevenue: number
    annualRunRate: number
    arpuMonthly: number // avg revenue per *live* member
    avgMonthlyFee: number
    medianMonthlyFee: number | null
    estimatedLTV: number // avg fee × avg tenure in months
    avgTenureMonths: number
    monthlyRevenueAtRisk: number // £ from high-risk members
    monthlyRevenueDeepSleepers: number
    monthlyRevenueFrozen: number
    monthlyRevenueOverdue: number
    pricingSource: 'column' | 'plan-name' | 'estimate'
    monthlyFeeAssumed: boolean
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
    light: number // 14–20 days
    deep: number // 21–45 days
    critical: number // 46–60 days
    lost: number // 60+ days
  }

  // Visit / payment health
  visits: {
    medianDaysSinceVisit: number | null
    p25DaysSinceVisit: number | null
    p75DaysSinceVisit: number | null
    membersWithNoVisitData: number
    membersZeroVisits30d: number
    /** How members split across visit frequency bands */
    frequencyDistribution: {
      power: number // visited in last 7 days
      regular: number // 8–14 days
      slipping: number // 15–30 days
      dormant: number // 31+ days
      unknown: number // no visit data
    }
  }
  payments: {
    overdueCount: number
    overdueRecoveryStage1: number // 1–7 days late
    overdueRecoveryStage2: number // 8–14 days
    overdueRecoveryStage3: number // 15+ days
    dueTodayCount: number // payment date is today (don't show as "overdue")
  }

  // Plan / membership mix
  planMix: PlanBucket[]

  // Tenure cohorts (built when joinDate is available)
  tenure: {
    available: boolean
    cohorts: TenureBucket[]
    avgTenureDays: number | null
    medianTenureDays: number | null
  }

  // Frozen-member analysis
  frozen: {
    count: number
    monthlyRevenueLost: number
    avgDaysFrozen: number | null
  }

  // New member health
  newMemberDropoutRisk: number // joined < 30 days, zero visits

  // How the gym compares to industry benchmarks
  benchmarks: Benchmark[]

  // Top action lists (max 25 each)
  topDeepSleepers: ScoredMember[]
  topPaymentOverdue: ScoredMember[]
  topNewMemberRisk: ScoredMember[]
  topFrozen: ScoredMember[]

  // Recommendations
  actionPlan: ActionItem[]

  // Diagnostics
  parseSummary: ParseSummary
}

export interface PlanBucket {
  name: string
  count: number
  monthlyValue: number | null
  monthlyRevenue: number
  share: number // 0..1
}

export interface TenureBucket {
  label: string // e.g. "0–30 days"
  count: number
  share: number
  highRiskCount: number
  monthlyRevenue: number
}

export interface Benchmark {
  metric: string
  yourValue: string
  industryValue: string
  sense: 'good' | 'mid' | 'bad'
  hint: string
}

export interface ActionItem {
  priority: 1 | 2 | 3 | 4 | 5
  title: string
  body: string
  estimatedRevenueImpact: number | null
}

// Generous cap so we don't truncate at typical gym sizes. Stored in the
// audit JSONB so the report page can decide how much to render at once.
const MAX_LIST_LEN = 500

export function analyseAudit(members: ParsedMember[], parseSummary: ParseSummary): AuditReport {
  const now = new Date()

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
  let active = 0, cancelled = 0, frozen = 0, sleeper = 0
  for (const m of scored) {
    if (m.status === 'cancelled') cancelled++
    else if (m.status === 'frozen') frozen++
    else if (m.status === 'sleeper') sleeper++
    else active++
  }
  const liveMembers = active + frozen + sleeper

  // 3. Live members (everyone still on the books)
  const live = scored.filter((m) => m.status !== 'cancelled')

  // 4. Revenue. Frozen members are paying nothing (or a token retainer); we
  //    exclude them from the headline monthly revenue and break them out separately.
  const billable = live.filter((m) => m.status !== 'frozen')
  const totalMonthlyRevenue = sum(billable.map((m) => m.monthlyValueEstimate))
  const frozenMonthly = sum(
    live.filter((m) => m.status === 'frozen').map((m) => m.monthlyValueEstimate),
  )
  const avgMonthlyFee =
    billable.length > 0 ? totalMonthlyRevenue / billable.length : DEFAULT_MONTHLY_FEE_GBP
  const sortedFees = billable
    .map((m) => m.monthlyValueEstimate)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b)
  const medianMonthlyFee = sortedFees.length ? sortedFees[Math.floor(sortedFees.length / 2)] : null

  // 5. Risk distribution (on live members).
  let highRisk = 0, medRisk = 0, lowRisk = 0
  for (const m of live) {
    if (m.riskBand === 'high') highRisk++
    else if (m.riskBand === 'medium') medRisk++
    else lowRisk++
  }

  // 6. Sleeper buckets.
  let lightSleeper = 0, deepSleeper = 0, criticalSleeper = 0, lostSleeper = 0
  for (const m of live) {
    const d = m.daysSinceLastVisit
    if (d === null) continue
    if (d >= 60) lostSleeper++
    else if (d >= 46) criticalSleeper++
    else if (d >= 21) deepSleeper++
    else if (d >= 14) lightSleeper++
  }

  // 7. Revenue at risk / by segment.
  const highRiskMembers = live.filter((m) => m.riskBand === 'high')
  const monthlyRevenueAtRisk = sum(highRiskMembers.map((m) => m.monthlyValueEstimate))
  const deepSleeperMembers = live.filter(
    (m) => m.sleeperCategory === 'deep' && (m.daysSinceLastVisit ?? 0) < 46,
  )
  const monthlyRevenueDeepSleepers = sum(deepSleeperMembers.map((m) => m.monthlyValueEstimate))

  // Overdue = nextPayment in the past OR a payment-failure signal from a
  // separate column (Glofox keeps next_payment_at pointed at the retry date
  // even when the previous charge bounced — without this fallback we badly
  // under-count overdue accounts).
  const overdueMembers = live.filter(
    (m) => (m.daysOverdue ?? 0) > 0 || m.paymentFailed,
  )
  const dueTodayCount = live.filter(
    (m) => m.daysOverdue === 0 && !m.paymentFailed,
  ).length
  const monthlyRevenueOverdue = sum(overdueMembers.map((m) => m.monthlyValueEstimate))

  // 8. Visit percentiles + frequency distribution.
  const visitDays = live
    .map((m) => m.daysSinceLastVisit)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)
  const medianDaysSinceVisit = percentile(visitDays, 0.5)
  const p25DaysSinceVisit = percentile(visitDays, 0.25)
  const p75DaysSinceVisit = percentile(visitDays, 0.75)
  const membersWithNoVisitData = live.filter((m) => m.daysSinceLastVisit === null).length
  const membersZeroVisits30d = live.filter((m) => m.visitCount30d === 0).length

  const freq = { power: 0, regular: 0, slipping: 0, dormant: 0, unknown: 0 }
  for (const m of live) {
    const d = m.daysSinceLastVisit
    if (d === null) {
      freq.unknown++
      continue
    }
    if (d <= 7) freq.power++
    else if (d <= 14) freq.regular++
    else if (d <= 30) freq.slipping++
    else freq.dormant++
  }

  // 9. Payment health. Members flagged via paymentFailed only (no date) count
  // as stage-2 by default — we don't know the exact lateness but they're
  // demonstrably in arrears.
  let stage1 = 0, stage2 = 0, stage3 = 0
  for (const m of overdueMembers) {
    const d = m.daysOverdue ?? 0
    if (d >= 15) stage3++
    else if (d >= 8) stage2++
    else if (d >= 1) stage1++
    else if (m.paymentFailed) stage2++
  }

  // 10. Plan mix.
  const planMap = new Map<string, { count: number; total: number; fees: number[] }>()
  for (const m of billable) {
    const key = m.membershipType ?? 'Unspecified plan'
    const cur = planMap.get(key) ?? { count: 0, total: 0, fees: [] }
    cur.count++
    cur.total += m.monthlyValueEstimate
    cur.fees.push(m.monthlyValueEstimate)
    planMap.set(key, cur)
  }
  const planMix: PlanBucket[] = Array.from(planMap.entries())
    .map(([name, v]) => ({
      name,
      count: v.count,
      monthlyValue: v.fees.length ? v.total / v.count : null,
      monthlyRevenue: v.total,
      share: billable.length ? v.count / billable.length : 0,
    }))
    .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
    .slice(0, 12)

  // 11. Tenure cohorts.
  const withTenure = live.filter((m) => m.tenureDays !== null) as Array<
    ScoredMember & { tenureDays: number }
  >
  const tenureAvailable = withTenure.length / Math.max(1, live.length) > 0.3
  const tenureBands: { label: string; min: number; max: number }[] = [
    { label: '0–30 days', min: 0, max: 30 },
    { label: '31–90 days', min: 31, max: 90 },
    { label: '91–180 days', min: 91, max: 180 },
    { label: '6–12 months', min: 181, max: 365 },
    { label: '1–2 years', min: 366, max: 730 },
    { label: '2+ years', min: 731, max: Number.MAX_SAFE_INTEGER },
  ]
  const cohorts: TenureBucket[] = tenureBands.map((band) => {
    const inBand = withTenure.filter((m) => m.tenureDays >= band.min && m.tenureDays <= band.max)
    return {
      label: band.label,
      count: inBand.length,
      share: withTenure.length ? inBand.length / withTenure.length : 0,
      highRiskCount: inBand.filter((m) => m.riskBand === 'high').length,
      monthlyRevenue: sum(inBand.map((m) => m.monthlyValueEstimate)),
    }
  })
  const avgTenureDays = withTenure.length
    ? withTenure.reduce((acc, m) => acc + m.tenureDays, 0) / withTenure.length
    : null
  const sortedTenure = withTenure.map((m) => m.tenureDays).sort((a, b) => a - b)
  const medianTenureDays = sortedTenure.length
    ? sortedTenure[Math.floor(sortedTenure.length / 2)]
    : null

  // 12. LTV — use observed avg tenure if available, otherwise the default.
  const avgTenureMonths =
    avgTenureDays !== null ? Math.max(1, avgTenureDays / 30) : DEFAULT_TENURE_MONTHS
  const estimatedLTV = avgMonthlyFee * avgTenureMonths

  // 13. Frozen-member analysis.
  const frozenMembers = live.filter((m) => m.status === 'frozen')
  const frozenWithLastVisit = frozenMembers.filter((m) => m.daysSinceLastVisit !== null)
  const avgDaysFrozen = frozenWithLastVisit.length
    ? frozenWithLastVisit.reduce((acc, m) => acc + (m.daysSinceLastVisit ?? 0), 0) /
      frozenWithLastVisit.length
    : null

  // 14. New-member dropout risk.
  const newMemberDropoutRisk = live.filter((m) => {
    if (!m.joinDate) return false
    const daysSinceJoin = Math.floor((now.getTime() - m.joinDate.getTime()) / 86_400_000)
    return daysSinceJoin <= 30 && m.visitCount30d === 0
  }).length

  // 15. Industry benchmarks.
  const benchmarks: Benchmark[] = []
  if (medianDaysSinceVisit !== null) {
    const median = medianDaysSinceVisit
    benchmarks.push({
      metric: 'Median days since last visit',
      yourValue: `${median} days`,
      industryValue: '~5–7 days for healthy clubs',
      sense: median <= 7 ? 'good' : median <= 14 ? 'mid' : 'bad',
      hint:
        median <= 7
          ? 'Your members are visiting frequently — the engagement core is healthy.'
          : median <= 14
          ? 'Slightly lower than top-quartile clubs. Cohort messaging can close the gap.'
          : 'Above the danger threshold. Half your members haven\'t been in for over two weeks.',
    })
  }
  const dormantShare = liveMembers ? freq.dormant / liveMembers : 0
  benchmarks.push({
    metric: 'Dormant share (31+ days no visit)',
    yourValue: `${Math.round(dormantShare * 100)}%`,
    industryValue: 'IHRSA: ~23% of cancellations come from non-use',
    sense: dormantShare < 0.15 ? 'good' : dormantShare < 0.3 ? 'mid' : 'bad',
    hint:
      dormantShare < 0.15
        ? 'Below average — your engagement loops are working.'
        : dormantShare < 0.3
        ? 'In line with the industry. A re-engagement campaign will move this.'
        : 'Above the industry norm. These members are likely to cancel next.',
  })
  if (avgTenureMonths) {
    benchmarks.push({
      metric: 'Estimated avg tenure',
      yourValue: `${avgTenureMonths.toFixed(1)} months`,
      industryValue: '~14 months for traditional clubs (HFA)',
      sense: avgTenureMonths >= 14 ? 'good' : avgTenureMonths >= 10 ? 'mid' : 'bad',
      hint:
        avgTenureMonths >= 14
          ? 'Strong tenure — your retention work is paying off.'
          : 'A 5% lift in retention typically grows profits 25–95%. Worth investing here.',
    })
  }
  benchmarks.push({
    metric: 'ARPU (per live member, per month)',
    yourValue: gbp(avgMonthlyFee),
    industryValue: 'UK independent gym range: £25–£60',
    sense: avgMonthlyFee >= 35 ? 'good' : 'mid',
    hint:
      avgMonthlyFee >= 35
        ? 'Healthy pricing — you have room to add value, not discount.'
        : 'Sub-£35 ARPU. Consider tier upgrades, premium add-ons, or PT bundles.',
  })

  // 16. Action lists.
  const topDeepSleepers = [...deepSleeperMembers]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, MAX_LIST_LEN)
  // Sort overdue by daysOverdue desc; paymentFailed-only members (no date)
  // sort to the top because they're indeterminately late.
  const topPaymentOverdue = [...overdueMembers]
    .sort((a, b) => {
      const aDays = a.daysOverdue ?? (a.paymentFailed ? Number.MAX_SAFE_INTEGER : -1)
      const bDays = b.daysOverdue ?? (b.paymentFailed ? Number.MAX_SAFE_INTEGER : -1)
      return bDays - aDays
    })
    .slice(0, MAX_LIST_LEN)
  const topNewMemberRisk = live
    .filter((m) => {
      if (!m.joinDate) return false
      const daysSinceJoin = Math.floor((now.getTime() - m.joinDate.getTime()) / 86_400_000)
      return daysSinceJoin <= 60 && m.visitCount30d <= 2
    })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, MAX_LIST_LEN)
  const topFrozen = [...frozenMembers]
    .sort((a, b) => (b.daysSinceLastVisit ?? 0) - (a.daysSinceLastVisit ?? 0))
    .slice(0, MAX_LIST_LEN)

  // 17. Recommendations — research-grounded, not "do nothing".
  const actionPlan = buildActionPlan({
    deepSleeperCount: deepSleeper,
    monthlyRevenueDeepSleepers,
    lostSleeperCount: lostSleeper,
    criticalSleeperCount: criticalSleeper,
    overdueStage1: stage1,
    overdueStage2: stage2,
    overdueStage3: stage3,
    monthlyRevenueOverdue,
    newMemberDropoutRisk,
    highRiskCount: highRisk,
    monthlyRevenueAtRisk,
    membersZeroVisits30d,
    frozenCount: frozen,
    frozenMonthly,
    arpu: avgMonthlyFee,
    estimatedLTV,
    tenureAvailable,
  })

  return {
    totals: {
      rowsParsed: members.length,
      activeMembers: active,
      cancelledMembers: cancelled,
      frozenMembers: frozen,
      sleeperMembers: sleeper,
      liveMembers,
    },
    revenue: {
      totalMonthlyRevenue: Math.round(totalMonthlyRevenue),
      annualRunRate: Math.round(totalMonthlyRevenue * 12),
      arpuMonthly: Math.round(avgMonthlyFee * 100) / 100,
      avgMonthlyFee: Math.round(avgMonthlyFee * 100) / 100,
      medianMonthlyFee: medianMonthlyFee !== null ? Math.round(medianMonthlyFee * 100) / 100 : null,
      estimatedLTV: Math.round(estimatedLTV),
      avgTenureMonths: Math.round(avgTenureMonths * 10) / 10,
      monthlyRevenueAtRisk: Math.round(monthlyRevenueAtRisk),
      monthlyRevenueDeepSleepers: Math.round(monthlyRevenueDeepSleepers),
      monthlyRevenueFrozen: Math.round(frozenMonthly),
      monthlyRevenueOverdue: Math.round(monthlyRevenueOverdue),
      pricingSource: parseSummary.pricingSource,
      monthlyFeeAssumed: parseSummary.pricingSource === 'estimate',
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
    visits: {
      medianDaysSinceVisit,
      p25DaysSinceVisit,
      p75DaysSinceVisit,
      membersWithNoVisitData,
      membersZeroVisits30d,
      frequencyDistribution: freq,
    },
    payments: {
      overdueCount: overdueMembers.length,
      overdueRecoveryStage1: stage1,
      overdueRecoveryStage2: stage2,
      overdueRecoveryStage3: stage3,
      dueTodayCount,
    },
    planMix,
    tenure: {
      available: tenureAvailable,
      cohorts,
      avgTenureDays,
      medianTenureDays,
    },
    frozen: {
      count: frozen,
      monthlyRevenueLost: Math.round(frozenMonthly),
      avgDaysFrozen,
    },
    newMemberDropoutRisk,
    benchmarks,
    topDeepSleepers: redact(topDeepSleepers),
    topPaymentOverdue: redact(topPaymentOverdue),
    topNewMemberRisk: redact(topNewMemberRisk),
    topFrozen: redact(topFrozen),
    actionPlan,
    parseSummary,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sum(arr: number[]): number {
  return arr.reduce((acc, n) => acc + n, 0)
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))
  return sorted[idx]
}

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
  lostSleeperCount: number
  criticalSleeperCount: number
  overdueStage1: number
  overdueStage2: number
  overdueStage3: number
  monthlyRevenueOverdue: number
  newMemberDropoutRisk: number
  highRiskCount: number
  monthlyRevenueAtRisk: number
  membersZeroVisits30d: number
  frozenCount: number
  frozenMonthly: number
  arpu: number
  estimatedLTV: number
  tenureAvailable: boolean
}): ActionItem[] {
  const items: ActionItem[] = []
  const formatGbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`

  if (stats.newMemberDropoutRisk > 0) {
    items.push({
      priority: 1,
      title: `Welcome the ${stats.newMemberDropoutRisk} new members who haven't shown up`,
      body: `These joined in the last 30 days with zero visits. Industry research (Health & Fitness Association) shows comprehensive onboarding — orientation plus three follow-ups — lifts 6-month retention from 60% to 87%. Each save is worth roughly ${formatGbp(stats.estimatedLTV)} in lifetime value.`,
      estimatedRevenueImpact: stats.newMemberDropoutRisk * stats.estimatedLTV,
    })
  }

  if (stats.deepSleeperCount > 0) {
    items.push({
      priority: 1,
      title: `Personal call the ${stats.deepSleeperCount} deep sleepers this week`,
      body: `Members 21–45 days without a visit are the most savable cohort. A real human call (or AI cancel-save conversation) typically saves ~70%. Don't sell — ask what changed. Each save protects ~${formatGbp(stats.arpu)}/month in recurring revenue.`,
      estimatedRevenueImpact: stats.monthlyRevenueDeepSleepers,
    })
  }

  if (stats.overdueStage3 > 0) {
    items.push({
      priority: 2,
      title: `Recover ${stats.overdueStage3} accounts at final-notice stage`,
      body: `These members are 15+ days overdue. Send a "we want you back" message with a one-time payment plan or short freeze offer instead of immediate cancellation. ${formatGbp(stats.monthlyRevenueOverdue)} of monthly revenue is currently outstanding across all overdue accounts.`,
      estimatedRevenueImpact: stats.monthlyRevenueOverdue,
    })
  }

  if (stats.criticalSleeperCount > 0) {
    items.push({
      priority: 2,
      title: `Send a "we miss you" + free-month offer to ${stats.criticalSleeperCount} critical sleepers`,
      body: `46–60 days dormant. Recent industry research (Motionsoft) shows a single warm email with a tactful offer cuts monthly cancellations ~80%. Frame it as "we'd love to have you back" rather than "use it or lose it".`,
      estimatedRevenueImpact: null,
    })
  }

  if (stats.lostSleeperCount > 0) {
    items.push({
      priority: 3,
      title: `Win-back campaign for ${stats.lostSleeperCount} long-dormant members`,
      body: `60+ days no visit. The old "let sleeping dogs lie" rule is being debunked — 23% of all gym cancellations come from non-use, and dormant payers eventually notice. Run a class invite or a fresh-start 30-day reset offer. Keep the tone empathetic, not pressuring.`,
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

  if (stats.frozenCount > 0) {
    items.push({
      priority: 3,
      title: `Check in with ${stats.frozenCount} frozen members`,
      body: `Frozen memberships are forgotten goldmines: ${formatGbp(stats.frozenMonthly)}/month is sitting paused. A check-in 30 days before the freeze ends massively lifts unfreeze rates — and surfaces who's about to cancel instead.`,
      estimatedRevenueImpact: stats.frozenMonthly,
    })
  }

  if (stats.membersZeroVisits30d > 0) {
    items.push({
      priority: 4,
      title: `Cohort message to ${stats.membersZeroVisits30d} members with zero visits this month`,
      body: `Members value communication: 9 in 10 say staff outreach matters, and two staff interactions in a month produces one extra visit the next. A class invite, new-equipment announcement, or buddy-day offer works.`,
      estimatedRevenueImpact: null,
    })
  }

  if (stats.highRiskCount > 0) {
    items.push({
      priority: 4,
      title: `Set up daily risk alerts in your CRM`,
      body: `Right now ${stats.highRiskCount} members are in the high-risk band. A daily 02:00 batch (GymIQ runs this for you) flags anyone hitting the 14- or 21-day intervention window so staff can act before the member quits. ${formatGbp(stats.monthlyRevenueAtRisk)}/month is at stake.`,
      estimatedRevenueImpact: stats.monthlyRevenueAtRisk,
    })
  }

  items.push({
    priority: 5,
    title: 'Audit your member data monthly',
    body: 'A 60-second upload here every 4 weeks gives you a trend line to show your team. Operators running this on cadence typically see a 10–20% drop in revenue-at-risk within two months — a 5% retention lift compounds to 25–95% profit growth.',
    estimatedRevenueImpact: null,
  })

  return items.sort((a, b) => a.priority - b.priority).slice(0, 10)
}

function gbp(n: number): string {
  if (!Number.isFinite(n)) return '£0'
  return `£${Math.round(n).toLocaleString('en-GB')}`
}
