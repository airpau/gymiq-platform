import type { Metadata } from 'next'

/** Audit reports are private: keep them out of search results even if a link leaks. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
}

export default function PrivateReportLayout({ children }: { children: React.ReactNode }) {
  return children
}
