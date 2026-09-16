/**
 * GymIQ AI Layer — Phase 1 backfill runner (one-off, Hoddesdon).
 * Reads the openclaw Glofox XLSX archive + sales logs + historical aggregates,
 * runs the canonical connector+pipeline from the product repo, and emits
 * batched SQL for the iq.* schema plus a summary.json for validation.
 * READ-ONLY on all source dirs. No DB access here; SQL is applied via MCP.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as XLSX from 'xlsx'
import {
  parseGlofoxMembersFile,
  asOfFromFilename,
} from '/sessions/sweet-gallant-bardeen/mnt/gymiq-platform/unified/src/lib/iq/connectors/glofox-xlsx.ts'
import {
  runPipeline,
  metricsFromSnapshot,
} from '/sessions/sweet-gallant-bardeen/mnt/gymiq-platform/unified/src/lib/iq/pipeline.ts'
import type { CanonicalBatch, CanonicalMember, CanonicalMemberPii, SiteConfig } from '/sessions/sweet-gallant-bardeen/mnt/gymiq-platform/unified/src/lib/iq/contract.ts'

const TENANT = 'b9fd9f2e-9154-4fea-a211-daef5f9f5640'
const SITE = '95f75b9f-2ff3-4c83-9fd0-168651ed7128'
const WS = '/sessions/sweet-gallant-bardeen/mnt/.openclaw/workspace'
const OUT = '/tmp/iqout'

const site: SiteConfig = { siteId: SITE, tenantId: TENANT, timezone: 'Europe/London', crmConfig: {} }

// ---------- helpers ----------
const q = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replace(/'/g, "''")}'`
}
let fileSeq = 0
function writeSqlBatches(prefix: string, header: string, rows: string[], perStmt = 1200, conflict = '') {
  for (let i = 0; i < rows.length; i += perStmt) {
    const chunk = rows.slice(i, i + perStmt)
    const sql = `${header}\n${chunk.join(',\n')}\n${conflict};`
    fileSeq++
    fs.writeFileSync(path.join(OUT, `${String(fileSeq).padStart(2, '0')}_${prefix}_${i}.sql`), sql)
  }
}

// ---------- 1. enumerate snapshot files (last file per date wins) ----------
const files: Array<{ date: string; full: string; name: string }> = []
for (const dir of [path.join(WS, 'manual-imports'), path.join(WS, 'downloads')]) {
  for (const name of fs.readdirSync(dir)) {
    if (!/^Members_.*\.xlsx$/.test(name)) continue
    const date = asOfFromFilename(name)
    if (!date) continue
    files.push({ date, full: path.join(dir, name), name })
  }
}
files.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date)))
const byDate = new Map<string, { full: string; name: string }>()
for (const f of files) byDate.set(f.date, { full: f.full, name: f.name }) // later (same-date) files overwrite

// ---------- 2. parse each snapshot through the product connector ----------
const batches: CanonicalBatch[] = []
const latestPii = new Map<string, CanonicalMemberPii>()
const latestRow = new Map<string, CanonicalMember>()
const parseWarnings: Record<string, string[]> = {}
for (const [date, f] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const wb = XLSX.read(fs.readFileSync(f.full), { type: 'buffer', cellDates: false })
  const sheetName = wb.SheetNames.find((s) => s.toLowerCase().includes('current'))
  if (!sheetName) { parseWarnings[date] = ['no Current Members sheet']; continue }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { raw: false, defval: null })
  const batch = parseGlofoxMembersFile(site, { name: f.name, asOf: date, rows })
  if (batch.warnings.length) parseWarnings[date] = batch.warnings
  batches.push(batch)
}

// ---------- 3. run the canonical pipeline ----------
const result = runPipeline(batches)
const quarantined = new Set(result.quarantinedDates)
for (const b of batches) {
  if (quarantined.has(b.asOf)) continue
  for (const p of b.pii) latestPii.set(p.sourceMemberId, p)
  for (const m of b.members) latestRow.set(m.sourceMemberId, m)
}

// ---------- 4. aggregate sources for non-snapshot days ----------
type Agg = { total?: number | null; active?: number | null; overdue?: number | null; paused?: number | null; activePaying?: number | null; mrr?: number | null; overdueMrr?: number | null; arpu?: number | null; quality?: string }
const aggByDate = new Map<string, Agg>()
const hist = JSON.parse(fs.readFileSync(path.join(WS, 'historical-gym-analysis.json'), 'utf8')) as Array<Record<string, unknown>>
for (const h of hist) {
  const d = String(h.date)
  const isPg = h.type === 'perfectgym'
  aggByDate.set(d, {
    total: h.total as number, active: isPg ? null : (h.active as number), overdue: isPg ? null : (h.overdue as number),
    paused: isPg ? null : (h.paused as number), mrr: isPg ? null : (h.mrr as number), overdueMrr: isPg ? null : (h.overdueMrr as number),
    quality: isPg ? 'perfectgym_total_only' : 'historical_json',
  })
}
type SalesDay = { submitted?: number | null; successful?: number | null; failed?: number | null; refunded?: number | null; collectionRate?: number | null }
const salesByDate = new Map<string, SalesDay>()
const slDir = path.join(WS, 'glofox-sales-log')
for (const name of fs.readdirSync(slDir)) {
  const m = name.match(/^(\d{4}-\d{2})-daily-sales\.json$/)
  if (!m) continue
  const j = JSON.parse(fs.readFileSync(path.join(slDir, name), 'utf8'))
  for (const day of j.days ?? []) {
    const d = String(day.date)
    salesByDate.set(d, {
      submitted: day.submitted ?? null, successful: day.successful ?? null,
      failed: day.failed ?? null, refunded: day.refunded ?? null,
      collectionRate: day.collectionRate != null ? Number(day.collectionRate) : null,
    })
    if (day.members && !aggByDate.has(d)) {
      aggByDate.set(d, {
        total: day.members.total, active: day.members.active, overdue: day.members.overdue, paused: day.members.paused,
        activePaying: day.members.activePaying, mrr: day.members.mrr, arpu: day.members.arpu, quality: 'sales_log_members',
      })
    }
  }
}
for (const name of fs.readdirSync(slDir)) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})\.json$/)
  if (!m) continue
  const d = m[1]
  if (salesByDate.has(d)) continue
  const j = JSON.parse(fs.readFileSync(path.join(slDir, name), 'utf8'))
  salesByDate.set(d, {
    submitted: j.submitted ?? null, successful: j.successful ?? null, failed: j.failed ?? null,
    refunded: j.refunded ?? null, collectionRate: j.collection_rate != null ? Number(j.collection_rate) : null,
  })
}

// ---------- 5. assemble site_metrics_daily rows ----------
const snapshotDates = new Set(result.metrics.map((m) => m.metricDate))
type MetricRow = Record<string, unknown>
const metricRows: MetricRow[] = []
for (const m of result.metrics) {
  metricRows.push({ date: m.metricDate, total: m.totalMembers, active: m.activeMembers, overdue: m.overdueMembers, paused: m.pausedMembers, activePaying: m.activePaying, mrr: m.mrr, overdueMrr: m.overdueMrr, pausedMrr: m.pausedMrr, arpu: m.arpu, source: 'snapshot', quality: {} })
}
for (const [d, a] of aggByDate) {
  if (snapshotDates.has(d)) continue
  metricRows.push({ date: d, total: a.total ?? null, active: a.active ?? null, overdue: a.overdue ?? null, paused: a.paused ?? null, activePaying: a.activePaying ?? null, mrr: a.mrr != null ? Math.round(a.mrr * 100) / 100 : null, overdueMrr: a.overdueMrr != null ? Math.round(a.overdueMrr * 100) / 100 : null, arpu: a.arpu != null ? Math.round(a.arpu * 100) / 100 : null, source: 'aggregate_import', quality: { origin: a.quality } })
}
// sales columns + within-month daily delta
const prevDay = (d: string) => { const t = new Date(Date.parse(d) - 86_400_000); return t.toISOString().slice(0, 10) }
const metricByDate = new Map(metricRows.map((r) => [r.date as string, r]))
for (const [d, s] of salesByDate) {
  let row = metricByDate.get(d)
  if (!row) { row = { date: d, source: 'aggregate_import', quality: { origin: 'sales_only' } }; metricRows.push(row); metricByDate.set(d, row) }
  row.salesSubmitted = s.submitted; row.salesSuccessful = s.successful; row.salesFailed = s.failed; row.salesRefunded = s.refunded; row.collectionRate = s.collectionRate
  const p = salesByDate.get(prevDay(d))
  if (d.slice(8) === '01') row.salesDay = s.successful
  else if (p?.successful != null && s.successful != null && prevDay(d).slice(0, 7) === d.slice(0, 7)) row.salesDay = Math.round((s.successful - p.successful) * 100) / 100
}

// ---------- 6. emit SQL ----------
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })

// members: current (finalMembers) + departed (had disappear/cancel, not current)
const departed = new Map<string, { occurredOn: string }>()
for (const mv of result.movements) {
  if ((mv.movement === 'disappear' || mv.movement === 'cancel') && !result.finalMembers.has(mv.sourceMemberId)) {
    const prior = departed.get(mv.sourceMemberId)
    if (!prior || prior.occurredOn < mv.occurredOn) departed.set(mv.sourceMemberId, { occurredOn: mv.occurredOn })
  }
}
const memberRows: string[] = []
const piiRows: string[] = []
for (const [id, last] of latestRow) {
  const current = result.finalMembers.has(id)
  const gone = departed.get(id)
  if (!current && !gone) continue // quarantined-only sightings
  const status = current ? last.status : 'cancelled'
  memberRows.push(`(${q(TENANT)},${q(SITE)},${q(id)},${q(status)},${q(last.joinedAt)},${q(current ? null : gone!.occurredOn)},${q(last.membershipRaw)},${q(last.planRaw)},${q(last.monthlyFee)},${q(last.paymentType)},${q(last.isGroup)},${q(current ? last.ddStatus : 'na')},${q(last.lastVisitAt)},${q(last.totalVisits)},${q(result.firstSeen.get(id))},${q(result.lastSeen.get(id))},${q(current ? null : gone!.occurredOn)},${q(last.acquisitionSource)},${q(last.acquisitionEntryPoint)})`)
  const p = latestPii.get(id)
  if (p) piiRows.push(`(${q(TENANT)},${q(SITE)},${q(id)},${q(p.fullName)},${q(p.email)},${q(p.phone)},${q(p.birthDate)})`)
}
writeSqlBatches('members', `insert into iq.members (tenant_id,site_id,source_member_id,status,joined_at,cancelled_at,membership_raw,plan_raw,monthly_fee,payment_type,is_group,dd_status,last_visit_at,total_visits,first_seen_on,last_seen_on,disappeared_on,acquisition_source,acquisition_entry_point) values`, memberRows, 700, `on conflict (site_id,source_member_id) do update set status=excluded.status,joined_at=excluded.joined_at,cancelled_at=excluded.cancelled_at,membership_raw=excluded.membership_raw,plan_raw=excluded.plan_raw,monthly_fee=excluded.monthly_fee,payment_type=excluded.payment_type,is_group=excluded.is_group,dd_status=excluded.dd_status,last_visit_at=excluded.last_visit_at,total_visits=excluded.total_visits,first_seen_on=excluded.first_seen_on,last_seen_on=excluded.last_seen_on,disappeared_on=excluded.disappeared_on,acquisition_source=excluded.acquisition_source,acquisition_entry_point=excluded.acquisition_entry_point,updated_at=now()`)

// pii (member_id resolved from source id in post step; stage into temp-keyed table via source_member_id column on... simplest: insert with subselect)
const piiValues = piiRows.map((r) => r) // (tenant,site,source_id,name,email,phone,dob)
writeSqlBatches('pii', `with v (tenant_id,site_id,source_member_id,full_name,email,phone,birth_date) as (values`, piiValues, 700, `)
insert into iq.member_pii (member_id,tenant_id,site_id,full_name,email,phone,birth_date)
select m.id, v.tenant_id::uuid, v.site_id::uuid, v.full_name, v.email, v.phone, v.birth_date::date
from v join iq.members m on m.site_id = v.site_id::uuid and m.source_member_id = v.source_member_id
on conflict (member_id) do update set full_name=excluded.full_name,email=excluded.email,phone=excluded.phone,birth_date=excluded.birth_date,updated_at=now()`)

// snapshots: first accepted snapshot of each month + the final snapshot
const acceptedDates = result.metrics.map((m) => m.metricDate)
// DB keeps only the LATEST snapshot (diff base for daily ingest); historical
// per-day snapshots remain re-derivable from the XLSX archive on disk.
const chosen = new Set<string>([acceptedDates[acceptedDates.length - 1]])
const snapRows: string[] = []
for (const b of batches) {
  if (!chosen.has(b.asOf) || quarantined.has(b.asOf)) continue
  for (const m of b.members) {
    snapRows.push(`(${q(TENANT)},${q(SITE)},${q(b.asOf)},${q(m.sourceMemberId)},${q(m.status)},${q(m.planRaw)},${q(m.monthlyFee)},${q(m.ddStatus === 'ok')},${q(m.lastVisitAt)},${q(m.totalVisits)},${q(m.pausedFrom)},${q(m.pausedTo)},${q(m.endDate)},${q(m.joinedAt)})`)
  }
}
writeSqlBatches('snapshots', `insert into iq.member_snapshots (tenant_id,site_id,snapshot_date,source_member_id,status,plan_raw,monthly_fee,dd_ok,last_visit_at,total_visits,paused_from,paused_to,end_date,commenced_at) values`, snapRows, 1400, `on conflict (site_id,snapshot_date,source_member_id) do nothing`)

// movements
const mvRows = result.movements.map((mv) => `(${q(TENANT)},${q(SITE)},${q(mv.sourceMemberId)},${q(mv.movement)},${q(mv.occurredOn)},${q(mv.tenureDays)},${q(mv.joinCohort)},${q(mv.planRaw)},${q(mv.monthlyFee)},${q(mv.detectedBy)},${q(mv.dataQuality)})`)
writeSqlBatches('movements', `insert into iq.member_movements (tenant_id,site_id,source_member_id,movement,occurred_on,tenure_days,join_cohort,plan_raw,monthly_fee,detected_by,data_quality) values`, mvRows, 900, `on conflict (site_id,source_member_id,movement,occurred_on) do nothing`)

// metrics
const meRows = metricRows.map((r) => `(${q(TENANT)},${q(SITE)},${q(r.date)},${q(r.total)},${q(r.active)},${q(r.overdue)},${q(r.paused)},${q(r.activePaying)},${q(r.mrr)},${q(r.overdueMrr)},${q(r.pausedMrr)},${q(r.arpu)},${q(r.salesSubmitted)},${q(r.salesSuccessful)},${q(r.salesFailed)},${q(r.salesRefunded)},${q(r.salesDay)},${q(r.collectionRate)},${q(r.source)},${q(JSON.stringify(r.quality ?? {}))}::jsonb)`)
writeSqlBatches('metrics', `insert into iq.site_metrics_daily (tenant_id,site_id,metric_date,total_members,active_members,overdue_members,paused_members,active_paying,mrr,overdue_mrr,paused_mrr,arpu,sales_mtd_submitted,sales_mtd_successful,sales_mtd_failed,sales_mtd_refunded,sales_day,collection_rate,source,data_quality) values`, meRows, 400, `on conflict (site_id,metric_date) do update set total_members=excluded.total_members,active_members=excluded.active_members,overdue_members=excluded.overdue_members,paused_members=excluded.paused_members,active_paying=excluded.active_paying,mrr=excluded.mrr,overdue_mrr=excluded.overdue_mrr,paused_mrr=excluded.paused_mrr,arpu=excluded.arpu,sales_mtd_submitted=excluded.sales_mtd_submitted,sales_mtd_successful=excluded.sales_mtd_successful,sales_mtd_failed=excluded.sales_mtd_failed,sales_mtd_refunded=excluded.sales_mtd_refunded,sales_day=excluded.sales_day,collection_rate=excluded.collection_rate,source=excluded.source,data_quality=excluded.data_quality`)

// post: link FKs, joiners/leavers/net, churn, connector_state
const finalDate = acceptedDates[acceptedDates.length - 1]
fs.writeFileSync(path.join(OUT, `99_post.sql`), `
update iq.member_movements mm set member_id = m.id
from iq.members m where mm.site_id = m.site_id and mm.source_member_id = m.source_member_id and mm.member_id is null;

update iq.site_metrics_daily d set
  joiners = (select count(*) from iq.member_movements mm where mm.site_id = d.site_id and mm.occurred_on = d.metric_date and mm.movement in ('join','rejoin')),
  leavers = (select count(*) from iq.member_movements mm where mm.site_id = d.site_id and mm.occurred_on = d.metric_date and mm.movement in ('disappear','cancel'))
where d.site_id = '${SITE}';

update iq.site_metrics_daily set net_change = joiners - leavers where site_id = '${SITE}';

update iq.site_metrics_daily d set churn_30d_pct = (
  select round(100.0 * (
    select count(*) from iq.member_movements mm
    where mm.site_id = d.site_id and mm.movement in ('disappear','cancel')
      and mm.occurred_on between d.metric_date - 29 and d.metric_date
  ) / nullif((
    select d2.active_members from iq.site_metrics_daily d2
    where d2.site_id = d.site_id and d2.metric_date <= d.metric_date - 30 and d2.active_members is not null
    order by d2.metric_date desc limit 1
  ), 0), 2)
) where d.site_id = '${SITE}' and d.metric_date >= (select min(metric_date) from iq.site_metrics_daily where site_id = d.site_id) + 30;

update iq.connector_state set last_attempt_at = now(), last_success_at = now(), last_asof = '${finalDate}',
  consecutive_failures = 0, cursor = jsonb_build_object('last_file_date','${finalDate}','mode','backfill'), updated_at = now()
where site_id = '${SITE}';
`)

// ---------- 7. summary for validation ----------
const monthAgg: Record<string, { joins: number; leavers: number }> = {}
for (const mv of result.movements) {
  const mo = mv.occurredOn.slice(0, 7)
  monthAgg[mo] ??= { joins: 0, leavers: 0 }
  if (mv.movement === 'join' || mv.movement === 'rejoin') monthAgg[mo].joins++
  if (mv.movement === 'disappear' || mv.movement === 'cancel') monthAgg[mo].leavers++
}
const checkpoints: Record<string, unknown> = {}
for (const d of ['2026-04-06', '2026-04-12', '2026-05-16', '2026-07-30']) {
  const r = metricByDate.get(d) ?? result.metrics.find((m) => m.metricDate === d)
  checkpoints[d] = r ?? 'no row'
}
const summary = {
  snapshotFiles: byDate.size,
  batchesParsed: batches.length,
  quarantinedDates: result.quarantinedDates,
  parseWarnings,
  membersCurrent: result.finalMembers.size,
  membersDeparted: departed.size,
  pendingAbsences: [...result.pendingAbsences.entries()].length,
  movements: result.movements.length,
  movementsByKind: result.movements.reduce<Record<string, number>>((a, m) => ((a[m.movement] = (a[m.movement] ?? 0) + 1), a), {}),
  metricRows: metricRows.length,
  snapshotRowsToDb: snapRows.length,
  monthlyJoinsLeavers: monthAgg,
  checkpoints,
  finalMetrics: result.metrics[result.metrics.length - 1],
  sqlFiles: fs.readdirSync(OUT).length,
}
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
