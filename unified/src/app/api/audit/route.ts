/**
 * POST /api/audit
 *
 * Receives a member-export file plus lead-capture fields, runs the analysis,
 * persists it to Supabase, fires off the email, and returns the reportId so
 * the client can redirect to /audit/[reportId].
 *
 * Everything runs in a Node serverless function (NOT edge) because xlsx
 * isn't edge-compatible.
 */
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseMemberFile } from '@/lib/csv/parse-members'
import { analyseAudit } from '@/lib/services/audit-analysis'
import { sendAuditEmail } from '@/lib/email/send-audit'
import { sendMetaLead } from '@/lib/analytics/meta-capi'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB — generous for any gym member export

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const firstName = (formData.get('firstName') as string | null)?.trim()
    const gymName = (formData.get('gymName') as string | null)?.trim()
    const email = (formData.get('email') as string | null)?.trim().toLowerCase()
    const phone = (formData.get('phone') as string | null)?.trim() || null
    const software = (formData.get('software') as string | null)?.trim() || null
    const memberBand = (formData.get('members') as string | null)?.trim() || null
    const eventId = (formData.get('eventId') as string | null)?.trim() || `audit-${Date.now()}`
    const fbp = (formData.get('fbp') as string | null)?.trim() || null
    const fbc = (formData.get('fbc') as string | null)?.trim() || null
    const sourceUrl = (formData.get('sourceUrl') as string | null)?.trim() || req.nextUrl.origin

    if (!(file instanceof File)) {
      return badRequest('Missing file in upload.')
    }
    if (!firstName || !gymName || !email) {
      return badRequest('Missing first name, gym name, or email.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return badRequest('That email address does not look valid.')
    }
    if (file.size > MAX_FILE_BYTES) {
      return badRequest('File is over 8 MB. Trim it down or contact us.')
    }

    // 1. Parse + analyse — pure compute, no DB or AI calls.
    const parseResult = await parseMemberFile(file)
    if (parseResult.members.length === 0) {
      return badRequest(
        parseResult.summary.warnings.join(' ') ||
          'We could not read any member rows from that file. Try a different export.',
      )
    }
    const report = analyseAudit(parseResult.members, parseResult.summary)

    // 2. Persist to Supabase.
    const supabase = createServiceClient()
    if (!supabase) {
      // No service-role key configured yet — still return a result the user
      // can see on-screen via the redirect, but flag it so we know.
      return NextResponse.json({
        reportId: 'preview',
        previewReport: report,
        warning: 'Storage not yet configured — report is in-memory only.',
      })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('audits')
      .insert({
        first_name: firstName,
        gym_name: gymName,
        email,
        source_filename: file.name,
        source_size_bytes: file.size,
        report,
        rows_parsed: report.totals.rowsParsed,
        high_risk_count: report.risk.high,
        monthly_revenue_at_risk: report.revenue.monthlyRevenueAtRisk,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error('[audit] Insert failed:', insertError)
      return NextResponse.json(
        { error: 'Failed to save audit. Try again in a moment.' },
        { status: 500 },
      )
    }

    const reportId = inserted.id as string

    // Everything below runs AFTER the response is sent, via next/server after().
    // Vercel freezes the function once the response returns, so a plain
    // fire-and-forget promise was silently killed: audit emails never went out.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`
    const userAgent = req.headers.get('user-agent')
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

    after(async () => {
      // Lead row, with what the audit found attached so the follow up call has context.
      try {
        const { error: leadErr } = await supabase.from('leads').upsert(
          {
            email,
            first_name: firstName,
            gym_name: gymName,
            phone: phone ?? undefined,
            metadata: {
              software,
              members: memberBand,
              rows: report.totals.rowsParsed,
              mrr: report.insights?.membership.mrr ?? null,
              money_on_table_monthly: report.insights?.money.totalMonthly ?? null,
              overdue: report.insights?.membership.overdue ?? null,
            },
            source: 'audit_form',
            stage: 'audit_completed',
            audit_id: reportId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'email,source' },
        )
        if (leadErr) console.warn('[audit] lead upsert failed:', leadErr)
      } catch (err) {
        console.warn('[audit] lead upsert threw:', err)
      }

      // Ad attribution, server side, deduplicated against the browser pixel by eventId.
      const meta = await sendMetaLead({ email, phone, firstName, eventId, sourceUrl, userAgent, ip, fbp, fbc })
      if (!meta.sent && meta.error !== 'not configured') console.warn('[audit] Meta CAPI:', meta.error)

      // The report email.
      try {
        const result = await sendAuditEmail({ to: email, firstName, gymName, reportId, report, appUrl })
        if (result.sent) {
          await supabase.from('audits').update({ email_sent_at: new Date().toISOString() }).eq('id', reportId)
        } else {
          await supabase.from('audits').update({ email_error: result.error }).eq('id', reportId)
          console.warn('[audit] Email send failed:', result.error)
        }
      } catch (err) {
        console.error('[audit] Email send threw:', err)
        await supabase.from('audits').update({ email_error: err instanceof Error ? err.message : 'threw' }).eq('id', reportId)
      }
    })

    return NextResponse.json({ reportId })
  } catch (err) {
    console.error('[audit] Unhandled error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
