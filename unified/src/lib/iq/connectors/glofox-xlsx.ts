/**
 * Glofox connector, v1 — file mode (XLSX "Members" export, sheet "Current Members").
 *
 * Dialect knowledge absorbed from the openclaw reference implementation
 * (~/.openclaw/workspace/glofox-daily-complete.js) and verified empirically
 * against live exports (Feb–Jul 2026):
 *
 *  - Sheet "Current Members" is the full CURRENT member list. Cancelled members
 *    DROP OFF the export — disappearance between snapshots is the cancellation
 *    signal; `Commenced at` is authoritative for joins.
 *  - Statuses seen: ACTIVE, OVERDUE, PAUSED / ON HOLD / HOLD, SUSPENDED.
 *  - Dates are DD/MM/YYYY strings; `Last visit` may carry "DD/MM/YYYY H:MMam".
 *  - `Price paid` is per billing cycle; annual plans detected via `Payment type`
 *    or plan name containing year/annual → ÷ 12 (reference rule).
 *  - Identity: Barcode is only ~27% filled; Email is 100% filled + unique →
 *    identity key = lower(email), pseudonymised with a per-site salt so PII
 *    never enters metrics tables.
 *  - Newer exports (≥ ~Jun 2026) add `Lead source` / `Lead entry point`.
 *
 * A future Glofox API connector (if Glofox grants credentials) implements the
 * same contract; nothing outside this file changes.
 */

import { createHash } from 'node:crypto'
import type {
  CanonicalBatch,
  CanonicalMember,
  CanonicalMemberPii,
  ConnectorCapabilities,
  CrmConnector,
  DdStatus,
  IsoDate,
  MemberStatus,
  NamedRows,
  SiteConfig,
} from '../contract'

export const glofoxCapabilities: ConnectorCapabilities = {
  members: true,
  payments: 'status_only', // OVERDUE status + arrears only; no per-payment feed in the export
  visits: false, // only last-visit/total-visits point-in-time fields
  leads: false, // acquisition source per member, but no lead pipeline feed
  webhooks: false,
}

