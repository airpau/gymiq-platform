/**
 * Generic table connector: any CRM's member export (CSV or XLSX) → CanonicalBatch.
 *
 * Covers every CRM that can export a member list but has no API a franchisee or
 * small club can use: ClubRight, TeamUp, Ashbourne, Xplor/Resamania, Mindbody,
 * GymMaster, PushPress, and a bare spreadsheet. Glofox keeps its own dialect
 * (glofox-xlsx.ts) because its quirks are well understood; everything else goes
 * through here with a per-CRM preset plus header auto-detection, and any site
 * can override the mapping in `iq.sites.crm_config.column_map`.
 *
 * crm_config keys (all optional):
 *   column_map: { email: "E-mail", status: "Member status", joined_at: "Start Date", ... }
 *   status_map: { "Live": "active", "Frozen": "paused", "Lapsed": "cancelled" }
 *   date_format: "dmy" | "mdy" | "ymd" | "auto"     (default: preset, else auto)
 *   fee_period:  "monthly" | "annual" | "auto"      (auto = ÷12 when plan/payment text says annual)
 *   full_snapshot: true|false                        (default true: the export IS the current list)
 *   sheet: "Members"                                  (XLSX sheet name; default first sheet)
 *
 * Like the Glofox connector this is pure: no I/O, no DB, no LLM.
 */
import { createHash } from 'node:crypto'
import type {
  CanonicalBatch, CanonicalMember, CanonicalMemberPii, ConnectorCapabilities, CrmConnector, CrmType,
  DdStatus, IsoDate, MemberStatus, NamedRows, SiteConfig,
} from '../contract'

export type CanonicalField =
  | 'member_id' | 'email' | 'phone' | 'full_name' | 'first_name' | 'last_name' | 'birth_date'
  | 'status' | 'joined_at' | 'cancelled_at' | 'end_date' | 'membership' | 'plan' | 'fee' | 'payment_type'
  | 'last_visit' | 'total_visits' | 'paused_from' | 'paused_to' | 'source' | 'arrears'

export type DateFormat = 'dmy' | 'mdy' | 'ymd' | 'auto'

export interface TableDialect {
  /** Header aliases per field, checked case-insensitively, exact first then substring. */
  headers: Partial<Record<CanonicalField, string[]>>
  statusMap: Record<string, MemberStatus>
  dateFormat: DateFormat
  feePeriod: 'monthly' | 'annual' | 'auto'
  fullSnapshot: boolean
  sheet?: string
}

/** Header vocabulary shared by every preset; presets add CRM-specific names on top. */
const COMMON: TableDialect['headers'] = {
  member_id: ['member id', 'client id', 'customer id', 'id', 'member number', 'membership number', 'barcode', 'account number'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'mobile', 'mobile phone', 'telephone', 'cell phone', 'phone number', 'mobile number'],
  full_name: ['full name', 'name', 'member name', 'client name', 'member'],
  first_name: ['first name', 'forename', 'given name'],
  last_name: ['last name', 'surname', 'family name'],
  birth_date: ['birth date', 'date of birth', 'dob', 'birthday'],
  status: ['status', 'member status', 'membership status', 'client status', 'account status'],
  joined_at: ['join date', 'joined', 'start date', 'membership start', 'commenced at', 'member since', 'date joined', 'created', 'creation date', 'signup date', 'sign up date'],
  cancelled_at: ['cancelled', 'cancellation date', 'cancel date', 'termination date', 'leave date', 'left', 'date cancelled'],
  end_date: ['end date', 'expiry', 'expiry date', 'expires', 'expiration date', 'membership end', 'renewal date'],
  membership: ['membership', 'membership name', 'membership type', 'product', 'package', 'contract'],
  plan: ['plan', 'plan name', 'rate plan', 'pricing option', 'tariff', 'subscription'],
  fee: ['price', 'price paid', 'fee', 'monthly fee', 'amount', 'rate', 'monthly price', 'payment amount', 'dd amount', 'direct debit amount'],
  payment_type: ['payment type', 'billing', 'billing period', 'payment frequency', 'frequency', 'billing cycle', 'payment method'],
  last_visit: ['last visit', 'last check in', 'last check-in', 'last attendance', 'last attended', 'last seen', 'last swipe', 'last booking'],
  total_visits: ['total visits', 'visits', 'check ins', 'check-ins', 'attendances', 'visit count', 'total check ins'],
  paused_from: ['paused from', 'freeze start', 'hold start', 'frozen from', 'suspended from'],
  paused_to: ['paused to', 'freeze end', 'hold end', 'frozen to', 'suspended to'],
  source: ['lead source', 'source', 'referral source', 'how did you hear', 'acquisition source', 'channel'],
  arrears: ['arrears', 'balance', 'outstanding', 'amount due', 'overdue amount', 'balance due'],
}

