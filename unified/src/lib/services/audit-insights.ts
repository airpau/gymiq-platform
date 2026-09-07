/**
 * Audit insights: the deep read of a member export.
 *
 * Everything here is what gymIQ finds on its first morning at a club, computed
 * from a single Memberships export. Pure function, no I/O. Every figure is a
 * monthly run rate unless the field name says otherwise, and every section says
 * which columns it needed so a thin export produces an honest report rather
 * than an invented one.
 *
 * The rules encode what was learned running a 1,600 member franchise club:
 *   - card and flexible payers fail at multiples of the Direct Debit rate
 *   - term endings with no renewal are a renewals list, not a billing fault
 *   - student rates leak as members age out, at about three a month
 *   - "30 days absent" is the wrong dormancy cut; measure against each member's own habit
 *   - annual upfront prices must be spread over 12 before any money is summed
 */
import type { ParsedMember } from '@/lib/csv/parse-members'

const DAY = 86_400_000

export type Sense = 'good' | 'mid' | 'bad' | 'na'

export interface NamedRow {
  name: string | null
  email: string | null
  phone: string | null
  plan: string | null
  monthly: number
  detail: string
  /** Sort key, meaning depends on the list. */
  key: number
}

export interface AuditInsights {
  basis: {
    rows: number
    asOf: string
    columnsFound: string[]
    columnsMissing: string[]
    /** Which sections could be computed from this file. */
    coverage: Record<string, boolean>
    confidence: 'high' | 'medium' | 'low'
    notes: string[]
  }
  membership: {
    roster: number
    active: number
    paused: number
    overdue: number
    cancelledInFile: number
    activeShare: number
    activePaying: number
    mrr: number
    arr: number
    arpu: number
    medianFee: number | null
    annualUpfront: number
    annualUpfrontMonthly: number
    concessionCount: number
    concessionMonthly: number
    /** Attrition per point: what one percent of the roster is worth a month. */
    valueOfOnePoint: number
  }
  plans: Array<{
    name: string
    count: number
    share: number
    avgMonthly: number
    monthly: number
    concession: boolean
    annualUpfront: boolean
  }>
  payments: {
    available: boolean
    byMethod: Array<{
      method: string
      label: string
      members: number
      overdue: number
      overdueRate: number
      monthly: number
    }>
    overdueCount: number
    overdueMonthly: number
    cashOverdue: number
    /** How many times worse card payers fail than Direct Debit payers. */
    cardVsDirectDebit: number | null
    /** Overdue members if every method failed at the Direct Debit rate. */
    overdueIfAllDirectDebit: number | null
    migrationMonthly: number | null
    unbilledCount: number
    unbilledMonthly: number
    overdueList: NamedRow[]
    unbilledList: NamedRow[]
  }
  endings: {
    available: boolean
    next30: { count: number; monthly: number }
    next60: { count: number; monthly: number }
    next90: { count: number; monthly: number }
    stillTraining30: number
    list: NamedRow[]
  }
  pricing: {
    available: boolean
    tiers: Array<{
      tier: string
      members: number
      currentPrice: number | null
      belowCurrent: number
      gapMonthly: number
      lowestPaid: number | null
    }>
    belowCurrentTotal: number
    gapMonthlyTotal: number
    legacyPlanMembers: number
    distinctPricePoints: number
    note: string
  }
  age: {
    available: boolean
    dobCoverage: number
    studentsTotal: number
    studentsAgedOut: number
    studentsAgedOutMonthly: number
    studentsTurning19In90: number
    studentsOver25: number
    under18OnAdultRate: number
    medianAge: number | null
    ageBands: Array<{ label: string; count: number; share: number }>
    list: NamedRow[]
  }
  engagement: {
    available: boolean
    bands: Array<{ key: string; label: string; count: number; monthly: number; share: number }>
    medianDaysSinceVisit: number | null
    medianVisitsPerMonth: number | null
    powerUsers: number
    neverVisited: number
    /** Members whose gap since last visit is at least twice their own habit. */
    habitBroken: number
    habitBrokenMonthly: number
    /** Long tenured, very low usage, still paying: the leave alone group. */
    leaveAlone: number
    leaveAloneMonthly: number
    driftingList: NamedRow[]
  }
  joiners: {
    available: boolean
    byMonth: Array<{ month: string; label: string; joins: number }>
    last30: number
    last90: number
    avgPerMonth: number | null
    bestMonth: string | null
    worstMonth: string | null
    newNoVisit: number
    newNoVisitMonthly: number
    newOneVisit: number
    newList: NamedRow[]
  }
  leavers: {
    available: boolean
    byMonth: Array<{ month: string; label: string; leavers: number }>
    impliedMonthlyAttrition: number | null
    twelveMonthSurvival: number | null
    monthlyValueLost: number | null
  }
  tenure: {
    available: boolean
    medianMonths: number | null
    p25Months: number | null
    p75Months: number | null
    underSixMonthsShare: number | null
    overTwoYearsShare: number | null
    bands: Array<{ label: string; count: number; share: number; monthly: number }>
  }
  paused: {
    count: number
    monthly: number
    resumingNext30: number
    noEndDate: number
  }
  money: {
    items: Array<{ key: string; label: string; monthly: number; annual: number; how: string; confidence: 'measured' | 'estimated' }>
    totalMonthly: number
    totalAnnual: number
  }
  benchmarks: Array<{ metric: string; yours: string; hoddesdon: string; industry: string; sense: Sense; hint: string }>
  actions: Array<{ priority: number; title: string; body: string; monthly: number | null; who: string; when: string }>
}

// ── helpers ──────────────────────────────────────────────────────────────────

