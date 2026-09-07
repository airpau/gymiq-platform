import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import AuditUpload from '@/components/marketing/AuditUpload'

/** Set fee per club, per month. Change here and it updates everywhere on the page. */
const PRICE_PER_CLUB = 395
const CONTACT = 'paul@gymiq.ai'
const WALKTHROUGH_HREF = `mailto:${CONTACT}?subject=gymIQ%20walkthrough&body=Hi%20Paul%2C%0A%0AClub%3A%20%0AMembers%3A%20%0AGym%20software%3A%20%0A%0ABest%20time%20for%20a%2020%20minute%20call%3A%20`

export const metadata = {
  title: 'gymIQ. The morning brief that runs your gym.',
  description:
    'gymIQ reads your Glofox account and your bank feed, and puts what came in, who is leaving and what to do today on your phone by 06:00. Built by a gym owner, running live at énergie Fitness Hoddesdon.',
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased selection:bg-emerald-200 selection:text-emerald-900">
      <Nav />
      <Hero />
      <Proof />
      <Day />
      <WhatItFinds />
      <Connect />
      <Pricing />
      <Faq />
      <Audit />
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
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900">
          <Logo />
          <span>gymIQ</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-zinc-600 md:flex">
          <a href="#day" className="transition hover:text-zinc-900">What it does</a>
          <a href="#found" className="transition hover:text-zinc-900">What it finds</a>
          <Link href="/hoddesdon" className="transition hover:text-zinc-900">Hoddesdon numbers</Link>
          <a href="#pricing" className="transition hover:text-zinc-900">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/auth/login"
            className="hidden text-sm font-medium text-zinc-600 transition hover:text-zinc-900 sm:inline-flex"
          >
            Sign in
          </Link>
          <a
            href={WALKTHROUGH_HREF}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Book a walkthrough
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
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
/* HERO: the product is a message on a phone, so show the message     */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[640px] bg-gradient-to-b from-emerald-50/70 via-white to-white" />
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:pt-24">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              Built by a gym owner. Live at énergie Fitness Hoddesdon.
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-zinc-900 sm:text-5xl lg:text-[60px]">
              Your gym&apos;s numbers, on your phone,
              <span className="block bg-gradient-to-r from-emerald-700 to-emerald-500 bg-clip-text text-transparent">
                before you have had a coffee.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-600">
              gymIQ reads your Glofox account four times a day and your bank feed once a day. Every morning it tells you what came in, who is leaving, and what your front desk should do about it today. Then it puts those jobs on a board your staff can actually clear.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={WALKTHROUGH_HREF}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
              >
                Book a 20 minute walkthrough
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/hoddesdon"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                See the Hoddesdon numbers
              </Link>
            </div>
            <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Bullet>Works with your existing Glofox account. Nothing to migrate.</Bullet>
              <Bullet>Each club connects its own login. Read only.</Bullet>
              <Bullet>£{PRICE_PER_CLUB} a month per club. Set fee, no usage charges.</Bullet>
              <Bullet>Running in a 1,600 member club today.</Bullet>
            </ul>
          </div>

          <div className="lg:col-span-6">
            <BriefCard />
          </div>
        </div>
      </div>
    </section>
  )
}