const COMMON_STATUS: Record<string, MemberStatus> = {
  active: 'active', live: 'active', current: 'active', ok: 'active', good: 'active', paid: 'active', member: 'active',
  overdue: 'overdue', arrears: 'overdue', 'in arrears': 'overdue', unpaid: 'overdue', failed: 'overdue', 'payment failed': 'overdue', 'past due': 'overdue', defaulted: 'overdue',
  paused: 'paused', frozen: 'paused', freeze: 'paused', hold: 'paused', 'on hold': 'paused', suspended: 'suspended',
  cancelled: 'cancelled', canceled: 'cancelled', terminated: 'cancelled', left: 'cancelled', lapsed: 'cancelled', ended: 'cancelled', inactive: 'cancelled', 'non-member': 'cancelled',
  expired: 'expired', expiring: 'active',
}

/** Per-CRM presets. Header names are the ones these systems are known to use in member exports;
 *  auto-detection covers drift and the site's column_map overrides anything. */
export const DIALECTS: Record<Exclude<CrmType, 'glofox'>, TableDialect> = {
  clubright: {
    headers: { ...COMMON, member_id: ['member number', 'membership number', ...(COMMON.member_id ?? [])], joined_at: ['start date', 'join date', ...(COMMON.joined_at ?? [])], plan: ['membership', 'membership type', ...(COMMON.plan ?? [])], fee: ['monthly fee', 'dd amount', ...(COMMON.fee ?? [])] },
    statusMap: { ...COMMON_STATUS, live: 'active', 'dd failed': 'overdue', 'notice given': 'active', 'frozen': 'paused' },
    dateFormat: 'dmy', feePeriod: 'auto', fullSnapshot: true,
  },
  teamup: {
    headers: { ...COMMON, member_id: ['customer id', 'id', ...(COMMON.member_id ?? [])], plan: ['membership', 'membership name', ...(COMMON.plan ?? [])], joined_at: ['membership start', 'start date', 'created', ...(COMMON.joined_at ?? [])], last_visit: ['last attendance', 'last attended', ...(COMMON.last_visit ?? [])] },
    statusMap: { ...COMMON_STATUS, 'on hold': 'paused', 'payment failed': 'overdue' },
    dateFormat: 'dmy', feePeriod: 'auto', fullSnapshot: true,
  },
  ashbourne: {
    headers: { ...COMMON, member_id: ['membership number', 'member no', 'member number', ...(COMMON.member_id ?? [])], fee: ['dd amount', 'direct debit amount', 'monthly amount', ...(COMMON.fee ?? [])], joined_at: ['start date', 'join date', ...(COMMON.joined_at ?? [])] },
    statusMap: { ...COMMON_STATUS, live: 'active', 'dd cancelled': 'cancelled', 'dd failed': 'overdue', 'unpaid': 'overdue' },
    dateFormat: 'dmy', feePeriod: 'monthly', fullSnapshot: true,
  },
  xplor: {
    headers: { ...COMMON, member_id: ['member id', 'member number', ...(COMMON.member_id ?? [])], plan: ['contract', 'membership type', 'plan', ...(COMMON.plan ?? [])], fee: ['contract value', 'monthly fee', 'amount', ...(COMMON.fee ?? [])] },
    statusMap: { ...COMMON_STATUS, 'in arrears': 'overdue', frozen: 'paused', 'non-member': 'cancelled' },
    dateFormat: 'dmy', feePeriod: 'auto', fullSnapshot: true,
  },
  mindbody: {
    headers: { ...COMMON, member_id: ['client id', 'id', ...(COMMON.member_id ?? [])], plan: ['pricing option', 'membership', 'contract', ...(COMMON.plan ?? [])], joined_at: ['creation date', 'first visit', 'contract start', 'start date', ...(COMMON.joined_at ?? [])], last_visit: ['last visit', 'last visit date', ...(COMMON.last_visit ?? [])], total_visits: ['total visits', 'visits', ...(COMMON.total_visits ?? [])], status: ['status', 'client status', 'membership status', 'active', ...(COMMON.status ?? [])] },
    statusMap: { ...COMMON_STATUS, 'yes': 'active', 'no': 'cancelled', 'true': 'active', 'false': 'cancelled', 'suspended': 'paused', 'declined': 'overdue' },
    dateFormat: 'mdy', feePeriod: 'auto', fullSnapshot: true,
  },
  gymmaster: {
    headers: { ...COMMON, member_id: ['member id', 'membership id', ...(COMMON.member_id ?? [])], plan: ['membership', 'membership type', 'membership name', ...(COMMON.plan ?? [])], fee: ['price', 'fee', 'amount', ...(COMMON.fee ?? [])], last_visit: ['last visit', 'last check in', ...(COMMON.last_visit ?? [])] },
    statusMap: { ...COMMON_STATUS, current: 'active', 'on hold': 'paused', 'debtor': 'overdue' },
    dateFormat: 'dmy', feePeriod: 'auto', fullSnapshot: true,
  },
  csv: {
    headers: COMMON,
    statusMap: COMMON_STATUS,
    dateFormat: 'auto', feePeriod: 'auto', fullSnapshot: true,
  },
}

