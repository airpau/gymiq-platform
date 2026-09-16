/**
 * GymIQ AI Layer — daily ingest (Phase 2). Deterministic, idempotent, LLM-free.
 *
 * Run (CLI):   IQ_DB_PW=... npx tsx daily-ingest.mts [--simulate-stale]
 * Run (code):  import { runDailyIngest } from '.../daily-ingest.mts'   (the hosted
 *              worker calls this per site; the CLI is a thin wrapper around it)
 *
 * What it does, in one transaction where it matters:
 *   1. Finds the newest Members_*.xlsx from the openclaw Glofox automation.
 *      Stale (no file for yesterday/today) → feed_silent alert + exit JSON,
 *      never a silent gap.
 *   2. Parses it through the canonical Glofox connector, diffs against the
 *      rolling snapshot window already in iq.member_snapshots (absence needs
 *      CONFIRM_ABSENT_SNAPSHOTS consecutive missing days, so the window is
 *      what makes leaver detection honest across restarts).
 *   3. Upserts members/PII, appends movements (join-guard: an existing member's
 *      changed commencement date is a plan change, never a new join), writes
 *      today's snapshot + metrics (+ sales log merge), recomputes derived
 *      fields (purge-excluded), prunes snapshots beyond retention.
 *   4. Evaluates alert rules from iq.alert_config, inserts deduped alerts.
 *   5. Returns a brief-data object (the CLI prints it as JSON) — the brief
 *      playbook composes the human brief from this and NOTHING else touches
 *      the database.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as XLSX from 'xlsx'
import pg from 'pg'
import { getConnector, memberArtifactPattern, memberSheetHint, asOfFromFilename } from '../../src/lib/iq/connectors/index.ts'
import { runPipeline, CONFIRM_ABSENT_SNAPSHOTS } from '../../src/lib/iq/pipeline.ts'
import { evaluateAlerts, type AlertConfigRow, type MetricDay } from '../../src/lib/iq/alerts.ts'
import type { CanonicalBatch, CanonicalMember, SiteConfig } from '../../src/lib/iq/contract.ts'

// ---- options (tenant #1 / Hoddesdon defaults live in the CLI wrapper at the bottom) ----
export interface IngestOptions {
  tenantId: string
  siteId: string
  siteName: string
  /** Directory holding Members_*.xlsx exports (openclaw downloads dir, or a temp dir the worker filled from storage). */
  artifactDir: string
  /** CRM dialect (iq.sites.crm_type). Default glofox. Picks the connector and the artifact filename pattern. */
  crmType?: string
  /** iq.sites.crm_config (column_map, status_map, date_format, sheet ...). */
  crmConfig?: Record<string, unknown>
  /** Site timezone (iq.sites.timezone). */
  timezone?: string
  /** Optional directory of <YYYY-MM-DD>.json sales-log files. */
  salesLogDir?: string
  /** pg connection: a DSN string or a ClientConfig. */
  dsn: string | pg.ClientConfig
  simulateStale?: boolean
}
export interface IngestOutput {
  status: 'ok' | 'stale'
  siteName: string
  [k: string]: unknown
}
const SNAPSHOT_RETENTION_DAYS = 14
const SNAPSHOT_WINDOW = CONFIRM_ABSENT_SNAPSHOTS + 2

const londonToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10)
const q = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replace(/'/g, "''")}'`
}

async function ingestCore(opts: IngestOptions, client: pg.Client): Promise<IngestOutput> {
  const TENANT = opts.tenantId
  const SITE = opts.siteId
  const SITE_NAME = opts.siteName
  const DOWNLOADS = opts.artifactDir
  const SALES_LOG = opts.salesLogDir ?? ''
  const SIMULATE_STALE = !!opts.simulateStale
  const CRM = opts.crmType ?? 'glofox'
  const CRM_CONFIG = opts.crmConfig ?? {}
  const connector = getConnector(CRM)
  const filePattern = memberArtifactPattern(CRM)
  const today = londonToday()

  async function emitStale(newestDate: string | null, hoursSince: number): Promise<IngestOutput> {
    const asOf = londonToday()
    const config = (await client.query(`select rule, enabled, threshold, sigma, consecutive_days, window_days, params from iq.alert_config where tenant_id=$1 and (site_id is null or site_id=$2)`, [TENANT, SITE])).rows as AlertConfigRow[]
    const alerts = evaluateAlerts({ siteName: SITE_NAME, asOf, history: [], config, hoursSinceLastSync: hoursSince })
    for (const a of alerts) {
      await client.query(
        `insert into iq.alerts (tenant_id, site_id, rule, severity, status, triggered_on, metric_value, threshold_value, message, dedupe_key)
         values ($1::uuid,$2::uuid,$3,$4,'new',$5::date,$6::numeric,$7::numeric,$8,$9) on conflict (dedupe_key) do nothing`,
        [TENANT, SITE, a.rule, a.severity, a.triggeredOn, a.metricValue, a.thresholdValue, a.message, a.dedupeKey])
    }
    await client.query(
      `update iq.connector_state set last_attempt_at=now(), consecutive_failures=consecutive_failures+1, last_error=$2, updated_at=now() where site_id=$1`,
      [SITE, `stale feed: newest export ${newestDate ?? 'none found'}`])
    return { status: 'stale', siteName: SITE_NAME, newestFileDate: newestDate, hoursSinceLastSync: Math.round(hoursSince), alerts: alerts.map((a) => a.message) }
  }

  // ---- 1. locate newest export ----
  const files = fs.readdirSync(DOWNLOADS)
    .filter((n) => filePattern.test(n))
    .map((n) => ({ n, d: asOfFromFilename(n) ?? new Date(fs.statSync(path.join(DOWNLOADS, n)).mtimeMs).toISOString().slice(0, 10) }))
    .filter((f): f is { n: string; d: string } => !!f.d)
    .sort((a, b) => (a.d === b.d ? a.n.localeCompare(b.n) : a.d.localeCompare(b.d)))
  const newest = files[files.length - 1] ?? null
  const st = (await client.query(`select extract(epoch from (now() - last_success_at))/3600.0 h from iq.connector_state where site_id=$1`, [SITE])).rows[0]
  const hoursSince = st?.h != null ? Number(st.h) : 999
  if (SIMULATE_STALE || !newest || newest.d < addDays(today, -1)) {
    return emitStale(newest?.d ?? null, SIMULATE_STALE ? 48 : hoursSince)
  }
  const asOf = newest!.d

  // ---- 2. parse + diff against rolling DB snapshots ----
  const site: SiteConfig = { siteId: SITE, tenantId: TENANT, timezone: opts.timezone ?? 'Europe/London', crmConfig: CRM_CONFIG }
  const wb = XLSX.read(fs.readFileSync(path.join(DOWNLOADS, newest!.n)), { type: 'buffer' })
  const hint = memberSheetHint(CRM, CRM_CONFIG)
  const sheet = hint ? wb.SheetNames.find((s) => s.toLowerCase().includes(hint.toLowerCase())) : wb.SheetNames[0]
  if (!sheet) throw new Error(`no "${hint}" sheet in ${newest!.n} (sheets: ${wb.SheetNames.join(', ')})`)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], { raw: false, defval: null })
  if (!connector.parseFile) throw new Error(`connector ${CRM} has no file mode`)
  const todayBatch = connector.parseFile(site, { name: newest!.n, asOf, rows })
  if (!todayBatch.members.length) throw new Error(`connector ${CRM} produced 0 members from ${newest!.n}: ${todayBatch.warnings.join('; ')}`)

  const snapRows = (await client.query(
    `select snapshot_date::text d, source_member_id, status, plan_raw, monthly_fee, dd_ok, last_visit_at::text lv, total_visits, paused_from::text pf, paused_to::text pt, end_date::text ed, commenced_at::text ca
     from iq.member_snapshots where site_id=$1 and snapshot_date < $2
     and snapshot_date >= (select max(snapshot_date) from iq.member_snapshots where site_id=$1 and snapshot_date < $2) - ${SNAPSHOT_WINDOW}
     order by snapshot_date`, [SITE, asOf])).rows
  const priorBatches = new Map<string, CanonicalMember[]>()
  for (const r of snapRows) {
    const m: CanonicalMember = {
      sourceMemberId: r.source_member_id, status: r.status, joinedAt: r.ca, cancelledAt: null,
      membershipRaw: null, planRaw: r.plan_raw, monthlyFee: r.monthly_fee != null ? Number(r.monthly_fee) : null,
      paymentType: null, isGroup: null, ddStatus: r.dd_ok ? 'ok' : 'na', arrearsAmount: null,
      lastVisitAt: r.lv, totalVisits: r.total_visits, pausedFrom: r.pf, pausedTo: r.pt, endDate: r.ed,
      acquisitionSource: null, acquisitionEntryPoint: null, identityConfidence: 'high',
    }
    if (!priorBatches.has(r.d)) priorBatches.set(r.d, [])
    priorBatches.get(r.d)!.push(m)
  }
  const series: CanonicalBatch[] = [...priorBatches.entries()].map(([d, members]) => ({
    asOf: d, isFullSnapshot: true, members, pii: [], provenance: { from: 'db_snapshot' }, warnings: [],
  }))
  if (series.some((b) => b.asOf === asOf)) {
    // Re-run for a date already ingested: idempotent no-op beyond metric refresh.
    series.splice(series.findIndex((b) => b.asOf === asOf), 1)
  }
  series.push(todayBatch)
  const result = runPipeline(series)
  const todayMetrics = result.metrics[result.metrics.length - 1]

  // ---- 3. writes (one transaction) ----
  await client.query('begin')
  try {
    // movements (join-guard for pre-existing members: commencement drift = plan change)
    const existing = new Set((await client.query(`select source_member_id from iq.members where site_id=$1`, [SITE])).rows.map((r) => r.source_member_id))
    const mv = result.movements.filter((m) => !(m.movement === 'join' && existing.has(m.sourceMemberId)))
    if (mv.length) {
      await client.query(`insert into iq.member_movements (tenant_id,site_id,source_member_id,movement,occurred_on,tenure_days,join_cohort,plan_raw,monthly_fee,detected_by,data_quality) values ` +
        mv.map((m) => `(${q(TENANT)},${q(SITE)},${q(m.sourceMemberId)},${q(m.movement)},${q(m.occurredOn)},${q(m.tenureDays)},${q(m.joinCohort)},${q(m.planRaw)},${q(m.monthlyFee)},${q(m.detectedBy)},${q(m.dataQuality)})`).join(',') +
        ` on conflict (site_id,source_member_id,movement,occurred_on) do nothing`)
    }
    // members upsert (current) — keeps last_seen fresh; new members get first_seen=asOf
    for (let i = 0; i < todayBatch.members.length; i += 500) {
      const chunk = todayBatch.members.slice(i, i + 500)
      await client.query(`insert into iq.members (tenant_id,site_id,source_member_id,status,joined_at,membership_raw,plan_raw,monthly_fee,payment_type,is_group,dd_status,last_visit_at,total_visits,first_seen_on,last_seen_on,acquisition_source,acquisition_entry_point) values ` +
        chunk.map((m) => `(${q(TENANT)},${q(SITE)},${q(m.sourceMemberId)},${q(m.status)},${q(m.joinedAt)},${q(m.membershipRaw)},${q(m.planRaw)},${q(m.monthlyFee)},${q(m.paymentType)},${q(m.isGroup)},${q(m.ddStatus)},${q(m.lastVisitAt)},${q(m.totalVisits)},${q(asOf)},${q(asOf)},${q(m.acquisitionSource)},${q(m.acquisitionEntryPoint)})`).join(',') +
        ` on conflict (site_id,source_member_id) do update set status=excluded.status,joined_at=excluded.joined_at,membership_raw=excluded.membership_raw,plan_raw=excluded.plan_raw,monthly_fee=excluded.monthly_fee,payment_type=excluded.payment_type,is_group=excluded.is_group,dd_status=excluded.dd_status,last_visit_at=excluded.last_visit_at,total_visits=excluded.total_visits,last_seen_on=excluded.last_seen_on,acquisition_source=excluded.acquisition_source,acquisition_entry_point=excluded.acquisition_entry_point,cancelled_at=null,disappeared_on=null,updated_at=now()`)
    }
    // departed (confirmed this run)
    for (const m of mv.filter((x) => x.movement === 'disappear' || x.movement === 'cancel')) {
      await client.query(`update iq.members set status='cancelled', cancelled_at=$3::date, disappeared_on=$3::date, updated_at=now() where site_id=$1 and source_member_id=$2`, [SITE, m.sourceMemberId, m.occurredOn])
    }
    // PII quarantine refresh
    for (let i = 0; i < todayBatch.pii.length; i += 500) {
      const chunk = todayBatch.pii.slice(i, i + 500)
      await client.query(`with v (source_member_id,full_name,email,phone,birth_date) as (values ` +
        chunk.map((p) => `(${q(p.sourceMemberId)},${q(p.fullName)},${q(p.email)},${q(p.phone)},${q(p.birthDate)})`).join(',') +
        `) insert into iq.member_pii (member_id,tenant_id,site_id,full_name,email,phone,birth_date)
         select m.id,${q(TENANT)},${q(SITE)},v.full_name,v.email,v.phone,v.birth_date::date from v join iq.members m on m.site_id=${q(SITE)} and m.source_member_id=v.source_member_id
         on conflict (member_id) do update set full_name=excluded.full_name,email=excluded.email,phone=excluded.phone,birth_date=excluded.birth_date,updated_at=now()`)
    }
    // snapshot for asOf
    for (let i = 0; i < todayBatch.members.length; i += 1000) {
      const chunk = todayBatch.members.slice(i, i + 1000)
      await client.query(`insert into iq.member_snapshots (tenant_id,site_id,snapshot_date,source_member_id,status,plan_raw,monthly_fee,dd_ok,last_visit_at,total_visits,paused_from,paused_to,end_date,commenced_at) values ` +
        chunk.map((m) => `(${q(TENANT)},${q(SITE)},${q(asOf)},${q(m.sourceMemberId)},${q(m.status)},${q(m.planRaw)},${q(m.monthlyFee)},${q(m.ddStatus === 'ok')},${q(m.lastVisitAt)},${q(m.totalVisits)},${q(m.pausedFrom)},${q(m.pausedTo)},${q(m.endDate)},${q(m.joinedAt)})`).join(',') +
        ` on conflict (site_id,snapshot_date,source_member_id) do nothing`)
    }
    await client.query(`delete from iq.member_snapshots where site_id=$1 and snapshot_date < $2::date - ${SNAPSHOT_RETENTION_DAYS}`, [SITE, asOf])
    // metrics row + sales merge
    let sales: Record<string, number | null> = {}
    try {
      const sf = path.join(SALES_LOG, `${asOf}.json`)
      if (SALES_LOG && fs.existsSync(sf)) {
        const j = JSON.parse(fs.readFileSync(sf, 'utf8'))
        sales = { sub: j.submitted ?? null, suc: j.successful ?? null, fail: j.failed ?? null, ref: j.refunded ?? null, cr: j.collection_rate != null ? Number(j.collection_rate) : null }
      }
    } catch { /* sales enrichment is optional */ }
    const prevSuc = (await client.query(`select sales_mtd_successful s from iq.site_metrics_daily where site_id=$1 and metric_date=$2::date-1`, [SITE, asOf])).rows[0]?.s
    const salesDay = sales.suc != null ? (asOf.slice(8) === '01' ? sales.suc : prevSuc != null && addDays(asOf, -1).slice(0, 7) === asOf.slice(0, 7) ? Math.round((sales.suc - Number(prevSuc)) * 100) / 100 : null) : null
    await client.query(`insert into iq.site_metrics_daily (tenant_id,site_id,metric_date,total_members,active_members,overdue_members,paused_members,active_paying,mrr,overdue_mrr,paused_mrr,arpu,sales_mtd_submitted,sales_mtd_successful,sales_mtd_failed,sales_mtd_refunded,sales_day,collection_rate,source)
      values (${q(TENANT)},${q(SITE)},${q(asOf)},${q(todayMetrics.totalMembers)},${q(todayMetrics.activeMembers)},${q(todayMetrics.overdueMembers)},${q(todayMetrics.pausedMembers)},${q(todayMetrics.activePaying)},${q(todayMetrics.mrr)},${q(todayMetrics.overdueMrr)},${q(todayMetrics.pausedMrr)},${q(todayMetrics.arpu)},${q(sales.sub)},${q(sales.suc)},${q(sales.fail)},${q(sales.ref)},${q(salesDay)},${q(sales.cr)},'snapshot')
      on conflict (site_id,metric_date) do update set total_members=excluded.total_members,active_members=excluded.active_members,overdue_members=excluded.overdue_members,paused_members=excluded.paused_members,active_paying=excluded.active_paying,mrr=excluded.mrr,overdue_mrr=excluded.overdue_mrr,paused_mrr=excluded.paused_mrr,arpu=excluded.arpu,sales_mtd_submitted=coalesce(excluded.sales_mtd_submitted,iq.site_metrics_daily.sales_mtd_submitted),sales_mtd_successful=coalesce(excluded.sales_mtd_successful,iq.site_metrics_daily.sales_mtd_successful),sales_mtd_failed=coalesce(excluded.sales_mtd_failed,iq.site_metrics_daily.sales_mtd_failed),sales_mtd_refunded=coalesce(excluded.sales_mtd_refunded,iq.site_metrics_daily.sales_mtd_refunded),sales_day=coalesce(excluded.sales_day,iq.site_metrics_daily.sales_day),collection_rate=coalesce(excluded.collection_rate,iq.site_metrics_daily.collection_rate),computed_at=now()`)
    // derived fields (purge-excluded), last 3 days
    await client.query(`update iq.site_metrics_daily d set
      joiners=(select count(*) from iq.member_movements mm where mm.site_id=d.site_id and mm.occurred_on=d.metric_date and mm.movement in ('join','rejoin') and mm.data_quality<>'purge'),
      leavers=(select count(*) from iq.member_movements mm where mm.site_id=d.site_id and mm.occurred_on=d.metric_date and mm.movement in ('disappear','cancel') and mm.data_quality<>'purge')
      where d.site_id=$1 and d.metric_date >= $2::date - 3`, [SITE, asOf])
    await client.query(`update iq.site_metrics_daily set net_change=joiners-leavers where site_id=$1 and metric_date >= $2::date - 3`, [SITE, asOf])
    await client.query(`update iq.site_metrics_daily d set churn_30d_pct=(
      select round(100.0*(select count(*) from iq.member_movements mm where mm.site_id=d.site_id and mm.movement in ('disappear','cancel') and mm.data_quality<>'purge' and mm.occurred_on between d.metric_date-29 and d.metric_date)
      / nullif((select d2.active_members from iq.site_metrics_daily d2 where d2.site_id=d.site_id and d2.metric_date<=d.metric_date-30 and d2.active_members is not null order by d2.metric_date desc limit 1),0),2))
      where d.site_id=$1 and d.metric_date >= $2::date - 3`, [SITE, asOf])
    await client.query(`update iq.connector_state set last_attempt_at=now(), last_success_at=now(), last_asof=$2, consecutive_failures=0, last_error=null, cursor=jsonb_build_object('last_file',$3::text), updated_at=now() where site_id=$1`, [SITE, asOf, newest!.n])
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  }

  // ---- 4. alerts ----
  const history = (await client.query(
    `select metric_date::text metric_date, joiners, leavers, net_change, overdue_members, active_members
     from iq.site_metrics_daily where site_id=$1 and metric_date <= $2 order by metric_date desc limit 60`, [SITE, asOf])).rows.reverse() as MetricDay[]
  const config = (await client.query(`select rule, enabled, threshold, sigma, consecutive_days, window_days, params from iq.alert_config where tenant_id=$1 and (site_id is null or site_id=$2)`, [TENANT, SITE])).rows as AlertConfigRow[]
  const eqw = (await client.query(
    `select count(*) filter (where occurred_on > $2::date-28 and tenure_days<=30) cq,
            count(*) filter (where occurred_on <= $2::date-28 and occurred_on > $2::date-56 and tenure_days<=30) pq
     from iq.member_movements where site_id=$1 and movement in ('disappear','cancel') and data_quality<>'purge'`, [SITE, asOf])).rows[0]
  const joiners28 = (await client.query(`select count(*) c from iq.member_movements where site_id=$1 and movement in ('join','rejoin') and occurred_on > $2::date-28`, [SITE, asOf])).rows[0]
  const candidates = evaluateAlerts({
    siteName: SITE_NAME, asOf, history, config,
    earlyQuit: { currentQuits: Number(eqw.cq), priorQuits: Number(eqw.pq), currentJoiners: Number(joiners28.c) },
    hoursSinceLastSync: 0,
  })
  const newAlerts: string[] = []
  for (const a of candidates) {
    const r = await client.query(
      `insert into iq.alerts (tenant_id,site_id,rule,severity,status,triggered_on,metric_value,threshold_value,message,dedupe_key)
       values ($1::uuid,$2::uuid,$3,$4,'new',$5::date,$6::numeric,$7::numeric,$8,$9) on conflict (dedupe_key) do nothing returning id`,
      [TENANT, SITE, a.rule, a.severity, a.triggeredOn, a.metricValue, a.thresholdValue, a.message, a.dedupeKey])
    if (r.rowCount) newAlerts.push(`[${a.severity}] ${a.message}`)
  }
  const openAlerts = (await client.query(`select severity, message from iq.alerts where site_id=$1 and status='new' order by created_at desc limit 10`, [SITE])).rows

  // ---- 5. brief data out ----
  const fin = (await client.query(`select finance_config from iq.sites where id=$1`, [SITE])).rows[0].finance_config
  const mtd2 = (await client.query(
    `select coalesce(sum(joiners),0) j, coalesce(sum(leavers),0) l from iq.site_metrics_daily where site_id=$1 and metric_date >= date_trunc('month',$2::date)`, [SITE, asOf])).rows[0]
  const eq30 = (await client.query(
    `select count(*) t, count(*) filter (where tenure_days<90) u90 from iq.member_movements where site_id=$1 and movement in ('disappear','cancel') and data_quality<>'purge' and occurred_on >= date_trunc('month',$2::date)`, [SITE, asOf])).rows[0]
  const yesterday = history.length >= 2 ? history[history.length - 2] : null
  const suc = (await client.query(`select sales_mtd_successful s, collection_rate cr from iq.site_metrics_daily where site_id=$1 and metric_date=$2`, [SITE, asOf])).rows[0]
  const successful = suc?.s != null ? Number(suc.s) : null
  const franchisePct = Number(fin?.franchise_pct ?? 0)
  const techFee = Number((fin?.fixed_fees ?? []).reduce?.((a: number, f: { amount?: number }) => a + Number(f.amount ?? 0), 0) ?? 0)
  const netReceipts = successful != null ? Math.round((successful * (1 - franchisePct / 100) - techFee) * 100) / 100 : null

  // The brief reports the last COMPLETED day. A file exported this morning only
  // holds a partial "today" (joiners after export time are invisible until the
  // next file), so headline numbers use asOf-1 when asOf is today.
  const briefDay = asOf === today ? addDays(asOf, -1) : asOf
  const bd = (await client.query(
    `select total_members, active_members, overdue_members, paused_members, mrr, overdue_mrr, joiners, leavers, net_change, churn_30d_pct
     from iq.site_metrics_daily where site_id=$1 and metric_date=$2`, [SITE, briefDay])).rows[0] ?? null
  const bdMoves = (await client.query(
    `select count(*) filter (where movement in ('join','rejoin') and data_quality<>'purge') j,
            count(*) filter (where movement in ('disappear','cancel') and data_quality<>'purge') l
     from iq.member_movements where site_id=$1 and occurred_on=$2`, [SITE, briefDay])).rows[0]

  const out: IngestOutput = {
    status: 'ok', asOf, siteName: SITE_NAME, file: newest!.n,
    briefDay,
    briefDayMetrics: bd,
    briefDayJoiners: bd?.joiners ?? Number(bdMoves.j),
    briefDayLeavers: bd?.leavers ?? Number(bdMoves.l),
    todaySoFar: asOf === today ? { joiners: history[history.length - 1]?.joiners ?? null, exportTime: newest!.n.match(/_(\d{2})(\d{2})\d{2}\.xlsx$/)?.slice(1, 3).join(':') ?? null } : null,
    today: todayMetrics, yesterdayNet: yesterday?.net_change ?? null,
    dayJoiners: history[history.length - 1]?.joiners ?? null,
    dayLeavers: history[history.length - 1]?.leavers ?? null,
    mtd: { joiners: Number(mtd2.j), leavers: Number(mtd2.l), net: Number(mtd2.j) - Number(mtd2.l), leaversU90: Number(eq30.u90), leaversTotal: Number(eq30.t) },
    salesMtdSuccessful: successful, collectionRate: suc?.cr != null ? Number(suc.cr) : null, netReceiptsMtd: netReceipts,
    churn30d: history[history.length - 1] ? (await client.query(`select churn_30d_pct c from iq.site_metrics_daily where site_id=$1 and metric_date=$2`, [SITE, asOf])).rows[0]?.c : null,
    quarantinedDates: result.quarantinedDates, pendingAbsences: result.pendingAbsences.size,
    connector: { crm: CRM, warnings: todayBatch.warnings, identityLow: todayBatch.members.filter((m) => m.identityConfidence === 'low').length },
    newAlerts, openAlerts,
  }
  return out
}

/** Connects, runs the ingest for one site, records failures on connector_state, always closes the connection. */
export async function runDailyIngest(opts: IngestOptions): Promise<IngestOutput> {
  const client = new pg.Client(opts.dsn as pg.ClientConfig)
  await client.connect()
  try {
    return await ingestCore(opts, client)
  } catch (e: any) {
    try {
      await client.query(`update iq.connector_state set last_attempt_at=now(), consecutive_failures=consecutive_failures+1, last_error=$2, updated_at=now() where site_id=$1`, [opts.siteId, String(e?.message ?? e).slice(0, 500)])
    } catch { /* connection already dead */ }
    throw e
  } finally {
    try { await client.end() } catch { /* already closed */ }
  }
}

// ---- CLI wrapper (unchanged behaviour: prints JSON, exit 0 ok/stale, exit 1 error) ----
const isCli = !!process.argv[1] && /daily-ingest\.m?[jt]s$/.test(process.argv[1])
if (isCli) {
  runDailyIngest({
    tenantId: process.env.IQ_TENANT_ID ?? 'b9fd9f2e-9154-4fea-a211-daef5f9f5640',
    siteId: process.env.IQ_SITE_ID ?? '95f75b9f-2ff3-4c83-9fd0-168651ed7128',
    siteName: process.env.IQ_SITE_NAME ?? 'Hoddesdon',
    artifactDir: process.env.IQ_ARTIFACT_DIR ?? path.join(process.env.HOME ?? '', '.openclaw/workspace/downloads'),
    crmType: process.env.IQ_CRM_TYPE ?? 'glofox',
    salesLogDir: process.env.IQ_SALES_LOG_DIR ?? path.join(process.env.HOME ?? '', '.openclaw/workspace/glofox-sales-log'),
    dsn: process.env.IQ_DB_DSN ?? {
      host: 'aws-1-eu-west-2.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      user: 'postgres.fugixpfgwhnmhtttdzym',
      password: process.env.IQ_DB_PW,
      ssl: { rejectUnauthorized: false },
    },
    simulateStale: process.argv.includes('--simulate-stale'),
  }).then((out) => {
    console.log(JSON.stringify(out, null, 2))
    process.exit(0)
  }).catch((e) => {
    console.error(JSON.stringify({ status: 'error', error: String(e?.message ?? e) }))
    process.exit(1)
  })
}
