/**
 * POST /api/visit
 *
 * First party landing log. One row per visitor session that lands on the
 * marketing site, written SERVER SIDE into public.ad_visits.
 *
 * Why this exists: every advertising signal gymIQ had ran through the Meta
 * pixel, which is gated behind advertising consent and blocked by ad
 * blockers and iOS tracking prevention. Between 8 and 28 Sep 2026 the
 * campaign bought 101 link clicks and Meta recorded zero Lead events,
 * because the only visitors who could ever be counted were the ones who
 * accepted the cookie banner. This route is the independent count.
 *
 * It is deliberately NOT consent gated, and that is defensible only because
 * it stays within these limits:
 *   - no cookie is set and no cookie is read
 *   - no name, email, phone or precise IP is stored
 *   - the visit_id is generated per browser session and never joined to a person
 *   - it records only what the ad platform already put in the URL
 * If you widen any of those, put it behind consent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/** Paths that must never be logged: private reports, auth, onboarding, dashboard. */
function isPrivatePath(pathname: string): boolean {
  if (/^\/audit\/./.test(pathname)) return true
  return ['/auth', '/onboard', '/overview', '/members', '/retention', '/conversations', '/leads', '/settings', '/cancel-save'].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

const BOT = /bot|crawl|spider|headless|python|curl|wget|lighthouse|preview|facebookexternalhit|slurp|bingpreview/i

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      visitId?: string
      landingPage?: string
      referrer?: string | null
    }

    const visitId = (body.visitId ?? '').trim().slice(0, 64)
    if (!visitId) return NextResponse.json({ ok: false }, { status: 400 })

    // The landing page is parsed server side so the query string cannot be
    // trusted to arrive pre-split.
    let url: URL
    try {
      url = new URL(body.landingPage ?? '/', req.nextUrl.origin)
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    if (isPrivatePath(url.pathname)) return NextResponse.json({ ok: true, skipped: 'private' })

    const userAgent = req.headers.get('user-agent') ?? ''
    if (BOT.test(userAgent)) return NextResponse.json({ ok: true, skipped: 'bot' })

    const q = url.searchParams
    const fbclid = q.get('fbclid')
    const gclid = q.get('gclid')
    const utmSource = q.get('utm_source')
    const utmMedium = q.get('utm_medium')

    // Paid is anything the ad platforms stamped, not just what we tagged
    // ourselves: a click that loses its utm tags still carries fbclid.
    const isPaid = Boolean(
      fbclid || gclid || (utmMedium && /^(paid|cpc|ppc)/i.test(utmMedium)) || (utmSource && /^(meta|facebook|instagram|google)$/i.test(utmSource)),
    )

    const supabase = createServiceClient()
    if (!supabase) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 500 })

    // visit_id is unique per session, so a re-post from the same session is a
    // no-op rather than a duplicate row. Add a unique index on visit_id to
    // make this enforceable at the database:
    //   create unique index if not exists ad_visits_visit_id_key on public.ad_visits (visit_id);
    const { error } = await supabase.from('ad_visits').upsert(
      {
        visit_id: visitId,
        landing_page: url.pathname,
        referrer: (body.referrer ?? '').slice(0, 500) || null,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: q.get('utm_campaign'),
        utm_content: q.get('utm_content'),
        utm_term: q.get('utm_term'),
        fbclid,
        gclid,
        user_agent: userAgent.slice(0, 500),
        is_paid: isPaid,
      },
      { onConflict: 'visit_id', ignoreDuplicates: true },
    )

    if (error) {
      console.warn('[visit] insert failed:', error.message)
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    // Tracking must never break the page, and must never return a 500 that
    // shows up in the browser console on a marketing page.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
