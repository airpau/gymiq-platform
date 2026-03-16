/**
 * Retention Log — DRY-RUN ONLY
 *
 * SAFETY: This module logs what WOULD be sent to members.
 *         No actual messages are dispatched. All outbound calls to Twilio
 *         are intentionally absent. See SAFETY.md.
 *
 * Log entries are kept in-memory for the lifetime of the process and exposed
 * via GET /retention/log for inspection during testing.
 *
 * INTERVENTION WINDOWS (industry best practice):
 *  • 14-20 days:   Light sleeper — friendly check-in
 *  • 21-45 days:   Deep sleeper — PRIORITY CONTACT with gym-configured offer
 *  • 46-60 days:   Critical — manual staff call only
 *  • 60+ days:     Lost — DO NOT CONTACT (sleeping dogs)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RetentionActionType =
  | 'light_sleeper_checkin'      // 14-20 days no visit — friendly check-in
  | 'deep_sleeper_offer'         // 21-45 days no visit — PRIORITY with offer
  | 'critical_manual_call'       // 46-60 days no visit — staff phone call
  | 'new_member_no_visit'        // Joined ≤30 days, 0 visits — highest priority
  | 'payment_reminder'           // overdue stage 1 (1-7 days)
  | 'payment_warning'            // overdue stage 2 (8-14 days)
  | 'payment_final_notice'       // overdue stage 3 (15+ days)
  | 'high_risk_retention';       // risk score >= 61 with no specific category

/** Gym-configurable retention offer */
export interface RetentionOffer {
  id: string;
  name: string;           // e.g., "Free Recovery Zone Session"
  description: string;      // e.g., "45 min private access to infrared sauna, ice bath..."
  normalValue: string;    // e.g., "£10"
  callToAction: string;   // e.g., "Claim your free session"
  bookingLink?: string;   // Optional direct booking URL
}

export interface RetentionLogEntry {
  id: string;
  timestamp: Date;
  gymId: string;
  memberId: string;
  memberName: string;
  actionType: RetentionActionType;
  channel: 'whatsapp' | 'sms' | 'email' | 'manual_call';
  messagePreview: string;
  riskScore: number;
  reason: string;
  offer?: RetentionOffer;   // Gym-configured offer (for deep_sleeper_offer)
  paymentRecoveryStage?: 1 | 2 | 3;
  /** Masked phone — last 4 digits only, e.g. ****1234 */
  wouldSendTo: string;
}

// ─── Message templates (with gym-configurable offers) ─────────────────────────

/** Default retention offers — gyms can override these in settings */
export const DEFAULT_OFFERS: RetentionOffer[] = [
  {
    id: 'recovery_zone',
    name: 'Free Recovery Zone Session',
    description: '45 min private access to infrared sauna, ice bath, massage guns, red light therapy, and Hyperice compression boots',
    normalValue: '£10',
    callToAction: 'Claim your free Recovery Zone session',
  },
  {
    id: 'pt_session',
    name: 'Free Personal Training Session',
    description: 'One-on-one 45 min session with a certified personal trainer to get you back on track',
    normalValue: '£35',
    callToAction: 'Book your free PT session',
  },
  {
    id: 'class_credit',
    name: 'Free Class Pass',
    description: 'Complimentary access to any group fitness class of your choice',
    normalValue: '£8',
    callToAction: 'Reserve your free class',
  },
  {
    id: 'guest_pass',
    name: 'Bring a Friend for Free',
    description: 'Work out with a friend — both of you get free access for one session',
    normalValue: '£15',
    callToAction: 'Bring your friend free',
  },
];

/** Get message template for action type, with optional gym-configured offer */
function getMessageTemplate(
  actionType: RetentionActionType,
  offer?: RetentionOffer
): (name: string, days?: number) => string {
  switch (actionType) {
    case 'light_sleeper_checkin':
      return (name, days = 14) =>
        `Hi ${name}! We've missed you — it's been ${days} days since your last visit. Your fitness goals are still within reach. Pop in this week and we'll make sure you feel right at home 💪`;

    case 'deep_sleeper_offer':
      return (name, days = 30) => {
        const offerText = offer
          ? `As a welcome back, we'd love to offer you a ${offer.name} (normally ${offer.normalValue}). ${offer.description}. ${offer.callToAction} — just reply YES and we'll get you booked in!`
          : `We'd love to have you back. Reply to this message and we'll arrange a free session to get you back on track.`;
        return `Hey ${name}, it's been ${days} days since your last session. Life gets busy — we get it. ${offerText}`;
      };

    case 'critical_manual_call':
      return (name, days = 50) =>
        `[STAFF ACTION REQUIRED] ${name} has not visited in ${days} days. This is a critical intervention — personal phone call recommended. Member is at high risk of cancellation.`;

    case 'new_member_no_visit':
      return (name) =>
        `Hi ${name}! Welcome to the gym family 🎉 We noticed you haven't had a chance to visit yet — no pressure! When you're ready, we'd love to show you around and help you feel comfortable. ${offer ? `As a welcome gift, enjoy a ${offer.name} (${offer.callToAction}).` : 'Reply to arrange a free orientation.'}`;

    case 'payment_reminder':
      return (name, days = 3) =>
        `Hi ${name}, just a gentle reminder that your membership payment is ${days} day${days === 1 ? '' : 's'} overdue. Please update your payment details to keep your access active. Need help? Reply to this message.`;

    case 'payment_warning':
      return (name, days = 10) =>
        `Hi ${name}, your membership payment is now ${days} days overdue and your access is at risk. Please settle your account within 7 days to avoid suspension. Reply to this message or call us.`;

    case 'payment_final_notice':
      return (name, days = 20) =>
        `FINAL NOTICE: Hi ${name}, your payment is ${days} days overdue. Your membership will be suspended today unless payment is received. Please contact us urgently — reply to this message or call 0800 XXX XXXX.`;

    case 'high_risk_retention':
      return (name) =>
        `Hi ${name}! We noticed you haven't been visiting recently and wanted to reach out personally. Is there anything we can do to improve your experience? Your goals matter to us 🎯`;

    default:
      return (name) => `Hi ${name}, we wanted to check in with you.`;
  }
}

