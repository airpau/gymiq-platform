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
  title: 'GymIQ — Predict gym churn. Save members. Grow revenue.',
  description:
    'AI churn prediction, cancel-save conversations, and instant lead follow-up that bolts on to Glofox, Mindbody, ClubRight, or any spreadsheet. Run a free 60-second audit on your member export.',
  metadataBase: new URL('https://gymiq.ai'),
  openGraph: {
    title: 'GymIQ — Predict gym churn. Save members. Grow revenue.',
    description:
      'The average independent gym is bleeding £2,494/month in revenue it doesn’t know about. Find yours in 60 seconds.',
    url: 'https://gymiq.ai',
    siteName: 'GymIQ',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GymIQ — Predict gym churn. Save members. Grow revenue.',
    description:
      'AI retention for independent gyms. Bolts on to your existing CRM. Free 60-second audit.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white text-zinc-900 antialiased">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
