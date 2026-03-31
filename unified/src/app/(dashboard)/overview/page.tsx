import { createClient } from '@/lib/supabase/server'
import { Users, UserPlus, ShieldAlert, TrendingDown, DollarSign, Activity } from 'lucide-react'

async function getStats() {
  const sb = await createClient()

  // Get user's gym
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const { data: profile } = await sb
    .from('users')
    .select('gym_id')
    .eq('id', user.id)
    .single()

  if (!profile?.gym_id) return null

  const gymId = profile.gym_id

  // Parallel queries
  const [members, leads, highRisk, tasks] = await Promise.all([
    sb.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).neq('status', 'cancelled'),
    sb.from('leads').select('id', { count: 'exact', head: true }).eq('gym_id', gymId),
    sb.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).gte('risk_score', 61),
    sb.from('staff_tasks').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', 'pending'),
  ])

  return {
    gymId,
    totalMembers: members.count || 0,
    totalLeads: leads.count || 0,
    highRiskMembers: highRisk.count || 0,
    pendingTasks: tasks.count || 0,
  }
}

export default async function DashboardOverview() {
  const stats = await getStats()

  const cards = [
    { label: 'Active Members', value: stats?.totalMembers ?? 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Active Leads', value: stats?.totalLeads ?? 0, icon: UserPlus, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'High Risk', value: stats?.highRiskMembers ?? 0, icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Pending Tasks', value: stats?.pendingTasks ?? 0, icon: Activity, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-slate-400">Overview of your gym&apos;s performance</p>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">{card.label}</p>
                  <p className="mt-1 text-3xl font-bold text-white">{card.value}</p>
                </div>
                <div className={`rounded-lg p-3 ${card.bg}`}>
                  <Icon className={`h-6 w-6 ${card.color}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Revenue at Risk */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Revenue at Risk</h2>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-red-400">
              £{((stats?.highRiskMembers ?? 0) * 45).toLocaleString()}
            </span>
            <span className="text-sm text-slate-500">/month</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Based on {stats?.highRiskMembers ?? 0} high-risk members at avg £45/month
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Quick Actions</h2>
          <div className="space-y-3">
            <a href="/retention" className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white hover:border-amber-500/50 transition-colors">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              View at-risk members
            </a>
            <a href="/leads" className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white hover:border-amber-500/50 transition-colors">
              <UserPlus className="h-5 w-5 text-emerald-400" />
              Manage lead pipeline
            </a>
            <a href="/settings" className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white hover:border-amber-500/50 transition-colors">
              <DollarSign className="h-5 w-5 text-amber-400" />
              Connect your CRM
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
