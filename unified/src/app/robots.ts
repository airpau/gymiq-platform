import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/hoddesdon', '/impact', '/demo', '/privacy', '/terms'],
        // Private by design: individual audit reports, sign in, onboarding and the dashboard.
        disallow: ['/audit/', '/auth/', '/onboard/', '/api/', '/overview', '/members', '/retention', '/conversations', '/leads', '/settings', '/cancel-save'],
      },
    ],
    sitemap: 'https://www.gymiq.ai/sitemap.xml',
    host: 'https://www.gymiq.ai',
  }
}
