/**
 * Universal connector type system.
 *
 * All connectors — regardless of tier — output NormalizedMember and
 * NormalizedLead.  The DataPipeline consumes these and handles all DB writes.
 */

// ─── Connector tiers ──────────────────────────────────────────────────────────

/** Which integration method this gym uses */
export type ConnectorType = 'api' | 'browser' | 'email' | 'upload' | 'manual';

/** Status of the latest (or current) sync run */
export type SyncStatus = 'pending' | 'running' | 'success' | 'failed' | 'partial';

// ─── Normalised data shapes ───────────────────────────────────────────────────

/** Standard member record output by every connector */
export interface NormalizedMember {
  /** ID in the source CRM */
  crmId?: string;
  name: string;
  email?: string;
  phone?: string;
  /** 'active' | 'frozen' | 'cancelled' | 'sleeper' — default 'active' */
  status?: string;
  membershipTier?: string;
  joinDate?: Date;
  lastVisit?: Date;
  visitCount30d?: number;
  /** Monthly spend in local currency */
  lifetimeValue?: number;
  /** Extra CRM-specific fields preserved as-is */
  metadata?: Record<string, unknown>;
}

/** Standard lead record output by every connector */
export interface NormalizedLead {
  crmId?: string;
  name?: string;
  email?: string;
  phone?: string;
  /** 'abandoned_cart' | 'web_form' | 'walk_in' | 'call' | 'referral' */
  source: string;
  enquiryDate?: Date;
  /** 0–100 lead quality score */
  score?: number;
  metadata?: Record<string, unknown>;
}

/** Optional visit/check-in record */
export interface NormalizedVisit {
  /** CRM member ID */
  memberCrmId: string;
  date: Date;
  durationMinutes?: number;
  classType?: string;
}

// ─── Sync result ──────────────────────────────────────────────────────────────

export interface SyncCounters {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  total: number;
}

export interface SyncResult {
  gymId: string;
  connectorType: ConnectorType;
  startedAt: Date;
  completedAt: Date;
  status: SyncStatus;
  members: SyncCounters;
  leads: SyncCounters & { followupQueued: number };
  errorMessage?: string;
}

// ─── Connector configs (one shape per tier) ───────────────────────────────────

export interface ApiConnectorConfig {
  type: 'api';
  /** 'mindbody' | 'clubright' | 'abc_fitness' | any future provider */
  provider: string;
  apiKey: string;
  siteId?: string;
  baseUrl?: string;
  /** Any extra provider-specific key→value pairs */
  credentials?: Record<string, string>;
}

export interface BrowserConnectorConfig {
  type: 'browser';
  /** 'glofox' | any future provider */
  provider: string;
  username: string;
  password: string;
  /** Provider-specific branch/location identifier */
  branchId?: string;
  baseUrl?: string;
}

export interface EmailConnectorConfig {
  type: 'email';
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  /** IMAP folder to monitor — defaults to INBOX */
  folder?: string;
  /** Only process emails whose Subject contains this string */
  subjectFilter?: string;
}

export interface UploadConnectorConfig {
  type: 'upload';
  // No credentials — members upload CSV/XLSX manually through the dashboard
}

export interface ManualConnectorConfig {
  type: 'manual';
  // No config — gym staff enter data directly through GymIQ forms
}

export type ConnectorConfig =
  | ApiConnectorConfig
  | BrowserConnectorConfig
  | EmailConnectorConfig
  | UploadConnectorConfig
  | ManualConnectorConfig;
