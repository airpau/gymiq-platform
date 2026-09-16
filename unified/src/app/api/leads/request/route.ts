/**
 * POST /api/leads/request
 *
 * Step one of the audit: the visitor's details, no file yet. Most ad clicks
 * arrive on a phone where the membership export is not to hand, so this is
 * the conversion the ads optimise for. It:
 *
 *   1. upserts the lead (source audit_form, stage audit_requested) with the
 *      ad attribution from the gymiq_attr cookie in metadata.attribution,
 *   2. mirrors the browser's Lead pixel event through the Conversions API
 *      with the same event id,
 *   3. emails the visitor a private link to /audit?l=<lead id> so they can
 *      upload from a laptop later. The Telegram trigger on public.leads tells
 *      Paul at the same time.
 *
 * GET /api/leads/request?l=<lead id>
 *
 * Returns the details needed to prefill the upload step from that link.
 */
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { z } from 'zod'
import { CONTACT } from '@/lib/site'
import { attributionFromCookieHeader } from '@/lib/analytics/attribution'
import { sendMetaLead } from '@/lib/analytics/meta-capi'

export const runtime = 'nodejs'

const Schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  gymName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  software: z.string().trim().max(80).optional().nullable(),
  members: z.string().trim().max(20).optional().nullable(),
  source: z.enum(['audit_form', 'demo_form']).default('audit_form'),
  eventId: z.string().trim().max(80).optional().nullable(),
  sourceUrl: z.string().trim().max(500).optional().nullable(),
  fbp: z.string().trim().max(120).optional().nullable(),
  fbc: z.string().trim().max(200).optional().nullable(),
  company_url_hp: z.string().optional(), // honeypot
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  let p: z.infer<typeof Schema>
  try {
    p = Schema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid request' }, { status: 400 })
  }
  if (p.company_url_hp) return NextResponse.json({ ok: true })

  const supabase = serviceClient()
  if (!supabase) return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })

  const email = p.email.toLowerCase()
  const attribution = attributionFromCookieHeader(req.headers.get('cookie'))
  const userAgent = req.headers.get('user-agent') ?? null
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const eventId = p.eventId || `lead-${Date.now()}`
  const sourceUrl = p.sourceUrl || req.headers.get('referer') || req.nextUrl.origin

  // Keep anything the row already holds (an earlier partial fill, or a
  // completed audit) and never downgrade a completed audit to requested.
  const { data: existing } = await supabase
    .from('leads')
    .select('id, stage, metadata')
    .eq('email', email)
    .eq('source', p.source)
    .maybeSingle()
  const prior = (existing?.metadata ?? {}) as Record<string, unknown>
  const stage = existing?.stage === 'audit_completed' ? 'audit_completed' : 'audit_requested'
  const metadata = {
    ...prior,
    software: p.software ?? prior.software ?? null,
    members: p.members ?? prior.members ?? null,
    attribution: (prior.attribution as Record<string, unknown> | undefined) ?? attribution ?? null,
    requested_at: (prior.requested_at as string | undefined) ?? new Date().toISOString(),
    request_page: sourceUrl,
  }

  const { data, error } = await supabase
    .from('leads')
    .upsert(
      {
        email,
        first_name: p.firstName,
        gym_name: p.gymName,
        phone: p.phone || undefined,
        source: p.source,
        stage,
        metadata,
        user_agent: userAgent,
        referrer: req.headers.get('referer') ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email,source' },
    )
    .select('id')
    .single()
  if (error || !data) {
    console.error('[leads/request] upsert failed', error)
    return NextResponse.json({ error: 'Could not save your details. Email ' + CONTACT + ' instead.' }, { status: 500 })
  }
  const leadId = data.id as string
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`).replace(/\/$/, '')
  const uploadUrl = `${appUrl}/audit?l=${leadId}`

  after(async () => {
    const meta = await sendMetaLead({ email, phone: p.phone, firstName: p.firstName, eventId, sourceUrl, userAgent, ip, fbp: p.fbp, fbc: p.fbc })
    if (!meta.sent && meta.error !== 'not configured') console.warn('[leads/request] Meta CAPI:', meta.error)

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return
    const resend = new Resend(apiKey)
    const from = process.env.RESEND_FROM_EMAIL ?? 'gymIQ <audit@gymiq.ai>'
    await resend.emails
      .send({
        from,
        to: email,
        replyTo: CONTACT,
        subject: `${p.gymName}: your audit link`,
        text: textBody(p.firstName, p.gymName, uploadUrl),
        html: htmlBody(p.firstName, p.gymName, uploadUrl),
      })
      .catch((e) => console.error('[leads/request] link email failed', e))
  })

  return NextResponse.json({ ok: true, leadId, uploadUrl })
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('l')?.trim() ?? ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const supabase = serviceClient()
  if (!supabase) return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  const { data } = await supabase
    .from('leads')
    .select('id, first_name, gym_name, email, phone, metadata, stage, audit_id')
    .eq('id', id)
    .in('source', ['audit_form', 'demo_form'])
    .maybeSingle()
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const md = (data.metadata ?? {}) as Record<string, unknown>
  return NextResponse.json({
    leadId: data.id,
    firstName: data.first_name ?? '',
    gymName: data.gym_name ?? '',
    email: data.email ?? '',
    phone: data.phone ?? '',
    software: (md.software as string | null) ?? '',
    members: (md.members as string | null) ?? '',
    stage: data.stage,
    auditId: data.audit_id,
  })
}

function textBody(firstName: string, gymName: string, url: string): string {
  return [
    `Hi ${firstName},`,
    '',
    `Here is your private link for the ${gymName} membership file audit:`,
    url,
    '',
    'Open it on the computer you use for your gym software, export the memberships report (CSV, TSV or Excel), and drop the file in. The report takes about a minute and you keep it.',
    '',
    'Where the export lives:',
    'Glofox: Reports, Members, export. ClubRight: Members, export to CSV. Mindbody: Reports, Clients, export. Any other system: a members list with join date, plan and payment status is enough.',
    '',
    'Your file is read once and not stored.',
    '',
    'Paul Airey',
    `gymIQ · ${CONTACT}`,
  ].join('\n')
}

function htmlBody(firstName: string, gymName: string, url: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F6F6F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0F1614">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#0F6E63;margin:0 0 12px">gymIQ · free membership file audit</p>
  <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px">${esc(gymName)}: your audit link</h1>
  <p style="font-size:16px;line-height:1.55;margin:0 0 16px">Hi ${esc(firstName)}, here is your private link. Open it on the computer you use for your gym software, export the memberships report, and drop the file in. About a minute, and you keep the report.</p>
  <p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#0F1614;color:#F6F6F2;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:999px">Upload my membership export</a></p>
  <p style="font-size:14px;line-height:1.55;color:#5E6B66;margin:0 0 12px">Or copy this link: <a href="${url}" style="color:#0F6E63">${url}</a></p>
  <h2 style="font-size:15px;margin:28px 0 8px">Where the export lives</h2>
  <p style="font-size:14px;line-height:1.6;color:#2A3833;margin:0 0 12px">Glofox: Reports, Members, export.<br>ClubRight: Members, export to CSV.<br>Mindbody: Reports, Clients, export.<br>Anything else: a members list with join date, plan and payment status is enough. CSV, TSV or Excel, up to 20 MB.</p>
  <p style="font-size:13px;line-height:1.55;color:#5E6B66;margin:24px 0 0">Your file is read once and not stored. The report is kept at a private link. Reply to this email if you get stuck.<br><br>Paul Airey<br>gymIQ · ${CONTACT}</p>
</div></body></html>`
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
