import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import SettingsForm from '@/components/dashboard/SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const ssr = await createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) redirect('/auth/login')

  const svc = serviceClient()
  if (!svc) {
    return (
      <Wrap>
        <Empty
          title="Service not configured"
          body="The Supabase service key is missing from this environment."
        />
      </Wrap>
    )
  }

  const { data: gym } = await svc
    .from('gyms')
    .select('id, name, timezone, whatsapp_number, sms_number, messaging_enabled')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!gym) {
    return (
      <Wrap>
        <Empty
          title="No gym set up yet"
          body="Run a member audit from the homepage and click 'Run this for me' to create your gym account."
        />
      </Wrap>
    )
  }

  const messagingLiveGlobal = process.env.MESSAGING_LIVE === 'true'

  return (
    <Wrap>
      <SettingsForm gym={gym} messagingLiveGlobal={messagingLiveGlobal} />
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-8 py-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">Settings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">Configuration</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          Gym profile, Twilio senders, and the master live-messaging switch.
        </p>
      </header>
      {children}
    </div>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-12 text-center">
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{body}</p>
    </div>
  )
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
