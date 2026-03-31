import { createClient } from '@/lib/supabase/server'
import { Users, Search, Filter } from 'lucide-react'

export default async function MembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return null

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('gym_id', profile.gym_id)
    .order('risk_score', { ascending: false })
    .limit(50)

  function riskColor(score: number) {
    if (score >= 61) return 'text-red-400 bg-red-500/10'
    if (score >= 31) return 'text-amber-400 bg-amber-500/10'
    return 'text-emerald-400 bg-emerald-500/10'
  }

  function statusColor(status: string) {
    const map: Record<string, string> = {
      active: 'text-emerald-400 bg-emerald-500/10',
      frozen: 'text-blue-400 bg-blue-500/10',
      cancelled: 'text-red-400 bg-red-500/10',
      sleeper: 'text-amber-400 bg-amber-500/10',
      past_due: 'text-orange-400 bg-orange-500/10',
    }
    return map[status] || 'text-slate-400 bg-slate-500/10'
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Members</h1>
          <p className="mt-1 text-slate-400">{members?.length || 0} members loaded</p>
        </div>
      </div>

      {/* Members Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Member</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Risk Score</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Last Visit</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Visits (30d)</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Monthly</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {(members || []).map((member) => (
              <tr key={member.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-white">{member.name}</p>
                    <p className="text-sm text-slate-500">{member.email}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(member.status)}`}>
                    {member.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${riskColor(member.risk_score)}`}>
                    {member.risk_score}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  {member.last_visit ? new Date(member.last_visit).toLocaleDateString('en-GB') : 'Never'}
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">{member.visit_count_30d}</td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  {member.monthly_amount ? `£${member.monthly_amount}` : '—'}
                </td>
              </tr>
            ))}
            {(!members || members.length === 0) && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  No members yet. Import from your CRM or add manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
