'use client'

/**
 * The free membership file audit, in two steps.
 *
 * Step 1, details: first name, gym, email, mobile, software, member band.
 * Submitting creates the lead (stage audit_requested), fires the Lead event
 * the ads optimise for, and emails a private upload link. Almost every ad
 * click arrives on a phone without the export to hand, so this is the step
 * that has to work on a phone.
 *
 * Step 2, upload: the file. Can be done straight away, or later from the
 * emailed link (/audit?l=<lead id>), which prefills step 1 and opens step 2.
 */
import { useState, useRef, useEffect, FormEvent, DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, ArrowRight, Loader2, AlertCircle, CheckCircle2, Mail } from 'lucide-react'
import { trackLead, trackFormStart, trackAuditCompleted, newEventId, identifyLead } from '@/components/analytics/AdTracking'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldErrors = Partial<Record<'file' | 'firstName' | 'gymName' | 'email' | 'phone', string>>

interface AuditUploadProps {
  /** "hero" sits in the hero block (compact). "section" is full-width with more breathing room. */
  variant?: 'hero' | 'section'
  /** A lead id from the emailed link: prefills the details and opens the upload step. */
  leadId?: string | null
  /** Headline over the form. */
  heading?: string
  /** Where the form is: audit_form (default) or demo_form. */
  source?: 'audit_form' | 'demo_form'
}

