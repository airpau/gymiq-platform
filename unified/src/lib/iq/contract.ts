/**
 * GymIQ AI Layer — CRM connector contract.
 *
 * This is the plug-and-play boundary. Every CRM (Glofox, ClubRight, TeamUp,
 * Ashbourne, Xplor/Resamania, Mindbody, GymMaster, bare CSV) implements this
 * interface and nothing else. The core pipeline (`pipeline.ts`) consumes
 * `CanonicalBatch` and never knows which CRM produced it.
 *
 * Design rules:
 *  - Connectors TRANSLATE; they never compute metrics.
 *  - No PII outside `pii`: canonical rows carry a pseudonymous `sourceMemberId`
 *    (stable hash of the CRM's best identity key, salted per site).
 *  - Idempotent by construction: batches are full or partial state snapshots
 *    keyed by (siteId, sourceMemberId); re-ingesting the same batch is a no-op.
 *  - A connector that cannot deliver an entity declares it in `capabilities`
 *    and omits it — the core treats absence as "unknown", never as zero.
 */

export type CrmType =
  | 'glofox'
  | 'clubright'
  | 'teamup'
  | 'ashbourne'
  | 'xplor'
  | 'mindbody'
  | 'gymmaster'
  | 'csv'

export type MemberStatus =
  | 'active'
  | 'overdue'
  | 'paused'
  | 'suspended'
  | 'cancelled'
  | 'expired'
  | 'unknown'

export type DdStatus = 'ok' | 'overdue' | 'failed' | 'na'

/** ISO date (YYYY-MM-DD), local to the site's timezone (Europe/London default). */
export type IsoDate = string

export interface CanonicalMember {
  /** Pseudonymous, stable per site. Never an email/phone/name. */
  sourceMemberId: string
  status: MemberStatus
  joinedAt: IsoDate | null
  /** Explicit cancellation/termination date where the CRM provides one. */
  cancelledAt: IsoDate | null
  membershipRaw: string | null
  planRaw: string | null
  /** Normalised to a MONTHLY figure (annual plans ÷ 12 etc.). */
  monthlyFee: number | null
  paymentType: string | null
  isGroup: boolean | null
  ddStatus: DdStatus
  arrearsAmount: number | null
  lastVisitAt: IsoDate | null
  totalVisits: number | null
  pausedFrom: IsoDate | null
  pausedTo: IsoDate | null
  endDate: IsoDate | null
  acquisitionSource: string | null
  acquisitionEntryPoint: string | null
  /** How confident the identity key is (email > barcode > phone > name+dob). */
  identityConfidence: 'high' | 'medium' | 'low'
}

/** PII quarantine payload — written ONLY to iq.member_pii. */
export interface CanonicalMemberPii {
  sourceMemberId: string
  fullName: string | null
  email: string | null
  phone: string | null
  birthDate: IsoDate | null
}

export interface CanonicalPayment {
  sourcePaymentId: string | null
  sourceMemberId: string | null
  amount: number
  status: 'paid' | 'failed' | 'pending' | 'refunded' | 'forgiven'
  dueAt: IsoDate | null
  paidAt: IsoDate | null
  failureReason: string | null
}

export interface CanonicalLead {
  sourceLeadId: string | null
  source: string | null
  status: 'new' | 'contacted' | 'trial' | 'joined' | 'lost'
  createdAtSource: string | null
  firstResponseAt: string | null
}

export interface CanonicalVisit {
  sourceMemberId: string
  visitedAt: string
  kind: 'gym' | 'class'
}

/**
 * Site-level aggregates a CRM exposes that member rows can't reproduce
 * (e.g. Glofox's cumulative month-to-date sales panel). Optional.
 */
export interface CanonicalSiteAggregates {
  salesMtdSubmitted?: number | null
  salesMtdSuccessful?: number | null
  salesMtdFailed?: number | null
  salesMtdRefunded?: number | null
  collectionRatePct?: number | null
  scheduledTotal?: number | null
}

export interface CanonicalBatch {
  /** The date this state was true (snapshot date), site-local. */
  asOf: IsoDate
  /** True when `members` is the FULL current member list (enables disappearance detection). */
  isFullSnapshot: boolean
  members: CanonicalMember[]
  pii: CanonicalMemberPii[]
  payments?: CanonicalPayment[]
  leads?: CanonicalLead[]
  visits?: CanonicalVisit[]
  aggregates?: CanonicalSiteAggregates
  /** Free-form provenance (filename, export tab, connector version…). */
  provenance: Record<string, unknown>
  /** Non-fatal oddities encountered while translating (bad dates, unknown statuses…). */
  warnings: string[]
}

export interface ConnectorCapabilities {
  members: true // non-negotiable: every connector delivers members
  payments: 'full' | 'status_only' | 'none'
  visits: boolean
  leads: boolean
  webhooks: boolean
}

export type SecretBag = Record<string, string>
export type AuthCtx = Record<string, unknown>

export interface SiteConfig {
  siteId: string
  tenantId: string
  timezone: string
  crmConfig: Record<string, unknown>
}

/**
 * The contract. Exactly one of the three modes must be implemented; a CRM may
 * implement several (e.g. API pull AND webhook push).
 */
export interface CrmConnector {
  readonly crm: CrmType
  readonly capabilities: ConnectorCapabilities
  /** Mode 1 — scheduled API pull. */
  auth?(secrets: SecretBag): Promise<AuthCtx>
  pullSnapshot?(ctx: AuthCtx, site: SiteConfig, since?: IsoDate): Promise<CanonicalBatch>
  /** Mode 2 — webhook push. */
  parseWebhook?(site: SiteConfig, payload: unknown): CanonicalBatch
  /** Mode 3 — file drop (CSV/XLSX export). Rows are pre-extracted sheet rows. */
  parseFile?(site: SiteConfig, file: NamedRows): CanonicalBatch
}

/** A parsed spreadsheet: header-keyed row objects, so connectors stay lib-agnostic. */
export interface NamedRows {
  name: string
  /** Best-effort snapshot date derived from filename or file metadata. */
  asOf: IsoDate | null
  rows: Array<Record<string, unknown>>
}
