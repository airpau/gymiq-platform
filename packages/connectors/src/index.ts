/**
 * @gymiq/connectors — Universal Data Connector System
 *
 * Public API:
 *   createConnector(gymId, config)  → BaseConnector
 *   dataPipeline                    → DataPipeline singleton
 *   connectorScheduler              → ConnectorScheduler singleton
 */

export type {
  ConnectorType,
  ConnectorConfig,
  ApiConnectorConfig,
  BrowserConnectorConfig,
  EmailConnectorConfig,
  UploadConnectorConfig,
  ManualConnectorConfig,
  NormalizedMember,
  NormalizedLead,
  NormalizedVisit,
  SyncResult,
  SyncStatus,
  SyncCounters,
} from './types';

export { BaseConnector } from './base';
export { DataPipeline, dataPipeline } from './pipeline';
export { ConnectorScheduler, connectorScheduler } from './scheduler';

// Tier A — API connectors
export { ApiConnector } from './api/base';
export { MindbodyConnector } from './api/mindbody';
export { ClubRightConnector } from './api/clubright';

// Tier B — Browser connectors
export { BrowserConnector } from './browser/base';
export { GloFoxConnector } from './browser/glofox';

// Tier C — Email connector
export { EmailConnector } from './email/parser';

// ─── Factory ──────────────────────────────────────────────────────────────────

export { createConnector } from './factory';
