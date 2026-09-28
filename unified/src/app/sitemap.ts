import type { MetadataRoute } from 'next'

const BASE = 'https://www.gymiq.ai'

/**
 * Only the public marketing pages. Reports, auth and the dashboard are private.
 *
 * lastModified must be a REAL date per page, not new Date(). Returning the
 * current time on every crawl tells Google that all nine pages changed every
 * time it looks, which trains it to ignore the field entirely. Update the
 * date beside a page when you actually change that page.
 */
const LAST_CHANGED = {
  home: '2026-09-16',
  aiGymManagementSoftware: '2026-09-16',
  caseStudy: '2026-09-16',
  impact: '2026-09-16',
  book: '2026-09-16',
  demo: '2026-09-16',
  audit: '2026-09-16',
  privacy: '2026-09-16',
  terms: '2026-09-16',
} as const

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, lastModified: LAST_CHANGED.home, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/ai-gym-management-software`, lastModified: LAST_CHANGED.aiGymManagementSoftware, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/case-study`, lastModified: LAST_CHANGED.caseStudy, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/impact`, lastModified: LAST_CHANGED.impact, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/book`, lastModified: LAST_CHANGED.book, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/demo`, lastModified: LAST_CHANGED.demo, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/audit`, lastModified: LAST_CHANGED.audit, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/privacy`, lastModified: LAST_CHANGED.privacy, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/terms`, lastModified: LAST_CHANGED.terms, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
