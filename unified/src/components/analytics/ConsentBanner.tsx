'use client'

/**
 * Cookie banner. Shown until the visitor chooses; "Accept all" and "Reject
 * all" are the same size and weight, as the ICO expects. "Choose" opens the
 * per purpose settings, which the footer "Cookie settings" link also opens.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { onOpenConsentSettings, saveConsent } from '@/lib/analytics/consent'
import { useConsent } from '@/components/analytics/useConsent'

export default function ConsentBanner() {
  const { ready, consent } = useConsent()
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [ads, setAds] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ready && !consent) setOpen(true)
  }, [ready, consent])

  useEffect(
    () =>
      onOpenConsentSettings(() => {
        setAnalytics(consent?.analytics ?? false)
        setAds(consent?.ads ?? false)
        setSettings(true)
        setOpen(true)
      }),
    [consent],
  )

  // While the banner is up, pad the page by its height so it never hides the
  // end of the page (a form's submit button, the footer links).
  useEffect(() => {
    const el = boxRef.current
    if (!open || !el) return
    const body = document.body
    const before = body.style.paddingBottom
    const apply = () => {
      body.style.paddingBottom = `${el.offsetHeight}px`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => {
      ro.disconnect()
      body.style.paddingBottom = before
    }
  }, [open, settings, ready])

  if (!ready || !open) return null

  const choose = (choice: { analytics: boolean; ads: boolean }) => {
    saveConsent(choice)
    setOpen(false)
    setSettings(false)
  }

  const btn =
    'inline-flex flex-1 items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-ink-2 focus:outline-none focus:ring-2 focus:ring-moss/30 sm:flex-none'

  return (
    <div ref={boxRef} role="dialog" aria-modal="false" aria-labelledby="consent-title" className="ph-no-capture pointer-events-none fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-5">
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-mist bg-white p-5 text-ink shadow-[0_8px_40px_-12px_rgba(0,0,0,0.25)] sm:p-6">
        <p id="consent-title" className="font-display text-lg font-bold tracking-tight">Cookies on gymIQ</p>
        {!settings ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-slate">
              We would like to use analytics cookies to see how the site is used, and advertising cookies so Meta and Google can tell us which ads bring gym owners
              here. Neither is set unless you say yes. You can change your mind at any time from Cookie settings at the bottom of the page.{' '}
              <Link href="/privacy#cookies" className="text-moss underline underline-offset-2">
                Privacy policy
              </Link>
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className={btn} onClick={() => choose({ analytics: true, ads: true })}>
                Accept all
              </button>
              <button type="button" className={btn} onClick={() => choose({ analytics: false, ads: false })}>
                Reject all
              </button>
              <button type="button" className="px-2 py-2 text-sm font-semibold text-ink underline underline-offset-4" onClick={() => setSettings(true)}>
                Choose
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 space-y-3">
              <Row title="Strictly necessary" always>
                Remembers the choice you make here. Always on.
              </Row>
              <Row title="Analytics (PostHog, EU)" checked={analytics} onChange={setAnalytics}>
                Keeps an anonymous ID on your device so we can see how visitors move through the site and which visits became enquiries. Without it, PostHog only
                records page views and clicks, stores nothing on your device and cannot link your visits.
              </Row>
              <Row title="Advertising (Meta, Google)" checked={ads} onChange={setAds}>
                Lets Meta and Google measure which ads brought you here, using their cookies and, if you send us a form, your email and phone number in hashed form.
              </Row>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className={btn} onClick={() => choose({ analytics, ads })}>
                Save choices
              </button>
              <button type="button" className={btn} onClick={() => choose({ analytics: true, ads: true })}>
                Accept all
              </button>
              <button type="button" className={btn} onClick={() => choose({ analytics: false, ads: false })}>
                Reject all
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({
  title,
  children,
  checked,
  onChange,
  always,
}: {
  title: string
  children: React.ReactNode
  checked?: boolean
  onChange?: (v: boolean) => void
  always?: boolean
}) {
  const id = `consent-${title.split(' ')[0].toLowerCase()}`
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-mist bg-paper-2 px-4 py-3">
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {title}
        </label>
        <p className="mt-0.5 text-xs leading-relaxed text-slate">{children}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 accent-moss"
        checked={always ? true : !!checked}
        disabled={always}
        onChange={(e) => onChange?.(e.target.checked)}
      />
    </div>
  )
}
