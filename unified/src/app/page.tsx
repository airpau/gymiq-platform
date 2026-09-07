import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import AuditUpload from '@/components/marketing/AuditUpload'

/** Set fee per club, per month. Change here and it updates everywhere on the page. */
const PRICE_PER_CLUB = 395
const CONTACT = 'paul@gymiq.ai'
const WALKTHROUGH_HREF = `mailto:${CONTACT}?subject=gymIQ%20walkthrough&body=Hi%20Paul%2C%0A%0AClub%3A%20%0AMembers%3A%20%0AGym%20software%3A%20%0A%0ABest%20time%20for%20a%2020%20minute%20call%3A%20`
const SYSTEMS = 'Glofox, ClubRight, Mindbody, PerfectGym, GymMaster and others'

export const metadata = {
  title: 'gymIQ. The morning brief that runs your gym.',
  description:
    'gymIQ reads your gym management system and your bank feed, and puts what came in, who is leaving and what to do today on your phone by 06:00. Built by a gym owner, running live at énergie Fitness Hoddesdon.',
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper text-ink antialiased selection:bg-lime selection:text-ink">
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
    <header className="sticky top-0 z-40 border-b border-mist/80 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-ink">
          <Logo />
          <span>gymIQ</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-slate md:flex">
          <a href="#day" className="transition hover:text-ink">What it does</a>
          <a href="#found" className="transition hover:text-ink">What it finds</a>
          <Link href="/hoddesdon" className="transition hover:text-ink">Hoddesdon numbers</Link>
          <a href="#pricing" className="transition hover:text-ink">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/auth/login" className="hidden text-sm font-medium text-slate transition hover:text-ink sm:inline-flex">
            Sign in
          </Link>
          <a
            href={WALKTHROUGH_HREF}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper transition hover:bg-ink-2"
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
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-moss font-mono text-[11px] font-semibold text-lime">
      IQ
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* HERO                                                               */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute -right-40 -top-40 -z-10 h-[520px] w-[520px] rounded-full bg-moss-soft blur-3xl" />
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:pt-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">Built by a gym owner · live at énergie Fitness Hoddesdon</p>
            <h1 className="mt-5 font-display text-[44px] font-extrabold leading-[0.98] tracking-tight text-ink sm:text-6xl lg:text-[72px]">
              Your gym&apos;s numbers, on your phone, before you have had a coffee.
            </h1>
            <p className="mt-7 max-w-xl text-xl leading-relaxed text-slate">
              gymIQ reads your gym management system four times a day and your bank feed once a day. Every morning it tells you what came in, who is leaving, and what the desk should do about it today. Then it puts those jobs on a board your staff can actually clear.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href={WALKTHROUGH_HREF}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-base font-semibold text-paper transition hover:bg-ink-2"
              >
                Book a 20 minute walkthrough
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/hoddesdon"
                className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-transparent px-6 py-3.5 text-base font-semibold text-ink transition hover:border-ink/50"
              >
                See the Hoddesdon numbers
              </Link>
            </div>
            <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Bullet>Works with {SYSTEMS}. Nothing to migrate.</Bullet>
              <Bullet>Each club connects its own login. Read only.</Bullet>
              <Bullet>£{PRICE_PER_CLUB} a month per club. Set fee, no usage charges.</Bullet>
              <Bullet>Running in a 1,600 member club today.</Bullet>
            </ul>
          </div>

          <div className="lg:col-span-5">
            <BriefPhone />
          </div>
        </div>
      </div>
    </section>
  )
}

