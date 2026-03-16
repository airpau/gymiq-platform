import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GymIQ — AI Gym Management',
  description: 'AI-powered member retention and lead recovery for gyms',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon-180x180.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
