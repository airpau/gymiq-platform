import Link from 'next/link'
import { LogoLink } from '@/components/brand/Logo'
import { ArrowRight } from 'lucide-react'
import { CONTACT, FOUNDING_PRICE, FOUNDING_SLOTS, PRICE_PER_CLUB, SYSTEMS, WALKTHROUGH_HREF, START_HREF } from '@/lib/site'
import { FAQ, faqJsonLd } from '@/lib/faq'

export const metadata = {
  title: 'AI gym management software for gym owners',
  description:
    'What AI gym management software should actually do for a gym owner: read the software you already have, tell your staff who to call, retry failed payments properly, catch drifting members before they cancel, answer leads in seconds, and put the numbers on your phone by 06:00. gymIQ does this, live at a UK club, from £' + FOUNDING_PRICE + ' a month.',
  alternates: { canonical: '/ai-gym-management-software' },
}

const jobs = [
  { h: 'Read the numbers every morning, so you do not have to', p: 'A written brief at 06:00: what came in, who joined and who left, the failure rate by payment method, the Friday forecast, and the three things that matter today. Reply to it in plain English and it answers from the same data.', href: '/demo#brief' },
  { h: 'Tell the front desk exactly who to call', p: 'A task board generated from the live roster before the club opens: the top overdue members to ring, billing faults to fix, memberships ending this week, drifting members to check in with, tours to confirm. Capped so a part time desk can finish it, assigned by name, ticked on a phone.', href: '/demo#board' },
  { h: 'Catch members who are drifting, against their own habit', p: 'A flat 30 day rule calls a twice a year member dormant and misses a daily member who has been away three weeks. gymIQ measures each member against their usual gap between visits and puts the right names on the board.', href: '/demo#retention' },
  { h: 'Handle failed payments the way a careful person would', p: 'One retry for a temporary shortfall, never within two days of the last, never a sixth attempt on a card. Declined cards get a payment link, dead mandates get a human decision, cash payers are never messaged. At the Hertfordshire club this took the failed book from about 10% to 3.6%.', href: '/demo#retries' },
  { h: 'Answer every lead in seconds and book the trial', p: 'Website, trial form or abandoned join: the lead assistant replies within seconds, answers questions from the club’s own facts, checks real availability, confirms the slot, moves it when asked, and remembers everything agreed.', href: '/demo#leads' },
  { h: 'Answer members’ questions without a person', p: 'Hours, classes, prices, freezes, parking, PT. The member assistant answers from a fact sheet you control and hands cancellations, complaints and anything it is unsure about to a person, with the thread attached.', href: '/demo#members' },
  { h: 'Find the money already sitting in your membership file', p: 'Students past their birthday still on the under 19 rate. Standard rate members paying less than today’s joiner. Active members with no next payment scheduled. A free audit reads your export and lists them by name with a recommended action.', href: '/#audit' },
  { h: 'Tell you what Friday will pay before it lands', p: 'Whatever your processor’s schedule, gymIQ learns it from your statements, forecasts each credit with a range, and on Wednesday afternoon warns what has not been retried in time to make it. In testing now.', href: '/demo#cash' },
]

const who = [
  ['Independent gyms', 'One club, an owner who also works the floor, a part time desk. The brief replaces the analyst you cannot afford and the board replaces the list you never get round to writing.'],
  ['Franchise clubs', 'Built inside an énergie Fitness club. Works alongside the franchisor’s system and reporting; gymIQ reads, it does not replace.'],
  ['Boutique studios and health clubs', 'Class heavy clubs get the same retention radar and lead assistant; multi site operators get one brief per club and one for the group.'],
  ['Personal trainers with a membership book', 'If you bill monthly and have more than a few dozen clients, failed payments and drift are your problem too. Same tools, smaller list.'],
]

