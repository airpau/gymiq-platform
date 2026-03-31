import { createClient } from '@/lib/supabase/server'
import { ShieldAlert, Clock, AlertTriangle, XCircle } from 'lucide-react'

export default async function RetentionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return null

  // Get at-risk members (risk_score > 30)
  const { data: atRisk } = await supabase
    .from('members')
    .select('*')
    .eq('gym_id', profile.gym_id)
    .gt('risk_score', 30)
    .neq('status', 'cancelled')
    .order('risk_score', { ascending: false })
    .limit(50)

  const highRisk = atRisk?.filter(m => m.risk_score >= 61) || []
  const mediumRisk = atRisk?.filter(m => m.risk_score >= 31 && m.risk_score < 61) || []
  const totalRevenue = (atRisk || []).reduce((sum, m) => sum + (m.monthly_amount || 0), 0)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Retention Dashboard</h1>
        <p className="mt-1 text-slate-400">Members at risk of churning</p>
      </div>

      {/* Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <div>
              <p className="text-sm text-slate-400">High Risk</p>
              <p className="text-2xl font-bold text-red-400">{highRisk.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 text-amber-400" />
            <div>
              <p className="text-sm text-slate-400">Medium Risk</p>
              <p className="text-2xl font-bold text-amber-400">{mediumRisk.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-white" />
            <div>
              <p className="text-sm text-slate-400">Revenue at Risk</p>
              <p className="text-2xl font-bold text-white">£{totalRevenue.toLocaleString()}/mo</p>
            </div>
          </div>
        </div>
      </div>

      {/* At-Risk Members */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-6 py-4">
          <h2 className="font-semibold text-white">At-Risk Members</h2>
        </div>
        <div className="divide-y divide-slate-800">
          {(atRisk || []).map((member) => (
            <div key={member.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                  member.risk_score >= 61 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {member.risk_score}
                </div>
                <div>
                  <p className="font-medium text-white">{member.name}</p>
                  <p className="text-sm text-slate-500">
                    {(member.risk_factors as string[] || []).slice(0, 2).join(' · ')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400">
                  {member.monthly_amount ? `£${member.monthly_amount}/mo` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  Last visit: {member.last_visit ? new Date(member.last_visit).toLocaleDateString('en-GB') : 'Never'}
                </p>
              </div>
            </div>
          ))}
          {(!atRisk || atRisk.length === 0) && (
            <div className="px-6 py-12 text-center text-slate-500">
              No at-risk members. Import member data to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
