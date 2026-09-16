/**
 * Ad attribution, first touch.
 *
 * On the first page a visitor lands on we read utm_*, fbclid and gclid from
 * the URL and keep them in a first party cookie (gymiq_attr) for 90 days.
 * Every lead route reads that cookie and stores it as metadata.attribution,
 * which is what public.marketing_site_leads and the daily ads review read.
 *
 * First touch wins: a later visit without tags does not wipe it, and a later
 * visit with different tags is kept under `last` so both are visible.
 *
 * Works in the browser (captureAttribution, readAttribution) and on the
 * server (parseAttributionCookie from a raw cookie value).
 */

export const ATTR_COOKIE = 'gymiq_attr'
const COOKIE_DAYS = 90

export interface Attribution {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  fbclid?: string
  gclid?: string
  /** Path and query of the first page seen, without the origin. */
  landing_page?: string
  referrer?: string
  first_seen?: string
  /** 'page_url' when taken from the form's page address rather than the cookie. */
  source?: string
  /** Most recent tagged visit, when it differs from the first. */
  last?: Omit<Attribution, 'last'>
}

const KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'] as const

function pick(params: URLSearchParams): Partial<Attribution> {
  const out: Partial<Attribution> = {}
  for (const k of KEYS) {
    const v = params.get(k)
    if (v) out[k] = v.slice(0, 200)
  }
  return out
}

export function hasTags(a: Partial<Attribution> | null | undefined): boolean {
  return Boolean(a && (a.utm_source || a.fbclid || a.gclid))
}

/** Parse the raw cookie value. Tolerates the old and the encoded form. */
export function parseAttributionCookie(raw: string | null | undefined): Attribution | null {
  if (!raw) return null
  try {
    const decoded = raw.startsWith('%7B') || raw.startsWith('%7b') ? decodeURIComponent(raw) : raw
    const parsed = JSON.parse(decoded) as Attribution
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Browser: raw cookie value, or null. */
export function readCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return m ? m[1] : null
  } catch {
    return null
  }
}

function writeCookie(name: string, value: string, days: number) {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${secure}`
  } catch {
    // Cookies blocked. Attribution is best effort.
  }
}

/** Browser: current stored attribution, or null. */
export function readAttribution(): Attribution | null {
  if (typeof document === 'undefined') return null
  return parseAttributionCookie(readCookie(ATTR_COOKIE))
}

/**
 * Browser: call on every page load. Stores tags from the URL on first touch,
 * and mirrors fbclid into Meta's _fbc cookie when the pixel has not set it,
 * so the server side Lead event matches the click.
 */
export function captureAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const tags = pick(params)
    const existing = readAttribution()

    // Meta's click id: the pixel normally writes _fbc itself, but only after
    // fbevents.js loads. Writing it here means an ad blocker on the pixel does
    // not cost us the match on the Conversions API side.
    if (tags.fbclid && !readCookie('_fbc')) {
      const host = window.location.hostname.replace(/^www\./, '')
      const value = `fb.1.${Date.now()}.${tags.fbclid}`
      try {
        document.cookie = `_fbc=${value}; expires=${new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString()}; path=/; domain=.${host}; SameSite=Lax; Secure`
      } catch {
        // ignore
      }
    }

    if (!hasTags(tags)) {
      // Untagged visit: keep whatever we had, and record a landing page if this is the very first visit.
      if (existing) return existing
      const first: Attribution = {
        landing_page: window.location.pathname + window.location.search,
        referrer: document.referrer ? document.referrer.slice(0, 300) : undefined,
        first_seen: new Date().toISOString(),
      }
      writeCookie(ATTR_COOKIE, JSON.stringify(first), COOKIE_DAYS)
      return first
    }

    const visit: Omit<Attribution, 'last'> = {
      ...tags,
      landing_page: window.location.pathname + window.location.search,
      referrer: document.referrer ? document.referrer.slice(0, 300) : undefined,
      first_seen: new Date().toISOString(),
    }

    if (!existing || !hasTags(existing)) {
      // First tagged touch, or an untagged first visit being upgraded.
      const next: Attribution = { ...visit, first_seen: existing?.first_seen ?? visit.first_seen }
      writeCookie(ATTR_COOKIE, JSON.stringify(next), COOKIE_DAYS)
      return next
    }

    const same = KEYS.every((k) => (existing[k] ?? '') === (tags[k] ?? ''))
    if (same) return existing
    const next: Attribution = { ...existing, last: visit }
    writeCookie(ATTR_COOKIE, JSON.stringify(next), COOKIE_DAYS)
    return next
  } catch {
    return null
  }
}

/**
 * Server: attribution from the page address a form was sent from. Used when
 * there is no gymiq_attr cookie (no advertising consent): the utm tags in the
 * link the visitor is on are part of what they sent us, nothing is read from
 * their device. Ad click ids are left out without consent.
 */
export function attributionFromUrl(url: string | null | undefined): Attribution | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const tags = pick(u.searchParams)
    delete tags.fbclid
    delete tags.gclid
    if (!tags.utm_source) return null
    const params = new URLSearchParams(u.search)
    params.delete('fbclid')
    params.delete('gclid')
    params.delete('l')
    const qs = params.toString()
    return { ...tags, landing_page: u.pathname + (qs ? `?${qs}` : ''), first_seen: new Date().toISOString(), source: 'page_url' } as Attribution
  } catch {
    return null
  }
}

/** Server: cookie attribution when there is one, else what the page address carries. */
export function requestAttribution(cookieHeader: string | null | undefined, pageUrl: string | null | undefined): Attribution | null {
  return attributionFromCookieHeader(cookieHeader) ?? attributionFromUrl(pageUrl)
}

/** Server: pull attribution from a Next request's cookie jar. */
export function attributionFromCookieHeader(cookieHeader: string | null | undefined): Attribution | null {
  if (!cookieHeader) return null
  const m = cookieHeader.match(new RegExp('(?:^|; )' + ATTR_COOKIE + '=([^;]*)'))
  return parseAttributionCookie(m ? m[1] : null)
}
