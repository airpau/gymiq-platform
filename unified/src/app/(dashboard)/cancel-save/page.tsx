import { createClient } from '@/lib/supabase/server'
import { TrendingDown, CheckCircle, XCircle, MessageSquare } from 'lucide-react'

export default async function CancelSavePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return null

  const { data: attempts } = await supabase
    .from('cancel_save_attempts')
    .select('*, members(name, email)')
    .eq('gym_id', profile.gym_id)
    .order('created_at', { ascending: false })
    .limit(50)

  const saved = attempts?.filter(a => a.outcome === 'saved').length || 0
  const cancelled = attempts?.filter(a => a.outcome === 'cancelled').length || 0
  const inProgress = attempts?.filter(a => a.outcome === 'in_progress').length || 0
  const total = attempts?.length || 0
  const saveRate = total > 0 ? Math.round((saved / total) * 100) : 0

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Cancel-Save AI</h1>
        <p className="mt-1 text-slate-400">AI-powered retention conversations</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Save Rate</p>
          <p className="mt-1 text-3xl font-bold text-emerald-400">{saveRate}%</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Saved</p>
          <p className="mt-1 text-3xl font-bold text-emerald-400">{saved}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">In Progress</p>
          <p className="mt-1 text-3xl font-bold text-amber-400">{inProgress}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Cancelled</p>
          <p className="mt-1 text-3xl font-bold text-red-400">{cancelled}</p>
        </div>
      </div>

      {/* Attempts List */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-6 py-4">
          <h2 className="font-semibold text-white">Recent Cancel-Save Attempts</h2>
        </div>
        <div className="divide-y divide-slate-800">
          {(attempts || []).map((attempt) => {
            const member = attempt.members as { name: string; email: string } | null
            return (
              <div key={attempt.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-4">
                  {attempt.outcome === 'saved' && <CheckCircle className="h-5 w-5 text-emerald-400" />}
                  {attempt.outcome === 'cancelled' && <XCircle className="h-5 w-5 text-red-400" />}
                  {attempt.outcome === 'in_progress' && <MessageSquare className="h-5 w-5 text-amber-400" />}
                  {attempt.outcome === 'escalated' && <TrendingDown className="h-5 w-5 text-purple-400" />}
                  <div>
                    <p className="font-medium text-white">{member?.name || 'Unknown member'}</p>
                    <p className="text-sm text-slate-500">{attempt.reason_category || 'No reason given'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    attempt.outcome === 'saved' ? 'bg-emerald-500/10 text-emerald-400' :
                    attempt.outcome === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                    attempt.outcome === 'in_progress' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-purple-500/10 text-purple-400'
                  }`}>
                    {attempt.outcome}
                  </span>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(attempt.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>
            )
          })}
          {(!attempts || attempts.length === 0) && (
            <div className="px-6 py-12 text-center text-slate-500">
              No cancel-save attempts yet. They&apos;ll appear here when members try to cancel.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
