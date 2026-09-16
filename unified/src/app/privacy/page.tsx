import Link from 'next/link'
import CookieSettingsLink from '@/components/analytics/CookieSettingsLink'
import { COMPANY_NUMBER, CONTACT, LEGAL_NAME, REGISTERED_OFFICE } from '@/lib/site'

export const metadata = {
  title: 'Privacy policy',
  description: 'How gymIQ handles the data in a membership export, lead details, cookies, analytics and advertising measurement.',
  alternates: { canonical: '/privacy' },
}

const UPDATED = '16 September 2026'

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
        <p className="mt-2 text-sm text-slate">
          Last updated {UPDATED}. Controller: {LEGAL_NAME}, registered in England and Wales, company number {COMPANY_NUMBER}, registered office {REGISTERED_OFFICE}.
          Contact: <a href={`mailto:${CONTACT}`} className="text-moss underline-offset-2 hover:underline">{CONTACT}</a>.
        </p>

        <H>Who we are</H>
        <P>gymIQ is a trading name of {LEGAL_NAME}, a company registered in England and Wales (company number {COMPANY_NUMBER}). We provide reporting, task boards and payment follow up tooling to gyms, and a free membership file audit on this website. We are the data controller for the details you give us on this website, for enquiries, and for the cookies and measurement described below. For the member data inside a membership file you upload, and for a subscribing gym&apos;s connected systems, the gym is the controller and we act as its processor, on its instructions only; for subscribers a data processing agreement forms part of the subscription. We have not appointed a data protection officer; questions about this policy go to {CONTACT}.</P>

        <H>What we collect on this website</H>
        <P><strong>Your details.</strong> When you run the free audit or book a walkthrough we collect your name, gym name, work email, and optionally your mobile number, the software your gym uses, a member count band, a preferred call time and any note you add. If you type an email address into the audit form, we save what you have entered so far even if you do not finish, so we can follow up. We use these details to produce and send your report, to send you a private link to finish the audit, to contact you about it, and to offer a walkthrough. We may send one reminder email if you start the audit and do not finish it. Lawful basis: our legitimate interest in responding to a request you made. Any further marketing follow up relies on your consent, which you can withdraw at any time by replying to any email.</P>
        <P><strong>Where your visit came from.</strong> If the page you send a form from carries campaign tags in its address (for example utm_source=meta), we store those tags and the page address with your enquiry, so we know which campaign or post brought you. Lawful basis: our legitimate interest in knowing which of our marketing works. If you have accepted advertising cookies we also keep the tags from the first page you landed on, and the advertising click identifier, as described under Cookies below.</P>
        <P><strong>The membership file you upload.</strong> The file is read once in memory to produce the report and is not stored. The report itself is stored at a private, unguessable link so you can return to it, and it contains the member level lists needed to act on it (names, plan, payment method, dates, and where present an email or phone). Names and contact details are masked in the on screen report. We process this member data on your gym&apos;s behalf, as its processor, and only to produce the report you asked for; your gym is responsible for having a lawful basis to share it with us, usually its legitimate interest in managing its own memberships. We do not use member data from uploaded files for marketing, for advertising, for training models, or for any purpose other than producing your report.</P>
        <P><strong>Do you have to give us your details?</strong> No. There is no legal or contractual requirement to. Without an email address we cannot send you the report or the upload link, and without a phone number we cannot call you about a walkthrough.</P>
        <P><strong>Automated decisions.</strong> We do not make decisions about you by automated means that have legal or similarly significant effects. The audit report is produced automatically from your file, but what to do with it is your gym&apos;s decision.</P>
        <P><strong>Technical data.</strong> When you send a form we record your browser&apos;s user agent and the referring page. Our hosting provider processes your IP address to deliver the site.</P>

        <H id="cookies">Cookies and similar technologies</H>
        <P>When you first visit, we ask whether you accept analytics and advertising cookies. Nothing in those two groups is stored on your device, and no advertising tag loads, unless you say yes. You can change your choice at any time: <CookieSettingsLink className="font-semibold text-moss underline underline-offset-2" label="open cookie settings" />. There is also a Cookie settings link at the bottom of our pages.</P>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-mist text-xs uppercase tracking-wider text-slate">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Set by</th>
                <th className="py-2 pr-3 font-medium">Purpose</th>
                <th className="py-2 font-medium">Kept for</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <Tr c={['gymiq_consent', 'gymIQ', 'Strictly necessary. Remembers your cookie choice.', '6 months']} />
              <Tr c={['ph_* (cookie and local storage)', 'PostHog, for us', 'Analytics, only if you accept. An anonymous ID so we can see how visitors move through the site and which visits became enquiries.', 'Up to 1 year']} />
              <Tr c={['gymiq_attr', 'gymIQ', 'Advertising, only if you accept. The campaign tags and ad click identifier from the first page you landed on.', '90 days']} />
              <Tr c={['_fbp, _fbc', 'Meta, on our site', 'Advertising, only if you accept. Lets Meta measure which ads led to a visit or an enquiry.', '90 days']} />
              <Tr c={['_gcl_* and Google tag storage', 'Google, on our site', 'Advertising, only if you accept and only while we run Google ads. Measures which ads led to an enquiry.', 'Up to 90 days']} />
            </tbody>
          </table>
        </div>
        <P><strong>Analytics.</strong> We use PostHog, hosted in the EU, as our processor to understand how the site is used: pages viewed, clicks, and which steps of the audit and booking forms were completed. Our PostHog project is set to discard IP addresses, so PostHog does not store yours. If you accept analytics cookies, PostHog keeps an anonymous ID on your device and we link that ID to your enquiry by an internal reference only; your name, email and phone number are not sent to PostHog. If you have not chosen yet, PostHog records page views, clicks and form steps without storing anything on your device, so separate page loads are not linked together and nothing is linked to your enquiry. If you reject analytics cookies, PostHog does not run. If we switch on PostHog session replay, it only runs with analytics consent and hides what you type into forms. Lawful basis: consent for the stored ID and linking; our legitimate interest in understanding how the site is used otherwise.</P>
        <P><strong>Advertising measurement.</strong> We advertise on Meta (Facebook and Instagram) and may advertise on Google. If you accept advertising cookies, the Meta Pixel (and the Google tag, if we are running Google ads) loads on our pages and records page views and form steps. When you then send us a form, our server also tells Meta directly (the Meta Conversions API) that an enquiry or completed audit happened, sending your email address, phone number and first name in hashed (scrambled) form, together with your IP address, browser user agent, the page address and Meta&apos;s click and browser identifiers, so Meta can match the enquiry to the ad you saw. Meta Platforms Ireland Limited receives this data and uses it to measure and improve our ads; Meta also uses it for its own purposes, as its own privacy policy explains. If you do not accept advertising cookies, none of this is sent. Advertising tags never load on private pages, such as your report or the private link we email you, and we never send report links or the member data in your file to an advertising platform. Lawful basis: consent, which you can withdraw in cookie settings at any time; withdrawing does not affect what was sent before.</P>

        <H>How long we keep it</H>
        <P>Audit reports are kept for 12 months from creation and then deleted, unless the gym has subscribed, in which case the data is held under the subscription. Lead details, including where your visit came from, are kept for up to 24 months from last contact. Cookie lifetimes are listed above. You can ask us to delete a report or your details at any time.</P>

        <H>Who we share it with</H>
        <P><strong>Our processors</strong>, who act on our instructions under contract: Vercel (website hosting; our server functions run in the United States), Supabase (database, hosted in London), Resend (email delivery), PostHog (analytics, EU), and Telegram (delivers new enquiry alerts to us).</P>
        <P><strong>Services you choose to use.</strong> The booking calendar on our walkthrough page is provided by Calendly and only loads when you choose to show it; Calendly then sets its own cookies and handles the details you enter under its own privacy policy. Card payments are taken by Stripe on its own checkout page, under Stripe&apos;s privacy policy.</P>
        <P><strong>Advertising platforms</strong>, only if you accept advertising cookies: Meta Platforms Ireland Limited, and Google Ireland Limited while we run Google ads, as described above.</P>
        <P>We do not sell your data. Where a provider processes data outside the UK, we rely on UK adequacy regulations (including the UK extension to the EU-US Data Privacy Framework where the provider is certified) or the ICO&apos;s international data transfer agreement or addendum.</P>

        <H>Your rights</H>
        <P>Under UK GDPR you can ask for a copy of the data we hold about you, ask us to correct or delete it, object to processing based on our legitimate interests, ask us to restrict it, ask for the details you gave us in a portable format, and withdraw consent at any time (for cookies, through cookie settings; for marketing, by replying to any email). Email {CONTACT} and we will respond within one month. If you are a gym member and your gym uses gymIQ, please contact your gym first, as they are the controller of your membership data. You can complain to the Information Commissioner&apos;s Office at ico.org.uk.</P>

        <H>Security</H>
        <P>Data is encrypted in transit and at rest. Access to member data is limited to what is needed to run the service. Reports are reachable only by their private link and are excluded from search engines.</P>

        <H>Changes</H>
        <P>We will update this page when anything material changes and note the date at the top.</P>
      </main>
    </div>
  )
}

function H({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-10 scroll-mt-6 text-xl font-semibold tracking-tight text-ink">
      {children}
    </h2>
  )
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3">{children}</p>
}
function Tr({ c }: { c: [string, string, string, string] }) {
  return (
    <tr className="border-b border-mist/70">
      <td className="py-2.5 pr-3 font-mono text-[13px] text-ink">{c[0]}</td>
      <td className="py-2.5 pr-3">{c[1]}</td>
      <td className="py-2.5 pr-3">{c[2]}</td>
      <td className="py-2.5">{c[3]}</td>
    </tr>
  )
}