// ─── In-memory buffer ─────────────────────────────────────────────────────────

const _buffer: RetentionLogEntry[] = [];

let _counter = 0;
function nextId(): string {
  return `ret_${Date.now()}_${(++_counter).toString().padStart(4, '0')}`;
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '(no phone)';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Log a retention action that WOULD be taken. Returns the log entry. */
export function logRetentionAction(params: {
  gymId: string;
  memberId: string;
  memberName: string;
  phone: string | null | undefined;
  actionType: RetentionActionType;
  riskScore: number;
  daysSinceVisit?: number | null;
  daysOverdue?: number | null;
  paymentRecoveryStage?: 1 | 2 | 3;
  offer?: RetentionOffer;  // Gym-configured offer for deep_sleeper_offer
}): RetentionLogEntry {
  const {
    gymId, memberId, memberName, phone, actionType, riskScore,
    daysSinceVisit, daysOverdue, paymentRecoveryStage, offer,
  } = params;

  // Determine channel based on action type
  const channel: RetentionLogEntry['channel'] =
    actionType === 'critical_manual_call' ? 'manual_call' : 'whatsapp';

  // Build the message that would be sent
  const relevantDays =
    actionType.startsWith('payment') ? (daysOverdue ?? undefined) : (daysSinceVisit ?? undefined);
  const templateFn = getMessageTemplate(actionType, offer);
  const messagePreview = templateFn(memberName, relevantDays);

  // Human-readable reason
  const reason = buildReason(actionType, params);

  const entry: RetentionLogEntry = {
    id: nextId(),
    timestamp: new Date(),
    gymId,
    memberId,
    memberName,
    actionType,
    channel,
    messagePreview,
    riskScore,
    reason,
    ...(offer ? { offer } : {}),
    ...(paymentRecoveryStage ? { paymentRecoveryStage } : {}),
    wouldSendTo: maskPhone(phone),
  };

  _buffer.push(entry);

  const offerInfo = offer ? ` [Offer: ${offer.name}]` : '';
  console.log(
    `[DRY-RUN][Retention] ${actionType.toUpperCase()} | ` +
    `${memberName} (risk: ${riskScore}) → ${entry.wouldSendTo}${offerInfo}\n` +
    `  Reason: ${reason}\n` +
    `  Preview: "${messagePreview.slice(0, 100)}${messagePreview.length > 100 ? '…' : ''}"`
  );

  return entry;
}

function buildReason(
  actionType: RetentionActionType,
  params: { riskScore: number; daysSinceVisit?: number | null; daysOverdue?: number | null }
): string {
  switch (actionType) {
    case 'light_sleeper_checkin':
      return `No visit in ${params.daysSinceVisit} days (14-20 days: light sleeper)`;
    case 'deep_sleeper_offer':
      return `No visit in ${params.daysSinceVisit} days (21-45 days: deep sleeper — PRIORITY with offer)`;
    case 'critical_manual_call':
      return `No visit in ${params.daysSinceVisit} days (46-60 days: CRITICAL — manual call required)`;
    case 'new_member_no_visit':
      return `New member (≤30 days) with 0 visits — early dropout prevention`;
    case 'payment_reminder':
      return `Payment ${params.daysOverdue} day(s) overdue — stage 1`;
    case 'payment_warning':
      return `Payment ${params.daysOverdue} days overdue — stage 2`;
    case 'payment_final_notice':
      return `Payment ${params.daysOverdue} days overdue — final notice`;
    case 'high_risk_retention':
      return `High churn risk score: ${params.riskScore}`;
    default:
      return 'Triggered by retention workflow';
  }
}

/** Return log entries, optionally filtered by gymId. */
export function getRetentionLog(gymId?: string): RetentionLogEntry[] {
  if (gymId) return _buffer.filter((e) => e.gymId === gymId);
  return [..._buffer];
}

/** Clear the in-memory buffer (useful in tests). */
export function clearRetentionLog(): void {
  _buffer.length = 0;
}

/** Total entries in the buffer. */
export function getLogSize(): number {
  return _buffer.length;
}
