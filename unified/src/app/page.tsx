import Link from 'next/link'
import {
  ShieldAlert,
  TrendingUp,
  MessageSquare,
  PhoneCall,
  Brain,
  ArrowRight,
  CheckCircle,
  Zap,
  Users,
  BarChart3,
} from 'lucide-react'

const features = [
  {
    icon: ShieldAlert,
    title: 'AI Churn Prediction',
    description: 'Predicts which members are about to leave before they cancel. Pure heuristic scoring means zero AI cost for analysis.',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
  },
  {
    icon: TrendingUp,
    title: 'Cancel-Save AI',
    description: 'When a member tries to cancel, AI handles the conversation — offering freezes, downgrades, and personalised incentives. 72% save rate in pilot.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: MessageSquare,
    title: 'Automated Lead Follow-Up',
    description: '3x faster lead response via WhatsApp and SMS. 9-stage pipeline tracks every lead from first contact to conversion.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    icon: PhoneCall,
    title: 'AI Voice Receptionist',
    description: 'Never miss a call again. AI answers your gym phone, books tours, answers FAQs, and routes urgent calls to staff.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
  {
    icon: Brain,
    title: 'Smart CRM Integration',
    description: 'Works WITH your existing CRM — Glofox, Mindbody, ClubRight, or CSV. No need to switch systems.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Dashboard',
    description: 'Revenue at risk, member health scores, lead pipeline, staff tasks — everything in one view. No more spreadsheets.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
  },
]

const stats = [
  { value: '72%', label: 'Cancel-save rate' },
  { value: '3x', label: 'Faster lead response' },
  { value: '£2,494', label: 'Avg revenue at risk per gym/month' },
  { value: '£4-6', label: 'Monthly AI cost per gym' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Nav */}
      <nav className="border-b border-slate-800/50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="text-2xl font-bold text-white">
            Gym<span className="text-amber-500">IQ</span>
            <span className="ml-1.5 text-xs font-normal text-slate-500">AI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm text-slate-400 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 transition-colors"
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 py-24 text-center">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-400">
            <Zap className="mr-2 h-4 w-4" />
            AI-powered gym retention — now in beta
          </div>
          <h1 className="text-5xl font-bold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
            Stop losing members.
            <br />
            <span className="text-amber-500">Start predicting churn.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Most gyms lose 30-50% of members annually without knowing why. GymIQ predicts who&apos;s about to leave, saves cancellations with AI, and converts leads 3x faster — for £4-6/month in AI costs.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-base font-semibold text-slate-900 hover:bg-amber-400 transition-colors"
            >
              Start free trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-6 py-3 text-base font-medium text-white hover:border-slate-600 transition-colors"
            >
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-slate-800 bg-slate-900/50">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-12 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold text-amber-500">{stat.value}</p>
              <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Everything your gym needs. <span className="text-amber-500">One platform.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-400">
            GymIQ combines intelligent CRM features with AI-powered retention, lead management, and voice reception — all working with your existing tools.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="rounded-xl border border-slate-800 bg-slate-900 p-6 hover:border-slate-700 transition-colors">
                <div className={`mb-4 inline-flex rounded-lg p-3 ${feature.bg}`}>
                  <Icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-slate-800 bg-slate-900/30 px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-white">How GymIQ works</h2>
          <div className="space-y-8">
            {[
              { step: '1', title: 'Connect your CRM', desc: 'Link Glofox, Mindbody, ClubRight, or upload a CSV. GymIQ imports your members in minutes.' },
              { step: '2', title: 'AI scores every member', desc: 'The churn engine analyses visit patterns, payment history, and engagement to score risk from 0-100.' },
              { step: '3', title: 'Intervene at the right time', desc: 'Get alerts when members hit the intervention window. AI handles cancel-save conversations automatically.' },
              { step: '4', title: 'Convert more leads', desc: 'Every enquiry gets instant follow-up via WhatsApp or SMS. The 9-stage pipeline tracks progress to conversion.' },
            ].map((item) => (
              <div key={item.step} className="flex gap-6">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-lg font-bold text-slate-900">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-slate-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-slate-900 p-12 text-center">
          <h2 className="text-3xl font-bold text-white">Ready to stop losing members?</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Plans start at £99/month. Get started with a free trial — no credit card required.
          </p>
          <Link
            href="/auth/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-8 py-3 text-base font-semibold text-slate-900 hover:bg-amber-400 transition-colors"
          >
            Start free trial
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-12">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="text-lg font-bold text-white">
            Gym<span className="text-amber-500">IQ</span>
            <span className="ml-1.5 text-xs font-normal text-slate-500">AI</span>
          </div>
          <p className="text-sm text-slate-500">© {new Date().getFullYear()} GymIQ AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
