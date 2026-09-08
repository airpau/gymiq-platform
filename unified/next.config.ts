import type { NextConfig } from 'next'

const CANONICAL_HOST = 'www.gymiq.ai'

const nextConfig: NextConfig = {
  experimental: {},
  async redirects() {
    // One canonical host. Vercel already sends the apex to www; this covers the
    // .co.uk domains and app.gymiq.ai so search engines see a single site.
    return [
      ...['gymiq.co.uk', 'www.gymiq.co.uk', 'app.gymiq.ai'].map((host) => ({
        source: '/:path*',
        has: [{ type: 'host' as const, value: host }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      })),
      // The case study used to live at /hoddesdon.
      { source: '/hoddesdon', destination: '/case-study', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
