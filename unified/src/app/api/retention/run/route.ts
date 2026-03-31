import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { runBatchChurnAnalysis } from '@/lib/services/churn-engine'

/**
 * POST /api/retention/run — Run batch churn analysis for a gym
 * Can be called by cron job or manually from dashboard
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Check auth — either user session or CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const gymId = body.gymId

  try {
    const result = await runBatchChurnAnalysis(supabase, gymId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Retention] Batch analysis failed:', error)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
