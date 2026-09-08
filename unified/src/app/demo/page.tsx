import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { DemoFrame } from '@/components/demo/DemoFrame'
import LeadEngineDemo from '@/components/demo/LeadEngineDemo'
import BriefDemo from '@/components/demo/BriefDemo'
import BoardDemo from '@/components/demo/BoardDemo'
import RetentionDemo from '@/components/demo/RetentionDemo'
import SalesPulseDemo from '@/components/demo/SalesPulseDemo'
import RetryDemo from '@/components/demo/RetryDemo'
import CashDemo from '@/components/demo/CashDemo'
import AlertsDemo from '@/components/demo/AlertsDemo'
import MemberChatDemo from '@/components/demo/MemberChatDemo'
import { DemoStoreProvider } from '@/components/demo/DemoStore'
import { WALKTHROUGH_HREF, FOUNDING_PRICE, FOUNDING_SLOTS } from '@/lib/site'

export const metadata = {
  title: 'Try every tool: live AI gym management demo',
  description:
    'Click through every tool in gymIQ: the lead assistant, the morning brief you can talk to, the staff board, the retention radar, the sales pulse, the payment routine, the Friday forecast, the alerts by role and channel, and the member assistant.',
  alternates: { canonical: '/demo' },
}

const TOOLS = [
  { id: 'leads', label: 'Lead assistant' },
  { id: 'brief', label: 'Morning brief' },
  { id: 'board', label: 'Staff board' },
  { id: 'retention', label: 'Retention radar' },
  { id: 'pulse', label: 'Sales pulse' },
  { id: 'retries', label: 'Payment routine' },
  { id: 'cash', label: 'Friday forecast' },
  { id: 'alerts', label: 'Alerts by role' },
  { id: 'members', label: 'Member assistant' },
]

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-paper text-ink antialiased">
      <header className="sticky top-0 z-30 border-b border-mist/80 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-ink">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-moss font-mono text-[11px] font-semibold text-lime">IQ</span>
            gymIQ
          </Link>
          <nav className="hidden gap-4 overflow-x-auto text-xs text-slate lg:flex">
            {TOOLS.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="whitespace-nowrap hover:text-ink">{t.label}</a>
            ))}
          </nav>
          <a href={WALKTHROUGH_HREF} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper transition hover:bg-ink-2">
            Book a walkthrough
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-6 pt-14 sm:px-8 sm:pt-20">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">Try it</p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl font-extrabold leading-[0.98] tracking-tight sm:text-6xl">Every tool, working. Click anything.</h1>
        <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate">
          These are the tools that run a 1,600 member club every day, with a fictional club&apos;s numbers so you can press everything. Nothing here is a video; it all responds. On a phone, turn it sideways for the boards.
        </p>
        <div className="mt-8 flex flex-wrap gap-2 lg:hidden">
          {TOOLS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className="rounded-full border border-mist bg-white px-3 py-1.5 text-sm text-ink">{t.label}</a>
          ))}
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
       <DemoStoreProvider>
        <DemoFrame
          id="leads"
          eyebrow="Lead assistant"
          title="Every enquiry answered in seconds, booked when the lead says yes, and remembered."
          blurb="A lead comes in from the website, a trial form or an abandoned online join. The assistant sends the first message within seconds and answers questions honestly from the club's own facts. When the person names a day and time it checks the club's real availability, offers the slot and asks for a yes before anything is written down. Say &quot;can I do 8am instead&quot; and it reads the stored booking, checks the new time and moves it once you confirm; the old slot is released and the team told. It remembers what you asked, what you told it, and every visit outcome, so it never books twice or contradicts what was agreed. It never pretends to be a person, hands over when someone is unhappy, and honours STOP."
          tries={['Create a lead, then reply "tomorrow morning" and "yes"', 'Now reply "can I do 8am instead?" then "yes"', 'Try "tomorrow at 6pm" (that slot is full) or "5am" (closed)', 'Reply "I need to cancel, I hurt my knee" then "yes"', 'After booking, mark No show, then reply "sunday morning"']}
        >
          <LeadEngineDemo />
        </DemoFrame>

        <DemoFrame
          id="brief"
          eyebrow="Morning brief"
          title="The club, in writing, at 06:00. And it answers back."
          blurb="Four runs a day. The morning brief opens with a verdict and the three things that matter; the 16:00 run warns about anything the board has not cleared before the cut off; the evening close says what changed and whether anything needs you tonight. Reply to any of them in plain English and get an answer from the same system that wrote it."
          tries={['Switch between the 06:00, 16:00 and 22:00 runs', 'Ask "who are the 47?"', 'Ask "what will Friday pay?"', 'Ask "who did the board yesterday?"']}
        >
          <BriefDemo />
        </DemoFrame>

        <DemoFrame
          id="board"
          eyebrow="Staff board"
          title="A task list that rewrites itself every morning."
          blurb="Generated from the live roster before the club opens: the top 12 overdue members to call, the top 6 billing faults, every membership ending this week, the drifting members, the tours to confirm, and the standing jobs. Capped so a small desk can finish it. Assign any task to a named person or leave it for whoever is on shift. Each person signs in with a PIN, every tick is recorded to them, a tick sticks for three days, and the owner gets the count by name at 22:00. The retention radar and the payment routine below write straight onto it. Works alongside any CRM, or on its own."
          tries={['Switch who you are and tick a few money hour tasks', 'Assign a task to Rachel, then switch to "Mine"', 'Watch the queue counter and the 22:00 report change', 'Mark someone called on the retention radar below and see it tick here']}
        >
          <BoardDemo />
        </DemoFrame>

        <DemoFrame
          id="retention"
          eyebrow="Retention radar"
          title="Who is drifting, measured against their own habit."
          blurb="A flat 30 day rule calls a twice a year member dormant and misses a daily member who has been away three weeks. gymIQ measures each member against their own pattern: how far they have drifted from their usual gap. The drifting window gets a check in, the long tenured low users are left in peace, and the calls land on the staff board above, so marking a call here ticks it there."
          tries={['Switch between the habit rule and the flat 30 day rule', 'Find Dev and Harry, then Ben, Emma and Jack', 'Press "Called, noted" and scroll up to the board']}
        >
          <RetentionDemo />
        </DemoFrame>

        <DemoFrame
          id="pulse"
          eyebrow="Sales pulse"
          title="Joins today against what today should do."
          blurb="Every hour, joins so far are compared with the club's own expected pace for that day of the week and month, built from three years of its own sales. Nothing fires while the day is on pace. When a weekday is running under half of expected for the third day, the owner hears about it at lunchtime, not at month end. This is how a failing price test was caught in five days."
          tries={['Play a good Monday', 'Play a bad price test and watch the alert fire']}
        >
          <SalesPulseDemo />
        </DemoFrame>

        <DemoFrame
          id="retries"
          eyebrow="Payment routine"
          title="Failed payments, decided the way a careful person would."
          blurb="Three times a week, every failed payment is read: temporary shortfall or dead card, how many attempts, how long since the last, how many months, whether the member still trains. Temporary failures get one retry, never within two days of the last, never a sixth attempt. Everything else becomes a named action on the staff board: new card, mandate to re set, cancellation for a human to decide. Cash payers are never chased by message. Press Run and watch each step, then the bank's answer for every retry."
          tries={['Run the routine and watch the log', 'Tick "It is Friday" and run again: Mercedes is retried', 'Find Sam, whose card was replaced', 'Scroll up: the routed ones are on the board']}
        >
          <RetryDemo />
        </DemoFrame>

        <DemoFrame
          id="cash"
          eyebrow="Friday forecast"
          title="What lands on Friday, before it lands. In testing."
          blurb="Whatever your processor's schedule, gymIQ learns it from your statements and forecasts each credit with a range, then on Wednesday afternoon warns what has not been retried in time to make it. At the Hertfordshire club the model has matched the bank within 0.4% over six months. This feature is in testing: it is switched on for your club once it has matched your first month of credits. Automatic reconciliation against a live bank feed is coming soon."
          tries={['Move the arrears slider and watch Friday move', 'Drop the pending clearance to 85%']}
        >
          <CashDemo />
        </DemoFrame>

        <DemoFrame
          id="alerts"
          eyebrow="Alerts by role"
          title="Reaches you where you are. Shows each person only their part."
          blurb="The owner gets money. The manager gets performance and the board. The desk gets today's names. Every message has the same shape: a one line verdict, the numbers behind it with a label each, then what to do. Delivered on WhatsApp, Telegram, email or SMS, and you can reply to it. Nobody logs in anywhere to find out what happened."
          tries={['Switch role and channel', 'Compare the 06:00 brief for the owner and the desk', 'Reply "who are the 47?" or, as the desk, "done"']}
        >
          <AlertsDemo />
        </DemoFrame>

        <DemoFrame
          id="members"
          eyebrow="Member assistant"
          title="Members ask the club anything. It answers from your facts, and knows when to hand over."
          blurb="On the website, in WhatsApp and in the app: hours, classes, prices, freezes, parking, PT, cancellations. It answers from a fact sheet you control, takes the actions you allow (a freeze, a class booking, a trial), logs every question so you can see what members keep asking, and passes anything it is unsure about, and every cancellation or complaint, to a person with the thread attached."
          tries={['Ask "what time do you open on Sunday?"', 'Ask to freeze for a month', 'Say "I want to cancel" and watch it reach a person', 'Ask something it cannot know']}
        >
          <MemberChatDemo />
        </DemoFrame>
       </DemoStoreProvider>
      </main>

      <section className="mt-16 bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <h2 className="max-w-3xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">All of it, on your club&apos;s real numbers, within a week.</h2>
          <p className="mt-5 max-w-xl text-lg text-paper/80">£{FOUNDING_PRICE} a month per club for the first {FOUNDING_SLOTS} clubs, monthly business review included. If a month&apos;s review cannot show at least the fee in found money, that month is free.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href={WALKTHROUGH_HREF} className="inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3.5 text-base font-semibold text-ink transition hover:bg-paper">
              Book a 30 minute walkthrough
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link href="/#audit" className="text-base font-semibold text-paper underline-offset-4 hover:underline">Or start with the free audit</Link>
          </div>
        </div>
      </section>
      <footer className="border-t border-mist bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 text-xs text-slate sm:flex-row sm:items-center sm:px-8">
          <span>© {new Date().getFullYear()} GymIQ AI Ltd · demo club data is fictional</span>
          <nav className="flex gap-5">
            <Link href="/ai-gym-management-software" className="hover:text-ink">AI for gym owners</Link>
            <Link href="/impact" className="hover:text-ink">What it made</Link>
            <Link href="/case-study" className="hover:text-ink">Case study</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
