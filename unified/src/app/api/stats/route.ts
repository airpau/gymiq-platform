import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return NextResponse.json({ error: 'No gym' }, { status: 400 })

  const gymId = profile.gym_id

  const [members, activeMembers, highRisk, leads, tasks, cancelSaves] = await Promise.all([
    supabase.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId),
    supabase.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', 'active'),
    supabase.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).gte('risk_score', 61),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('gym_id', gymId),
    supabase.from('staff_tasks').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', 'pending'),
    supabase.from('cancel_save_attempts').select('outcome').eq('gym_id', gymId),
  ])

  const saved = cancelSaves.data?.filter(c => c.outcome === 'saved').length || 0
  const totalAttempts = cancelSaves.data?.length || 0

  return NextResponse.json({
    totalMembers: members.count || 0,
    activeMembers: activeMembers.count || 0,
    highRiskMembers: highRisk.count || 0,
    totalLeads: leads.count || 0,
    pendingTasks: tasks.count || 0,
    cancelSaveRate: totalAttempts > 0 ? Math.round((saved / totalAttempts) * 100) : 0,
    cancelSaveTotal: totalAttempts,
    cancelSaveSaved: saved,
  })
}
