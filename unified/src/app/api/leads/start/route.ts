/**
 * POST /api/leads/start
 *
 * Fired by the audit form whenever the visitor blurs the email field (or
 * partially fills the form). Captures whatever they've entered as a lead row
 * so we can follow up if they never complete the audit upload.
 *
 * Idempotent on (email, source) — subsequent posts UPDATE the existing row
 * rather than creating duplicates.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const runtime = 'nodejs'

const Schema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().optional().nullable(),
  gymName: z.string().trim().optional().nullable(),
  source: z.string().trim().optional().default('audit_form'),
  referrer: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
})

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Schema>
  try {
    const body = await req.json()
    parsed = Schema.parse(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const supabase = serviceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  }

  const email = parsed.email.toLowerCase()
  const userAgent = parsed.userAgent ?? req.headers.get('user-agent') ?? null
  const referrer = parsed.referrer ?? req.headers.get('referer') ?? null

  // Upsert on (email, source) so the same visitor refining their form
  // updates the same row instead of accumulating dupes.
  const { data, error } = await supabase
    .from('leads')
    .upsert(
      {
        email,
        first_name: parsed.firstName ?? undefined,
        gym_name: parsed.gymName ?? undefined,
        source: parsed.source,
        user_agent: userAgent,
        referrer,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email,source' },
    )
    .select('id, stage')
    .single()

  if (error || !data) {
    console.error('[leads/start] upsert failed:', error)
    return NextResponse.json({ error: 'Failed to record lead' }, { status: 500 })
  }

  return NextResponse.json({ leadId: data.id, stage: data.stage })
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
