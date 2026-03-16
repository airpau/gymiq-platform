/**
 * BaseConnector — abstract base class that every connector (Tier A–E) extends.
 *
 * Contract:
 *  - syncMembers()     → NormalizedMember[]
 *  - syncLeads()       → NormalizedLead[]
 *  - syncVisits()      → NormalizedVisit[]  (optional — default returns [])
 *  - testConnection()  → boolean
 */

import type {
  NormalizedMember,
  NormalizedLead,
  NormalizedVisit,
  ConnectorConfig,
  ConnectorType,
} from './types';

export abstract class BaseConnector {
  readonly gymId: string;
  readonly connectorType: ConnectorType;
  protected readonly config: ConnectorConfig;

  constructor(gymId: string, connectorType: ConnectorType, config: ConnectorConfig) {
    this.gymId = gymId;
    this.connectorType = connectorType;
    this.config = config;
  }

  // ── Required ─────────────────────────────────────────────────────────────

  /** Fetch all members from the source and return in normalised format. */
  abstract syncMembers(): Promise<NormalizedMember[]>;

  /** Fetch all leads/prospects from the source and return in normalised format. */
  abstract syncLeads(): Promise<NormalizedLead[]>;

  /**
   * Verify that the stored credentials / session are valid.
   * Should NOT throw — return false on any failure.
   */
  abstract testConnection(): Promise<boolean>;

  // ── Optional ──────────────────────────────────────────────────────────────

  /** Fetch visit / check-in records.  Override in connectors that support it. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async syncVisits(): Promise<NormalizedVisit[]> {
    return [];
  }

  // ── Logging helpers ───────────────────────────────────────────────────────

  protected log(msg: string): void {
    console.log(`[${this.connectorType.toUpperCase()}:${this.gymId}] ${msg}`);
  }

  protected logError(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? err.message : String(err ?? '');
    console.error(`[${this.connectorType.toUpperCase()}:${this.gymId}] ERROR ${msg}${detail ? ': ' + detail : ''}`);
  }
}
