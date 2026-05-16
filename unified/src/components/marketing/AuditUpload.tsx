'use client'

import { useState, useRef, FormEvent, DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

type FieldErrors = Partial<Record<'file' | 'firstName' | 'gymName' | 'email', string>>

interface AuditUploadProps {
  /** "hero" sits in the hero block (compact). "section" is full-width with more breathing room. */
  variant?: 'hero' | 'section'
}

export default function AuditUpload({ variant = 'hero' }: AuditUploadProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [firstName, setFirstName] = useState('')
  const [gymName, setGymName] = useState('')
  const [email, setEmail] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)

  function validateFile(f: File): string | null {
    const max = 20 * 1024 * 1024 // 20 MB
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)

    const next: FieldErrors = {}
    if (!file) next.file = 'Upload an export from your CRM.'
    if (!firstName.trim()) next.firstName = 'Required'
    if (!gymName.trim()) next.gymName = 'Required'
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Use a valid work email.'
    setErrors(next)
    if (Object.keys(next).length) return

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('file', file!)
      fd.append('firstName', firstName.trim())
      fd.append('gymName', gymName.trim())
      fd.append('email', email.trim())

      const res = await fetch('/api/audit', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Upload failed (${res.status}).`)
      }
      const data = (await res.json()) as { reportId: string }
      router.push(`/audit/${data.reportId}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed. Try again.'
      setServerError(message)
      setSubmitting(false)
    }
  }

  const compact = variant === 'hero'

  return (
    <form
      onSubmit={onSubmit}
      className={`mx-auto w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] ${
        compact ? 'p-5 sm:p-6' : 'p-6 sm:p-8'
      }`}
    >
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">
          Free 60-second audit
        </p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
          Upload your member export. Get the revenue you&apos;re bleeding.
        </h3>
        <p className="mt-1.5 text-sm text-zinc-500">
          Drop a CSV from Glofox, Mindbody, ClubRight, or any spreadsheet. Private, takes ~60 seconds.
        </p>
      </div>

      <label
        htmlFor="audit-file"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-7 text-center transition ${
          dragActive
            ? 'border-emerald-500 bg-emerald-50/60'
            : file
            ? 'border-emerald-300 bg-emerald-50/40'
            : 'border-zinc-300 bg-zinc-50/60 hover:border-zinc-400 hover:bg-zinc-50'
        }`}
      >
        {file ? (
          <>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-zinc-900">{file.name}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {(file.size / 1024).toFixed(0)} KB &middot; click to choose a different file
            </p>
          </>
        ) : (
          <>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-white">
              <Upload className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-zinc-900">
              Drop your member export here
              <span className="ml-1 font-normal text-zinc-500">or click to browse</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
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

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          id="audit-firstName"
          label="Your first name"
          value={firstName}
          onChange={setFirstName}
          autoComplete="given-name"
          error={errors.firstName}
        />
        <Field
          id="audit-gymName"
          label="Gym name"
          value={gymName}
          onChange={setGymName}
          autoComplete="organization"
          error={errors.gymName}
        />
      </div>
      <Field
        id="audit-email"
        label="Work email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        error={errors.email}
        className="mt-3"
      />

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Running your audit...
          </>
        ) : (
          <>
            Run my free audit
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

      <p className="mt-4 text-xs text-zinc-500">
        We never share your data. The audit runs locally on your file — we only keep aggregate stats and your contact details.
      </p>
    </form>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  autoComplete,
  className = '',
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  type?: string
  autoComplete?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-zinc-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${
          error
            ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
            : 'border-zinc-300 focus:border-zinc-400 focus:ring-zinc-200'
        }`}
      />
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
