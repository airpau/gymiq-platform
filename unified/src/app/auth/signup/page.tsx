'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [gymName, setGymName] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, gym_name: gymName },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (authData.user) {
      // Create gym record
      const slug = gymName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const { data: gym, error: gymError } = await supabase
        .from('gyms')
        .insert({ name: gymName, slug, email })
        .select('id')
        .single()

      if (gymError) {
        setError('Account created but gym setup failed. Please contact support.')
        setLoading(false)
        return
      }

      // Create user profile linked to gym
      await supabase.from('users').insert({
        id: authData.user.id,
        email,
        name,
        role: 'GYM_OWNER',
        gym_id: gym.id,
      })
    }

    router.push('/overview')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">
            Gym<span className="text-amber-500">IQ</span>
          </h1>
          <p className="mt-2 text-slate-400">Create your gym dashboard</p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-8">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="gymName" className="mb-1.5 block text-sm font-medium text-slate-300">Gym name</label>
            <input
              id="gymName"
              type="text"
              value={gymName}
              onChange={(e) => setGymName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="Energie Fitness Hoddesdon"
            />
          </div>

          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-300">Your name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="John Smith"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="you@yourgym.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="Min 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-amber-500 hover:text-amber-400">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
