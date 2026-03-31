import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GymIQ AI — The Intelligent Gym CRM',
  description: 'AI-powered gym CRM and retention platform. Predict churn, save cancellations, convert leads 3x faster.',
  metadataBase: new URL('https://gymiq.ai'),
  openGraph: {
    title: 'GymIQ AI — The Intelligent Gym CRM',
    description: 'Stop losing members. AI predicts who is about to leave and saves them automatically.',
    url: 'https://gymiq.ai',
    siteName: 'GymIQ AI',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-white antialiased">
        {children}
      </body>
    </html>
  )
}
