/**
 * Cookie consent, first party, no third party CMP.
 *
 * Two optional purposes:
 *   analytics  PostHog may store its identifier on the device and link a
 *              visitor to a lead. Without it PostHog runs in memory only
 *              (nothing stored, nothing followed between page loads), and
 *              after an explicit "reject" it does not run at all.
 *   ads        Meta Pixel, Google tag, the gymiq_attr attribution cookie,
 *              Meta's _fbc/_fbp cookies, and the server side Conversions
 *              API events. None of these run without it.
 *
 * The choice itself is kept in the gymiq_consent cookie, which is strictly
 * necessary and needs no consent. Browser only; every function is a no-op on
 * the server.
 */

export const CONSENT_COOKIE = 'gymiq_consent'
export const CONSENT_VERSION = 1
const CONSENT_DAYS = 180
const CHANGE_EVENT = 'gymiq:consent'
const OPEN_EVENT = 'gymiq:open-consent'

export interface Consent {
  v: number
  analytics: boolean
  ads: boolean
  /** ISO time the choice was made. */
  at: string
}

function readRaw(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** The stored choice, or null when the visitor has not chosen yet (or chose under an older version). */
export function readConsent(): Consent | null {
  if (typeof document === 'undefined') return null
  const raw = readRaw(CONSENT_COOKIE)
  if (!raw) return null
  try {
    const c = JSON.parse(decodeURIComponent(raw)) as Consent
    if (!c || c.v !== CONSENT_VERSION) return null
    return { v: c.v, analytics: c.analytics === true, ads: c.ads === true, at: String(c.at ?? '') }
  } catch {
    return null
  }
}

export function hasAdConsent(): boolean {
  return readConsent()?.ads === true
}

export function hasAnalyticsConsent(): boolean {
  return readConsent()?.analytics === true
}

function expireCookie(name: string) {
  const past = 'Thu, 01 Jan 1970 00:00:00 GMT'
  const host = window.location.hostname
  const bare = host.replace(/^www\./, '')
  for (const domain of ['', `; domain=${host}`, `; domain=.${bare}`]) {
    document.cookie = `${name}=; expires=${past}; path=/${domain}`
  }
}

/** Remove what the advertising purpose may have stored. */
function clearAdStorage() {
  for (const name of ['gymiq_attr', '_fbc', '_fbp', '_gcl_au']) expireCookie(name)
}

/** Remove what PostHog may have stored. */
function clearAnalyticsStorage() {
  try {
    for (const c of document.cookie.split('; ')) {
      const name = c.split('=')[0]
      if (name.startsWith('ph_')) expireCookie(name)
    }
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith('ph_') && !k.includes('opt_in_out')) window.localStorage.removeItem(k)
    }
    for (const k of Object.keys(window.sessionStorage)) {
      if (k.startsWith('ph_')) window.sessionStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
}

/** Store a choice and tell the page. */
export function saveConsent(choice: { analytics: boolean; ads: boolean }): Consent {
  const c: Consent = { v: CONSENT_VERSION, analytics: choice.analytics, ads: choice.ads, at: new Date().toISOString() }
  if (typeof document === 'undefined') return c
  const previous = readConsent()
  try {
    const expires = new Date(Date.now() + CONSENT_DAYS * 864e5).toUTCString()
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(c))}; expires=${expires}; path=/; SameSite=Lax${secure}`
  } catch {
    // Cookies blocked: the choice holds for this page only.
  }
  if (!c.ads) clearAdStorage()
  if (!c.analytics) clearAnalyticsStorage()
  window.dispatchEvent(new CustomEvent<{ consent: Consent; previous: Consent | null }>(CHANGE_EVENT, { detail: { consent: c, previous } }))
  return c
}

/** Subscribe to choices made on this page. Returns an unsubscribe function. */
export function onConsentChange(cb: (consent: Consent, previous: Consent | null) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event) => {
    const d = (e as CustomEvent<{ consent: Consent; previous: Consent | null }>).detail
    if (d) cb(d.consent, d.previous)
  }
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}

/** Reopen the banner in its settings view (the footer "Cookie settings" link). */
export function openConsentSettings() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function onOpenConsentSettings(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(OPEN_EVENT, cb)
  return () => window.removeEventListener(OPEN_EVENT, cb)
}
