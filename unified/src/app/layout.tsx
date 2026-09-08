import type { Metadata } from 'next'
import { Bricolage_Grotesque, Source_Sans_3, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { PostHogProvider } from '@/components/analytics/PostHogProvider'
import AdTracking from '@/components/analytics/AdTracking'

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['500', '600', '700', '800'],
})
const body = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
})
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: { default: 'gymIQ | AI gym management software for gym owners', template: '%s | gymIQ' },
  description:
    'AI for gym owners. gymIQ reads the gym software you already use (Glofox, ClubRight, Mindbody, PerfectGym and more) and puts what came in, who is leaving, which payments to retry and what your staff should do today on your phone by 06:00. Built by a UK gym owner, live at an énergie Fitness club in Hertfordshire.',
  metadataBase: new URL('https://www.gymiq.ai'),
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  keywords: ['AI gym management software', 'AI for gym owners', 'gym management AI', 'gym business intelligence', 'gym retention software', 'failed payments gym', 'gym owner dashboard', 'gym cash forecast', 'gym lead follow up', 'Glofox', 'ClubRight', 'Mindbody', 'PerfectGym', 'énergie Fitness'],
  authors: [{ name: 'Paul Airey' }],
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
  openGraph: {
    title: 'gymIQ | AI gym management software for gym owners',
    description:
      'Your gym’s numbers on your phone by 06:00, and a staff board your front desk can actually clear. Works with the gym software you already use. Live at an énergie Fitness club in Hertfordshire.',
    url: 'https://www.gymiq.ai',
    siteName: 'gymIQ',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'gymIQ | AI gym management software for gym owners',
    description:
      'The morning brief that runs your gym. Built by a gym owner, live at an énergie Fitness club in Hertfordshire.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://www.gymiq.ai/#org',
      name: 'gymIQ',
      legalName: 'GymIQ AI Ltd',
      url: 'https://www.gymiq.ai',
      email: 'paul@gymiq.ai',
      founder: { '@type': 'Person', name: 'Paul Airey' },
      areaServed: 'GB',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'gymIQ',
      alternateName: 'gymIQ AI gym management software',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Gym management software',
      operatingSystem: 'Web',
      url: 'https://www.gymiq.ai',
      description:
        'AI gym management software for gym owners: reads the club’s existing management system and delivers a written morning brief, a staff task board, a retention radar, a failed payment routine, a lead assistant, a member assistant, price and age audits, a cash forecast and a monthly business review. Works with Glofox, ClubRight, Mindbody, PerfectGym and others.',
      featureList: ['Morning brief by 06:00', 'Staff task board with assignment', 'Retention radar measured against each member’s own habit', 'Failed payment routine', 'Lead assistant that books trials', 'Member assistant chatbot', 'Sales pulse alerts', 'Friday cash forecast', 'Monthly business review'],
      audience: { '@type': 'BusinessAudience', audienceType: 'Gym owners, health club operators, boutique studios, personal trainers' },
      offers: { '@type': 'Offer', price: '295', priceCurrency: 'GBP', description: 'Per club, per month, monthly business review included. No setup fee.' },
      provider: { '@id': 'https://www.gymiq.ai/#org' },
    },
    {
      '@type': 'WebSite',
      url: 'https://www.gymiq.ai',
      name: 'gymIQ',
      inLanguage: 'en-GB',
      publisher: { '@id': 'https://www.gymiq.ai/#org' },
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <AdTracking />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
