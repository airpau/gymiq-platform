import Link from 'next/link'
import { LogoLink } from '@/components/brand/Logo'
import { ArrowRight, CalendarCheck } from 'lucide-react'
import BookForm from '@/components/marketing/BookForm'
import { CONTACT, PRICE_PER_CLUB, STRIPE_CHECKOUT_URL, CALENDLY_URL } from '@/lib/site'

export const metadata = {
  title: 'Book a walkthrough',
  description: 'Pick a 30 minute slot with the gym owner who built gymIQ. Bring your membership export and leave with your own numbers.',
  alternates: { canonical: '/book' },
}

const calendlyEmbed = `${CALENDLY_URL}?hide_gdpr_banner=1&hide_landing_page_details=1&background_color=ffffff&text_color=0f1614&primary_color=0f6e63`

export default async function BookPage({ searchParams }: { searchParams: Promise<{ intent?: string; paid?: string }> }) {
  const sp = await searchParams
  const intent = sp.intent === 'start' ? 'start' : 'walkthrough'
  const paid = sp.paid === '1'
  return (
    <div className="min-h-screen bg-paper text-ink antialiased">
      <header className="border-b border-mist/80 bg-paper/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <LogoLink />
          <nav className="flex items-center gap-5 text-sm text-slate">
            <Link href="/demo" className="hover:text-ink">Try the tools</Link>
            <Link href="/#pricing" className="hover:text-ink">Pricing</Link>
          </nav>
        </div>
      </header>

      {paid && (
        <div className="border-b border-moss/30 bg-moss-soft">
          <div className="mx-auto flex max-w-6xl items-start gap-3 px-5 py-4 text-sm text-ink sm:px-8">
            <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-moss" />
            <p><strong>Payment received, thank you.</strong> Your receipt is on its way from Stripe. Fill in the club details below (or pick a slot) and I will set up the connection and book your first review.</p>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-6xl gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">{intent === 'start' ? 'Start' : 'Book a walkthrough'}</p>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl">
            {intent === 'start' ? <>Start gymIQ at your club.</> : <>Thirty minutes with the person who runs it.</>}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate">
            {intent === 'start'
              ? `£${PRICE_PER_CLUB} a month per club, no setup fee, cancel with a month's notice, and the monthly business review is included. Pay by card now or tell me about the club and I will call to set up the connection and book your first review. If a month's review cannot show at least the fee in found money, that month is free.`
              : 'Pick a slot that suits you. No slides. You tell me about the club, I show you what gymIQ finds in a membership export like yours, and you leave with your own numbers whether or not you go ahead. I am a gym owner, not a salesperson.'}
          </p>
          <ul className="mt-8 space-y-3 text-[15px] text-ink">
            {(intent === 'start'
              ? ['A read only login to your gym software is all it needs', 'The brief is running within a week, tuned to how you think', 'First business review booked on the call']
              : ['Bring a membership export if you have one; I will read it live', 'Works with Glofox, ClubRight, Mindbody, PerfectGym and more', 'The invite lands in your calendar the moment you pick a slot']
            ).map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />{t}</li>
            ))}
          </ul>
          {intent === 'start' && STRIPE_CHECKOUT_URL && !paid && (
            <a href={STRIPE_CHECKOUT_URL} className="mt-8 inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3.5 text-base font-semibold text-ink transition hover:bg-moss hover:text-paper">
              Pay by card now, £{PRICE_PER_CLUB} a month
              <ArrowRight className="h-4 w-4" />
            </a>
          )}
          {intent === 'start' && (
            <p className="mt-6 text-sm text-slate">Want to talk first? <Link href="/book" className="text-moss underline-offset-2 hover:underline">Pick a 30 minute slot</Link>.</p>
          )}
          {intent === 'walkthrough' && (
            <p className="mt-6 text-sm text-slate">Rather not use the calendar? <a href={CALENDLY_URL} className="text-moss underline-offset-2 hover:underline" target="_blank" rel="noopener">Open it in a new tab</a>, leave your details in the form below, or email <a className="text-moss underline-offset-2 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
          )}
          {intent === 'start' && (
            <p className="mt-2 text-sm text-slate">Or email <a className="text-moss underline-offset-2 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
          )}
        </div>
        <div className="space-y-6">
          {intent === 'walkthrough' && (
            <div className="overflow-hidden rounded-3xl border border-mist bg-white shadow-sm">
              <iframe
                src={calendlyEmbed}
                title="Pick a time for your gymIQ walkthrough"
                className="h-[720px] w-full"
                loading="lazy"
              />
            </div>
          )}
          <div className="rounded-3xl border border-mist bg-white p-6 shadow-sm sm:p-8">
            {intent === 'walkthrough' && <p className="mb-5 font-mono text-[11px] uppercase tracking-wider text-slate">Or leave your details and I will call you</p>}
            <BookForm intent={intent} />
          </div>
        </div>
      </main>
    </div>
  )
}
