import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  LineChart,
  PhoneCall,
  MessagesSquare,
  FileSpreadsheet,
  Workflow,
  Check,
} from 'lucide-react'
import AuditUpload from '@/components/marketing/AuditUpload'

export const metadata = {
  title: 'GymIQ — Predict gym churn. Save members. Grow revenue.',
  description:
    'AI churn prediction, cancel-save conversations, and instant lead follow-up that bolts on to Glofox, Mindbody, ClubRight, or any spreadsheet. Run a free 60-second audit on your member export.',
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased selection:bg-emerald-200 selection:text-emerald-900">
      <Nav />
      <Hero />
      <TrustStrip />
      <Stats />
      <AuditPreview />
      <Features />
      <HowItWorks />
      <Pricing />
      <FinalCta />
      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* NAV                                                                */
/* ------------------------------------------------------------------ */

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900">
          <Logo />
          <span>GymIQ</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-zinc-600 md:flex">
          <a href="#features" className="transition hover:text-zinc-900">Features</a>
          <a href="#how" className="transition hover:text-zinc-900">How it works</a>
          <a href="#audit" className="transition hover:text-zinc-900">Free audit</a>
          <a href="#pricing" className="transition hover:text-zinc-900">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/auth/login"
            className="hidden text-sm font-medium text-zinc-600 transition hover:text-zinc-900 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="#audit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Free audit
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  )
}

