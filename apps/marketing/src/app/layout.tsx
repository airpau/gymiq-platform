import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GymIQ — AI-Powered Gym Revenue Protection',
  description: 'Stop losing members. GymIQ predicts churn, saves cancellations, and converts more leads using AI. Free revenue audit for your gym.',
  keywords: 'gym management, AI, churn prediction, revenue protection, member retention, lead conversion',
  openGraph: {
    title: 'GymIQ — AI-Powered Gym Revenue Protection',
    description: 'Stop losing members. GymIQ predicts churn, saves cancellations, and converts more leads using AI. Free revenue audit for your gym.',
    url: 'https://gymiq.ai',
    siteName: 'GymIQ',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'en_GB',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GymIQ — AI-Powered Gym Revenue Protection',
    description: 'Stop losing members. GymIQ predicts churn, saves cancellations, and converts more leads using AI. Free revenue audit for your gym.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon-180x180.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  )
}