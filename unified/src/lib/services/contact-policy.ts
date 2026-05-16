/**
 * Contact policy — answers the question "should we proactively message
 * this member right now?"
 *
 * Background research (Motionsoft, GymMaster, Health & Fitness Association,
 * DellaVigna & Malmendier 2006): the right answer depends on cohort, not
 * just on days dormant. Two stylised facts:
 *
 *   1. The most savable cohort is 14–45 days dormant. Touch them and ~70%
 *      come back. Touch them late and they cancel anyway.
 *   2. Long-tenured silent payers (1y+ tenure, 90+ days dormant, paying
 *      reliably, no contract renewal coming) are a different animal. They
 *      have made peace with paying for something they don't use. Outreach
 *      to this cohort risks *reminding them they could cancel*. Net negative
 *      expected value in most price points.
 *
 * This module encodes that policy as a pure function so it can be unit-
 * tested and re-used by every entry point (onboarding enrolment, sequence
 * runner, manual triggers in the dashboard).
 */

export interface ContactPolicyInput {
  tenureDays: number | null
  daysSinceLastVisit: number | null
  paymentFailed: boolean
  /** Days until contract renewal, if known. null = unknown or no contract. */
  daysToRenewal?: number | null
  /** Member status from CSV — 'active' | 'frozen' | 'sleeper' | 'cancelled' */
  status: string
  /** Cancellation intent already detected by inbound classifier? Always contact then. */
  hasCancellationIntent?: boolean
}

export type ContactDecision =
  | { contact: true; reason: string; cohort: ContactCohort }
  | { contact: false; reason: string }

export type ContactCohort =
  | 'cancellation_intent'        // member explicitly asked to cancel — engage now
  | 'new_member_dropout_risk'    // joined recently, hasn't built habit — highest ROI
  | 'sweet_spot_sleeper'         // 14-45 days dormant, was visiting — most savable
  | 'critical_sleeper'           // 46-89 days dormant — last chance, soft touch
  | 'renewal_window'             // contract renewal coming up — proactive review
  | 'payment_trouble'            // payment failed — already on the way out, save attempt
  | 'long_dormant_safe'          // long-tenured silent payer — DO NOT contact

const NEW_MEMBER_DAYS = 30
const SWEET_SPOT_LOW = 14
const SWEET_SPOT_HIGH = 45
const CRITICAL_HIGH = 89
const LONG_TENURED_DAYS = 365
const DEEP_DORMANT_DAYS = 90
const RENEWAL_WINDOW_DAYS = 60

export function decideContact(m: ContactPolicyInput): ContactDecision {
  // 0. Cancelled members are dropped entirely.
  if (m.status === 'cancelled') {
    return { contact: false, reason: 'Already cancelled — out of scope for retention.' }
  }

  // 1. Cancellation intent → always contact.
  if (m.hasCancellationIntent) {
    return { contact: true, reason: 'Explicit cancellation intent.', cohort: 'cancellation_intent' }
  }

  // 2. Payment trouble → contact regardless of dormancy. They're already
  //    on the way out; an honest save offer has nothing to lose.
  if (m.paymentFailed) {
    return { contact: true, reason: 'Payment failed — already disengaged on billing.', cohort: 'payment_trouble' }
  }

  // 3. Renewal window → review-anyway moment. Better to be in the conversation.
  if (m.daysToRenewal !== null && m.daysToRenewal !== undefined && m.daysToRenewal >= 0 && m.daysToRenewal <= RENEWAL_WINDOW_DAYS) {
    return { contact: true, reason: `Contract renewal in ${m.daysToRenewal} days.`, cohort: 'renewal_window' }
  }

  // 4. New member who hasn't visited → highest-ROI onboarding intervention.
  if (m.tenureDays !== null && m.tenureDays <= NEW_MEMBER_DAYS) {
    if (m.daysSinceLastVisit === null || m.daysSinceLastVisit >= 14) {
      return { contact: true, reason: 'New member without an established habit.', cohort: 'new_member_dropout_risk' }
    }
  }

  // 5. Sweet-spot sleeper (14–45 days dormant) → highest save rate. Contact.
  if (m.daysSinceLastVisit !== null && m.daysSinceLastVisit >= SWEET_SPOT_LOW && m.daysSinceLastVisit <= SWEET_SPOT_HIGH) {
    return { contact: true, reason: `Dormant ${m.daysSinceLastVisit} days — the intervention sweet spot.`, cohort: 'sweet_spot_sleeper' }
  }

  // 6. Critical sleeper (46–89 days) → soft re-engagement (class invite,
  //    new equipment news). No save offers — those signal "you could cancel"
  //    and may trigger the cancellation we're trying to prevent.
  if (m.daysSinceLastVisit !== null && m.daysSinceLastVisit > SWEET_SPOT_HIGH && m.daysSinceLastVisit <= CRITICAL_HIGH) {
    return { contact: true, reason: `Dormant ${m.daysSinceLastVisit} days — soft re-engagement only.`, cohort: 'critical_sleeper' }
  }

  // 7. The "sleeping dogs" cohort: long-tenured (1y+), deeply dormant
  //    (90+ days), paying reliably, no payment trouble, no renewal coming.
  //    Outreach here is net negative. Leave them alone.
  if (
    m.tenureDays !== null && m.tenureDays >= LONG_TENURED_DAYS &&
    m.daysSinceLastVisit !== null && m.daysSinceLastVisit >= DEEP_DORMANT_DAYS &&
    !m.paymentFailed
  ) {
    return {
      contact: false,
      reason: 'Long-tenured silent payer — outreach risks waking them to cancel. (sleeping-dogs cohort)',
    }
  }

  // 8. Healthy members (visited recently). No proactive contact needed.
  if (m.daysSinceLastVisit !== null && m.daysSinceLastVisit < SWEET_SPOT_LOW) {
    return { contact: false, reason: 'Active member — no intervention needed.' }
  }

  // 9. No visit data we can act on, and none of the above flags apply.
  //    Default to NOT contacting — better to miss a hit than spam the inbox.
  return {
    contact: false,
    reason: 'Insufficient signal — no recent visit data and no other risk flags.',
  }
}

/** Convenience for the sequence-runner: filter a list of members. */
export function filterContactable<T extends ContactPolicyInput>(members: T[]): Array<{
  member: T
  decision: ContactDecision
}> {
  return members
    .map((m) => ({ member: m, decision: decideContact(m) }))
    .filter((r) => r.decision.contact)
}
