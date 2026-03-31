/**
 * Churn Prediction Engine
 *
 * Pure heuristic risk scoring — no AI calls, processes thousands of
 * members cheaply in batch. Ported from Express to standalone module.
 *
 * INTERVENTION WINDOWS (based on industry research):
 *  • 0-13 days:    Healthy — no action needed
 *  • 14-20 days:   Light sleeper — friendly check-in (habit at risk)
 *  • 21-45 days:   Deep sleeper — PRIORITY CONTACT with offer (habit broken, salvageable)
 *  • 46-60 days:   Critical — manual staff call only (last chance)
 *  • 60+ days:     Lost — DO NOT CONTACT (sleeping dogs — contact may trigger cancellation)
 *
 * Scoring breakdown (max 100 pts):
 *  • Days since last visit      — up to 40 pts  (highest weight)
 *  • Visit frequency (30-day)   — up to 25 pts
 *  • Payment overdue            — up to 20 pts
 *  • Member status              — up to 15 pts (frozen / sleeper penalty)
 *  • New-member early dropout   — up to 20 pts (bonus risk for new joiners)
 *
 * Final score is clamped 0-100.
 */

import { SupabaseClient } from '@supabase/supabase-js'

const MS_PER_DAY = 24 * 60 * 60 * 1_000

// ─── Public types ─────────────────────────────────────────────────────────────

export type SleeperCategory = 'light' | 'deep' | 'lost'
export type PaymentRecoveryStage = 1 | 2 | 3

export interface ChurnScore {
  riskScore: number
  factors: string[]
  sleeperCategory: SleeperCategory | null
  paymentRecoveryStage: PaymentRecoveryStage | null
  daysSinceLastVisit: number | null
  daysOverdue: number | null
  riskBand: 'low' | 'medium' | 'high'
  interventionRecommended: boolean
  interventionType: 'none' | 'light_touch' | 'priority_offer' | 'manual_call' | 'do_not_contact'
}

export interface MemberInput {
  status: string
  lastVisit: Date | null
  visitCount30d: number
  nextPayment: Date | null
  joinDate: Date | null
}

