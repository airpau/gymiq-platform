import type { MetadataRoute } from 'next'

const BASE = 'https://www.gymiq.ai'

/** Only the public marketing pages. Reports, auth and the dashboard are private. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/hoddesdon`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/impact`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