export default function AiGymManagementSoftwarePage() {
  return (
    <div className="min-h-screen bg-paper text-ink antialiased">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <header className="border-b border-mist/80 bg-paper/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <LogoLink />
          <nav className="flex items-center gap-5 text-sm text-slate">
            <Link href="/demo" className="hover:text-ink">Try the tools</Link>
            <Link href="/case-study" className="hover:text-ink">Case study</Link>
            <a href={WALKTHROUGH_HREF} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink-2">Book a walkthrough <ArrowRight className="h-3.5 w-3.5" /></a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">AI for gym owners</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-extrabold leading-[0.98] tracking-tight sm:text-6xl">AI gym management software, for the owner who has no analyst.</h1>
          <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate">
            Most gym software stores your members and takes their money. Almost none of it reads the numbers every morning and tells your staff what to do about them. That is the job gymIQ does, on top of {SYSTEMS}, at an énergie Fitness club in Hertfordshire every day.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/demo" className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-base font-semibold text-paper hover:bg-ink-2">Try every tool live <ArrowRight className="h-4 w-4" /></Link>
            <a href={WALKTHROUGH_HREF} className="text-base font-semibold text-moss underline-offset-4 hover:underline">Book a 30 minute walkthrough</a>
          </div>
        </section>

        <section className="bg-paper-2">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="max-w-3xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">What AI should actually do in a gym</h2>
            <p className="mt-4 max-w-2xl text-lg text-slate">Not a chatbot bolted onto a dashboard. Eight jobs a good operations manager would do if you had one, done every day, with the workings shown.</p>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {jobs.map((j) => (
                <Link key={j.h} href={j.href} className="group rounded-2xl border border-mist bg-white p-6 transition hover:border-moss">
                  <h3 className="font-display text-xl font-bold text-ink">{j.h}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate">{j.p}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-moss">See it work <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="max-w-3xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">It is not another gym software. It reads the one you have.</h2>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <p className="text-lg leading-relaxed text-slate">Glofox, ClubRight, Mindbody, PerfectGym, GymMaster, Xplor, TeamUp: they are systems of record. They hold the members, the plans, the payments. What they do not do is read themselves each morning and tell a part time front desk which four members to ring before 10:30. gymIQ needs a read only login and produces the brief, the board, the retries and the alerts from what is already there. Nothing is migrated, nobody retrains.</p>
            <div className="rounded-2xl border border-mist bg-white p-6">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Proof, not promises</p>
              <ul className="mt-3 space-y-3 text-[15px] text-ink">
                <li>Failed book from about 10% to 3.6% at the Hertfordshire club.</li>
                <li>47 students found on the under 19 rate in one export: £970 a month.</li>
                <li>A failing price test caught in five days by the sales pulse.</li>
                <li>Lowest attrition month on record in July.</li>
              </ul>
              <Link href="/case-study" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-moss">Read the case study <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </section>

        <section className="bg-ink text-paper">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="max-w-3xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Who it is for</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {who.map(([h, p]) => (
                <div key={h} className="rounded-2xl border border-ink-3 p-6">
                  <h3 className="font-display text-lg font-bold text-lime">{h}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-paper/90">{p}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-4 rounded-2xl bg-ink-2 p-6">
              <div className="flex-1">
                <p className="font-display text-2xl font-bold">£{FOUNDING_PRICE} a month per club for the first {FOUNDING_SLOTS} clubs.</p>
                <p className="mt-1 text-paper/85">Fixed for twelve months, list £{PRICE_PER_CLUB}. No setup fee, monthly business review included. If a month’s review cannot show at least the fee in found money, that month is free.</p>
              </div>
              <a href={START_HREF} className="inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3.5 text-base font-semibold text-ink hover:bg-paper">Start at £{FOUNDING_PRICE} a month <ArrowRight className="h-4 w-4" /></a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Questions gym owners ask about AI</h2>
          <dl className="mt-10 grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q} className="border-t border-mist pt-5">
                <dt className="font-display text-lg font-bold text-ink">{f.q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-slate">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 text-sm text-slate">Anything else? Email <a href={`mailto:${CONTACT}`} className="text-moss underline-offset-2 hover:underline">{CONTACT}</a>. You get the owner, not a sales team.</p>
        </section>
      </main>

      <footer className="border-t border-mist bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 text-xs text-slate sm:flex-row sm:items-center sm:px-8">
          <span>© {new Date().getFullYear()} GymIQ AI Ltd</span>
          <nav className="flex gap-5">
            <Link href="/demo" className="hover:text-ink">Try the tools</Link>
            <Link href="/impact" className="hover:text-ink">What it made</Link>
            <Link href="/case-study" className="hover:text-ink">Case study</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
