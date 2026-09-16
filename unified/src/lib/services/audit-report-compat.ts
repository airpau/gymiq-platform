/**
 * Stored audit reports come in older shapes. The first reports (May 2026)
 * predate plan mix, tenure, frozen analysis, benchmarks, visit frequency and
 * most of the revenue block, and the report page crashed reading them.
 *
 * normalizeAuditReport() fills in everything the page reads: values that can
 * be derived from the old fields are derived, everything else gets an empty
 * default, and `legacyRevenue` tells the page to hide the revenue figures an
 * old report never computed rather than show zeros.
 */
import type { AuditReport } from '@/lib/services/audit-analysis'

type Loose = Record<string, unknown>

const obj = (v: unknown): Loose => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {})
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export type NormalizedAuditReport = AuditReport & {
  /** True when the stored report predates the revenue block (total, ARPU, run rate, LTV). */
  legacyRevenue: boolean
}

export function normalizeAuditReport(raw: unknown): NormalizedAuditReport {
  const r = obj(raw)
  const totals = obj(r.totals)
  const revenue = obj(r.revenue)
  const risk = obj(r.risk)
  const sleepers = obj(r.sleepers)
  const visits = obj(r.visits)
  const freq = obj(visits.frequencyDistribution)
  const payments = obj(r.payments)
  const tenure = obj(r.tenure)
  const frozen = obj(r.frozen)
  const ps = obj(r.parseSummary)

  const active = num(totals.activeMembers)
  const frozenMembers = num(totals.frozenMembers)
  const sleeper = num(totals.sleeperMembers)
  const legacyRevenue = typeof revenue.totalMonthlyRevenue !== 'number'
  const monthlyFeeAssumed = revenue.monthlyFeeAssumed === true
  const pricing = str(revenue.pricingSource)

  return {
    ...(r as unknown as AuditReport),
    totals: {
      rowsParsed: num(totals.rowsParsed, num(ps.rowsParsed)),
      activeMembers: active,
      cancelledMembers: num(totals.cancelledMembers),
      frozenMembers,
      sleeperMembers: sleeper,
      liveMembers: num(totals.liveMembers, active + frozenMembers + sleeper),
    },
    revenue: {
      totalMonthlyRevenue: num(revenue.totalMonthlyRevenue),
      annualRunRate: num(revenue.annualRunRate),
      arpuMonthly: num(revenue.arpuMonthly, num(revenue.avgMonthlyFee)),
      avgMonthlyFee: num(revenue.avgMonthlyFee),
      medianMonthlyFee: numOrNull(revenue.medianMonthlyFee),
      estimatedLTV: num(revenue.estimatedLTV),
      avgTenureMonths: num(revenue.avgTenureMonths),
      monthlyRevenueAtRisk: num(revenue.monthlyRevenueAtRisk),
      monthlyRevenueDeepSleepers: num(revenue.monthlyRevenueDeepSleepers),
      monthlyRevenueFrozen: num(revenue.monthlyRevenueFrozen),
      monthlyRevenueOverdue: num(revenue.monthlyRevenueOverdue),
      pricingSource:
        pricing === 'column' || pricing === 'plan-name' || pricing === 'estimate' ? pricing : monthlyFeeAssumed ? 'estimate' : 'column',
      monthlyFeeAssumed,
    },
    risk: {
      high: num(risk.high),
      medium: num(risk.medium),
      low: num(risk.low),
      highRiskPercent: num(risk.highRiskPercent),
    },
    sleepers: {
      light: num(sleepers.light),
      deep: num(sleepers.deep),
      critical: num(sleepers.critical),
      lost: num(sleepers.lost),
    },
    visits: {
      medianDaysSinceVisit: numOrNull(visits.medianDaysSinceVisit),
      p25DaysSinceVisit: numOrNull(visits.p25DaysSinceVisit),
      p75DaysSinceVisit: numOrNull(visits.p75DaysSinceVisit),
      membersWithNoVisitData: num(visits.membersWithNoVisitData),
      membersZeroVisits30d: num(visits.membersZeroVisits30d),
      frequencyDistribution: {
        power: num(freq.power),
        regular: num(freq.regular),
        slipping: num(freq.slipping),
        dormant: num(freq.dormant),
        unknown: num(freq.unknown),
      },
    },
    payments: {
      overdueCount: num(payments.overdueCount),
      overdueRecoveryStage1: num(payments.overdueRecoveryStage1),
      overdueRecoveryStage2: num(payments.overdueRecoveryStage2),
      overdueRecoveryStage3: num(payments.overdueRecoveryStage3),
      dueTodayCount: num(payments.dueTodayCount),
    },
    planMix: arr(r.planMix),
    tenure: {
      available: tenure.available === true && Array.isArray(tenure.cohorts),
      cohorts: arr(tenure.cohorts),
      avgTenureDays: numOrNull(tenure.avgTenureDays),
      medianTenureDays: numOrNull(tenure.medianTenureDays),
    },
    frozen: {
      count: num(frozen.count),
      monthlyRevenueLost: num(frozen.monthlyRevenueLost),
      avgDaysFrozen: numOrNull(frozen.avgDaysFrozen),
    },
    newMemberDropoutRisk: num(r.newMemberDropoutRisk),
    benchmarks: arr(r.benchmarks),
    topDeepSleepers: arr(r.topDeepSleepers),
    topPaymentOverdue: arr(r.topPaymentOverdue),
    topNewMemberRisk: arr(r.topNewMemberRisk),
    topFrozen: arr(r.topFrozen),
    actionPlan: arr(r.actionPlan),
    parseSummary: {
      ...(ps as unknown as AuditReport['parseSummary']),
      rowsParsed: num(ps.rowsParsed, num(totals.rowsParsed)),
      rowsSkipped: num(ps.rowsSkipped),
      warnings: arr<string>(ps.warnings),
      detectedColumns: obj(ps.detectedColumns) as AuditReport['parseSummary']['detectedColumns'],
      allHeaders: arr<string>(ps.allHeaders),
      pricingSource: (str(ps.pricingSource) as AuditReport['parseSummary']['pricingSource'] | undefined) ?? (monthlyFeeAssumed ? 'estimate' : 'column'),
      paymentStatusColumn: str(ps.paymentStatusColumn) ?? null,
      outstandingBalanceColumn: str(ps.outstandingBalanceColumn) ?? null,
    },
    insights: r.insights ? (r.insights as AuditReport['insights']) : undefined,
    legacyRevenue,
  }
}
