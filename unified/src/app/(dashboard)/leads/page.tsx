import { createClient } from '@/lib/supabase/server'
import { STAGE_DESCRIPTIONS, type LeadStage } from '@/lib/services/lead-pipeline'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return null

  // Get all leads grouped by stage
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('gym_id', profile.gym_id)
    .order('score', { ascending: false })

  const stages: LeadStage[] = ['new', 'contacted', 'engaged', 'booked', 'visited', 'converting', 'converted']
  const leadsByStage = stages.reduce((acc, stage) => {
    acc[stage] = (leads || []).filter(l => l.current_stage === stage)
    return acc
  }, {} as Record<string, typeof leads>)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Lead Pipeline</h1>
        <p className="mt-1 text-slate-400">{leads?.length || 0} total leads</p>
      </div>

      {/* Kanban-style Pipeline */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageInfo = STAGE_DESCRIPTIONS[stage]
          const stageLeads = leadsByStage[stage] || []
          return (
            <div key={stage} className="min-w-[280px] flex-shrink-0">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageInfo.color }} />
                <h3 className="text-sm font-semibold text-white">{stageInfo.title}</h3>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  {stageLeads.length}
                </span>
              </div>
              <div className="space-y-2">
                {stageLeads.map((lead) => (
                  <div key={lead.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-slate-700 transition-colors">
                    <p className="font-medium text-white">{lead.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{lead.email || lead.phone || 'No contact'}</p>
                    {lead.source && (
                      <span className="mt-2 inline-block rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                        {lead.source}
                      </span>
                    )}
                  </div>
                ))}
                {stageLeads.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-sm text-slate-600">
                    No leads
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