const sum = (a: number[]) => a.reduce((t, n) => t + n, 0)
const r2 = (n: number) => Math.round(n * 100) / 100
const r0 = (n: number) => Math.round(n)
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY)
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}
function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
function pct(xs: number[], p: number): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}
const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`

const CONCESSION = /student|corporate|staff|\bcomp\b|complimentary|weekend|off[-\s]?peak|nhs|blue\s*light|senior|junior|family/i
const STUDENT = /student/i
const LEGACY = /^import|^legacy|^private|^old\b|migrat/i

function tierOf(m: ParsedMember): string {
  const n = `${m.membershipType ?? ''} ${m.planName ?? ''}`.toUpperCase()
  // Strip the concession words so "Corporate WOW" still lands in WOW.
  const base = n.replace(/STUDENT|CORPORATE|STAFF|COMP(LIMENTARY)?|IMPORT|LEGACY|PRIVATE|PAID IN FULL|PIF|12 MONTH|MONTHLY|ROLLING|-|_/g, ' ').trim()
  const words = base.split(/\s+/).filter((w) => w.length > 2 && !/^\d+$/.test(w))
  return words[0] ?? 'OTHER'
}

function monthlyOf(m: ParsedMember): number {
  return m.monthlyValue ?? 0
}

function row(m: ParsedMember, detail: string, key: number): NamedRow {
  return {
    name: m.name,
    email: m.email,
    phone: m.phone,
    plan: m.membershipType ?? m.planName,
    monthly: r2(monthlyOf(m)),
    detail,
    key,
  }
}

function ageAt(dob: Date, at: Date): number {
  return (at.getTime() - dob.getTime()) / (365.25 * DAY)
}

const LIST_CAP = 300

// ── main ─────────────────────────────────────────────────────────────────────

export function buildInsights(members: ParsedMember[], now = new Date()): AuditInsights {
  const live = members.filter((m) => m.status !== 'cancelled')
  const cancelled = members.filter((m) => m.status === 'cancelled')
  const active = live.filter((m) => m.status === 'active' || m.status === 'sleeper')
  const paused = live.filter((m) => m.status === 'frozen')
  const overdue = live.filter((m) => m.status === 'overdue' || m.paymentFailed)
  const paying = live.filter((m) => monthlyOf(m) >= 5)

  // Column coverage
  const has = {
    price: members.some((m) => m.priceRaw !== null),
    priceAny: members.some((m) => m.monthlyValue !== null),
    status: members.some((m) => m.rawStatus),
    lastVisit: members.filter((m) => m.lastVisit).length / Math.max(1, live.length) > 0.3,
    totalVisits: members.some((m) => m.totalVisits !== null),
    join: members.filter((m) => m.joinDate).length / Math.max(1, live.length) > 0.3,
    paymentType: members.some((m) => m.paymentType),
    nextPayment: members.some((m) => m.nextPayment),
    endDate: members.some((m) => m.endDate),
    dob: members.filter((m) => m.dateOfBirth).length / Math.max(1, live.length) > 0.3,
    email: members.some((m) => m.email),
    phone: members.some((m) => m.phone),
    plan: members.some((m) => m.membershipType || m.planName),
  }
  const columnsFound: string[] = []
  const columnsMissing: string[] = []
  const label: Record<keyof typeof has, string> = {
    price: 'price paid',
    priceAny: 'a price',
    status: 'status',
    lastVisit: 'last visit',
    totalVisits: 'lifetime visits',
    join: 'join date',
    paymentType: 'payment method',
    nextPayment: 'next payment date',
    endDate: 'end date',
    dob: 'date of birth',
    email: 'email',
    phone: 'phone',
    plan: 'plan name',
  }
  for (const k of Object.keys(has) as (keyof typeof has)[]) {
    if (k === 'priceAny') continue
    ;(has[k] ? columnsFound : columnsMissing).push(label[k])
  }
  const coverageScore = columnsFound.length / (columnsFound.length + columnsMissing.length)
  const confidence: AuditInsights['basis']['confidence'] =
    coverageScore >= 0.75 ? 'high' : coverageScore >= 0.5 ? 'medium' : 'low'
  const notes: string[] = []
  if (!has.price) notes.push('No price column: revenue figures use prices found in plan names or a £40 estimate.')
  if (!has.status) notes.push('No status column: every row is treated as a live member.')
  if (!has.lastVisit) notes.push('No last visit column: the engagement section is not computed.')
  if (!has.dob) notes.push('No date of birth: the age eligibility check is not computed.')
  if (!has.endDate) notes.push('No end date column: the term endings section is not computed.')

  // ── membership ────────────────────────────────────────────────────────────
  const mrr = sum(live.map(monthlyOf))
  const activeMrr = sum(active.map(monthlyOf)) + sum(overdue.filter((m) => m.status !== 'frozen').map(monthlyOf))
  const arpu = paying.length ? mrr / paying.length : 0
  const annualUpfront = live.filter((m) => m.isAnnualUpfront)
  const concession = live.filter((m) => CONCESSION.test(`${m.membershipType ?? ''} ${m.planName ?? ''} ${m.discountName ?? ''}`))
  const membership: AuditInsights['membership'] = {
    roster: live.length,
    active: active.length,
    paused: paused.length,
    overdue: overdue.length,
    cancelledInFile: cancelled.length,
    activeShare: live.length ? active.length / live.length : 0,
    activePaying: paying.length,
    mrr: r0(mrr),
    arr: r0(mrr * 12),
    arpu: r2(arpu),
    medianFee: median(paying.map(monthlyOf)),
    annualUpfront: annualUpfront.length,
    annualUpfrontMonthly: r0(sum(annualUpfront.map(monthlyOf))),
    concessionCount: concession.length,
    concessionMonthly: r0(sum(concession.map(monthlyOf))),
    valueOfOnePoint: r0((live.length / 100) * arpu),
  }
  void activeMrr

  // ── plans ────────────────────────────────────────────────────────────────
  const planMap = new Map<string, ParsedMember[]>()
  for (const m of live) {
    const key = (m.membershipType ?? m.planName ?? 'Unspecified plan').trim()
    planMap.set(key, [...(planMap.get(key) ?? []), m])
  }
  const plans = Array.from(planMap.entries())
    .map(([name, ms]) => ({
      name,
      count: ms.length,
      share: live.length ? ms.length / live.length : 0,
      avgMonthly: r2(sum(ms.map(monthlyOf)) / ms.length),
      monthly: r0(sum(ms.map(monthlyOf))),
      concession: CONCESSION.test(name),
      annualUpfront: ms.every((m) => m.isAnnualUpfront),
    }))
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, 20)

  // ── payments ─────────────────────────────────────────────────────────────
  const methodLabel = (k: string) =>
    ({ DIRECT_DEBIT: 'Direct Debit', CARD: 'Card', CASH: 'Cash', FLEXIBLE: 'Flexible / none', COMPLIMENTARY: 'Complimentary' } as Record<string, string>)[k] ?? k
  const byMethodMap = new Map<string, ParsedMember[]>()
  for (const m of live) {
    const k = m.paymentType ?? 'UNKNOWN'
    byMethodMap.set(k, [...(byMethodMap.get(k) ?? []), m])
  }
  const byMethod = Array.from(byMethodMap.entries())
    .map(([method, ms]) => {
      const od = ms.filter((m) => m.status === 'overdue' || m.paymentFailed).length
      return {
        method,
        label: methodLabel(method),
        members: ms.length,
        overdue: od,
        overdueRate: ms.length ? od / ms.length : 0,
        monthly: r0(sum(ms.map(monthlyOf))),
      }
    })
    .sort((a, b) => b.members - a.members)
  const dd = byMethod.find((b) => b.method === 'DIRECT_DEBIT')
  const card = byMethod.find((b) => b.method === 'CARD')
  const cardVsDirectDebit = dd && card && dd.overdueRate > 0 ? r2(card.overdueRate / dd.overdueRate) : null
  const overdueIfAllDirectDebit = dd ? r0(live.length * dd.overdueRate) : null
  const migrationMonthly =
    dd && card ? r0(Math.max(0, card.overdue - card.members * dd.overdueRate) * arpu) : null
  const unbilled = live.filter(
    (m) =>
      (m.status === 'active' || m.status === 'sleeper') &&
      has.nextPayment &&
      !m.nextPayment &&
      !m.isAnnualUpfront &&
      monthlyOf(m) > 1 &&
      !/staff|comp/i.test(`${m.membershipType ?? ''} ${m.planName ?? ''}`) &&
      (!m.endDate || daysBetween(m.endDate, now) > 21),
  )
  const payments: AuditInsights['payments'] = {
    available: has.paymentType || overdue.length > 0,
    byMethod,
    overdueCount: overdue.length,
    overdueMonthly: r0(sum(overdue.map(monthlyOf))),
    cashOverdue: overdue.filter((m) => m.paymentType === 'CASH').length,
    cardVsDirectDebit,
    overdueIfAllDirectDebit,
    migrationMonthly,
    unbilledCount: unbilled.length,
    unbilledMonthly: r0(sum(unbilled.map(monthlyOf))),
    overdueList: overdue
      .map((m) =>
        row(
          m,
          `${methodLabel(m.paymentType ?? 'UNKNOWN')}${m.lastVisit ? `, last visit ${m.lastVisit.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`,
          m.lastVisit ? daysBetween(now, m.lastVisit) : 9999,
        ),
      )
      .sort((a, b) => (a.key - b.key) || b.monthly - a.monthly)
      .slice(0, LIST_CAP),
    unbilledList: unbilled
      .map((m) => row(m, 'Active with no next payment scheduled', monthlyOf(m)))
      .sort((a, b) => b.key - a.key)
      .slice(0, LIST_CAP),
  }

  // ── endings ──────────────────────────────────────────────────────────────
  const ending = live.filter((m) => m.endDate && daysBetween(m.endDate, now) >= 0 && !m.isAnnualUpfront)
  const within = (d: number) => ending.filter((m) => daysBetween(m.endDate!, now) <= d)
  const endings: AuditInsights['endings'] = {
    available: has.endDate,
    next30: { count: within(30).length, monthly: r0(sum(within(30).map(monthlyOf))) },
    next60: { count: within(60).length, monthly: r0(sum(within(60).map(monthlyOf))) },
    next90: { count: within(90).length, monthly: r0(sum(within(90).map(monthlyOf))) },
    stillTraining30: within(30).filter((m) => m.lastVisit && daysBetween(now, m.lastVisit) <= 14).length,
    list: within(90)
      .map((m) =>
        row(
          m,
          `Ends ${m.endDate!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${m.lastVisit ? `, last visit ${m.lastVisit.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`,
          daysBetween(m.endDate!, now),
        ),
      )
      .sort((a, b) => a.key - b.key)
      .slice(0, LIST_CAP),
  }

  // ── pricing ──────────────────────────────────────────────────────────────
  // Current price per tier is inferred from what recent joiners (last 120 days)
  // on a non concession plan actually pay: the modal monthly figure.
  const tierMap = new Map<string, ParsedMember[]>()
  for (const m of live) {
    if (m.isAnnualUpfront || monthlyOf(m) < 5) continue
    if (CONCESSION.test(`${m.membershipType ?? ''} ${m.planName ?? ''} ${m.discountName ?? ''}`)) continue
    const t = tierOf(m)
    tierMap.set(t, [...(tierMap.get(t) ?? []), m])
  }
  const tiers: AuditInsights['pricing']['tiers'] = []
  for (const [tier, ms] of tierMap.entries()) {
    if (ms.length < 5) continue
    const recent = ms.filter((m) => m.joinDate && daysBetween(now, m.joinDate) <= 120)
    const source = recent.length >= 5 ? recent : ms
    const counts = new Map<number, number>()
    for (const m of source) counts.set(r2(monthlyOf(m)), (counts.get(r2(monthlyOf(m))) ?? 0) + 1)
    let currentPrice: number | null = null
    let best = 0
    for (const [price, n] of counts.entries()) {
      if (n > best || (n === best && currentPrice !== null && price > currentPrice)) {
        best = n
        currentPrice = price
      }
    }
    const below = currentPrice !== null ? ms.filter((m) => monthlyOf(m) < currentPrice! - 0.5) : []
    tiers.push({
      tier,
      members: ms.length,
      currentPrice,
      belowCurrent: below.length,
      gapMonthly: currentPrice !== null ? r0(sum(below.map((m) => currentPrice! - monthlyOf(m)))) : 0,
      lowestPaid: ms.length ? Math.min(...ms.map(monthlyOf)) : null,
    })
  }
  tiers.sort((a, b) => b.members - a.members)
  const legacyPlanMembers = live.filter((m) => LEGACY.test(m.membershipType ?? '')).length
  const distinctPricePoints = new Set(paying.map((m) => r2(monthlyOf(m)))).size
  const pricing: AuditInsights['pricing'] = {
    available: has.priceAny && tiers.length > 0,
    tiers,
    belowCurrentTotal: sum(tiers.map((t) => t.belowCurrent)),
    gapMonthlyTotal: sum(tiers.map((t) => t.gapMonthly)),
    legacyPlanMembers,
    distinctPricePoints,
    note: has.join
      ? 'Current price per tier is the most common amount paid by joiners in the last 120 days. Concession plans (student, corporate, staff) are excluded.'
      : 'Current price per tier is the most common amount paid across the tier, because the export has no join date. Treat the gap as indicative.',
  }

  // ── age ──────────────────────────────────────────────────────────────────
  const withDob = live.filter((m) => m.dateOfBirth)
  const students = live.filter((m) => STUDENT.test(`${m.membershipType ?? ''} ${m.planName ?? ''} ${m.discountName ?? ''}`))
  const studentsWithDob = students.filter((m) => m.dateOfBirth)
  const under19Rate = (m: ParsedMember) => /under\s*19|u19|junior|16\s*-\s*18|16-18/i.test(`${m.membershipType ?? ''} ${m.planName ?? ''}`)
  const agedOut = studentsWithDob.filter((m) => ageAt(m.dateOfBirth!, now) >= 19 && under19Rate(m))
  const turning19 = studentsWithDob.filter((m) => {
    const a = ageAt(m.dateOfBirth!, now)
    return a < 19 && a >= 18.75 && under19Rate(m)
  })
  const over25 = studentsWithDob.filter((m) => ageAt(m.dateOfBirth!, now) >= 25)
  const under18Adult = withDob.filter((m) => ageAt(m.dateOfBirth!, now) < 18 && !STUDENT.test(`${m.membershipType ?? ''} ${m.planName ?? ''}`) && !/junior|youth|teen/i.test(`${m.membershipType ?? ''} ${m.planName ?? ''}`))
  const ages = withDob.map((m) => ageAt(m.dateOfBirth!, now)).filter((a) => a > 10 && a < 100)
  const ageBandsDef = [
    ['Under 18', 0, 18],
    ['18 to 24', 18, 25],
    ['25 to 34', 25, 35],
    ['35 to 44', 35, 45],
    ['45 to 54', 45, 55],
    ['55 to 64', 55, 65],
    ['65 and over', 65, 200],
  ] as const
  const age: AuditInsights['age'] = {
    available: has.dob,
    dobCoverage: live.length ? withDob.length / live.length : 0,
    studentsTotal: students.length,
    studentsAgedOut: agedOut.length,
    studentsAgedOutMonthly: r0(sum(agedOut.map(monthlyOf))),
    studentsTurning19In90: turning19.length,
    studentsOver25: over25.length,
    under18OnAdultRate: under18Adult.length,
    medianAge: ages.length ? r0(median(ages)!) : null,
    ageBands: ageBandsDef.map(([lbl, lo, hi]) => {
      const n = ages.filter((a) => a >= lo && a < hi).length
      return { label: lbl, count: n, share: ages.length ? n / ages.length : 0 }
    }),
    list: [...agedOut, ...over25]
      .filter((m, i, arr) => arr.indexOf(m) === i)
      .map((m) => row(m, `Age ${Math.floor(ageAt(m.dateOfBirth!, now))} on ${m.membershipType ?? m.planName ?? 'student plan'}`, ageAt(m.dateOfBirth!, now)))
      .sort((a, b) => b.key - a.key)
      .slice(0, LIST_CAP),
  }

  // ── engagement ───────────────────────────────────────────────────────────
  const visitable = live.filter((m) => m.status !== 'frozen')
  const bandsDef: Array<[string, string, (d: number | null, m: ParsedMember) => boolean]> = [
    ['healthy', 'Healthy, visited in the last 13 days', (d) => d !== null && d <= 13],
    ['drifting', 'Drifting, 14 to 20 days', (d) => d !== null && d >= 14 && d <= 20],
    ['atRisk', 'At risk, 21 to 29 days', (d) => d !== null && d >= 21 && d <= 29],
    ['dormant', 'Dormant, 30 to 89 days', (d) => d !== null && d >= 30 && d <= 89],
    ['sleeper', 'Sleeping, 90 days or more', (d) => d !== null && d >= 90],
    ['never', 'Never visited', (d, m) => d === null && (m.totalVisits === 0)],
    ['noData', 'No visit data', (d, m) => d === null && m.totalVisits !== 0],
  ]
  const bands = bandsDef.map(([key, lbl, test]) => {
    const ms = visitable.filter((m) => test(m.lastVisit ? daysBetween(now, m.lastVisit) : null, m))
    return { key, label: lbl, count: ms.length, monthly: r0(sum(ms.map(monthlyOf))), share: visitable.length ? ms.length / visitable.length : 0 }
  })
  const daysSince = visitable.filter((m) => m.lastVisit).map((m) => daysBetween(now, m.lastVisit!))
  const visitsPerMonth = visitable
    .filter((m) => m.totalVisits !== null && m.joinDate && daysBetween(now, m.joinDate) >= 30)
    .map((m) => m.totalVisits! / Math.max(1, daysBetween(now, m.joinDate!) / 30.44))
  // Habit relative recency: expected gap = 30.44 / habit rate (floored at 0.25 a month).
  const habitBroken = visitable.filter((m) => {
    if (!m.lastVisit || m.totalVisits === null || !m.joinDate) return false
    const tenureMonths = Math.max(1, daysBetween(now, m.joinDate) / 30.44)
    const habit = Math.max(0.25, m.totalVisits / tenureMonths)
    const expectedGap = 30.44 / habit
    const gap = daysBetween(now, m.lastVisit)
    return gap >= 14 && gap >= expectedGap * 2 && tenureMonths >= 1
  })
  const leaveAlone = visitable.filter((m) => {
    if (!m.lastVisit || m.totalVisits === null || !m.joinDate) return false
    const tenureMonths = daysBetween(now, m.joinDate) / 30.44
    const habit = m.totalVisits / Math.max(1, tenureMonths)
    return tenureMonths >= 12 && habit < 1 && daysBetween(now, m.lastVisit) >= 30
  })
  const drifting = visitable.filter((m) => m.lastVisit && daysBetween(now, m.lastVisit) >= 14 && daysBetween(now, m.lastVisit) <= 29)
  const engagement: AuditInsights['engagement'] = {
    available: has.lastVisit,
    bands,
    medianDaysSinceVisit: median(daysSince),
    medianVisitsPerMonth: visitsPerMonth.length ? r2(median(visitsPerMonth)!) : null,
    powerUsers: visitsPerMonth.filter((v) => v >= 12).length,
    neverVisited: bands.find((b) => b.key === 'never')?.count ?? 0,
    habitBroken: habitBroken.length,
    habitBrokenMonthly: r0(sum(habitBroken.map(monthlyOf))),
    leaveAlone: leaveAlone.length,
    leaveAloneMonthly: r0(sum(leaveAlone.map(monthlyOf))),
    driftingList: drifting
      .map((m) => row(m, `${daysBetween(now, m.lastVisit!)} days since last visit${m.totalVisits !== null ? `, ${m.totalVisits} visits in total` : ''}`, daysBetween(now, m.lastVisit!)))
      .sort((a, b) => a.key - b.key)
      .slice(0, LIST_CAP),
  }

  // ── joiners ──────────────────────────────────────────────────────────────
  const joined = members.filter((m) => m.joinDate)
  const byMonthMap = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    byMonthMap.set(monthKey(d), 0)
  }
  for (const m of joined) {
    const k = monthKey(m.joinDate!)
    if (byMonthMap.has(k)) byMonthMap.set(k, (byMonthMap.get(k) ?? 0) + 1)
  }
  const byMonth = Array.from(byMonthMap.entries()).map(([month, joins]) => ({ month, label: monthLabel(month), joins }))
  const completeMonths = byMonth.slice(0, -1)
  const newMembers = live.filter((m) => m.joinDate && daysBetween(now, m.joinDate) <= 30)
  const newNoVisit = newMembers.filter((m) => (m.totalVisits !== null ? m.totalVisits === 0 : !m.lastVisit) && daysBetween(now, m.joinDate!) >= 3)
  const newOneVisit = newMembers.filter((m) => m.totalVisits === 1)
  const joiners: AuditInsights['joiners'] = {
    available: has.join,
    byMonth,
    last30: newMembers.length,
    last90: live.filter((m) => m.joinDate && daysBetween(now, m.joinDate) <= 90).length,
    avgPerMonth: completeMonths.length ? r2(sum(completeMonths.map((b) => b.joins)) / completeMonths.length) : null,
    bestMonth: completeMonths.length ? completeMonths.reduce((a, b) => (b.joins > a.joins ? b : a)).label : null,
    worstMonth: completeMonths.length ? completeMonths.reduce((a, b) => (b.joins < a.joins ? b : a)).label : null,
    newNoVisit: newNoVisit.length,
    newNoVisitMonthly: r0(sum(newNoVisit.map(monthlyOf))),
    newOneVisit: newOneVisit.length,
    newList: newNoVisit
      .map((m) => row(m, `Joined ${m.joinDate!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, no visit yet`, daysBetween(now, m.joinDate!)))
      .sort((a, b) => b.key - a.key)
      .slice(0, LIST_CAP),
  }

  // ── leavers ──────────────────────────────────────────────────────────────
  const left = cancelled.filter((m) => m.endDate)
  const leaverMap = new Map<string, number>()
  for (const [k] of byMonthMap) leaverMap.set(k, 0)
  for (const m of left) {
    const k = monthKey(m.endDate!)
    if (leaverMap.has(k)) leaverMap.set(k, (leaverMap.get(k) ?? 0) + 1)
  }
  const leaversByMonth = Array.from(leaverMap.entries()).map(([month, leavers]) => ({ month, label: monthLabel(month), leavers }))
  const recentLeaverMonths = leaversByMonth.slice(-4, -1)
  // A real club loses a large share of its roster a year. If the export holds
  // far fewer cancelled rows than that, it is a partial export and any attrition
  // figure from it would flatter the club, so it is withheld.
  const left12 = left.filter((m) => daysBetween(now, m.endDate!) <= 365).length
  const leaversAvailable = left.length >= 10 && left12 >= live.length * 0.15
  if (left.length > 0 && !leaversAvailable) notes.push('The export contains some cancelled members but not enough for a reliable attrition figure, so it is not shown. Include all leavers from the last 12 months to see it.')
  const impliedAttrition = leaversAvailable && live.length
    ? r2((sum(recentLeaverMonths.map((b) => b.leavers)) / Math.max(1, recentLeaverMonths.length)) / live.length * 100)
    : null
  // 12 month survival: of everyone who joined 12 to 15 months ago, how many are still live.
  const cohort = members.filter((m) => m.joinDate && daysBetween(now, m.joinDate) >= 365 && daysBetween(now, m.joinDate) <= 455)
  const survival = cohort.length >= 20 ? r2((cohort.filter((m) => m.status !== 'cancelled').length / cohort.length) * 100) : null
  const leavers: AuditInsights['leavers'] = {
    available: leaversAvailable || survival !== null,
    byMonth: leaversByMonth,
    impliedMonthlyAttrition: impliedAttrition,
    twelveMonthSurvival: survival,
    monthlyValueLost: impliedAttrition !== null ? r0((impliedAttrition / 100) * live.length * arpu) : null,
  }

  // ── tenure ───────────────────────────────────────────────────────────────
  const tenureMonths = live.filter((m) => m.joinDate).map((m) => daysBetween(now, m.joinDate!) / 30.44)
  const tenureBandsDef = [
    ['Under 3 months', 0, 3],
    ['3 to 6 months', 3, 6],
    ['6 to 12 months', 6, 12],
    ['1 to 2 years', 12, 24],
    ['2 to 5 years', 24, 60],
    ['5 years and more', 60, 10000],
  ] as const
  const tenure: AuditInsights['tenure'] = {
    available: has.join,
    medianMonths: tenureMonths.length ? r2(median(tenureMonths)!) : null,
    p25Months: tenureMonths.length ? r2(pct(tenureMonths, 0.25)!) : null,
    p75Months: tenureMonths.length ? r2(pct(tenureMonths, 0.75)!) : null,
    underSixMonthsShare: tenureMonths.length ? r2(tenureMonths.filter((t) => t < 6).length / tenureMonths.length) : null,
    overTwoYearsShare: tenureMonths.length ? r2(tenureMonths.filter((t) => t >= 24).length / tenureMonths.length) : null,
    bands: tenureBandsDef.map(([lbl, lo, hi]) => {
      const ms = live.filter((m) => m.joinDate && daysBetween(now, m.joinDate) / 30.44 >= lo && daysBetween(now, m.joinDate) / 30.44 < hi)
      return { label: lbl, count: ms.length, share: tenureMonths.length ? ms.length / tenureMonths.length : 0, monthly: r0(sum(ms.map(monthlyOf))) }
    }),
  }

  // ── paused ───────────────────────────────────────────────────────────────
  const pausedBlock: AuditInsights['paused'] = {
    count: paused.length,
    monthly: r0(sum(paused.map(monthlyOf))),
    resumingNext30: paused.filter((m) => m.pausedTo && daysBetween(m.pausedTo, now) >= 0 && daysBetween(m.pausedTo, now) <= 30).length,
    noEndDate: paused.filter((m) => !m.pausedTo).length,
  }

  // ── money ────────────────────────────────────────────────────────────────
  const items: AuditInsights['money']['items'] = []
  if (payments.overdueMonthly > 0) {
    items.push({
      key: 'overdue',
      label: `${payments.overdueCount} overdue members`,
      monthly: r0(payments.overdueMonthly * 0.55),
      annual: r0(payments.overdueMonthly * 0.55 * 12),
      how: 'Retry the temporary failures, ring the rest with a payment link. Clubs running this routine recover roughly half.',
      confidence: 'estimated',
    })
  }
  if (payments.unbilledMonthly > 0) {
    items.push({ key: 'unbilled', label: `${payments.unbilledCount} training with no next payment scheduled`, monthly: payments.unbilledMonthly, annual: payments.unbilledMonthly * 12, how: 'Open each profile and restart billing. This is money already agreed, not a sale.', confidence: 'measured' })
  }
  if (endings.available && endings.next30.monthly > 0) {
    items.push({ key: 'endings', label: `${endings.next30.count} memberships ending in 30 days`, monthly: r0(endings.next30.monthly * 0.4), annual: r0(endings.next30.monthly * 0.4 * 12), how: 'A renewal call before the end date. Four in ten renew when asked; almost none renew unasked.', confidence: 'estimated' })
  }
  if (pricing.available && pricing.gapMonthlyTotal > 0) {
    items.push({ key: 'pricing', label: `${pricing.belowCurrentTotal} members below current price`, monthly: r0(pricing.gapMonthlyTotal * 0.85), annual: r0(pricing.gapMonthlyTotal * 0.85 * 12), how: 'Move legacy rates to the current list with 30 days notice, tied to something visible in the club. Expect about 15 percent to push back.', confidence: 'estimated' })
  }
  if (age.available && age.studentsAgedOutMonthly > 0) {
    items.push({ key: 'students', label: `${age.studentsAgedOut} students past the age for their rate`, monthly: age.studentsAgedOutMonthly, annual: age.studentsAgedOutMonthly * 12, how: 'Move them to the adult student or standard rate on their next billing date. This refills every month unless someone watches it.', confidence: 'measured' })
  }
  if (payments.migrationMonthly && payments.migrationMonthly > 0) {
    items.push({ key: 'migration', label: 'Card payers moved to Direct Debit', monthly: payments.migrationMonthly, annual: payments.migrationMonthly * 12, how: 'Card payers fail at a multiple of the Direct Debit rate. Default new joins to Direct Debit and migrate the card book with one campaign.', confidence: 'estimated' })
  }
  if (engagement.available && engagement.habitBrokenMonthly > 0) {
    items.push({ key: 'habit', label: `${engagement.habitBroken} members whose habit has broken`, monthly: r0(engagement.habitBrokenMonthly * 0.2), annual: r0(engagement.habitBrokenMonthly * 0.2 * 12), how: 'A check in call to anyone who has drifted to twice their own usual gap. Saving one in five is the conservative case.', confidence: 'estimated' })
  }
  items.sort((a, b) => b.monthly - a.monthly)
  const money: AuditInsights['money'] = {
    items,
    totalMonthly: r0(sum(items.map((i) => i.monthly))),
    totalAnnual: r0(sum(items.map((i) => i.annual))),
  }

  // ── benchmarks ───────────────────────────────────────────────────────────
  const benchmarks: AuditInsights['benchmarks'] = []
  const overdueRate = live.length ? overdue.length / live.length : 0
  benchmarks.push({
    metric: 'Overdue share of roster',
    yours: `${(overdueRate * 100).toFixed(1)}%`,
    hoddesdon: '3.6% after 6 weeks of gymIQ, from 4.7%',
    industry: 'UK clubs typically run 4 to 8%',
    sense: overdueRate <= 0.04 ? 'good' : overdueRate <= 0.07 ? 'mid' : 'bad',
    hint: overdueRate <= 0.04 ? 'Tight collection. Keep the retry routine running.' : 'Every point of overdue is money already sold and not collected. It is the fastest lever in the club.',
  })
  if (dd && card) {
    benchmarks.push({
      metric: 'Card failure rate against Direct Debit',
      yours: cardVsDirectDebit !== null ? `${cardVsDirectDebit}x` : 'n/a',
      hoddesdon: '2.4x before the migration campaign',
      industry: 'Card typically fails 2 to 3x more often',
      sense: cardVsDirectDebit === null ? 'na' : cardVsDirectDebit <= 1.5 ? 'good' : cardVsDirectDebit <= 2.5 ? 'mid' : 'bad',
      hint: 'Card payers are where the failed book lives. Direct Debit is the fix, not more chasing.',
    })
  }
  benchmarks.push({
    metric: 'Revenue per paying member',
    yours: gbp(arpu),
    hoddesdon: '£30.87 on a 1,472 paying base',
    industry: 'Budget clubs £22 to £28, mid market £30 to £45',
    sense: arpu >= 30 ? 'good' : arpu >= 25 ? 'mid' : 'bad',
    hint: arpu >= 30 ? 'Room to add value rather than discount.' : 'A £2 move across the base is worth more than any campaign. Check the pricing section.',
  })
  if (engagement.available && engagement.medianDaysSinceVisit !== null) {
    const md = engagement.medianDaysSinceVisit
    benchmarks.push({
      metric: 'Median days since last visit',
      yours: `${md} days`,
      hoddesdon: 'Roughly 1 in 5 members drifting or worse at any time',
      industry: '5 to 7 days in a well engaged club',
      sense: md <= 7 ? 'good' : md <= 14 ? 'mid' : 'bad',
      hint: md <= 7 ? 'The core is visiting. Protect it with the drifting calls.' : 'Half the roster has not been in for two weeks. The retention calls are the job.',
    })
  }
  if (leavers.impliedMonthlyAttrition !== null) {
    const a = leavers.impliedMonthlyAttrition
    benchmarks.push({
      metric: 'Monthly attrition',
      yours: `${a}%`,
      hoddesdon: '3.65% in July 2026, 5.7% average before',
      industry: 'Independent gyms 5 to 8%',
      sense: a <= 4 ? 'good' : a <= 6 ? 'mid' : 'bad',
      hint: `Every point is ${gbp(membership.valueOfOnePoint)} a month of billing that has to be re-sold.`,
    })
  }
  if (tenure.medianMonths !== null) {
    benchmarks.push({
      metric: 'Median tenure',
      yours: `${tenure.medianMonths} months`,
      hoddesdon: 'Joiners paid 7.55 months in year one on average',
      industry: 'Independent gyms about 9 months',
      sense: tenure.medianMonths >= 12 ? 'good' : tenure.medianMonths >= 8 ? 'mid' : 'bad',
      hint: tenure.medianMonths >= 12 ? 'A loyal base. The money is in the price, not the volume.' : 'A young base churns. Onboarding in the first 30 days is where tenure is made.',
    })
  }
  if (age.available) {
    benchmarks.push({
      metric: 'Students on an age rate they have outgrown',
      yours: `${age.studentsAgedOut}`,
      hoddesdon: '47 found on day one, £970 a month',
      industry: 'Rarely checked anywhere',
      sense: age.studentsAgedOut === 0 ? 'good' : age.studentsAgedOut <= 10 ? 'mid' : 'bad',
      hint: age.studentsAgedOut === 0 ? 'Clean. Check it monthly, it refills.' : 'Nobody is being unfair by charging the rate the member signed up to.',
    })
  }

  // ── actions ──────────────────────────────────────────────────────────────
  const actions: AuditInsights['actions'] = []
  if (payments.overdueCount > 0) {
    actions.push({ priority: 1, title: `Work the ${payments.overdueCount} overdue members this week`, body: `Retry the temporary failures once, no more than once every two days. Ring card payers with a payment link, they need to act. Do not ring the ${payments.cashOverdue} cash payers; collect at the desk. ${gbp(payments.overdueMonthly)} a month is outstanding.`, monthly: r0(payments.overdueMonthly * 0.55), who: 'Front desk, one hour a day', when: 'Before Wednesday, so it lands on this Friday' })
  }
  if (payments.unbilledCount > 0) {
    actions.push({ priority: 1, title: `Restart billing for ${payments.unbilledCount} members training with no next payment`, body: `Each one is active, on a priced plan, and has no payment scheduled. Open the profile, fix the plan or payment method, confirm a next payment date shows. ${gbp(payments.unbilledMonthly)} a month, already agreed.`, monthly: payments.unbilledMonthly, who: 'Manager', when: 'This week' })
  }
  if (endings.available && endings.next30.count > 0) {
    actions.push({ priority: 2, title: `Renewal calls for ${endings.next30.count} memberships ending in the next 30 days`, body: `${endings.stillTraining30} of them trained in the last fortnight; call those first, they want to stay. Ask, offer the current plan, book the payment. ${gbp(endings.next30.monthly)} a month is walking out unasked.`, monthly: r0(endings.next30.monthly * 0.4), who: 'Front desk', when: 'Sorted by end date, earliest first' })
  }
  if (joiners.newNoVisit > 0) {
    actions.push({ priority: 2, title: `Welcome the ${joiners.newNoVisit} new joiners who have not visited yet`, body: 'Joined in the last 30 days, no visit. This is the cohort that cancels at month two. A call, a booked induction, a named trainer. Onboarding is where tenure is made.', monthly: null, who: 'Trainer on shift', when: 'Within 48 hours of joining' })
  }
  if (age.available && age.studentsAgedOut > 0) {
    actions.push({ priority: 2, title: `Move ${age.studentsAgedOut} students to the correct rate`, body: `They are past the age for the rate they pay. Write to them, change the plan on the next billing date. ${age.studentsTurning19In90} more turn 19 within 90 days, so make it a monthly check.`, monthly: age.studentsAgedOutMonthly, who: 'Manager', when: 'Next billing run' })
  }
  if (pricing.available && pricing.belowCurrentTotal > 0) {
    actions.push({ priority: 3, title: `Decide what to do about ${pricing.belowCurrentTotal} members below current price`, body: `${gbp(pricing.gapMonthlyTotal)} a month sits between what they pay and what a joiner pays today. Tie any rise to something the member can see, give 30 days notice, and expect about 15 percent to argue.`, monthly: r0(pricing.gapMonthlyTotal * 0.85), who: 'Owner', when: 'Next quarter, with the notice period' })
  }
  if (payments.migrationMonthly && payments.migrationMonthly > 0) {
    actions.push({ priority: 3, title: 'Default new joins to Direct Debit and migrate the card book', body: `Card payers fail ${cardVsDirectDebit}x more often than Direct Debit payers. At the Direct Debit rate your overdue book would be about ${overdueIfAllDirectDebit} members, not ${payments.overdueCount}.`, monthly: payments.migrationMonthly, who: 'Manager', when: 'One campaign, then the join form' })
  }
  if (engagement.available && engagement.habitBroken > 0) {
    actions.push({ priority: 3, title: `Check in with ${engagement.habitBroken} members whose habit has broken`, body: `Measured against each member's own pattern, not a flat 30 days. Leave the ${engagement.leaveAlone} long tenured low users alone; they are happy paying and a call only reminds them. Do not mention price or billing in the check in.`, monthly: r0(engagement.habitBrokenMonthly * 0.2), who: 'Front desk, five a day', when: 'Every day, from the board' })
  }
  if (pausedBlock.count > 0) {
    actions.push({ priority: 4, title: `Check the ${pausedBlock.count} paused memberships`, body: `${pausedBlock.noEndDate} have no end date on the pause. ${gbp(pausedBlock.monthly)} a month is on hold. A message a week before the pause ends lifts the return rate; a pause with no end date is usually a cancellation nobody processed.`, monthly: null, who: 'Manager', when: 'This month' })
  }
  actions.push({ priority: 5, title: 'Run this every morning, not once', body: 'Everything above changes daily. gymIQ reads the club four times a day, puts the calls on a board the desk can clear, retries what can clear, and tells the owner what Friday will pay. That is the product; this report is the first morning.', monthly: null, who: 'gymIQ', when: '06:00 tomorrow' })

  const basis: AuditInsights['basis'] = {
    rows: members.length,
    asOf: now.toISOString(),
    columnsFound,
    columnsMissing,
    coverage: {
      membership: true,
      payments: payments.available,
      endings: endings.available,
      pricing: pricing.available,
      age: age.available,
      engagement: engagement.available,
      joiners: joiners.available,
      leavers: leavers.available,
      tenure: tenure.available,
    },
    confidence,
    notes,
  }

  return {
    basis,
    membership,
    plans,
    payments,
    endings,
    pricing,
    age,
    engagement,
    joiners,
    leavers,
    tenure,
    paused: pausedBlock,
    money,
    benchmarks,
    actions: actions.sort((a, b) => a.priority - b.priority),
  }
}
