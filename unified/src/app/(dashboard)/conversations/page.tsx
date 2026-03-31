import { createClient } from '@/lib/supabase/server'
import { MessageSquare } from 'lucide-react'

export default async function ConversationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return null

  const { data: conversations } = await supabase
    .from('conversations')
    .select('*, members(name), leads(name)')
    .eq('gym_id', profile.gym_id)
    .order('updated_at', { ascending: false })
    .limit(50)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Conversations</h1>
        <p className="mt-1 text-slate-400">WhatsApp, SMS, and email threads</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="divide-y divide-slate-800">
          {(conversations || []).map((conv) => {
            const contactName = (conv.members as { name: string } | null)?.name ||
              (conv.leads as { name: string } | null)?.name || 'Unknown'
            return (
              <div key={conv.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-800/50 transition-colors">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800">
                  <MessageSquare className="h-5 w-5 text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">{contactName}</p>
                  <p className="text-sm text-slate-500">{conv.type} · {conv.status}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {new Date(conv.updated_at).toLocaleDateString('en-GB')}
                </p>
              </div>
            )
          })}
          {(!conversations || conversations.length === 0) && (
            <div className="px-6 py-12 text-center text-slate-500">
              No conversations yet. Connect Twilio to start receiving messages.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
