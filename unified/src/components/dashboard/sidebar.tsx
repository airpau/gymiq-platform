'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ShieldAlert,
  MessageSquare,
  TrendingDown,
  Settings,
  LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/cancel-save', label: 'Cancel-save', icon: TrendingDown },
  { href: '/retention', label: 'Retention', icon: ShieldAlert },
  { href: '/leads', label: 'Lead pipeline', icon: UserPlus },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-zinc-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-6">
        <Link href="/overview" className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-emerald-700 text-[11px] font-bold text-white shadow-sm">
            IQ
          </span>
          GymIQ
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-zinc-200 p-3">
        {userEmail && (
          <p className="mb-2 truncate px-3 text-xs text-zinc-500" title={userEmail}>
            {userEmail}
          </p>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
