import { Sidebar } from '@/components/dashboard/sidebar'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased">
      <Sidebar userEmail={user.email ?? null} />
      <main className="ml-64 min-h-screen">
        {children}
      </main>
    </div>
  )
}
