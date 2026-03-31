import { createClient } from '@/lib/supabase/server'
import { Settings, Database, MessageSquare, Brain } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return null

  const { data: gym } = await supabase.from('gyms').select('*').eq('id', profile.gym_id).single()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-slate-400">Configure your gym and integrations</p>
      </div>

      <div className="space-y-6">
        {/* Gym Info */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center gap-3">
            <Settings className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-white">Gym Information</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-slate-400">Name</p>
              <p className="mt-1 text-white">{gym?.name || 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Email</p>
              <p className="mt-1 text-white">{gym?.email || 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Timezone</p>
              <p className="mt-1 text-white">{gym?.timezone || 'Europe/London'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">CRM Connector</p>
              <p className="mt-1 text-white">{gym?.connector_type || 'Not connected'}</p>
            </div>
          </div>
        </div>

        {/* CRM Connection */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center gap-3">
            <Database className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">CRM Connection</h2>
          </div>
          <p className="mb-4 text-sm text-slate-400">Connect your existing gym CRM to import members and keep data in sync.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {['Glofox', 'Mindbody', 'ClubRight', 'CSV Upload'].map((crm) => (
              <button
                key={crm}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-white hover:border-amber-500/50 transition-colors"
              >
                {crm}
              </button>
            ))}
          </div>
        </div>

        {/* Messaging */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Messaging</h2>
          </div>
          <p className="mb-4 text-sm text-slate-400">Configure WhatsApp, SMS, and email for member communication.</p>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm text-amber-400">Messaging is currently in test mode. No outbound messages will be sent until you activate it.</p>
          </div>
        </div>

        {/* AI Configuration */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center gap-3">
            <Brain className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">AI Configuration</h2>
          </div>
          <p className="text-sm text-slate-400">AI is configured to route tasks to the cheapest adequate model. Estimated cost: £4-6/month per gym.</p>
        </div>
      </div>
    </div>
  )
}
