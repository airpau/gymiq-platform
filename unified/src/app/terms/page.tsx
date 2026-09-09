import Link from 'next/link'

export const metadata = {
  title: 'Terms',
  description: 'Terms for the free audit and the gymIQ subscription.',
  alternates: { canonical: '/terms' },
}

const UPDATED = '7 September 2026'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-ink antialiased">
      <header className="border-b border-mist">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">gymIQ</Link>
          <Link href="/privacy" className="text-sm text-slate hover:text-ink">Privacy</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-12 text-[15px] leading-relaxed text-ink-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-moss">Terms</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Terms of service</h1>
        <p className="mt-2 text-sm text-slate">Last updated {UPDATED}. GymIQ AI Ltd, United Kingdom.</p>

        <H>The free audit</H>
        <P>The free membership file audit is provided as is, for the gym operator who uploads the file, to help them understand their own membership data. Figures are computed from the file you provide and depend on which columns it contains; estimated recoveries apply rates observed at a live club and are not a guarantee. You confirm you are entitled to process the data in the file. We may contact you about the report and about gymIQ; you can opt out at any time.</P>

        <H>The subscription</H>
        <P>gymIQ is sold per club at a set monthly fee, £295 a month excluding VAT, with no setup fee and no usage charges, and including a monthly business review call. Where a month&apos;s review cannot show at least the month&apos;s fee in money found, recovered or saved, that month&apos;s fee is waived. The fee is billed monthly in advance. Either side can end the subscription with one month&apos;s written notice. We provide the morning brief, the staff task board, the failed payment routine, the audits and the cash forecast described on the website, using read only access to the club&apos;s gym management system. A bank feed connection through a regulated open banking provider will be offered as an optional addition once it is available; it is not part of the service until then.</P>

        <H>What we need from you</H>
        <P>A login to your gym management system with the access needed to read reports, ideally a dedicated read only user; and prompt notice of anything that changes how the club operates (pricing, payout arrangements, staff). Staff actions taken from the board remain the club&apos;s decisions.</P>

        <H>Payment routines</H>
        <P>Where gymIQ retries failed payments it does so inside the rules of your gym management system and payment provider, with limits designed to avoid repeated attempts on a card. Messages to members are only sent where the club has switched that on in writing. The club remains responsible for its member communications and for complying with payment scheme rules.</P>

        <H>Data</H>
        <P>Member data belongs to the club. We process it only to provide the service, under our <Link href="/privacy" className="text-moss hover:text-moss">privacy policy</Link> and a data processing agreement. On termination we delete the club&apos;s data within 30 days unless the law requires otherwise.</P>

        <H>Liability</H>
        <P>gymIQ provides information and tooling; it does not run the club. We are not liable for decisions taken on the basis of the brief, for losses arising from data supplied by third party systems, or for indirect or consequential loss. Our total liability in any 12 month period is limited to the fees paid in that period. Nothing here limits liability that cannot be limited by law.</P>

        <H>Governing law</H>
        <P>These terms are governed by the law of England and Wales.</P>

        <p className="mt-10 text-xs text-slate">Questions: paul@gymiq.ai</p>
      </main>
    </div>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-xl font-semibold tracking-tight text-ink">{children}</h2>
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3">{children}</p>
}
