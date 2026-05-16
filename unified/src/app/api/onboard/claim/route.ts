/**
 * POST /api/onboard/claim
 *
 * Called once, immediately after a visitor signs up off the back of an audit.
 * Turns their anonymous audit into a real gym account by:
 *
 *  1. Verifying they're signed in as a Supabase auth user.
 *  2. Looking up the audit row by its UUID (passed in the body).
 *  3. Sanity-checking that the audit's email matches the signed-in user's
 *     email — stops randos claiming someone else's report.
 *  4. Creating a `gyms` row owned by them (if they don't already have one).
 *  5. Importing the actionable members (deep sleepers + payment overdue +
 *     new-member-at-risk + frozen) into the `members` table.
 *  6. Creating the default 3-step retention sequence.
 *  7. Enrolling all deep-sleeper members in the sequence as `pending` runs.
 *  8. Marking the lead row as `signed_up` and linking it to the user.
 *
 * Idempotent: re-running just no-ops or upserts. Safe to retry.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  DEFAULT_SEQUENCE_NAME,
  DEFAULT_SEQUENCE_DESCRIPTION,
  DEFAULT_SEQUENCE_STEPS,
} from '@/lib/services/default-sequence'
import type { AuditReport, ScoredMember } from '@/lib/services/audit-analysis'

export const runtime = 'nodejs'
export const maxDuration = 30

interface ClaimRequest {
  auditId: string
}

interface ClaimResult {
  gymId: string
  membersImported: number
  sequenceId: string
  enrolledCount: number
}

export async function POST(req: NextRequest) {
  let auditId: string
  try {
    const body = (await req.json()) as ClaimRequest
    if (!body?.auditId || !/^[0-9a-f-]{36}$/i.test(body.auditId)) {
      return NextResponse.json({ error: 'Missing or invalid auditId' }, { status: 400 })
    }
    auditId = body.auditId
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // 1. Auth check via the SSR client — relies on the Supabase cookie set by
  // the signup/login flow.
  const ssr = await createServerClient()
  const { data: authData } = await ssr.auth.getUser()
  const user = authData?.user
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Service-role client for everything else (bypasses RLS).
  const svc = serviceClient()
  if (!svc) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  }

  // 3. Fetch the audit.
  const { data: audit, error: auditErr } = await svc
    .from('audits')
    .select('id, first_name, gym_name, email, report')
    .eq('id', auditId)
    .single()
  if (auditErr || !audit) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
  }

  // 4. Email match — prevents claim hijacking via guessed UUIDs.
  if (typeof user.email !== 'string' || user.email.toLowerCase() !== audit.email.toLowerCase()) {
    return NextResponse.json(
      { error: 'This audit was generated under a different email — sign in with that address.' },
      { status: 403 },
    )
  }

  const report = audit.report as AuditReport

  // 5. Find-or-create the gym.
  const { data: existingGym } = await svc
    .from('gyms')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  let gymId: string
  if (existingGym) {
    gymId = existingGym.id
  } else {
    const slug = slugify(audit.gym_name) + '-' + audit.id.slice(0, 6)
    const { data: newGym, error: gymErr } = await svc
      .from('gyms')
      .insert({
        name: audit.gym_name,
        slug,
        owner_user_id: user.id,
        timezone: 'Europe/London',
        // Messaging stays OFF until Paul explicitly flips it (SAFETY.md).
        messaging_enabled: false,
      })
      .select('id')
      .single()
    if (gymErr || !newGym) {
      console.error('[onboard/claim] gym insert failed:', gymErr)
      return NextResponse.json({ error: 'Failed to create gym' }, { status: 500 })
    }
    gymId = newGym.id
  }

  // 6. Build the actionable-member union from the audit JSON.
  // We import the four priority lists, deduped by external_id / email.
  const actionable: ScoredMember[] = uniqueMembers([
    ...(report.topDeepSleepers ?? []),
    ...(report.topPaymentOverdue ?? []),
    ...(report.topNewMemberRisk ?? []),
    ...(report.topFrozen ?? []),
  ])

  // 7. Upsert members. We dedupe on (gym_id, external_id OR email) — for the
  // MVP we use email as the dedup key when external_id is missing.
  let membersImported = 0
  const memberIdsByKey = new Map<string, string>()
  for (const m of actionable) {
    const key = m.externalId || (m.email ?? '').toLowerCase() || `${gymId}:${m.name}`
    if (!key) continue

    const { data: existing } = await svc
      .from('members')
      .select('id')
      .eq('gym_id', gymId)
      .or(
        m.externalId
          ? `external_id.eq.${m.externalId}`
          : `email.eq.${(m.email ?? '').toLowerCase()}`,
      )
      .maybeSingle()

    if (existing) {
      memberIdsByKey.set(key, existing.id)
      continue
    }

    const { data: inserted, error: insErr } = await svc
      .from('members')
      .insert({
        gym_id: gymId,
        external_id: m.externalId,
        name: m.name ?? 'Unknown',
        email: m.email,
        phone: m.phone,
        status: m.status,
        plan_name: m.membershipType,
        monthly_fee: m.monthlyValue,
        join_date: m.joinDate ? toISODate(m.joinDate) : null,
        last_visit: m.lastVisit ? toISODate(m.lastVisit) : null,
        next_payment: m.nextPayment ? toISODate(m.nextPayment) : null,
        visit_count_30d: m.visitCount30d ?? 0,
        risk_score: m.riskScore,
        risk_factors: m.factors ?? [],
        source_metadata: {
          imported_from_audit: auditId,
          sleeper_category: m.sleeperCategory,
          tenure_days: m.tenureDays,
          payment_failed: m.paymentFailed,
        },
      })
      .select('id')
      .single()
    if (insErr || !inserted) {
      console.warn('[onboard/claim] member insert skipped:', insErr?.message)
      continue
    }
    memberIdsByKey.set(key, inserted.id)
    membersImported++
  }

  // 8. Find-or-create the default sequence for this gym.
  const { data: existingSeq } = await svc
    .from('sequences')
    .select('id')
    .eq('gym_id', gymId)
    .eq('name', DEFAULT_SEQUENCE_NAME)
    .maybeSingle()

  let sequenceId: string
  if (existingSeq) {
    sequenceId = existingSeq.id
  } else {
    const { data: newSeq, error: seqErr } = await svc
      .from('sequences')
      .insert({
        gym_id: gymId,
        name: DEFAULT_SEQUENCE_NAME,
        description: DEFAULT_SEQUENCE_DESCRIPTION,
        status: 'active',
        steps: DEFAULT_SEQUENCE_STEPS,
      })
      .select('id')
      .single()
    if (seqErr || !newSeq) {
      console.error('[onboard/claim] sequence insert failed:', seqErr)
      return NextResponse.json({ error: 'Failed to create sequence', gymId }, { status: 500 })
    }
    sequenceId = newSeq.id
  }

  // 9. Enrol deep sleepers (the highest-leverage cohort) in the sequence.
  // sequence_runs rows are status='pending' with next_send_at = now; the
  // cron runner will pick them up.
  const deepSleepers = (report.topDeepSleepers ?? []) as ScoredMember[]
  const now = new Date().toISOString()
  let enrolledCount = 0
  for (const m of deepSleepers) {
    const key = m.externalId || (m.email ?? '').toLowerCase() || `${gymId}:${m.name}`
    const memberId = memberIdsByKey.get(key)
    if (!memberId) continue

    // Skip if already enrolled (avoid duplicates on re-claim).
    const { data: existingRun } = await svc
      .from('sequence_runs')
      .select('id')
      .eq('sequence_id', sequenceId)
      .eq('member_id', memberId)
      .maybeSingle()
    if (existingRun) continue

    const { error: runErr } = await svc.from('sequence_runs').insert({
      sequence_id: sequenceId,
      member_id: memberId,
      gym_id: gymId,
      status: 'pending',
      current_step: 0,
      next_send_at: now,
    })
    if (!runErr) enrolledCount++
  }

  // 10. Mark the lead row converted (best-effort).
  svc
    .from('leads')
    .update({
      stage: 'signed_up',
      converted_user_id: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('email', audit.email)
    .eq('source', 'audit_form')
    .then(() => undefined, (err: unknown) => {
      console.warn('[onboard/claim] lead update failed:', err)
    })

  const result: ClaimResult = { gymId, membersImported, sequenceId, enrolledCount }
  return NextResponse.json(result)
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50)
}

function toISODate(d: Date | string | null): string | null {
  if (!d) return null
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10) // YYYY-MM-DD
}

function uniqueMembers(list: ScoredMember[]): ScoredMember[] {
  const seen = new Set<string>()
  const out: ScoredMember[] = []
  for (const m of list) {
    const key = (m.externalId ?? m.email ?? m.name ?? '').toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(m)
  }
  return out
}
