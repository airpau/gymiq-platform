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
  title: 'gymIQ. The intelligence layer for your gym.',
  description:
    'gymIQ reads your gym management system and your bank feed, and puts what came in, who is leaving and what to do today on your phone by 06:00. Built by a gym owner, running live at énergie Fitness Hoddesdon.',
  metadataBase: new URL('https://www.gymiq.ai'),
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  keywords: ['gym management', 'Glofox', 'ClubRight', 'Mindbody', 'PerfectGym', 'gym retention', 'failed payments gym', 'gym owner dashboard', 'gym cash forecast', 'énergie Fitness'],
  authors: [{ name: 'Paul Airey' }],
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
  openGraph: {
    title: 'gymIQ. The intelligence layer for your gym.',
    description:
      'Your gym’s numbers on your phone by 06:00, and a staff board your front desk can actually clear. Live at énergie Fitness Hoddesdon.',
    url: 'https://www.gymiq.ai',
    siteName: 'gymIQ',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'gymIQ. The intelligence layer for your gym.',
    description:
      'The morning brief that runs your gym. Built by a gym owner, live at énergie Fitness Hoddesdon.',
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
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://www.gymiq.ai',
      description:
        'The intelligence layer for gyms: reads the club’s management system and bank feed and delivers a written morning brief, a staff task board, payment retries, price and age audits, a cash forecast and a monthly business review. Works with Glofox, ClubRight, Mindbody, PerfectGym and others.',
      offers: { '@type': 'Offer', price: '495', priceCurrency: 'GBP', description: 'Per club, per month, monthly business review included. No setup fee.' },
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
