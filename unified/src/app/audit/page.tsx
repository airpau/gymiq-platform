/**
 * /audit: the landing page every audit ad points at.
 *
 * One ask, no pricing, no walkthrough button above the form. The headline
 * follows the ad's utm_content so the page repeats the promise the visitor
 * just tapped. ?l=<lead id> (from the emailed link) prefills the form and
 * opens the upload step.
 */
import type { Metadata } from 'next'
import { Check } from 'lucide-react'
import { LogoLink } from '@/components/brand/Logo'
import AuditUpload from '@/components/marketing/AuditUpload'
import ViewContentPing from '@/components/analytics/ViewContentPing'
import { CONTACT, SYSTEMS } from '@/lib/site'
import CookieSettingsLink from '@/components/analytics/CookieSettingsLink'

export const metadata: Metadata = {
  title: 'Free membership file audit for gym owners',
  description:
    'Upload your membership export and see overdue by payment method, memberships ending unasked, members below current price, students past the age for their rate, and who is drifting. Free, about a minute, you keep the report.',
  alternates: { canonical: '/audit' },
  robots: { index: true, follow: true },
}

interface Message {
  kicker: string
  headline: string
  sub: string
  formHeading: string
}

const MESSAGES: Record<string, Message> = {
  students: {
    kicker: 'Students on the wrong rate',
    headline: 'How many of your students are past the age for their rate?',
    sub: 'A 1,600 member club found 47 still on the under 19 price, a median of nine months past their birthday. £970 a month. Your export will show yours in about a minute.',
    formHeading: 'Find the students still on the wrong rate.',
  },
  cards: {
    kicker: 'Card vs Direct Debit',
    headline: 'See your failed payments by payment method.',
    sub: 'Card payers fail 2.4 times more often than Direct Debit in a real UK club, and most owners never see the split. Your export shows the failure rate by method and the overdue book with an action per member.',
    formHeading: 'See your failure rate by payment method.',
  },
  brief: {
    kicker: 'Your numbers by 06:00',
    headline: 'Start with what is already in your membership file.',
    sub: 'Before the morning brief, the audit: overdue by payment method, memberships ending unasked, members below current price, who is drifting. Free, and you keep the report.',
    formHeading: 'See what is hiding in your membership file.',
  },
  leads: {
    kicker: 'The lead assistant, on your numbers',
    headline: 'First, see what your membership file is costing you.',
    sub: 'The tools work on your club’s real numbers. The audit is the first look: money sitting in the file, and who is about to leave. About a minute, free.',
    formHeading: 'See what is hiding in your membership file.',
  },
  default: {
    kicker: 'Free membership file audit',
    headline: 'See what is hiding in your membership file.',
    sub: 'Overdue by payment method, memberships ending unasked, members below current price, students past the age for their rate, who is drifting. Upload the export from your gym software. About a minute, free, you keep the report.',
    formHeading: 'See what is hiding in your membership file.',
  },
}

const FINDS = [
  'Overdue balance split by card and Direct Debit, with a recommended action per member',
  'Memberships ending in the next 60 days that nobody has spoken to',
  'Members still paying below your current price',
  'Students and juniors past the age for their rate',
  'Who has stopped visiting and what they are worth a month',
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AuditLandingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const content = typeof sp.utm_content === 'string' ? sp.utm_content : typeof sp.m === 'string' ? sp.m : ''
  const msg = MESSAGES[content] ?? MESSAGES.default
  const leadParam = typeof sp.l === 'string' && UUID_RE.test(sp.l) ? sp.l : null

  return (
    <div className="min-h-screen bg-paper text-ink antialiased">
      <ViewContentPing />
      <header className="border-b border-mist/80 bg-paper/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <LogoLink />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate">Built by a gym owner</span>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="absolute -right-40 -top-40 -z-10 h-[520px] w-[520px] rounded-full bg-moss-soft blur-3xl" />
          <div className="mx-auto max-w-6xl px-5 pb-14 pt-10 sm:px-8 sm:pt-16">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-5">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">{msg.kicker}</p>
                <h1 className="mt-4 font-display text-[36px] font-extrabold leading-[1.02] tracking-tight text-ink sm:text-5xl">{msg.headline}</h1>
                <p className="mt-5 text-lg leading-relaxed text-slate">{msg.sub}</p>
                <ul className="mt-7 hidden space-y-2.5 lg:block">
                  {FINDS.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[15px] text-ink-3">
                      <Check className="mt-1 h-4 w-4 flex-shrink-0 text-moss" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-7 hidden text-sm text-slate lg:block">
                  Works with {SYSTEMS}. Live at an énergie Fitness club in Hertfordshire. Your file is read once and not stored.
                </p>
              </div>
              <div className="lg:col-span-7">
                <AuditUpload variant="section" leadId={leadParam} heading={msg.formHeading} />
              </div>
            </div>

            <ul className="mt-10 space-y-2.5 lg:hidden">
              {FINDS.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[15px] text-ink-3">
                  <Check className="mt-1 h-4 w-4 flex-shrink-0 text-moss" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-mist bg-paper-2">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 py-12 sm:px-8 sm:grid-cols-3">
            <Stat n="47" label="students found on the under 19 rate at one 1,600 member club, a median of nine months past their birthday" />
            <Stat n="2.4x" label="the failure rate of card payers against Direct Debit in a real UK club" />
            <Stat n="1 min" label="from upload to a report you keep, with an action per member" />
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Questions owners ask first</h2>
            <dl className="mt-6 space-y-6">
              <Q q="I am on my phone. Do I need the file now?" a="No. Put your details in and we email a private link. Open it on the computer you use for your gym software and upload there." />
              <Q q="What happens to my file?" a="It is read once to build the report and not stored. The report lives at a private link that only you have, and we email it to you." />
              <Q q="Which export?" a={`The memberships report from ${SYSTEMS}: a members list with join date, plan and payment status is enough. CSV, TSV or Excel.`} />
              <Q q="What is the catch?" a="None on the audit. If the report shows money worth chasing we will offer a 20 minute walkthrough of the tools that chase it. You can say no." />
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-mist">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-slate sm:px-8">
          <span>gymIQ · GymIQ AI Ltd · {CONTACT}</span>
          <span className="flex gap-4">
            <a href="/privacy" className="hover:text-ink">Privacy</a>
            <a href="/terms" className="hover:text-ink">Terms</a>
            <CookieSettingsLink />
            <a href="/" className="hover:text-ink">gymiq.ai</a>
          </span>
        </div>
      </footer>
    </div>
  )
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <p className="font-display text-4xl font-extrabold tracking-tight text-ink">{n}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate">{label}</p>
    </div>
  )
}

function Q({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-semibold text-ink">{q}</dt>
      <dd className="mt-1.5 text-[15px] leading-relaxed text-slate">{a}</dd>
    </div>
  )
}