/** DD/MM/YYYY (optionally with trailing time) → ISO YYYY-MM-DD, else null. */
export function parseUkDate(value: unknown): IsoDate | null {
  if (value == null || value === '') return null
  const s = String(value).trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const day = Number(dd)
  const month = Number(mm)
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  return `${yyyy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function mapStatus(raw: unknown): MemberStatus {
  const s = String(raw ?? '').trim().toUpperCase()
  if (s === 'ACTIVE') return 'active'
  if (s === 'OVERDUE') return 'overdue'
  if (s === 'PAUSED' || s === 'ON HOLD' || s === 'HOLD') return 'paused'
  if (s === 'SUSPENDED') return 'suspended'
  if (s === 'CANCELLED') return 'cancelled'
  if (s === 'EXPIRED') return 'expired'
  return 'unknown'
}

function ddStatusFor(status: MemberStatus, paymentType: string | null): DdStatus {
  if (status === 'overdue') return 'overdue'
  if (status === 'active') return paymentType ? 'ok' : 'na'
  return 'na'
}

/** Reference rule: annual billing cycles normalised to monthly. */
export function monthlyFeeFrom(pricePaid: unknown, paymentType: unknown, planName: unknown): number | null {
  const n = typeof pricePaid === 'number' ? pricePaid : Number(String(pricePaid ?? '').replace(/[£,]/g, ''))
  if (!Number.isFinite(n)) return null
  const hint = `${String(paymentType ?? '')} ${String(planName ?? '')}`.toLowerCase()
  if (/(year|annual|12\s*month)/.test(hint)) return Math.round((n / 12) * 100) / 100
  return Math.round(n * 100) / 100
}

/**
 * Stable pseudonymous member id: sha256(siteSalt:identityKey) → 16 hex chars.
 * Identity preference: email (unique+filled in Glofox) → barcode → phone → name+dob.
 */
export function pseudoId(siteSalt: string, identityKey: string): string {
  return createHash('sha256').update(`${siteSalt}:${identityKey}`).digest('hex').slice(0, 16)
}

function identityFor(row: Record<string, unknown>): { key: string; confidence: CanonicalMember['identityConfidence'] } | null {
  const email = String(row['Email'] ?? '').trim().toLowerCase()
  if (email) return { key: `e:${email}`, confidence: 'high' }
  const barcode = String(row['Barcode'] ?? '').trim()
  if (barcode) return { key: `b:${barcode}`, confidence: 'medium' }
  const phone = String(row['Phone'] ?? '').replace(/\D/g, '')
  if (phone) return { key: `p:${phone}`, confidence: 'medium' }
  const name = String(row['Full Name'] ?? '').trim().toLowerCase()
  const dob = parseUkDate(row['Birth date']) ?? ''
  if (name) return { key: `n:${name}|${dob}`, confidence: 'low' }
  return null
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' || s === 'N/A' ? null : s
}

/**
 * Translate one Glofox Members export into a CanonicalBatch.
 * Pure: no I/O, no DB, no LLM. Duplicate identities within a file collapse to
 * the "most alive" row (active > overdue > paused > rest).
 */
export function parseGlofoxMembersFile(site: SiteConfig, file: NamedRows): CanonicalBatch {
  const warnings: string[] = []
  const rank: Record<MemberStatus, number> = {
    active: 6, overdue: 5, paused: 4, suspended: 3, unknown: 2, expired: 1, cancelled: 0,
  }
  const byId = new Map<string, { m: CanonicalMember; p: CanonicalMemberPii }>()
  let unidentifiable = 0

  for (const row of file.rows) {
    const ident = identityFor(row)
    if (!ident) {
      unidentifiable++
      continue
    }
    const id = pseudoId(site.siteId, ident.key)
    const status = mapStatus(row['Status'])
    const paymentType = str(row['Payment type'])
    const member: CanonicalMember = {
      sourceMemberId: id,
      status,
      joinedAt: parseUkDate(row['Commenced at']),
      cancelledAt: null, // Glofox export has no explicit cancellation date; End Date is forward-looking
      membershipRaw: str(row['Membership Name']),
      planRaw: str(row['Plan Name']),
      monthlyFee: monthlyFeeFrom(row['Price paid'], paymentType, row['Plan Name']),
      paymentType,
      isGroup: typeof row['Is Group membership'] === 'boolean' ? (row['Is Group membership'] as boolean) : null,
      ddStatus: ddStatusFor(status, paymentType),
      arrearsAmount: null, // not in the export; sales panel covers failed totals at site level
      lastVisitAt: parseUkDate(row['Last visit']),
      totalVisits: Number.isFinite(Number(row['Total visits'])) ? Number(row['Total visits']) : null,
      pausedFrom: parseUkDate(row['Paused from']),
      pausedTo: parseUkDate(row['Paused to']),
      endDate: parseUkDate(row['End Date']),
      acquisitionSource: str(row['Lead source']),
      acquisitionEntryPoint: str(row['Lead entry point']),
      identityConfidence: ident.confidence,
    }
    const pii: CanonicalMemberPii = {
      sourceMemberId: id,
      fullName: str(row['Full Name']),
      email: str(row['Email'])?.toLowerCase() ?? null,
      phone: str(row['Phone']),
      birthDate: parseUkDate(row['Birth date']),
    }
    const existing = byId.get(id)
    if (!existing || rank[member.status] > rank[existing.m.status]) {
      byId.set(id, { m: member, p: pii })
    }
  }

  if (unidentifiable > 0) warnings.push(`${unidentifiable} rows had no usable identity key and were skipped`)
  const dupes = file.rows.length - unidentifiable - byId.size
  if (dupes > 0) warnings.push(`${dupes} duplicate-identity rows collapsed`)
  if (!file.asOf) warnings.push('no asOf date derivable from filename; caller must supply one')

  return {
    asOf: file.asOf ?? '',
    isFullSnapshot: true, // the Glofox Members export is always the full current list
    members: [...byId.values()].map((v) => v.m),
    pii: [...byId.values()].map((v) => v.p),
    provenance: { connector: 'glofox-xlsx', file: file.name, rawRows: file.rows.length },
    warnings,
  }
}

/** Filename convention: Members_YYYY-MM-DD_HHMMSS.xlsx (openclaw automation). */
export function asOfFromFilename(name: string): IsoDate | null {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export const glofoxXlsxConnector: CrmConnector = {
  crm: 'glofox',
  capabilities: glofoxCapabilities,
  parseFile: parseGlofoxMembersFile,
}
