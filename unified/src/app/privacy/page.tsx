import Link from 'next/link'

export const metadata = {
  title: 'Privacy policy',
  description: 'How gymIQ handles the data in a membership export, lead details, and analytics.',
  alternates: { canonical: '/privacy' },
}

const UPDATED = '7 September 2026'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-ink antialiased">
      <header className="border-b border-mist">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">gymIQ</Link>
          <Link href="/terms" className="text-sm text-slate hover:text-ink">Terms</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-12 text-[15px] leading-relaxed text-ink-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-moss">Privacy</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Privacy policy</h1>
        <p className="mt-2 text-sm text-slate">Last updated {UPDATED}. Controller: GymIQ AI Ltd, United Kingdom. Contact: paul@gymiq.ai.</p>

        <H>Who we are</H>
        <P>gymIQ is operated by GymIQ AI Ltd, a UK company. We provide reporting, task boards and payment follow up tooling to gyms, and a free membership file audit on this website. For the free audit and for enquiries we are the data controller. When a gym subscribes to gymIQ and connects its own systems, we process its members&apos; data on the gym&apos;s instructions and the gym is the controller; a data processing agreement forms part of the subscription.</P>

        <H>What we collect on this website</H>
        <P><strong>Your details.</strong> When you run the free audit or book a walkthrough we collect your name, gym name, work email, and optionally your mobile number, the software your gym uses and a member count band. We use these to produce and send your report, to contact you about it, and to offer a walkthrough. Lawful basis: our legitimate interest in responding to a request you made, and consent for marketing follow up, which you can withdraw at any time by replying to any email.</P>
        <P><strong>The membership file you upload.</strong> The file is read once in memory to produce the report and is not stored. The report itself is stored at a private, unguessable link so you can return to it, and it contains the member level lists needed to act on it (names, plan, payment method, dates, and where present an email or phone). Names and contact details are masked in the on screen report. Lawful basis: your legitimate interest, as the gym operator, in analysing your own membership data, and our contract with you to provide the report. We do not use member data from uploaded files for marketing, for training models, or for any purpose other than producing your report.</P>
        <P><strong>Analytics.</strong> We use PostHog, hosted in the EU, to understand how the site is used. It records pages viewed and interactions, with IP addresses truncated. We do not use advertising cookies without asking first.</P>

        <H>How long we keep it</H>
        <P>Audit reports are kept for 12 months from creation and then deleted, unless the gym has subscribed, in which case the data is held under the subscription. Lead details are kept for up to 24 months from last contact. You can ask us to delete a report or your details at any time.</P>

        <H>Who we share it with</H>
        <P>Our hosting and infrastructure providers: Vercel (hosting), Supabase (database, EU region), Resend (email delivery), PostHog (analytics, EU). Each acts as our processor under contract. We do not sell data and we do not share it with advertisers.</P>

        <H>Your rights</H>
        <P>Under UK GDPR you can ask for a copy of the data we hold about you, ask us to correct or delete it, object to processing, or ask us to restrict it. Email paul@gymiq.ai and we will respond within one month. If you are a gym member and your gym uses gymIQ, please contact your gym first, as they are the controller of your membership data. You can complain to the Information Commissioner&apos;s Office at ico.org.uk.</P>

        <H>Security</H>
        <P>Data is encrypted in transit and at rest. Access to member data is limited to what is needed to run the service. Reports are reachable only by their private link and are excluded from search engines.</P>

        <H>Changes</H>
        <P>We will update this page when anything material changes and note the date at the top.</P>
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