function Logo() {
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-emerald-700 text-[11px] font-bold tracking-tight text-white shadow-sm">
      IQ
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* HERO                                                               */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section id="audit" className="relative overflow-hidden">
      {/* soft background wash */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[640px] bg-gradient-to-b from-emerald-50/60 via-white to-white"
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-[-160px] -z-10 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-emerald-200/40 blur-3xl"
      />

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pt-20 lg:pt-24">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" />
              Live with Energie Fitness Hoddesdon
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-zinc-900 sm:text-5xl lg:text-[64px]">
              Know who&apos;s about to quit your gym.
              <span className="block bg-gradient-to-r from-emerald-700 to-emerald-500 bg-clip-text text-transparent">
                Before they do.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-600">
              GymIQ adds AI churn prediction, cancel-save conversations, and instant lead follow-up to the CRM you already use. The average gym we audit is bleeding{' '}
              <span className="font-semibold text-zinc-900">£2,494/month</span> in revenue it doesn&apos;t know about. Find yours in 60 seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#audit-widget"
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
              >
                Run my free audit
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                How it works
              </a>
            </div>

            <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Bullet>Works with Glofox, Mindbody, ClubRight, or a CSV</Bullet>
              <Bullet>No CRM migration. Live in under a day.</Bullet>
              <Bullet>£4–6/month per gym in AI costs. Not £500.</Bullet>
              <Bullet>72% cancel-save rate in pilot</Bullet>
            </ul>
          </div>

          <div id="audit-widget" className="lg:col-span-5">
            <AuditUpload variant="hero" />
          </div>
        </div>
      </div>
    </section>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-zinc-700">
      <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      {children}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* TRUST STRIP                                                        */
/* ------------------------------------------------------------------ */

function TrustStrip() {
  const integrations = ['Glofox', 'Mindbody', 'ClubRight', 'TrainerizeBeyond', 'GymMaster']
  return (
    <section aria-label="Integrations" className="border-y border-zinc-100 bg-zinc-50/60">
      <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
            Works with the CRM you already pay for
          </p>
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-2">
            {integrations.map((name) => (
              <li key={name} className="text-sm font-medium text-zinc-400">
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* STATS                                                              */
/* ------------------------------------------------------------------ */

function Stats() {
  const stats = [
    { value: '£2,494', label: 'avg monthly revenue at risk per gym', note: 'across the gyms we’ve audited' },
    { value: '72%', label: 'cancel-save rate', note: 'when AI handles the conversation' },
    { value: '3×', label: 'faster lead response', note: 'vs. manual follow-up by staff' },
    { value: '£4–6', label: 'AI cost per gym, per month', note: 'GPT-4o-mini + Claude Sonnet' },
  ]
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
          The numbers that matter
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          Independent gyms churn 30–50% a year.
          <span className="text-zinc-500"> Almost nobody knows who, why, or when.</span>
        </h2>
      </div>
      <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white px-6 py-8">
            <p className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-[40px]">
              {s.value}
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-700">{s.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{s.note}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* AUDIT PREVIEW — what the report contains                           */
/* ------------------------------------------------------------------ */

function AuditPreview() {
  const items = [
    { title: 'Revenue at risk', body: 'Total monthly £ from members likely to cancel in the next 30 days, by risk band.' },
    { title: 'Deep sleeper list', body: 'Every member 21–45 days without a visit — the sweet spot for a save call.' },
    { title: 'Cohort churn curves', body: 'See where new joiners drop off. Spot the first-30-day, first-90-day gaps.' },
    { title: 'Lead conversion gaps', body: 'How fast you respond, where leads stall, and what you should be saying.' },
    { title: 'Auto-categorised reasons', body: 'AI tags leavers by reason: price, location, injury, unused, etc.' },
    { title: 'A 30-day action plan', body: 'Ten concrete moves, ranked by expected revenue impact.' },
  ]

  return (
    <section className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
              What you get
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              A full retention audit of your gym, in 60 seconds.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-zinc-600">
              Upload an export from your CRM — even a messy spreadsheet. We score every member, surface who&apos;s about to leave, and email you a PDF you can hand to your team this afternoon.
            </p>
            <a
              href="#audit"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
            >
              Run mine now
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
          <div className="lg:col-span-7">
            <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2">
              {items.map((it) => (
                <li key={it.title} className="bg-white p-6">
                  <p className="text-sm font-semibold text-zinc-900">{it.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{it.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* FEATURES                                                           */
/* ------------------------------------------------------------------ */

function Features() {
  const features = [
    {
      icon: LineChart,
      title: 'Churn prediction that runs free',
      body: 'A heuristic engine — not a black box — scores every member 0–100 by visit pattern, payment health, and engagement. Pure functions. Zero AI cost.',
    },
    {
      icon: MessagesSquare,
      title: 'Cancel-save AI conversations',
      body: 'When a member tries to leave, AI handles the conversation: probes the reason, offers a freeze, a downgrade, or a recovery plan. 72% save in pilot.',
    },
    {
      icon: PhoneCall,
      title: 'AI voice receptionist',
      body: 'Answer your gym phone 24/7. Book tours, answer FAQs, route urgent calls. Tone-matched to your brand, in your accent.',
    },
    {
      icon: Workflow,
      title: 'Instant lead follow-up',
      body: 'Every enquiry gets a WhatsApp inside 60 seconds. A 9-stage pipeline tracks each lead from first ping to converted member.',
    },
    {
      icon: FileSpreadsheet,
      title: 'Bolts on. No migration.',
      body: 'Glofox, Mindbody, ClubRight, IMAP CSV reports, or a spreadsheet. We import, normalise, and never ask you to switch CRM.',
    },
    {
      icon: ShieldCheck,
      title: 'Dry-run by default',
      body: 'No outbound message leaves the system until you flip the switch per channel. See exactly what AI would have said.',
    },
  ]
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
          The platform
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          Built for gyms.
          <span className="text-zinc-500"> Not adapted from a generic CRM.</span>
        </h2>
      </div>
      <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => {
          const Icon = f.icon
          return (
            <div
              key={f.title}
              className="group relative rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]"
            >
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold tracking-tight text-zinc-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.body}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* HOW IT WORKS                                                       */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Connect or upload',
      body: 'Hook up Glofox, Mindbody, or ClubRight in two clicks. No CRM? Drop a CSV — we handle the rest.',
    },
    {
      n: '02',
      title: 'AI scores every member',
      body: 'The churn engine flags risk, classifies leavers by reason, and surfaces the deep-sleeper list daily at 2am.',
    },
    {
      n: '03',
      title: 'Intervene at the right time',
      body: 'AI sends a friendly nudge at day 14. At day 21, it offers a save. Quiet hours and dry-run by default.',
    },
    {
      n: '04',
      title: 'Watch the dashboard',
      body: 'Revenue saved, leads converted, members rescued, staff tasks completed. One screen instead of seven.',
    },
  ]
  return (
    <section id="how" className="border-y border-zinc-100 bg-zinc-50/60 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Live in a day. Saving members by week two.
          </h2>
        </div>
        <ol className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="relative rounded-2xl border border-zinc-200 bg-white p-6">
              <span className="text-xs font-semibold tracking-[0.12em] text-emerald-700">{s.n}</span>
              <h3 className="mt-3 text-base font-semibold tracking-tight text-zinc-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* PRICING                                                            */
/* ------------------------------------------------------------------ */

function Pricing() {
  const tiers = [
    {
      name: 'Retention AI',
      price: '£179',
      desc: 'For gyms focused on keeping the members they already have.',
      features: [
        'Churn prediction for every member',
        'Automated sleeper detection',
        'Cancel-save AI conversations',
        'Payment recovery sequences',
        'Risk dashboard',
        'Email + WhatsApp channels',
        'Up to 4,000 members',
        '500 WhatsApp messages / mo',
        '200 AI conversations / mo',
      ],
      cta: 'Start free trial',
      ctaHref: '/auth/signup',
      highlight: false,
    },
    {
      name: 'Lead Recovery AI',
      price: '£179',
      desc: 'For growing gyms that want to convert every enquiry.',
      features: [
        'AI lead nurturing (WhatsApp, Email, SMS)',
        '30-second response time',
        '5-touch follow-up sequence',
        'Automated tour booking',
        'Post-visit conversion tracking',
        'Lead pipeline dashboard',
        'Up to 500 leads / month',
        '1,000 WhatsApp messages / mo',
        '300 AI conversations / mo',
      ],
      cta: 'Start free trial',
      ctaHref: '/auth/signup',
      highlight: false,
    },
    {
      name: 'GymIQ Complete',
      price: '£299',
      saving: 'Save £59/mo vs. buying both',
      desc: 'The complete revenue-protection system. Both products, plus premium extras.',
      features: [
        'Everything in Retention AI',
        'Everything in Lead Recovery AI',
        'Priority support',
        'Custom AI personality matched to your brand',
        'Advanced analytics',
        '4,000 members + unlimited leads',
        '1,500 WhatsApp messages / mo',
        '500 AI conversations / mo',
      ],
      cta: 'Start free trial',
      ctaHref: '/auth/signup',
      highlight: true,
    },
  ]
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
          Pricing
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          One member saved pays for it. <span className="text-zinc-500">Twice over.</span>
        </h2>
        <p className="mt-4 text-sm text-zinc-500">No setup fees. No contracts. Cancel anytime.</p>
      </div>
      <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {tiers.map((t) => (
          <div
            key={t.name}
            className={`relative flex flex-col rounded-2xl border p-7 ${
              t.highlight
                ? 'border-zinc-900 bg-zinc-900 text-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_16px_40px_-16px_rgba(0,0,0,0.35)]'
                : 'border-zinc-200 bg-white text-zinc-900'
            }`}
          >
            {t.highlight && (
              <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                Most popular
              </span>
            )}
            <p className={`text-sm font-semibold ${t.highlight ? 'text-emerald-300' : 'text-emerald-700'}`}>
              {t.name}
            </p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight">{t.price}</span>
              <span className={`text-sm ${t.highlight ? 'text-zinc-400' : 'text-zinc-500'}`}>/ month</span>
            </p>
            {t.saving && (
              <p className={`mt-2 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${t.highlight ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-50 text-emerald-700'}`}>
                {t.saving}
              </p>
            )}
            <p className={`mt-2 text-sm ${t.highlight ? 'text-zinc-300' : 'text-zinc-600'}`}>{t.desc}</p>
            <ul className="mt-6 space-y-2.5">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check
                    className={`mt-0.5 h-4 w-4 flex-shrink-0 ${t.highlight ? 'text-emerald-400' : 'text-emerald-600'}`}
                    strokeWidth={2.5}
                  />
                  <span className={t.highlight ? 'text-zinc-200' : 'text-zinc-700'}>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={t.ctaHref}
              className={`mt-7 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                t.highlight
                  ? 'bg-white text-zinc-900 hover:bg-zinc-100'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800'
              }`}
            >
              {t.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </div>

      {/* Enterprise strip */}
      <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-900 text-white">
        <div className="flex flex-col items-start gap-6 px-7 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-9 sm:py-8">
          <div className="max-w-xl">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">
              Enterprise
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">
              4,000+ members? Multi-site? Custom integrations?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              Custom pricing tailored to usage, dedicated account manager, and centralised analytics across every site.
            </p>
          </div>
          <a
            href="mailto:hello@gymiq.ai?subject=GymIQ Enterprise enquiry"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
          >
            Talk to us
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* FINAL CTA                                                          */
/* ------------------------------------------------------------------ */

function FinalCta() {
  return (
    <section className="px-5 pb-24 sm:px-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-emerald-50/60 px-8 py-14 text-center sm:px-12 sm:py-20">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          Find the £2,494 you&apos;re leaving on the table.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-zinc-600">
          Upload a member export. Sixty seconds later, you have the full audit. No card. No sales call.
        </p>
        <a
          href="#audit"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Run my free audit
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* FOOTER                                                             */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Logo />
          GymIQ
        </Link>
        <p className="text-xs text-zinc-500">
          © {new Date().getFullYear()} GymIQ AI Ltd · Made in the UK · hello@gymiq.ai
        </p>
        <nav className="flex items-center gap-5 text-xs text-zinc-500">
          <a href="#features" className="hover:text-zinc-900">Features</a>
          <a href="#pricing" className="hover:text-zinc-900">Pricing</a>
          <Link href="/auth/login" className="hover:text-zinc-900">Sign in</Link>
        </nav>
      </div>
    </footer>
  )
}
