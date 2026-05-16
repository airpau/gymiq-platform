/**
 * GET /api/cron/abandoned-leads
 *
 * Vercel Cron entry point (15-minute cadence). For every lead that:
 *
 *   - has stage 'audit_started' OR 'audit_completed'
 *   - was last updated 30+ minutes ago but less than 24 hours ago
 *   - has no recovery_email_sent_at yet
 *   - does NOT have a converted_user_id (so we never email customers)
 *
 * we fire a single recovery email via Resend, then stamp
 * recovery_email_sent_at + recovery_email_status. The (email, source)
 * uniqueness on the leads table means even if the visitor re-fires the
 * audit-form blur we never email them twice (the upsert keeps the same
 * row + the existing sent_at).
 *
 * Security: rejects requests that don't carry the Vercel cron header OR a
 * matching CRON_SECRET query param. This lets us also kick it manually
 * from `curl` for testing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sendRecoveryEmail } from '@/lib/email/send-recovery'

export const runtime = 'nodejs'
export const maxDuration = 60

interface LeadRow {
  id: string
  email: string
  first_name: string | null
  gym_name: string | null
  stage: string
  audit_id: string | null
  updated_at: string
}

const PER_RUN_CAP = 50

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const svc = serviceClient()
  if (!svc) return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })

  const now = Date.now()
  const thirtyMinAgo = new Date(now - 30 * 60_000).toISOString()
  const twentyFourHrAgo = new Date(now - 24 * 60 * 60_000).toISOString()

  const { data: leads, error } = await svc
    .from('leads')
    .select('id, email, first_name, gym_name, stage, audit_id, updated_at')
    .in('stage', ['audit_started', 'audit_completed'])
    .is('recovery_email_sent_at', null)
    .is('converted_user_id', null)
    .lte('updated_at', thirtyMinAgo)
    .gte('updated_at', twentyFourHrAgo)
    .order('updated_at', { ascending: true })
    .limit(PER_RUN_CAP)

  if (error) {
    console.error('[cron/abandoned-leads] select failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (leads ?? []) as LeadRow[]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gymiq.ai'

  const results = { picked: rows.length, sent: 0, failed: 0, skipped: 0, errors: [] as string[] }

  for (const lead of rows) {
    // Defensive opt-out check: if the same email appears on the global
    // messaging_optouts list (e.g. they replied STOP to a previous SMS),
    // skip them.
    const { data: optedOut } = await svc
      .from('messaging_optouts')
      .select('phone')
      .eq('phone', lead.email)
      .maybeSingle()
    if (optedOut) {
      await svc
        .from('leads')
        .update({ recovery_email_status: 'skipped_opted_out' })
        .eq('id', lead.id)
      results.skipped++
      continue
    }

    const stage = lead.stage === 'audit_completed' ? 'audit_completed' : 'audit_started'
    const send = await sendRecoveryEmail({
      to: lead.email,
      firstName: lead.first_name,
      gymName: lead.gym_name,
      stage,
      auditId: lead.audit_id,
      appUrl,
    })

    if (send.sent) {
      await svc
        .from('leads')
        .update({
          recovery_email_sent_at: new Date().toISOString(),
          recovery_email_status: 'sent',
        })
        .eq('id', lead.id)
      results.sent++
    } else {
      const err = send.error.slice(0, 200)
      await svc
        .from('leads')
        .update({
          recovery_email_sent_at: new Date().toISOString(),
          recovery_email_status: `error:${err}`,
        })
        .eq('id', lead.id)
      results.failed++
      results.errors.push(`${lead.email}: ${err}`)
    }
  }

  return NextResponse.json(results)
}

function isAuthorised(req: NextRequest): boolean {
  // Vercel Cron sets `x-vercel-cron: 1` on cron-triggered hits.
  if (req.headers.get('x-vercel-cron')) return true
  // Manual trigger: pass ?secret=… matching CRON_SECRET.
  const secret = process.env.CRON_SECRET
  if (secret && new URL(req.url).searchParams.get('secret') === secret) return true
  return false
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