function BriefCard() {
  return (
    <div className="mx-auto w-full max-w-md rounded-[28px] border border-zinc-200 bg-zinc-950 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_24px_60px_-24px_rgba(0,0,0,0.45)]">
      <div className="rounded-[20px] bg-zinc-900 px-4 pb-4 pt-3 text-zinc-100">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span>gymIQ</span>
          <span>22:00</span>
        </div>
        <p className="mt-3 text-[13px] font-semibold leading-snug text-white">
          Hoddesdon evening close, Sun 6 Sep: £26,414 collected MTD, 1,472 active paying
        </p>
        <pre className="mt-3 whitespace-pre-wrap font-mono text-[12px] leading-[1.55] text-zinc-300">{`TOP 3
1. Retention is good. 7 leavers this month against 19 over the same six days of August. Roster has grown six days running.
2. Selling is the problem. Joins project 77 against a 100 target.
3. £1,884 of September arrears across 47 members clears onto Friday's credit if worked before Wednesday.

FAILURE RATE 6.77 pct, best of the month. Overdue 58, down from 77.

FRIDAY CREDIT forecast £20,471, range 17,000 to 23,000.

BOARD for Monday: 12 overdue calls and 6 billing fixes, 46 more queued behind them.`}</pre>
        <p className="mt-3 text-[11px] text-zinc-500">A real brief, lightly shortened. Reply to it in plain English and it answers.</p>
      </div>
    </div>
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
/* PROOF STRIP: four figures from the live club                       */
/* ------------------------------------------------------------------ */

function Proof() {
  const stats = [
    { value: '9.55% to 6.77%', label: 'payment failure rate', note: 'August whole month against 1 to 6 September' },
    { value: '77 to 58', label: 'overdue members', note: 'late August peak to 6 September' },
    { value: '£13,239', label: 'a year of unpriced memberships found', note: 'students, corporates and two legacy plans' },
    { value: '3.65%', label: 'July attrition', note: 'lowest month in the club’s recorded history' },
  ]
  return (
    <section className="border-y border-zinc-100 bg-zinc-50/60">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
          énergie Fitness Hoddesdon, July to September 2026
        </p>
        <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white px-6 py-7">
              <p className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[28px]">{s.value}</p>
              <p className="mt-2 text-sm font-medium text-zinc-700">{s.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{s.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Every figure is pulled from the club&apos;s own data and explained, including the bad month, on the{' '}
          <Link href="/hoddesdon" className="font-medium text-emerald-700 hover:text-emerald-800">Hoddesdon page</Link>.
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* A DAY AT THE CLUB                                                  */
/* ------------------------------------------------------------------ */

function Day() {
  const slots = [
    {
      t: '06:00',
      title: 'Morning brief on your phone',
      body: 'Collected month to date, failure rate, overdue count, joins against target, projected month end banked, and the three things that matter today. Written, not charted. Reply to it and it answers.',
    },
    {
      t: '06:20',
      title: 'The staff board fills itself',
      body: 'The top 12 overdue members to call, the top 6 billing faults to fix, every membership ending this week, and the standing daily jobs. Short on purpose. A tick sticks for three days, so nobody is asked to call the same person twice.',
    },
    {
      t: '11:00',
      title: 'Payments that can clear are retried',
      body: 'Temporary shortfalls not attempted in the last two days, once per member, with the rules a careful human would use. Declined cards and dead mandates are routed to a named action instead of being hammered.',
    },
    {
      t: '16:00',
      title: 'Late warning',
      body: 'Anything the board has not cleared, and on Wednesdays a cut off alert so arrears land on Friday’s payout rather than the one after.',
    },
    {
      t: '22:00',
      title: 'Evening close',
      body: 'What changed since the morning, joins and leavers verified against the live roster, Friday’s credit forecast updated to the pound.',
    },
  ]
  return (
    <section id="day" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">What it does</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          Not a dashboard to check. <span className="text-zinc-500">A colleague who has already checked.</span>
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          Glofox has all the data. What it does not do is read it for you at six in the morning, work out what matters, and hand your team a list. That is the whole product.
        </p>
      </div>
      <ol className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {slots.map((s) => (
          <li key={s.t} className="rounded-2xl border border-zinc-200 bg-white p-6">
            <span className="font-mono text-xs font-semibold tracking-wide text-emerald-700">{s.t}</span>
            <h3 className="mt-2 text-base font-semibold tracking-tight text-zinc-900">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* WHAT IT FINDS                                                      */
/* ------------------------------------------------------------------ */

function WhatItFinds() {
  const items = [
    {
      title: 'Members on a rate they no longer qualify for',
      body: 'At Hoddesdon: 47 students aged 19 and over still on the under 19 price, billing £970 a month short. It refills at about three members a month unless someone watches it.',
    },
    {
      title: 'Memberships ending with no renewal booked',
      body: '50 members whose term was quietly running out, worth £1,289 a month, handed to the desk as a list sorted by expiry with the ones still training marked priority.',
    },
    {
      title: 'The payment method that is costing you',
      body: 'Card payers failed at 2.4 times the Direct Debit rate. One migration campaign, no capital, about £530 a month.',
    },
    {
      title: 'Prices nobody authorised',
      body: 'A membership plan sold four times at a price the owner never launched. Flagged the day it was found.',
    },
    {
      title: 'A price test that is quietly failing',
      body: 'A new joiner rate trial was caught in five days when weekday sales fell to 1 against 8.4 expected, and reverted at a cost of six joins instead of a month’s worth.',
    },
    {
      title: 'What Friday will actually pay',
      body: 'Payout forecasts with a stated range, reconciled against the bank feed. The banked model checked out within 0.4% of the statements.',
    },
  ]
  return (
    <section id="found" className="border-y border-zinc-100 bg-zinc-50/60 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">What it finds</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            The money hiding in your membership file.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            None of these needed a new member. All of them were sitting in Glofox already. These are the first quarter&apos;s finds at one club.
          </p>
        </div>
        <ul className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <li key={it.title} className="bg-white p-6">
              <p className="text-sm font-semibold text-zinc-900">{it.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{it.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* HOW IT CONNECTS                                                    */
/* ------------------------------------------------------------------ */

function Connect() {
  const steps = [
    {
      title: 'Your club, your login',
      body: 'Each club connects its own Glofox login. gymIQ reads the Memberships, Sales and Failed Payments reports the way you would, and writes nothing back. Franchise groups connect one club at a time; nothing is shared between clubs.',
    },
    {
      title: 'Bank feed, optional',
      body: 'Connect the club account through open banking and Friday’s payout is reconciled against what actually landed. The consent renews every 90 days, and the brief tells you when.',
    },
    {
      title: 'A week of tuning',
      body: 'The first week is gymIQ learning what normal looks like for your club: your seasonality, your payout pattern, your plan names. Forecasts sharpen from month two.',
    },
    {
      title: 'Nothing for staff to learn',
      body: 'Glofox stays exactly as it is. The board is one page on a tablet at the desk, opened with a PIN. Ticks are recorded to whoever made them.',
    },
  ]
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">How it connects</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          Live in an evening. <span className="text-zinc-500">Useful by the second week.</span>
        </h2>
      </div>
      <ol className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <li key={s.title} className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h3 className="text-base font-semibold tracking-tight text-zinc-900">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* PRICING: one set fee                                               */
/* ------------------------------------------------------------------ */

function Pricing() {
  const included = [
    'Morning brief and evening close, seven days a week',
    'Staff task board with the daily money hour',
    'Failed payment retries and arrears triage, three runs a week',
    'Price, age and plan audits every month',
    'Friday payout and month end forecasts',
    'Bank feed reconciliation (open banking)',
    'Reply to any brief and get an answer',
    'Set up and tuning included',
  ]
  return (
    <section id="pricing" className="border-y border-zinc-100 bg-zinc-50/60 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">Pricing</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            One set fee per club. <span className="text-zinc-500">Nothing to track, nothing to argue about.</span>
          </h2>
          <p className="mt-4 text-sm text-zinc-500">Monthly. No setup fee. No usage charges. Cancel with a month&apos;s notice.</p>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="relative flex flex-col rounded-2xl border border-zinc-900 bg-zinc-900 p-8 text-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_16px_40px_-16px_rgba(0,0,0,0.35)] lg:col-span-3">
            <p className="text-sm font-semibold text-emerald-300">gymIQ for one club</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="text-5xl font-semibold tracking-tight">£{PRICE_PER_CLUB}</span>
              <span className="text-sm text-zinc-400">a month, per club</span>
            </p>
            <p className="mt-3 text-sm text-zinc-300">
              On a 1,000 member club that is about 40p per member per month. A dozen recovered payments, or one member kept for a year, covers it.
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {included.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" strokeWidth={2.5} />
                  <span className="text-zinc-200">{f}</span>
                </li>
              ))}
            </ul>
            <a
              href={WALKTHROUGH_HREF}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
            >
              Book a walkthrough
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-8 lg:col-span-2">
            <p className="text-sm font-semibold text-emerald-700">Groups and franchises</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">Per club, priced on numbers</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
              Each club keeps its own login and its own board. The owner or area manager gets one brief across all of them. Talk to us about three clubs or more.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              énergie clubs: the Friday 80 per cent credit, the reconciliation on the fourth working day and the franchise fee are already modelled, so the cash forecast works from day one.
            </p>
            <a
              href={`mailto:${CONTACT}?subject=gymIQ%20for%20a%20group`}
              className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Talk about a group
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* FAQ: the honest answers                                            */
/* ------------------------------------------------------------------ */

function Faq() {
  const qs = [
    {
      q: 'Does it replace Glofox?',
      a: 'No. It reads Glofox and leaves it alone. Your team keeps working in Glofox exactly as they do now; gymIQ tells them which member to open first.',
    },
    {
      q: 'Does it contact my members?',
      a: 'Not by default. The board tells your staff who to call and why. Automated retries of failed payments run inside Glofox’s own rules. Any messaging to members is switched on per club, by you, in writing.',
    },
    {
      q: 'What does it need from me?',
      a: 'A Glofox login for the club, ideally a read only staff account created for gymIQ. Optionally an open banking connection to the club account for reconciliation. And an hour on a call so the brief is written the way you think.',
    },
    {
      q: 'Will it work if my front desk is part time?',
      a: 'That is who it is built for. The board is capped at a list a small desk can clear in an hour, and the evening report tells you who cleared what. If nothing gets ticked, you will know by 22:00, not at month end.',
    },
    {
      q: 'Is the retention result real?',
      a: 'July at Hoddesdon was the lowest attrition month on record. August was not, because the club cleared its overdue book that month and the leavers show up all at once. Both months are on the Hoddesdon page with the workings, because a retention claim you cannot check is worth nothing.',
    },
    {
      q: 'Who is behind it?',
      a: 'Paul Airey, who owns and runs énergie Fitness Hoddesdon, a 1,600 member club in Hertfordshire. gymIQ was built to run that club first. You are talking to the person who uses it every day.',
    },
  ]
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">Straight answers</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">The questions owners ask first.</h2>
      </div>
      <dl className="mt-12 grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
        {qs.map((item) => (
          <div key={item.q} className="border-t border-zinc-200 pt-5">
            <dt className="text-base font-semibold tracking-tight text-zinc-900">{item.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-zinc-600">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* AUDIT: the existing upload widget as a lower commitment first step */
/* ------------------------------------------------------------------ */

function Audit() {
  return (
    <section id="audit" className="border-y border-zinc-100 bg-zinc-50/60 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">Not ready to connect?</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Start with an export.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Download the Memberships report from Glofox and drop it here. You get a first read of your plan mix, tenure, sleepers and revenue at risk by email. No login, no call.
          </p>
        </div>
        <div className="lg:col-span-7">
          <AuditUpload variant="section" />
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
    <section className="px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-emerald-50/60 px-8 py-14 text-center sm:px-12 sm:py-20">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          See your own club&apos;s first brief.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-zinc-600">
          A 20 minute call, a Glofox login, and your first morning brief lands within a week. If it finds nothing, you will have lost twenty minutes.
        </p>
        <a
          href={WALKTHROUGH_HREF}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Book a walkthrough
          <ArrowRight className="h-4 w-4" />
        </a>
        <p className="mt-4 text-xs text-zinc-500">Or email {CONTACT}</p>
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
          gymIQ
        </Link>
        <p className="text-xs text-zinc-500">
          © {new Date().getFullYear()} GymIQ AI Ltd · Made in Hertfordshire · {CONTACT}
        </p>
        <nav className="flex items-center gap-5 text-xs text-zinc-500">
          <a href="#day" className="hover:text-zinc-900">What it does</a>
          <Link href="/hoddesdon" className="hover:text-zinc-900">Hoddesdon</Link>
          <a href="#pricing" className="hover:text-zinc-900">Pricing</a>
          <Link href="/privacy" className="hover:text-zinc-900">Privacy</Link>
          <Link href="/terms" className="hover:text-zinc-900">Terms</Link>
          <Link href="/auth/login" className="hover:text-zinc-900">Sign in</Link>
        </nav>
      </div>
    </footer>
  )
}