export interface BatchResult {
  memberId: string
  gymId: string
  score: ChurnScore
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/** Score a single member — pure function, no I/O. */
export function scoreChurnRisk(member: MemberInput): ChurnScore {
  const now = new Date()
  let score = 0
  const factors: string[] = []

  // Cancelled = already churned
  if (member.status === 'cancelled') {
    return {
      riskScore: 100,
      factors: ['Membership cancelled'],
      sleeperCategory: null,
      paymentRecoveryStage: null,
      daysSinceLastVisit: null,
      daysOverdue: null,
      riskBand: 'high',
      interventionRecommended: false,
      interventionType: 'none',
    }
  }

  // 1. Days since last visit (max 40 pts)
  let daysSinceVisit: number | null = null

  if (member.lastVisit) {
    daysSinceVisit = Math.floor(
      (now.getTime() - member.lastVisit.getTime()) / MS_PER_DAY
    )
    if (daysSinceVisit >= 60) {
      score += 40
      factors.push(`No visit in ${daysSinceVisit} days`)
    } else if (daysSinceVisit >= 30) {
      score += 28
      factors.push(`No visit in ${daysSinceVisit} days`)
    } else if (daysSinceVisit >= 14) {
      score += 15
      factors.push(`Last visit ${daysSinceVisit} days ago`)
    } else if (daysSinceVisit >= 7) {
      score += 5
    }
  } else {
    score += 25
    factors.push('No visit on record')
  }

  // 2. Visit frequency last 30 days (max 25 pts)
  const visits = member.visitCount30d
  if (visits === 0) {
    score += 25
    factors.push('Zero visits in last 30 days')
  } else if (visits === 1) {
    score += 15
    factors.push('Only 1 visit in last 30 days')
  } else if (visits <= 3) {
    score += 8
    factors.push('Low visit frequency (≤3 visits/month)')
  } else if (visits <= 6) {
    score += 3
  }

  // 3. Payment overdue (max 20 pts)
  let daysOverdue: number | null = null
  let paymentRecoveryStage: PaymentRecoveryStage | null = null

  if (member.nextPayment && member.nextPayment < now) {
    daysOverdue = Math.floor(
      (now.getTime() - member.nextPayment.getTime()) / MS_PER_DAY
    )
    if (daysOverdue >= 15) {
      score += 20
      paymentRecoveryStage = 3
      factors.push(`Payment ${daysOverdue} days overdue — final notice stage`)
    } else if (daysOverdue >= 8) {
      score += 15
      paymentRecoveryStage = 2
      factors.push(`Payment ${daysOverdue} days overdue`)
    } else {
      score += 10
      paymentRecoveryStage = 1
      factors.push(`Payment ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`)
    }
  }

  // 4. Member status (max 15 pts)
  if (member.status === 'frozen') {
    score += 10
    factors.push('Membership currently frozen')
  } else if (member.status === 'sleeper') {
    score += 15
    factors.push('Marked as inactive sleeper')
  }

  // 5. New-member early dropout risk (max 20 pts)
  if (member.joinDate) {
    const daysSinceJoin = Math.floor(
      (now.getTime() - member.joinDate.getTime()) / MS_PER_DAY
    )
    if (daysSinceJoin <= 30 && visits === 0) {
      score += 20
      factors.push('New member with no visits yet — high early dropout risk')
    } else if (daysSinceJoin <= 60 && visits <= 2) {
      score += 10
      factors.push('Early-stage member with very low engagement')
    }
  }

  const riskScore = Math.min(100, Math.max(0, score))

  // Sleeper categorisation (INTERVENTION WINDOWS)
  let sleeperCategory: SleeperCategory | null = null
  let interventionRecommended = false
  let interventionType: ChurnScore['interventionType'] = 'none'

  if (daysSinceVisit !== null) {
    if (daysSinceVisit >= 60) {
      sleeperCategory = 'lost'
      interventionType = 'do_not_contact'
    } else if (daysSinceVisit >= 46) {
      sleeperCategory = 'deep'
      interventionType = 'manual_call'
      interventionRecommended = true
    } else if (daysSinceVisit >= 21) {
      sleeperCategory = 'deep'
      interventionType = 'priority_offer'
      interventionRecommended = true
    } else if (daysSinceVisit >= 14) {
      sleeperCategory = 'light'
      interventionType = 'light_touch'
      interventionRecommended = true
    }
  }

  // New members who haven't visited are highest priority
  if (member.joinDate) {
    const daysSinceJoin = Math.floor(
      (now.getTime() - member.joinDate.getTime()) / MS_PER_DAY
    )
    if (daysSinceJoin <= 30 && visits === 0) {
      interventionRecommended = true
      interventionType = 'priority_offer'
    }
  }

  const riskBand: 'low' | 'medium' | 'high' =
    riskScore >= 61 ? 'high' : riskScore >= 31 ? 'medium' : 'low'

  return {
    riskScore,
    factors,
    sleeperCategory,
    paymentRecoveryStage,
    daysSinceLastVisit: daysSinceVisit,
    daysOverdue,
    riskBand,
    interventionRecommended,
    interventionType,
  }
}

// ─── Batch analysis (Supabase version) ───────────────────────────────────────

const BATCH_SIZE = 100

/**
 * Score every non-cancelled member for a gym and persist the
 * updated riskScore + riskFactors back to the database.
 */
export async function runBatchChurnAnalysis(
  supabase: SupabaseClient,
  gymId?: string
): Promise<{
  processed: number
  highRisk: number
  mediumRisk: number
  lowRisk: number
  sleeperCount: number
  overdueCount: number
  results: BatchResult[]
}> {
  // Fetch all non-cancelled members
  let query = supabase
    .from('members')
    .select('id, gym_id, status, last_visit, visit_count_30d, next_payment, join_date')
    .neq('status', 'cancelled')

  if (gymId) {
    query = query.eq('gym_id', gymId)
  }

  const { data: members, error } = await query

  if (error) {
    console.error('[ChurnEngine] Failed to fetch members:', error)
    throw error
  }

  // Score every member
  const results: BatchResult[] = (members || []).map((m) => ({
    memberId: m.id,
    gymId: m.gym_id,
    score: scoreChurnRisk({
      status: m.status,
      lastVisit: m.last_visit ? new Date(m.last_visit) : null,
      visitCount30d: m.visit_count_30d || 0,
      nextPayment: m.next_payment ? new Date(m.next_payment) : null,
      joinDate: m.join_date ? new Date(m.join_date) : null,
    }),
  }))

  // Batch-write scores back to DB
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const chunk = results.slice(i, i + BATCH_SIZE)
    const updates = chunk.map((r) =>
      supabase
        .from('members')
        .update({
          risk_score: r.score.riskScore,
          risk_factors: r.score.factors,
        })
        .eq('id', r.memberId)
    )
    await Promise.all(updates)
  }

  // Aggregate stats
  let highRisk = 0, mediumRisk = 0, lowRisk = 0, sleeperCount = 0, overdueCount = 0
  for (const r of results) {
    if (r.score.riskBand === 'high') highRisk++
    else if (r.score.riskBand === 'medium') mediumRisk++
    else lowRisk++
    if (r.score.sleeperCategory) sleeperCount++
    if (r.score.daysOverdue !== null) overdueCount++
  }

  console.log(
    `[ChurnEngine] Batch complete — ${results.length} members scored | ` +
    `high: ${highRisk}, medium: ${mediumRisk}, low: ${lowRisk} | ` +
    `sleepers: ${sleeperCount}, overdue: ${overdueCount}`
  )

  return { processed: results.length, highRisk, mediumRisk, lowRisk, sleeperCount, overdueCount, results }
}
