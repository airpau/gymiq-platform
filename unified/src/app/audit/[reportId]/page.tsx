/**
 * Public audit report — anyone with the unguessable reportId UUID can view.
 * Server component: loads the audit JSON from Supabase, then renders via
 * the shared AuditReportView.
 */
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import AuditReportView from '@/components/audit/AuditReportView'
import type { AuditReport } from '@/lib/services/audit-analysis'

interface PageProps {
  params: Promise<{ reportId: string }>
}

export default async function AuditReportPage({ params }: PageProps) {
  const { reportId } = await params

  if (!isUuid(reportId)) notFound()

  const supabase = createServiceClient()
  if (!supabase) notFound()

  const { data, error } = await supabase
    .from('audits')
    .select('id, first_name, gym_name, created_at, report')
    .eq('id', reportId)
    .single()

  if (error || !data) notFound()

  return (
    <AuditReportView
      report={data.report as AuditReport}
      gymName={data.gym_name}
      firstName={data.first_name}
      createdAt={new Date(data.created_at)}
    />
  )
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
