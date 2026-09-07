import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { PostHogProvider } from '@/components/analytics/PostHogProvider'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'gymIQ. The morning brief that runs your gym.',
  description:
    'gymIQ reads your Glofox account and your bank feed, and puts what came in, who is leaving and what to do today on your phone by 06:00. Built by a gym owner, running live at énergie Fitness Hoddesdon.',
  metadataBase: new URL('https://www.gymiq.ai'),
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  keywords: ['gym management', 'Glofox', 'gym retention', 'failed payments gym', 'gym owner dashboard', 'gym cash forecast', 'énergie Fitness'],
  authors: [{ name: 'Paul Airey' }],
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
  openGraph: {
    title: 'gymIQ. The morning brief that runs your gym.',
    description:
      'Your gym’s numbers on your phone by 06:00, and a staff board your front desk can actually clear. Live at énergie Fitness Hoddesdon.',
    url: 'https://www.gymiq.ai',
    siteName: 'gymIQ',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'gymIQ. The morning brief that runs your gym.',
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
        'Reads a gym’s Glofox account and bank feed and delivers a written morning brief, a staff task board, payment retries and a cash forecast.',
      offers: { '@type': 'Offer', price: '395', priceCurrency: 'GBP', description: 'Per club, per month. No setup fee.' },
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
    <html lang="en-GB" className={inter.variable}>
      <body className="min-h-screen bg-white text-zinc-900 antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
