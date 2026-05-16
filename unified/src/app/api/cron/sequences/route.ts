/**
 * GET /api/cron/sequences
 *
 * Hourly Vercel Cron. Walks every `sequence_runs` row where
 *   status = 'pending' AND next_send_at <= now
 * and tries to send the current step to that member via Twilio.
 *
 * Safety:
 *   - The TwilioService applies dry-run / quiet-hours / opt-out gates. This
 *     cron never bypasses them — it just queues calls.
 *   - The gym-level `gyms.messaging_enabled` flag is also checked here so
 *     a half-configured gym never accidentally fires.
 *   - All inputs come from our own tables (no external user input on this
 *     route) so we only need shape validation, not sanitisation.
 *
 * Auth:
 *   Vercel Cron sends a request with header `x-vercel-cron-signature` and
 *   also an Authorization: Bearer header containing CRON_SECRET. We accept
 *   either of those, but require *something* — never let randoms hit this.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { TwilioService, type SendOptions } from '@/lib/messaging/twilio'
import {
  DEFAULT_SEQUENCE_STEPS,
  type SequenceStep,
} from '@/lib/services/default-sequence'

export const runtime = 'nodejs'
export const maxDuration = 60

const BATCH_SIZE = 50

interface SequenceRunRow {
  id: string
  sequence_id: string
  member_id: string
  gym_id: string
  current_step: number
  next_send_at: string
}

interface SequenceRow {
  id: string
  steps: SequenceStep[]
  status: string
}

interface MemberRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  plan_name: string | null
  last_visit: string | null
  monthly_fee: number | null
}

interface GymRow {
  id: string
  name: string
  timezone: string
  whatsapp_number: string | null
  sms_number: string | null
  messaging_enabled: boolean
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = serviceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  }

  const now = new Date()
  const nowIso = now.toISOString()

  // Pull a batch of due runs. We pick a small batch each hour to keep the
  // function well under Vercel's invocation budget; the next cron picks up
  // the rest. This also avoids one bad row stalling the whole queue.
  const { data: runs, error } = await supabase
    .from('sequence_runs')
    .select('id, sequence_id, member_id, gym_id, current_step, next_send_at')
    .eq('status', 'pending')
    .lte('next_send_at', nowIso)
    .order('next_send_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[cron/sequences] fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch pending runs' }, { status: 500 })
  }

  const stats = {
    picked: runs?.length ?? 0,
    sent: 0,
    dryRun: 0,
    skipped: 0,
    failed: 0,
    completed: 0,
  }

  if (!runs || runs.length === 0) {
    return NextResponse.json({ ...stats, message: 'No pending runs' })
  }

  // Group lookups by sequence/gym/member so we don't N+1.
  const sequenceIds = Array.from(new Set(runs.map((r) => r.sequence_id)))
  const memberIds = Array.from(new Set(runs.map((r) => r.member_id)))
  const gymIds = Array.from(new Set(runs.map((r) => r.gym_id)))

  const [sequences, members, gyms] = await Promise.all([
    fetchSequences(supabase, sequenceIds),
    fetchMembers(supabase, memberIds),
    fetchGyms(supabase, gymIds),
  ])

  const twilio = new TwilioService()

  for (const run of runs as SequenceRunRow[]) {
    const seq = sequences.get(run.sequence_id)
    const member = members.get(run.member_id)
    const gym = gyms.get(run.gym_id)

    if (!seq || !member || !gym) {
      console.warn(`[cron/sequences] missing dep for run ${run.id} — marking failed`)
      await markFailed(supabase, run.id, 'missing sequence/member/gym row')
      stats.failed++
      continue
    }

    // Gym-level kill switch
    if (!gym.messaging_enabled) {
      // Don't error — just leave it pending. As soon as Paul flips the gym's
      // messaging_enabled flag, the next cron picks it up.
      stats.skipped++
      continue
    }

    const steps = Array.isArray(seq.steps) ? seq.steps : DEFAULT_SEQUENCE_STEPS
    const step = steps[run.current_step]
    if (!step) {
      // Past the last step → mark completed.
      await markCompleted(supabase, run.id)
      stats.completed++
      continue
    }

    // Build the message body from the template.
    const body = renderTemplate(step.bodyTemplate, {
      firstName: firstNameOf(member.name),
      gymName: gym.name,
      daysSinceVisit: daysBetween(member.last_visit, now),
    })

    if (!member.phone) {
      // Without a phone number, we can't WhatsApp/SMS. Mark this run as
      // 'failed' so it doesn't keep coming back — gym staff can re-enrol
      // once they fix the data.
      await markFailed(supabase, run.id, 'member has no phone')
      stats.failed++
      continue
    }

    const sendOpts: SendOptions = {
      to: member.phone,
      body,
      channel: step.channel,
      from:
        step.channel === 'whatsapp'
          ? gym.whatsapp_number ?? undefined
          : gym.sms_number ?? undefined,
      timezone: gym.timezone,
      supabase,
    }
    const result = await twilio.send(sendOpts)

    // Persist the message regardless of outcome so the dashboard has a
    // complete audit trail (incl. dry-runs and opt-out skips).
    await writeOutboundMessage(supabase, {
      gymId: gym.id,
      memberId: member.id,
      phone: member.phone,
      channel: step.channel,
      body,
      result,
    })

    if (!result.ok) {
      if ('skipped' in result && (result.skipped === 'quiet_hours' || result.skipped === 'opted_out')) {
        if (result.skipped === 'opted_out') {
          await supabase.from('sequence_runs').update({ status: 'opted_out', updated_at: nowIso }).eq('id', run.id)
        }
        stats.skipped++
        continue
      }
      console.warn(`[cron/sequences] send failed for run ${run.id}:`, result)
      await markFailed(supabase, run.id, 'error' in result ? result.error : 'unknown send error')
      stats.failed++
      continue
    }

    if (result.dryRun) stats.dryRun++
    else stats.sent++

    // Advance the run.
    const nextStep = run.current_step + 1
    const nextStepDef = steps[nextStep]
    if (!nextStepDef) {
      await markCompleted(supabase, run.id)
      stats.completed++
    } else {
      const nextSendAt = new Date(now.getTime() + nextStepDef.delayHours * 3_600_000).toISOString()
      await supabase
        .from('sequence_runs')
        .update({
          status: 'pending',
          current_step: nextStep,
          next_send_at: nextSendAt,
          contacted_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', run.id)
    }
  }

  return NextResponse.json(stats)
}

// ─── helpers ────────────────────────────────────────────────────────────────

function authorised(req: NextRequest): boolean {
  // Vercel Cron sends its own signature header. We also accept a manual
  // Authorization: Bearer <CRON_SECRET> for testing from curl.
  if (req.headers.get('x-vercel-cron-signature')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Allow if no secret is configured AND we're on Vercel (Vercel Cron
    // can't be hit externally without the header). For local dev / no
    // CRON_SECRET set, we'd rather fail closed.
    return Boolean(req.headers.get('x-vercel-cron-signature'))
  }
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function fetchSequences(supabase: SupabaseClient, ids: string[]): Promise<Map<string, SequenceRow>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .from('sequences')
    .select('id, steps, status')
    .in('id', ids)
  const out = new Map<string, SequenceRow>()
  for (const r of (data ?? []) as SequenceRow[]) out.set(r.id, r)
  return out
}

async function fetchMembers(supabase: SupabaseClient, ids: string[]): Promise<Map<string, MemberRow>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .from('members')
    .select('id, name, email, phone, plan_name, last_visit, monthly_fee')
    .in('id', ids)
  const out = new Map<string, MemberRow>()
  for (const r of (data ?? []) as MemberRow[]) out.set(r.id, r)
  return out
}

async function fetchGyms(supabase: SupabaseClient, ids: string[]): Promise<Map<string, GymRow>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .from('gyms')
    .select('id, name, timezone, whatsapp_number, sms_number, messaging_enabled')
    .in('id', ids)
  const out = new Map<string, GymRow>()
  for (const r of (data ?? []) as GymRow[]) out.set(r.id, r)
  return out
}

async function markCompleted(supabase: SupabaseClient, runId: string) {
  await supabase
    .from('sequence_runs')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', runId)
}

async function markFailed(supabase: SupabaseClient, runId: string, reason: string) {
  await supabase
    .from('sequence_runs')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
  console.warn(`[cron/sequences] run ${runId} failed: ${reason}`)
}

async function writeOutboundMessage(
  supabase: SupabaseClient,
  args: {
    gymId: string
    memberId: string
    phone: string
    channel: 'whatsapp' | 'sms'
    body: string
    result: Awaited<ReturnType<TwilioService['send']>>
  },
) {
  // Find or create the conversation for (gym, member, phone) so all
  // future inbound + outbound messages thread together.
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('gym_id', args.gymId)
    .eq('phone', args.phone)
    .maybeSingle()

  let convId = existingConv?.id as string | undefined
  if (!convId) {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        gym_id: args.gymId,
        member_id: args.memberId,
        phone: args.phone,
        channel: args.channel,
        status: 'active',
      })
      .select('id')
      .single()
    convId = newConv?.id
  }
  if (!convId) return

  const sid = 'sid' in args.result && args.result.ok ? args.result.sid : null
  await supabase.from('messages').insert({
    conversation_id: convId,
    direction: 'outbound',
    content: args.body,
    channel: args.channel,
    twilio_sid: sid,
    sent_at: new Date().toISOString(),
  })
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', convId)
}

function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    return v === undefined || v === null ? '' : String(v)
  })
}

function firstNameOf(fullName: string): string {
  return (fullName ?? '').trim().split(/\s+/)[0] || 'there'
}

function daysBetween(iso: string | null, ref: Date): number | string {
  if (!iso) return ''
  const ms = ref.getTime() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}
