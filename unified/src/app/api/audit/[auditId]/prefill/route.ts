/**
 * GET /api/audit/[auditId]/prefill
 *
 * Returns just the public-safe fields the signup page needs to render the
 * "picking up from your audit" context. Does NOT return the full member
 * list — that's claim-only.
 *
 * Anyone with the audit UUID can call this (same security envelope as the
 * /audit/[id] view).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AuditReport } from '@/lib/services/audit-analysis'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ auditId: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { auditId } = await ctx.params

  if (!/^[0-9a-f-]{36}$/i.test(auditId)) {
    return NextResponse.json({ error: 'Invalid audit id' }, { status: 400 })
  }

  const supabase = serviceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('audits')
    .select('id, first_name, gym_name, email, report')
    .eq('id', auditId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
  }

  const report = data.report as AuditReport
  return NextResponse.json({
    firstName: data.first_name,
    gymName: data.gym_name,
    email: data.email,
    liveMembers: report.totals?.liveMembers ?? 0,
    highRisk: report.risk?.high ?? 0,
    monthlyRevenueAtRisk: report.revenue?.monthlyRevenueAtRisk ?? 0,
  })
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
