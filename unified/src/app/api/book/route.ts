/**
 * POST /api/book
 *
 * The "book a walkthrough" and "start" forms. Stores the enquiry as a lead
 * (stage walkthrough_requested or start_requested). A database trigger posts
 * every such row to Paul's Telegram, so delivery does not depend on email.
 * We also email Paul and send the enquirer a short acknowledgement when
 * Resend is configured.
 *
 * Like the audit routes, it stores the first touch ad attribution from the
 * gymiq_attr cookie in metadata.attribution (kept if the row already has
 * one) and mirrors the browser's Lead and Schedule pixel events through the
 * Conversions API with the same event ids.
 */
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { z } from 'zod'
import { CONTACT, PRICE_PER_CLUB } from '@/lib/site'
import { requestAttribution } from '@/lib/analytics/attribution'
import { sendMetaEvent } from '@/lib/analytics/meta-capi'

export const runtime = 'nodejs'

const Schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  gymName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(6).max(30),
  software: z.string().trim().max(80).optional().nullable(),
  members: z.string().trim().max(20).optional().nullable(),
  preferredTime: z.string().trim().max(120).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  intent: z.enum(['walkthrough', 'start']).default('walkthrough'),
  leadEventId: z.string().trim().max(80).optional().nullable(),
  scheduleEventId: z.string().trim().max(80).optional().nullable(),
  sourceUrl: z.string().trim().max(500).optional().nullable(),
  fbp: z.string().trim().max(120).optional().nullable(),
  fbc: z.string().trim().max(200).optional().nullable(),
  /** The visitor accepted advertising cookies. Without it nothing is sent to Meta. */
  adConsent: z.boolean().optional().default(false),
  company_url_hp: z.string().optional(), // honeypot
})

export async function POST(req: NextRequest) {
  let p: z.infer<typeof Schema>
  try {
    p = Schema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid request' }, { status: 400 })
  }
  if (p.company_url_hp) return NextResponse.json({ ok: true })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const stage = p.intent === 'start' ? 'start_requested' : 'walkthrough_requested'
  const source = p.intent === 'start' ? 'start_form' : 'book_call'
  const email = p.email.toLowerCase()
  const userAgent = req.headers.get('user-agent') ?? null
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const sourceUrl = p.sourceUrl || req.headers.get('referer') || req.nextUrl.origin
  const attribution = requestAttribution(req.headers.get('cookie'), sourceUrl)

  // Keep what the row already holds, above all the first touch attribution.
  const { data: existing } = await supabase.from('leads').select('metadata').eq('email', email).eq('source', source).maybeSingle()
  const prior = (existing?.metadata ?? {}) as Record<string, unknown>
  const metadata = {
    ...prior,
    attribution: (prior.attribution as Record<string, unknown> | undefined) ?? attribution ?? null,
    software: p.software ?? null,
    members: p.members ?? null,
    preferred_time: p.preferredTime ?? null,
    message: p.message ?? null,
    page: req.headers.get('referer') ?? null,
    submitted_at: new Date().toISOString(),
    ad_consent: p.adConsent,
  }
  const { data, error } = await supabase
    .from('leads')
    .upsert(
      {
        email,
        first_name: p.firstName,
        gym_name: p.gymName,
        phone: p.phone,
        source,
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
    console.error('[book] upsert failed', error)
    return NextResponse.json({ error: 'Could not save your request. Email ' + CONTACT + ' instead.' }, { status: 500 })
  }

  // Ad attribution, server side, deduplicated against the browser pixel by event id.
  after(async () => {
    if (!p.adConsent) return
    const user = { email, phone: p.phone, firstName: p.firstName, sourceUrl, userAgent, ip, fbp: p.fbp, fbc: p.fbc }
    const results = await Promise.all([
      sendMetaEvent({ ...user, eventName: 'Lead', eventId: p.leadEventId || `book-lead-${data.id}`, contentName: source }),
      sendMetaEvent({ ...user, eventName: 'Schedule', eventId: p.scheduleEventId || `book-schedule-${data.id}`, contentName: p.intent }),
    ])
    for (const r of results) if (!r.sent && r.error !== 'not configured') console.warn('[book] Meta CAPI:', r.error)
  })

  // Email, best effort. The Telegram trigger has already fired from the database.
  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    const resend = new Resend(apiKey)
    const from = process.env.RESEND_FROM_EMAIL ?? 'gymIQ <audit@gymiq.ai>'
    const what = p.intent === 'start' ? `wants to start gymIQ (£${PRICE_PER_CLUB} a month)` : 'wants a walkthrough call'
    const lines = [
      `${p.firstName} at ${p.gymName} ${what}.`,
      `Email: ${p.email}`,
      `Phone: ${p.phone}`,
      `Software: ${p.software ?? '-'}, members: ${p.members ?? '-'}`,
      `Best time: ${p.preferredTime ?? '-'}`,
      p.message ? `Note: ${p.message}` : '',
    ].filter(Boolean)
    await resend.emails
      .send({ from, to: CONTACT, replyTo: p.email, subject: `gymIQ: ${p.firstName} at ${p.gymName} ${what}`, text: lines.join('\n') })
      .catch((e) => console.error('[book] owner email failed', e))
    await resend.emails
      .send({
        from,
        to: p.email,
        replyTo: CONTACT,
        subject: p.intent === 'start' ? 'gymIQ: next steps for your club' : 'gymIQ: your walkthrough call',
        text:
          `Hi ${p.firstName},\n\nThanks, I have your details for ${p.gymName}. I will ${p.intent === 'start' ? 'send the setup link and call you' : 'call you'} ${p.preferredTime ? `around ${p.preferredTime}` : 'today or tomorrow'} on ${p.phone}. If you would rather pick a time, reply to this email.\n\nPaul Airey\ngymIQ · ${CONTACT}`,
      })
      .catch((e) => console.error('[book] ack email failed', e))
  }

  return NextResponse.json({ ok: true, leadId: data.id })
}
