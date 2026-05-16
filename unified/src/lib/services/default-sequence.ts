/**
 * Default 3-step retention sequence used during onboarding handoff.
 *
 * The retention thesis: don't let sleeping dogs lie. Deep sleepers (21–45 days
 * without a visit) are the most-savable cohort. A 3-touch sequence over five
 * days catches them in the right window with the right tone.
 *
 * Each step is a template — the runner substitutes `{{firstName}}`,
 * `{{gymName}}`, `{{daysSinceVisit}}` etc. at send time.
 *
 * All steps are intentionally short — research shows shorter SMS/WhatsApp
 * messages have substantially higher reply rates.
 */

export interface SequenceStep {
  step: number
  /** Hours after the previous step (or after enrolment for step 1). */
  delayHours: number
  channel: 'whatsapp' | 'sms'
  /** Mustache-style placeholders: {{firstName}}, {{gymName}}, {{daysSinceVisit}} */
  bodyTemplate: string
}

export const DEFAULT_SEQUENCE_NAME = 'Deep-sleeper recovery — default'
export const DEFAULT_SEQUENCE_DESCRIPTION =
  '3-touch outreach to members 21–45 days without a visit. Warm tone, no hard sell, ends with a real save offer if they engage.'

export const DEFAULT_SEQUENCE_STEPS: SequenceStep[] = [
  {
    step: 1,
    delayHours: 0,
    channel: 'whatsapp',
    bodyTemplate:
      `Hey {{firstName}}, it's the team at {{gymName}}. We've not seen you in a few weeks — just checking everything's ok? No pressure to come in, just wanted to say we're thinking of you. Reply anytime.`,
  },
  {
    step: 2,
    delayHours: 48,
    channel: 'whatsapp',
    bodyTemplate:
      `Hi {{firstName}} — life's busy, we get it. If now's not the right time we can freeze your membership for a month, no charge. Want me to set that up? Or pop in this week and I'll show you something new.`,
  },
  {
    step: 3,
    delayHours: 72,
    channel: 'whatsapp',
    bodyTemplate:
      `Last note from me, {{firstName}}. We'd love to have you back — got time for a quick chat this week to figure out what'd help? If not, no worries at all, the door's always open.`,
  },
]