export const genericCapabilities: ConnectorCapabilities = {
  members: true, payments: 'status_only', visits: false, leads: false, webhooks: false,
}

// ---------------------------------------------------------------- parsing helpers

const norm = (h: string) => h.toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim()

/** Resolve which header feeds each canonical field: column_map override → exact alias → substring alias. */
export function resolveColumns(headers: string[], dialect: TableDialect, override: Record<string, string> = {}): Partial<Record<CanonicalField, string>> {
  const out: Partial<Record<CanonicalField, string>> = {}
  const byNorm = new Map(headers.map((h) => [norm(h), h]))
  const used = new Set<string>()
  const fields = Object.keys(dialect.headers) as CanonicalField[]
  for (const f of fields) {
    const o = override[f]
    if (o && headers.includes(o)) { out[f] = o; used.add(o) }
  }
  for (const f of fields) {
    if (out[f]) continue
    for (const alias of dialect.headers[f] ?? []) {
      const h = byNorm.get(norm(alias))
      if (h && !used.has(h)) { out[f] = h; used.add(h); break }
    }
  }
  for (const f of fields) {
    if (out[f]) continue
    for (const alias of dialect.headers[f] ?? []) {
      const a = norm(alias)
      const h = headers.find((x) => !used.has(x) && norm(x).includes(a) && a.length >= 4)
      if (h) { out[f] = h; used.add(h); break }
    }
  }
  return out
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

/** Parses a date in the declared format; 'auto' prefers ISO, then unambiguous, then DMY (UK default). */
export function parseDate(value: unknown, fmt: DateFormat): IsoDate | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    // Excel serial date
    const d = new Date(Math.round((value - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/)
  if (m) {
    const a = Number(m[1]), b = Number(m[2]); let y = Number(m[3]); if (y < 100) y += 2000
    if (fmt === 'mdy') return iso(y, a, b)
    if (fmt === 'dmy') return iso(y, b, a)
    if (fmt === 'ymd') return null
    // auto: whichever is unambiguous, else UK
    if (a > 12 && b <= 12) return iso(y, b, a)
    if (b > 12 && a <= 12) return iso(y, a, b)
    return iso(y, b, a)
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/)
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return iso(Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]))
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return iso(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]))
  return null
}
function iso(y: number, mo: number, d: number): IsoDate | null {
  if (!(y > 1900 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseMoney(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[£$€,\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function mapStatus(raw: unknown, statusMap: Record<string, MemberStatus>): MemberStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'unknown'
  if (statusMap[s]) return statusMap[s]
  for (const [k, v] of Object.entries(statusMap)) if (s.includes(k)) return v
  return 'unknown'
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' || s.toUpperCase() === 'N/A' ? null : s
}

export function pseudoId(siteSalt: string, identityKey: string): string {
  return createHash('sha256').update(`${siteSalt}:${identityKey}`).digest('hex').slice(0, 16)
}

// ---------------------------------------------------------------- the connector

export function dialectFor(crm: CrmType, crmConfig: Record<string, unknown>): TableDialect {
  const base = crm === 'glofox' ? DIALECTS.csv : DIALECTS[crm] ?? DIALECTS.csv
  return {
    headers: base.headers,
    statusMap: { ...base.statusMap, ...Object.fromEntries(Object.entries((crmConfig.status_map as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v as MemberStatus])) },
    dateFormat: (crmConfig.date_format as DateFormat) ?? base.dateFormat,
    feePeriod: (crmConfig.fee_period as TableDialect['feePeriod']) ?? base.feePeriod,
    fullSnapshot: typeof crmConfig.full_snapshot === 'boolean' ? crmConfig.full_snapshot : base.fullSnapshot,
    sheet: (crmConfig.sheet as string) ?? base.sheet,
  }
}

export function parseGenericMembersFile(site: SiteConfig, file: NamedRows, crm: CrmType = 'csv'): CanonicalBatch {
  const dialect = dialectFor(crm, site.crmConfig)
  const headers = file.rows.length ? Object.keys(file.rows[0]) : []
  const cols = resolveColumns(headers, dialect, (site.crmConfig.column_map as Record<string, string>) ?? {})
  const warnings: string[] = []
  const get = (row: Record<string, unknown>, f: CanonicalField) => (cols[f] ? row[cols[f]!] : undefined)

  if (!cols.status) warnings.push('no status column detected: every row treated as active')
  if (!cols.email && !cols.member_id && !cols.phone && !cols.full_name) {
    return { asOf: file.asOf ?? '', isFullSnapshot: dialect.fullSnapshot, members: [], pii: [], provenance: { connector: 'generic-table', crm, file: file.name, rawRows: file.rows.length, columns: cols }, warnings: ['no identity column (email, id, phone or name) detected; nothing ingested'] }
  }

  const rank: Record<MemberStatus, number> = { active: 6, overdue: 5, paused: 4, suspended: 3, unknown: 2, expired: 1, cancelled: 0 }
  const byId = new Map<string, { m: CanonicalMember; p: CanonicalMemberPii }>()
  let unidentifiable = 0

  for (const row of file.rows) {
    const email = str(get(row, 'email'))?.toLowerCase() ?? null
    const memberId = str(get(row, 'member_id'))
    const phone = str(get(row, 'phone'))?.replace(/\D/g, '') || null
    const fullName = str(get(row, 'full_name')) ?? ([str(get(row, 'first_name')), str(get(row, 'last_name'))].filter(Boolean).join(' ') || null)
    const dob = parseDate(get(row, 'birth_date'), dialect.dateFormat)
    let ident: { key: string; confidence: CanonicalMember['identityConfidence'] } | null = null
    if (email) ident = { key: `e:${email}`, confidence: 'high' }
    else if (memberId) ident = { key: `i:${memberId}`, confidence: 'high' }
    else if (phone) ident = { key: `p:${phone}`, confidence: 'medium' }
    else if (fullName) ident = { key: `n:${fullName.toLowerCase()}|${dob ?? ''}`, confidence: 'low' }
    if (!ident) { unidentifiable++; continue }

    const id = pseudoId(site.siteId, ident.key)
    const status = cols.status ? mapStatus(get(row, 'status'), dialect.statusMap) : 'active'
    const paymentType = str(get(row, 'payment_type'))
    const plan = str(get(row, 'plan')) ?? str(get(row, 'membership'))
    const feeRaw = parseMoney(get(row, 'fee'))
    const hint = `${paymentType ?? ''} ${plan ?? ''}`.toLowerCase()
    const monthlyFee = feeRaw == null ? null
      : dialect.feePeriod === 'annual' ? Math.round((feeRaw / 12) * 100) / 100
      : dialect.feePeriod === 'monthly' ? feeRaw
      : /(year|annual|12\s*month)/.test(hint) ? Math.round((feeRaw / 12) * 100) / 100
      : /(week)/.test(hint) ? Math.round(feeRaw * 52 / 12 * 100) / 100
      : feeRaw
    const arrears = parseMoney(get(row, 'arrears'))
    const ddStatus: DdStatus = status === 'overdue' || (arrears != null && arrears > 0) ? 'overdue' : status === 'active' ? 'ok' : 'na'
    const cancelledAt = parseDate(get(row, 'cancelled_at'), dialect.dateFormat)
    const member: CanonicalMember = {
      sourceMemberId: id,
      status: cancelledAt && status === 'unknown' ? 'cancelled' : status,
      joinedAt: parseDate(get(row, 'joined_at'), dialect.dateFormat),
      cancelledAt,
      membershipRaw: str(get(row, 'membership')),
      planRaw: plan,
      monthlyFee,
      paymentType,
      isGroup: null,
      ddStatus,
      arrearsAmount: arrears,
      lastVisitAt: parseDate(get(row, 'last_visit'), dialect.dateFormat),
      totalVisits: Number.isFinite(Number(get(row, 'total_visits'))) && get(row, 'total_visits') !== '' && get(row, 'total_visits') != null ? Number(get(row, 'total_visits')) : null,
      pausedFrom: parseDate(get(row, 'paused_from'), dialect.dateFormat),
      pausedTo: parseDate(get(row, 'paused_to'), dialect.dateFormat),
      endDate: parseDate(get(row, 'end_date'), dialect.dateFormat),
      acquisitionSource: str(get(row, 'source')),
      acquisitionEntryPoint: null,
      identityConfidence: ident.confidence,
    }
    const pii: CanonicalMemberPii = { sourceMemberId: id, fullName, email, phone: str(get(row, 'phone')), birthDate: dob }
    const existing = byId.get(id)
    if (!existing || rank[member.status] > rank[existing.m.status]) byId.set(id, { m: member, p: pii })
  }

  const unknownStatuses = [...byId.values()].filter((v) => v.m.status === 'unknown').length
  if (unknownStatuses) warnings.push(`${unknownStatuses} rows had a status the dialect does not recognise (add to crm_config.status_map)`)
  if (unidentifiable) warnings.push(`${unidentifiable} rows had no usable identity key and were skipped`)
  const dupes = file.rows.length - unidentifiable - byId.size
  if (dupes > 0) warnings.push(`${dupes} duplicate-identity rows collapsed`)
  if (!file.asOf) warnings.push('no asOf date derivable from filename; caller must supply one')

  return {
    asOf: file.asOf ?? '',
    isFullSnapshot: dialect.fullSnapshot,
    members: [...byId.values()].map((v) => v.m),
    pii: [...byId.values()].map((v) => v.p),
    provenance: { connector: 'generic-table', crm, file: file.name, rawRows: file.rows.length, columns: cols },
    warnings,
  }
}

export function genericTableConnector(crm: CrmType): CrmConnector {
  return { crm, capabilities: genericCapabilities, parseFile: (site, file) => parseGenericMembersFile(site, file, crm) }
}
