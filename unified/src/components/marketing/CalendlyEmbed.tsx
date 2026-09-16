'use client'

/**
 * Calendly calendar, loaded only when the visitor asks for it. The embed runs
 * Calendly's own cookies and trackers (and Stripe's fraud checks), so it is
 * not loaded on page view. Calendly shows its own cookie choices inside the
 * frame once opened.
 */
import { useState } from 'react'
import { CalendarCheck } from 'lucide-react'

export default function CalendlyEmbed({ url, title }: { url: string; title: string }) {
  const [show, setShow] = useState(false)
  const src = `${url}?hide_landing_page_details=1&background_color=ffffff&text_color=0f1614&primary_color=0f6e63`
  if (show) {
    return <iframe src={src} title={title} className="h-[720px] w-full" />
  }
  return (
    <div className="flex flex-col items-start gap-4 p-6 sm:p-8">
      <CalendarCheck className="h-7 w-7 text-moss" aria-hidden />
      <div>
        <p className="font-display text-xl font-bold tracking-tight text-ink">Pick a 30 minute slot</p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate">
          The calendar is provided by Calendly, which sets its own cookies when it opens. If you would rather not, leave your details below and I will call you.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setShow(true)}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-base font-semibold text-paper transition hover:bg-ink-2"
      >
        Show available times
      </button>
    </div>
  )
}
