'use client'

/**
 * In-memory preview audit report.
 *
 * Used when SUPABASE_SERVICE_ROLE_KEY isn't configured yet — the API returns
 * the full report inline, AuditUpload stashes it in sessionStorage, the user
 * is redirected here, and we render the same AuditReportView from that blob.
 *
 * No persistence: the report disappears when the tab closes.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import AuditReportView from '@/components/audit/AuditReportView'
import type { AuditReport } from '@/lib/services/audit-analysis'

interface StoredPreview {
  report: AuditReport
  firstName: string
  gymName: string
  createdAt: string // ISO
}

const STORAGE_KEY = 'gymiq:audit-preview'

export default function AuditPreviewPage() {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; data: StoredPreview } | { status: 'empty' }
  >({ status: 'loading' })

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY)
      if (!raw) {
        setState({ status: 'empty' })
        return
      }
      const data = JSON.parse(raw) as StoredPreview
      setState({ status: 'ready', data })
    } catch {
      setState({ status: 'empty' })
    }
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-zinc-500">
        Loading your audit…
      </div>
    )
  }

  if (state.status === 'empty') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-5">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-7 text-center shadow-sm">
          <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-zinc-900">No preview to display</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
            We couldn&apos;t find your audit in this browser. Preview reports only live in the tab where you ran them — head back to the homepage and run a new one.
          </p>
          <Link
            href="/#audit"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Run a new audit
          </Link>
        </div>
      </div>
    )
  }

  return (
    <AuditReportView
      report={state.data.report}
      gymName={state.data.gymName}
      firstName={state.data.firstName}
      createdAt={new Date(state.data.createdAt)}
      isPreview
    />
  )
}
