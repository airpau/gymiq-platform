/**
 * Twilio messaging service.
 *
 * Wraps WhatsApp + SMS sending with the safety rails that absence-of-config
 * used to enforce in the dormant Express monorepo:
 *
 *   1. DRY-RUN gate. While MESSAGING_LIVE !== "true" no message goes out the
 *      door — calls return a synthetic { dryRun: true } result. This is the
 *      project-level feature flag the audit (section 7, item 4) recommended.
 *
 *   2. Quiet hours. Outbound messages outside the gym's local 09:00–20:00
 *      window are deferred with { skipped: 'quiet_hours' }.
 *
 *   3. STOP opt-out. We never message a number marked opted-out in the
 *      `messaging_optouts` Supabase table. Inbound STOP / UNSUBSCRIBE keywords
 *      add a row to that table — see handleInboundOptOut().
 *
 *   4. Webhook signature validation for the Twilio inbound webhook.
 */
import twilio from 'twilio'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type SendResult =
  | { ok: true; sid: string; channel: 'whatsapp' | 'sms'; dryRun: false }
  | { ok: true; dryRun: true; channel: 'whatsapp' | 'sms'; preview: string }
  | { ok: false; skipped: 'quiet_hours' | 'opted_out' | 'no_credentials'; reason: string }
  | { ok: false; error: string }

export interface SendOptions {
  /** The body text to send. */
  body: string
  /** E.164 destination, e.g. "+447700900123". */
  to: string
  /** E.164 sender — defaults to TWILIO_WHATSAPP_NUMBER or TWILIO_SMS_NUMBER. */
  from?: string
  /** Channel — WhatsApp by default. */
  channel?: 'whatsapp' | 'sms'
  /** Skip the dry-run gate. ONLY pass true after Paul has explicitly enabled the gym. */
  forceLive?: boolean
  /** Skip the quiet-hours gate. Used for transactional payment receipts etc. */
  bypassQuietHours?: boolean
  /** Skip the opt-out lookup. NEVER set this true for marketing/retention. */
  bypassOptOut?: boolean
  /**
   * The visitor's local timezone, used for quiet-hours calculation. Defaults
   * to Europe/London — change per gym once we capture this in the Supabase
   * gyms table.
   */
  timezone?: string
  /** Optional Supabase client (service role) — required for opt-out checks. */
  supabase?: SupabaseClient
}

const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])
const START_KEYWORDS = new Set(['START', 'YES', 'UNSTOP'])

const DEFAULT_TIMEZONE = 'Europe/London'
const QUIET_HOURS_START = 9 // 09:00 inclusive
const QUIET_HOURS_END = 20 // 20:00 exclusive

export class TwilioService {
  private client: twilio.Twilio | null
  private accountSid: string | undefined
  private authToken: string | undefined

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID
    this.authToken = process.env.TWILIO_AUTH_TOKEN
    this.client = this.accountSid && this.authToken ? twilio(this.accountSid, this.authToken) : null
  }

  /** True if Twilio credentials are present AND the global live-mode flag is on. */
  isLive(): boolean {
    return Boolean(this.client) && process.env.MESSAGING_LIVE === 'true'
  }

  async send(opts: SendOptions): Promise<SendResult> {
    const channel = opts.channel ?? 'whatsapp'

    // Credentials check
    if (!this.client) {
      return {
        ok: false,
        skipped: 'no_credentials',
        reason: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set',
      }
    }

    // Opt-out check (the user can override for transactional, but never for marketing)
    if (!opts.bypassOptOut) {
      const supabase = opts.supabase ?? defaultSupabase()
      if (supabase) {
        const { data } = await supabase
          .from('messaging_optouts')
          .select('phone')
          .eq('phone', normalisePhone(opts.to))
          .maybeSingle()
        if (data) {
          return { ok: false, skipped: 'opted_out', reason: `${opts.to} has opted out` }
        }
      }
    }

    // Quiet hours check
    if (!opts.bypassQuietHours) {
      const tz = opts.timezone ?? DEFAULT_TIMEZONE
      const hour = currentHourIn(tz)
      if (hour < QUIET_HOURS_START || hour >= QUIET_HOURS_END) {
        return {
          ok: false,
          skipped: 'quiet_hours',
          reason: `Current hour ${hour} in ${tz} is outside ${QUIET_HOURS_START}:00–${QUIET_HOURS_END}:00`,
        }
      }
    }

    // Pick the sender
    const from =
      opts.from ??
      (channel === 'whatsapp'
        ? process.env.TWILIO_WHATSAPP_NUMBER
        : process.env.TWILIO_SMS_NUMBER)
    if (!from) {
      return { ok: false, error: `No ${channel} sender configured` }
    }

    // Dry-run gate
    const live = opts.forceLive || this.isLive()
    if (!live) {
      console.log(
        `[Twilio DRY-RUN] ${channel} to ${opts.to} from ${from}: ${opts.body.slice(0, 80)}…`,
      )
      return { ok: true, dryRun: true, channel, preview: opts.body }
    }

    // Send
    try {
      const message = await this.client.messages.create(
        channel === 'whatsapp'
          ? { from: `whatsapp:${from}`, to: `whatsapp:${opts.to}`, body: opts.body }
          : { from, to: opts.to, body: opts.body },
      )
      return { ok: true, sid: message.sid, channel, dryRun: false }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Twilio error'
      return { ok: false, error: message }
    }
  }

  /** Validate a Twilio webhook signature so we can trust the inbound payload. */
  validateWebhook(url: string, params: Record<string, string>, signature: string): boolean {
    if (!this.authToken) return false
    return twilio.validateRequest(this.authToken, signature, url, params)
  }

  /**
   * Inspect an inbound message and, if it's STOP/START, update the opt-out
   * table accordingly. Returns the keyword consumed (or null).
   */
  async handleInboundOptOut(
    fromNumber: string,
    body: string,
    supabase?: SupabaseClient,
  ): Promise<'stop' | 'start' | null> {
    const word = body.trim().toUpperCase()
    const sb = supabase ?? defaultSupabase()
    if (!sb) return null
    const phone = normalisePhone(fromNumber)

    if (STOP_KEYWORDS.has(word)) {
      await sb.from('messaging_optouts').upsert({ phone, opted_out_at: new Date().toISOString() })
      return 'stop'
    }
    if (START_KEYWORDS.has(word)) {
      await sb.from('messaging_optouts').delete().eq('phone', phone)
      return 'start'
    }
    return null
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalisePhone(input: string): string {
  // Strip the `whatsapp:` prefix and trim — leaves E.164.
  return input.replace(/^whatsapp:/i, '').trim()
}

function currentHourIn(timezone: string): number {
  // Use Intl to get the hour in the target timezone without pulling in moment-tz.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date())
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '12'
  return parseInt(hourPart, 10)
}

function defaultSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
