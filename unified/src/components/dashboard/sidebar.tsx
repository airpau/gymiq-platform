'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ShieldAlert,
  MessageSquare,
  PhoneCall,
  Settings,
  LogOut,
  TrendingDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/overview', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/leads', label: 'Lead Pipeline', icon: UserPlus },
  { href: '/retention', label: 'Retention', icon: ShieldAlert },
  { href: '/cancel-save', label: 'Cancel-Save', icon: TrendingDown },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-900">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-slate-800 px-6">
        <Link href="/overview" className="text-xl font-bold text-white">
          Gym<span className="text-amber-500">IQ</span>
          <span className="ml-2 text-xs font-normal text-slate-500">AI</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-slate-800 p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
