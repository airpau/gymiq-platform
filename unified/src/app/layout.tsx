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
  metadataBase: new URL('https://gymiq.ai'),
  openGraph: {
    title: 'gymIQ. The morning brief that runs your gym.',
    description:
      'Your gym’s numbers on your phone by 06:00, and a staff board your front desk can actually clear. Live at énergie Fitness Hoddesdon.',
    url: 'https://gymiq.ai',
    siteName: 'GymIQ',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'gymIQ. The morning brief that runs your gym.',
    description:
      'The morning brief that runs your gym. Built by a gym owner, live at énergie Fitness Hoddesdon.',
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
