'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/overview')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-paper text-ink antialiased">
      <header className="border-b border-mist/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-ink">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-moss font-mono text-[11px] font-semibold text-lime">IQ</span>
            gymIQ
          </Link>
          <Link href="/" className="text-sm text-slate hover:text-ink">Back to the site</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-16 sm:px-8 lg:grid-cols-12 lg:py-24">
        <div className="lg:col-span-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">Sign in</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink">Your club, this morning.</h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate">
            The brief is already on your phone. This is where the board, the lists and the settings live.
          </p>
          <div className="mt-8 rounded-2xl bg-ink p-5 font-mono text-[12px] leading-relaxed text-paper/80">
            <p className="text-paper/50">06:00 · the club</p>
            <p className="mt-2 text-lime">£26,414 collected MTD · 1,472 active paying</p>
            <p className="mt-2">1. Retention is good. 7 leavers against 19 this time last month.</p>
            <p>2. Selling is the problem. Joins project 77 against 100.</p>
            <p>3. £1,884 of arrears clears onto Friday if worked by Wednesday.</p>
          </div>
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <form onSubmit={handleLogin} className="space-y-4 rounded-3xl border border-mist bg-white p-8 shadow-[0_24px_60px_-40px_rgba(15,22,20,0.35)]">
            {error && (
              <div className="rounded-xl border border-signal/30 bg-signal/5 px-3 py-2.5 text-sm text-signal">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-3">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl border border-mist bg-paper px-4 py-3 text-ink placeholder-slate/60 focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
                placeholder="you@yourgym.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-3">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-mist bg-paper px-4 py-3 text-ink placeholder-slate/60 focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
                placeholder="Your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3.5 text-base font-semibold text-paper transition hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

            <p className="text-center text-sm text-slate">
              New to gymIQ?{' '}
              <Link href="/auth/signup" className="font-medium text-moss hover:text-moss-deep">Create an account</Link>
              {' '}or{' '}
              <a href="mailto:paul@gymiq.ai?subject=gymIQ%20walkthrough" className="font-medium text-moss hover:text-moss-deep">book a walkthrough</a>.
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