function BriefPhone() {
  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <div className="rounded-[36px] border border-ink-3 bg-ink p-3 shadow-[0_40px_80px_-30px_rgba(15,22,20,0.55)]">
        <div className="rounded-[26px] bg-ink-2 px-5 pb-5 pt-4 text-paper">
          <div className="flex items-center justify-between font-mono text-[11px] text-paper/50">
            <span>gymIQ</span>
            <span>06:00</span>
          </div>
          <p className="mt-4 font-display text-[15px] font-bold leading-snug text-paper">
            Hoddesdon morning brief, Mon 7 Sep
          </p>
          <p className="mt-1 font-mono text-[12px] text-lime">£26,414 collected MTD · 1,472 active paying</p>
          <pre className="mt-4 whitespace-pre-wrap font-mono text-[12px] leading-[1.6] text-paper/85">{`TOP 3
1. Retention is good. 7 leavers this month against 19 over the same six days of August. Roster up six days running.
2. Selling is the problem. Joins project 77 against a 100 target.
3. £1,884 of arrears across 47 members clears onto Friday's credit if worked before Wednesday.

FAILURE RATE 6.77%, best of the month.
FRIDAY CREDIT forecast £20,471.
BOARD 12 overdue calls, 6 billing fixes, 46 queued.`}</pre>
          <div className="mt-4 rounded-xl bg-ink px-3 py-2.5 font-mono text-[11px] text-paper/60">
            Reply: <span className="text-paper">who are the 47?</span>
          </div>
        </div>
      </div>
      <div className="absolute -left-10 bottom-14 hidden rounded-2xl border border-mist bg-paper px-4 py-3 shadow-lg lg:block">
        <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Found this month</p>
        <p className="mt-1 font-display text-2xl font-bold text-ink">£1,884</p>
        <p className="text-xs text-slate">arrears, 47 members</p>
      </div>
      <p className="mt-4 text-center text-xs text-slate">A real brief, lightly shortened.</p>
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px] text-ink-3">
      <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-moss-soft text-moss">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      {children}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* PROOF                                                              */
/* ------------------------------------------------------------------ */

