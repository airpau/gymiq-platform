import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import BookForm from '@/components/marketing/BookForm'
import { CONTACT, PRICE_PER_CLUB, FOUNDING_PRICE, FOUNDING_SLOTS, STRIPE_CHECKOUT_URL } from '@/lib/site'

export const metadata = {
  title: 'Book a walkthrough',
  description: 'A 20 minute call with the gym owner who built gymIQ. Bring your membership export and leave with your own numbers.',
  alternates: { canonical: '/book' },
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const sp = await searchParams
  const intent = sp.intent === 'start' ? 'start' : 'walkthrough'
  return (
    <div className="min-h-screen bg-paper text-ink antialiased">
      <header className="border-b border-mist/80 bg-paper/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-ink">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-moss font-mono text-[11px] font-semibold text-lime">IQ</span>
            gymIQ
          </Link>
          <nav className="flex items-center gap-5 text-sm text-slate">
            <Link href="/demo" className="hover:text-ink">Try the tools</Link>
            <Link href="/#pricing" className="hover:text-ink">Pricing</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">{intent === 'start' ? 'Start' : 'Book a walkthrough'}</p>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl">
            {intent === 'start' ? <>Start gymIQ at your club.</> : <>Twenty minutes with the person who runs it.</>}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate">
            {intent === 'start'
              ? `£${FOUNDING_PRICE} a month per club as one of the first ${FOUNDING_SLOTS} founding clubs (list price £${PRICE_PER_CLUB}, your rate fixed for twelve months), no setup fee, cancel with a month's notice, and the monthly business review is included. Tell me about the club and I will call to set up the connection and book your first review. If a month's review cannot show at least the fee in found money, that month is free.`
              : 'No slides. You tell me about the club, I show you what gymIQ finds in a membership export like yours, and you leave with your own numbers whether or not you go ahead. I am a gym owner, not a salesperson.'}
          </p>
          <ul className="mt-8 space-y-3 text-[15px] text-ink">
            {(intent === 'start'
              ? ['A read only login to your gym software is all it needs', 'The brief is running within a week, tuned to how you think', 'First business review booked on the call']
              : ['Bring a membership export if you have one; I will read it live', 'Works with Glofox, ClubRight, Mindbody, PerfectGym and more', 'Every submission reaches my phone, so you will hear back the same day']
            ).map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />{t}</li>
            ))}
          </ul>
          {intent === 'start' && STRIPE_CHECKOUT_URL && (
            <a href={STRIPE_CHECKOUT_URL} className="mt-8 inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3.5 text-base font-semibold text-ink transition hover:bg-moss hover:text-paper">
              Pay by card now, £{FOUNDING_PRICE} a month
              <ArrowRight className="h-4 w-4" />
            </a>
          )}
          <p className="mt-8 text-sm text-slate">Or email <a className="text-moss underline-offset-2 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
        </div>
        <div className="rounded-3xl border border-mist bg-white p-6 shadow-sm sm:p-8">
          <BookForm intent={intent} />
        </div>
      </main>
    </div>
  )
}