export default function AuditUpload({ variant = 'hero', leadId: leadIdProp = null, heading, source = 'audit_form' }: AuditUploadProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [leadId, setLeadId] = useState<string | null>(leadIdProp)
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [firstName, setFirstName] = useState('')
  const [gymName, setGymName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [software, setSoftware] = useState('')
  const [members, setMembers] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const lastLeadSnapshotRef = useRef<string>('')
  const formStartedRef = useRef(false)
  const leadEventIdRef = useRef<string>('')

  // Arriving from the emailed link: load the details and go straight to the upload.
  useEffect(() => {
    if (!leadIdProp) return
    let cancelled = false
    fetch(`/api/leads/request?l=${encodeURIComponent(leadIdProp)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        setFirstName(d.firstName ?? '')
        setGymName(d.gymName ?? '')
        setEmail(d.email ?? '')
        setPhone(d.phone ?? '')
        setSoftware(d.software ?? '')
        setMembers(d.members ?? '')
        setLeadId(d.leadId)
        identifyLead(d.leadId, { form: source, gym_name: d.gymName ?? '', software: d.software || null, members: d.members || null })
        setStep(2)
      })
      .catch(() => {
        // Link did not resolve: the visitor just fills the form in.
      })
    return () => {
      cancelled = true
    }
  }, [leadIdProp, source])

  // Partial capture: as soon as there is a valid email, record it so an
  // abandoned form is still a name to call. Idempotent server side.
  useEffect(() => {
    if (step !== 1 || !EMAIL_RE.test(email.trim())) return
    if (!formStartedRef.current) {
      formStartedRef.current = true
      trackFormStart(newEventId('start'), source)
    }
    const snapshot = JSON.stringify({
      email: email.trim().toLowerCase(),
      firstName: firstName.trim() || null,
      gymName: gymName.trim() || null,
      phone: phone.trim() || null,
      software: software || null,
      members: members || null,
    })
    if (snapshot === lastLeadSnapshotRef.current) return
    lastLeadSnapshotRef.current = snapshot
    const t = setTimeout(() => {
      fetch('/api/leads/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: firstName.trim() || null,
          gymName: gymName.trim() || null,
          phone: phone.trim() || null,
          metadata: { software: software || null, members: members || null },
          source,
          referrer: typeof document !== 'undefined' ? document.referrer || null : null,
        }),
      }).catch(() => {
        // Best effort.
      })
    }, 700)
    return () => clearTimeout(t)
  }, [step, email, firstName, gymName, phone, software, members, source])

  function validateDetails(): FieldErrors {
    const next: FieldErrors = {}
    if (!firstName.trim()) next.firstName = 'Required'
    if (!gymName.trim()) next.gymName = 'Required'
    if (!email.trim() || !EMAIL_RE.test(email)) next.email = 'Use a valid work email.'
    if (phone.trim() && phone.replace(/\D/g, '').length < 10) next.phone = 'That number looks short.'
    return next
  }

  async function onSubmitDetails(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    const next = validateDetails()
    setErrors(next)
    if (Object.keys(next).length) return
    setSubmitting(true)
    try {
      const eventId = newEventId('lead')
      leadEventIdRef.current = eventId
      const res = await fetch('/api/leads/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          gymName: gymName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          software: software || null,
          members: members || null,
          source,
          eventId,
          sourceUrl: window.location.href,
          fbp: readCookie('_fbp'),
          fbc: readCookie('_fbc'),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Could not save your details (${res.status}).`)
      }
      const data = (await res.json()) as { leadId: string }
      trackLead({ eventId, gymName: gymName.trim(), form: source })
      identifyLead(data.leadId, { form: source, gym_name: gymName.trim(), software: software || null, members: members || null })
      setLeadId(data.leadId)
      setLinkSentTo(email.trim())
      setStep(2)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function validateFile(f: File): string | null {
    const max = 20 * 1024 * 1024
    if (f.size > max) return 'File is over 20 MB. Trim it down or contact us.'
    const lower = f.name.toLowerCase()
    const okExt = ['.csv', '.tsv', '.xlsx', '.xls', '.txt'].some((ext) => lower.endsWith(ext))
    if (!okExt) return 'Use a CSV, TSV or Excel export from your CRM.'
    return null
  }

  function handleFile(f: File | null) {
    if (!f) return
    const err = validateFile(f)
    if (err) {
      setErrors((e) => ({ ...e, file: err }))
      return
    }
    setErrors((e) => ({ ...e, file: undefined }))
    setFile(f)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0])
  }
  function onDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragActive(true)
  }
  function onDragLeave(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragActive(false)
  }

  async function onSubmitFile(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    const next = validateDetails()
    if (!file) next.file = 'Upload an export from your CRM.'
    setErrors(next)
    if (Object.keys(next).length) return

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('file', file!)
      fd.append('firstName', firstName.trim())
      fd.append('gymName', gymName.trim())
      fd.append('email', email.trim())
      fd.append('phone', phone.trim())
      fd.append('software', software)
      fd.append('members', members)
      if (leadId) fd.append('leadId', leadId)
      fd.append('leadSource', source)
      const eventId = newEventId('audit')
      fd.append('eventId', eventId)
      fd.append('fbp', readCookie('_fbp') ?? '')
      fd.append('fbc', readCookie('_fbc') ?? '')
      fd.append('sourceUrl', window.location.href)

      const res = await fetch('/api/audit', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Upload failed (${res.status}).`)
      }
      const data = (await res.json()) as { reportId: string; previewReport?: unknown }
      trackAuditCompleted({ eventId, gymName: gymName.trim() })

      if (data.reportId === 'preview' && data.previewReport) {
        try {
          window.sessionStorage.setItem(
            'gymiq:audit-preview',
            JSON.stringify({ report: data.previewReport, firstName: firstName.trim(), gymName: gymName.trim(), createdAt: new Date().toISOString() }),
          )
        } catch {
          // sessionStorage disabled
        }
        router.push('/audit/preview')
        return
      }
      router.push(`/audit/${data.reportId}`)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Upload failed. Try again.')
      setSubmitting(false)
    }
  }

  const compact = variant === 'hero'
  const shell = `mx-auto w-full max-w-2xl rounded-2xl border border-mist bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] ${compact ? 'p-5 sm:p-6' : 'p-6 sm:p-8'}`

  if (step === 2) {
    return (
      <form onSubmit={onSubmitFile} className={shell} id="audit-upload">
        <div className="mb-5">
          <p className="text-xs font-medium uppercase tracking-wider text-moss">Step 2 of 2 · the file</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink sm:text-xl">
            {firstName ? `Thanks ${firstName}. ` : ''}Drop in the memberships export from your gym software.
          </h3>
          {linkSentTo ? (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-moss-soft px-3 py-2 text-sm text-ink">
              <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-moss" />
              <span>
                On your phone without the file? No problem. We have emailed a private link to <strong>{linkSentTo}</strong>. Open it on the computer you use for your gym software and upload there. Or do it now.
              </span>
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-slate">
              Glofox, ClubRight, Mindbody or any spreadsheet. CSV, TSV or Excel, up to 20 MB. Read once, not stored.
            </p>
          )}
        </div>

        <label
          htmlFor="audit-file"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-7 text-center transition ${
            dragActive ? 'border-emerald-500 bg-moss-soft' : file ? 'border-emerald-300 bg-moss-soft' : 'border-mist bg-paper-2 hover:border-zinc-400 hover:bg-paper-2'
          }`}
        >
          {file ? (
            <>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-ink">{file.name}</p>
              <p className="mt-0.5 text-xs text-slate">{(file.size / 1024).toFixed(0)} KB &middot; click to choose a different file</p>
            </>
          ) : (
            <>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-ink">
                Drop your Memberships export here
                <span className="ml-1 font-normal text-slate">or tap to browse</span>
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                CSV, TSV, or Excel &middot; up to 20 MB
              </p>
            </>
          )}
          <input
            ref={fileInputRef}
            id="audit-file"
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,.txt,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {errors.file && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" /> {errors.file}
          </p>
        )}

        <details className="mt-4 rounded-lg border border-mist bg-paper-2 px-3 py-2 text-xs text-slate">
          <summary className="cursor-pointer font-medium text-ink">Where the export lives</summary>
          <p className="mt-2 leading-relaxed">
            Glofox: Reports, Members, export. ClubRight: Members, export to CSV. Mindbody: Reports, Clients, export. Anything else: a members list with join date, plan and payment status is enough.
          </p>
        </details>

        <button
          type="submit"
          disabled={submitting || !file}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-2 focus:outline-none focus:ring-2 focus:ring-moss/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading your file...
            </>
          ) : (
            <>
              Show me what is in it
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        {serverError && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {serverError}
          </p>
        )}

        <p className="mt-4 text-xs text-slate">
          Your file is read once and not stored. The report is kept at a private link and emailed to you. We may call about a walkthrough; no mailing lists.{' '}
          <button type="button" onClick={() => setStep(1)} className="underline">
            Change my details
          </button>
        </p>
      </form>
    )
  }

  return (
    <form onSubmit={onSubmitDetails} className={shell} id="audit-form">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-moss">Free membership file audit · step 1 of 2</p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink sm:text-xl">{heading ?? 'See what is hiding in your membership file.'}</h3>
        <p className="mt-1.5 text-sm text-slate">
          Overdue by payment method, memberships ending unasked, members below current price, students past the age for their rate, who is drifting. Your details first; the file can wait until you are at your desk.
        </p>
      </div>

      <input type="text" name="company_url_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="audit-firstName" label="Your first name" value={firstName} onChange={setFirstName} autoComplete="given-name" error={errors.firstName} />
        <Field id="audit-gymName" label="Gym name" value={gymName} onChange={setGymName} autoComplete="organization" error={errors.gymName} />
      </div>
      <Field id="audit-email" label="Work email" type="email" value={email} onChange={setEmail} autoComplete="email" error={errors.email} className="mt-3" inputMode="email" />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field id="audit-phone" label="Mobile (for the walkthrough)" type="tel" value={phone} onChange={setPhone} autoComplete="tel" error={errors.phone} inputMode="tel" />
        <div>
          <label htmlFor="audit-software" className="block text-xs font-medium text-ink-3">Gym software</label>
          <select
            id="audit-software"
            value={software}
            onChange={(e) => setSoftware(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-mist bg-white px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20 focus:ring-offset-1"
          >
            <option value="">Choose</option>
            <option value="glofox">Glofox</option>
            <option value="clubright">ClubRight</option>
            <option value="mindbody">Mindbody</option>
            <option value="perfectgym">PerfectGym</option>
            <option value="gymmaster">GymMaster</option>
            <option value="other">Other or spreadsheet</option>
          </select>
        </div>
        <div>
          <label htmlFor="audit-members" className="block text-xs font-medium text-ink-3">Members</label>
          <select
            id="audit-members"
            value={members}
            onChange={(e) => setMembers(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-mist bg-white px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20 focus:ring-offset-1"
          >
            <option value="">Choose</option>
            <option value="under-300">Under 300</option>
            <option value="300-800">300 to 800</option>
            <option value="800-1500">800 to 1,500</option>
            <option value="1500-3000">1,500 to 3,000</option>
            <option value="3000+">Over 3,000</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-2 focus:outline-none focus:ring-2 focus:ring-moss/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            Get my audit link
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      {serverError && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-red-600">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          {serverError}
        </p>
      )}

      <p className="mt-4 text-xs text-slate">
        Next: upload the export, now or from the link we email you. Your file is read once and not stored. We may call about a walkthrough; no mailing lists. See the{' '}
        <a href="/privacy" className="underline">privacy policy</a>.
      </p>
    </form>
  )
}

function readCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : null
  } catch {
    return null
  }
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  autoComplete,
  inputMode,
  className = '',
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  type?: string
  autoComplete?: string
  inputMode?: 'email' | 'tel' | 'text'
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-ink-3">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink placeholder-zinc-400 transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${
          error ? 'border-red-300 focus:border-red-400 focus:ring-red-200' : 'border-mist focus:border-moss focus:ring-moss/20'
        }`}
      />
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