function Proof() {
  const stats = [
    { value: '10% to 3.6%', label: 'payment failures', note: 'before gymIQ, then July settled' },
    { value: '76 to 58', label: 'overdue members', note: '10 August to 6 September' },
    { value: '£13,239', label: 'a year in unpriced memberships', note: 'found in the membership file' },
    { value: '3.65%', label: 'July attrition', note: 'lowest month the club has recorded' },
  ]
  return (
    <section className="bg-ink text-paper">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-paper/50">énergie Fitness Hoddesdon, 1,617 members, July to September 2026</p>
        <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="whitespace-nowrap font-display text-[34px] font-extrabold tracking-tight text-lime sm:text-[44px]">{s.value}</p>
              <p className="mt-2 text-base font-semibold text-paper">{s.label}</p>
              <p className="mt-1 text-sm text-paper/55">{s.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 max-w-3xl text-sm leading-relaxed text-paper/60">
          Every figure is from the club&apos;s own data and explained, bad months included, on the{' '}
          <Link href="/hoddesdon" className="text-lime underline-offset-4 hover:underline">Hoddesdon page</Link>. The club now clears its non payers from the roster every month on purpose, which is why the numbers are real.
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
    { t: '06:00', title: 'Morning brief on your phone', body: 'Collected month to date, failure rate, overdue count, joins against target, projected month end banked, and the three things that matter today. Written, not charted. Reply to it and it answers.' },
    { t: '06:20', title: 'The staff board fills itself', body: 'The top 12 overdue members to call, the top 6 billing faults to fix, every membership ending this week, and the standing daily jobs. Short on purpose. A tick sticks for three days, so nobody is asked to call the same person twice.' },
    { t: '11:00', title: 'Payments that can clear are retried', body: 'Temporary shortfalls not attempted in the last two days, once per member, with the rules a careful human would use. Declined cards and dead mandates go to a named action instead of being hammered.' },
    { t: '16:00', title: 'Late warning', body: 'Anything the board has not cleared, and on Wednesdays a cut off alert so arrears land on this Friday’s payout rather than the one after.' },
    { t: '22:00', title: 'Evening close', body: 'What changed since the morning, joins and leavers verified against the live roster, Friday’s credit forecast updated to the pound.' },
  ]
  return (
    <section id="day" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">What it does</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          Not a dashboard to check. A colleague who has already checked.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-slate">
          Your gym software has all the data. What it does not do is read it for you at six in the morning, work out what matters, and hand your team a list. That is the whole product.
        </p>
      </div>
      <ol className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-mist bg-mist md:grid-cols-5">
        {slots.map((s) => (
          <li key={s.t} className="bg-paper p-6">
            <span className="font-display text-3xl font-extrabold tracking-tight text-moss">{s.t}</span>
            <h3 className="mt-3 font-display text-lg font-bold leading-snug text-ink">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-slate">{s.body}</p>
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
  const rows = [
    { what: 'Members on a rate they no longer qualify for', found: '47 students aged 19 and over still on the under 19 price. It refills at about three a month unless someone watches it.', worth: '£970 a month' },
    { what: 'Memberships ending with no renewal booked', found: '50 members whose term was quietly running out, handed to the desk sorted by expiry with the ones still training marked priority.', worth: '£1,289 a month' },
    { what: 'The payment method that is costing you', found: 'Card payers failed at 2.4 times the Direct Debit rate. One migration campaign, no capital.', worth: 'about £530 a month' },
    { what: 'Prices nobody authorised', found: 'A membership plan sold four times at a price the owner never launched. Flagged the day it was found.', worth: 'found' },
    { what: 'A price test that was quietly failing', found: 'A new joiner rate trial caught in five days when weekday sales fell to 1 against 8.4 expected. Reverted at a cost of six joins instead of a month’s worth.', worth: 'a month of joins' },
    { what: 'What Friday will actually pay', found: 'Payout forecasts with a stated range, reconciled against the bank feed. The banked model checked out within 0.4% of the statements.', worth: 'no surprises' },
  ]
  return (
    <section id="found" className="bg-paper-2">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">What it finds</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            The money hiding in your membership file.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate">
            None of these needed a new member. All of them were sitting in the club&apos;s own system already. First quarter, one club.
          </p>
        </div>
        <div className="mt-12 overflow-hidden rounded-3xl border border-mist bg-paper">
          {rows.map((r, idx) => (
            <div key={r.what} className={`grid grid-cols-1 gap-3 px-6 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_150px] md:items-baseline md:gap-8 ${idx > 0 ? 'border-t border-mist' : ''}`}>
              <h3 className="font-display text-lg font-bold leading-snug text-ink">{r.what}</h3>
              <p className="text-[15px] leading-relaxed text-slate">{r.found}</p>
              <p className="font-mono text-sm font-medium text-amber md:text-right">{r.worth}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* HOW IT CONNECTS                                                    */
/* ------------------------------------------------------------------ */

function Connect() {
  const steps = [
    { n: '1', title: 'Your club, your login', body: `Each club connects its own login to its gym software (${SYSTEMS}). gymIQ reads the memberships, sales and failed payment reports the way you would, and writes nothing back. Groups connect one club at a time; nothing is shared between clubs.` },
    { n: '2', title: 'Bank feed, optional', body: 'Connect the club account through open banking and the payout is reconciled against what actually landed. The consent renews every 90 days, and the brief tells you when.' },
    { n: '3', title: 'A week of tuning', body: 'The first week is gymIQ learning what normal looks like for your club: your seasonality, your payout pattern, your plan names. Forecasts sharpen from month two.' },
    { n: '4', title: 'Nothing for staff to learn', body: 'Your software stays exactly as it is. The board is one page on a tablet at the desk, opened with a PIN. Ticks are recorded to whoever made them.' },
  ]
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">How it connects</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          Live in an evening. Useful by the second week.
        </h2>
      </div>
      <ol className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <li key={s.n} className="rounded-3xl border border-mist bg-paper p-6">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink font-mono text-sm font-semibold text-lime">{s.n}</span>
            <h3 className="mt-4 font-display text-lg font-bold leading-snug text-ink">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-slate">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* PRICING                                                            */
/* ------------------------------------------------------------------ */

function Pricing() {
  const included = [
    'Morning brief and evening close, seven days a week',
    'Staff task board with the daily money hour',
    'Failed payment retries and arrears triage, three runs a week',
    'Price, age and plan audits every month',
    'Payout and month end forecasts',
    'Bank feed reconciliation (open banking)',
    'Reply to any brief and get an answer',
    'Set up and tuning included',
  ]
  return (
    <section id="pricing" className="bg-ink text-paper">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-lime">Pricing</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-paper sm:text-5xl">
            One set fee per club. Nothing to track, nothing to argue about.
          </h2>
          <p className="mt-4 text-base text-paper/60">Monthly. No setup fee. No usage charges. Cancel with a month&apos;s notice.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="rounded-3xl border border-ink-3 bg-ink-2 p-8 lg:col-span-3">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-lime">gymIQ for one club</p>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-6xl font-extrabold tracking-tight text-paper">£{PRICE_PER_CLUB}</span>
              <span className="text-base text-paper/60">a month, per club</span>
            </p>
            <p className="mt-3 text-[15px] text-paper/70">
              On a 1,000 member club that is about 40p per member per month. A dozen recovered payments, or one member kept for a year, covers it.
            </p>
            <ul className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {included.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[15px] text-paper/85">
                  <Check className="mt-1 h-4 w-4 flex-shrink-0 text-lime" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={WALKTHROUGH_HREF}
              className="mt-9 inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3.5 text-base font-semibold text-ink transition hover:bg-paper"
            >
              Book a walkthrough
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="flex flex-col rounded-3xl border border-ink-3 p-8 lg:col-span-2">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-paper/50">Groups and franchises</p>
            <p className="mt-4 font-display text-2xl font-bold text-paper">Per club, priced on numbers</p>
            <p className="mt-3 text-[15px] leading-relaxed text-paper/70">
              Each club keeps its own login and its own board. The owner or area manager gets one brief across all of them. Talk to us about three clubs or more.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-paper/70">
              énergie clubs: the Friday credit, the monthly reconciliation and the franchise fee are already modelled, so the cash forecast works from day one.
            </p>
            <a
              href={`mailto:${CONTACT}?subject=gymIQ%20for%20a%20group`}
              className="mt-auto inline-flex items-center gap-2 pt-8 text-base font-semibold text-lime"
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
/* FAQ                                                                */
/* ------------------------------------------------------------------ */

function Faq() {
  const qs = [
    { q: 'Does it replace my gym software?', a: 'No. It reads your system and leaves it alone. Your team keeps working in it exactly as they do now; gymIQ tells them which member to open first.' },
    { q: 'Which systems does it work with?', a: `${SYSTEMS}. If your software can produce a memberships report and a sales report, gymIQ can read it. Hoddesdon runs on Glofox, so that connection is the most worn in.` },
    { q: 'Does it contact my members?', a: 'Not by default. The board tells your staff who to call and why. Automated retries of failed payments run inside your system’s own rules. Any messaging to members is switched on per club, by you, in writing.' },
    { q: 'What does it need from me?', a: 'A login for the club, ideally a read only staff account created for gymIQ. Optionally an open banking connection to the club account for reconciliation. And an hour on a call so the brief is written the way you think.' },
    { q: 'Will it work if my front desk is part time?', a: 'That is who it is built for. The board is capped at a list a small desk can clear in an hour, and the evening report tells you who cleared what. If nothing gets ticked, you will know by 22:00, not at month end.' },
    { q: 'Is the retention result real?', a: 'July at Hoddesdon was the lowest attrition month on record. August was higher because the club now clears members who have stopped paying from the roster every month, on purpose, and those show up as leavers. Both months are on the Hoddesdon page with the workings.' },
    { q: 'Who is behind it?', a: 'Paul Airey, who owns and runs énergie Fitness Hoddesdon, a 1,600 member club in Hertfordshire. gymIQ was built to run that club first. You are talking to the person who uses it every day.' },
  ]
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">Straight answers</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">The questions owners ask first.</h2>
      </div>
      <dl className="mt-12 grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
        {qs.map((item) => (
          <div key={item.q} className="border-t border-mist pt-5">
            <dt className="font-display text-lg font-bold text-ink">{item.q}</dt>
            <dd className="mt-2 text-[15px] leading-relaxed text-slate">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* AUDIT                                                              */
/* ------------------------------------------------------------------ */

function Audit() {
  return (
    <section id="audit" className="bg-paper-2">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">Not ready to connect?</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Start with an export.</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate">
            Download the memberships report from your gym software and drop it here. You get overdue by payment method, memberships ending unasked, members below current price, students past the age for their rate, and who is drifting. No login, no call.
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
    <section className="bg-moss text-paper">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <h2 className="max-w-3xl font-display text-4xl font-extrabold tracking-tight text-paper sm:text-5xl">
          See your own club&apos;s first brief.
        </h2>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-paper/80">
          A 20 minute call, a login, and your first morning brief lands within a week. If it finds nothing, you will have lost twenty minutes.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a href={WALKTHROUGH_HREF} className="inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3.5 text-base font-semibold text-ink transition hover:bg-paper">
            Book a walkthrough
            <ArrowRight className="h-4 w-4" />
          </a>
          <span className="text-sm text-paper/70">Or email {CONTACT}</span>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* FOOTER                                                             */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="border-t border-mist bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <Logo />
          gymIQ
        </Link>
        <p className="text-xs text-slate">© {new Date().getFullYear()} GymIQ AI Ltd · Made in Hertfordshire · {CONTACT}</p>
        <nav className="flex items-center gap-5 text-xs text-slate">
          <a href="#day" className="hover:text-ink">What it does</a>
          <Link href="/hoddesdon" className="hover:text-ink">Hoddesdon</Link>
          <a href="#pricing" className="hover:text-ink">Pricing</a>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/auth/login" className="hover:text-ink">Sign in</Link>
        </nav>
      </div>
    </footer>
  )
}
