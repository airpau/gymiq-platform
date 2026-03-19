/**
 * /connectors routes — manage connector configs and trigger syncs.
 *
 * GET    /connectors           — get current connector config (credentials redacted)
 * POST   /connectors           — create or replace connector config
 * PATCH  /connectors/schedule  — update sync schedule only
 * POST   /connectors/sync      — trigger an immediate sync
 * POST   /connectors/test      — test connection credentials
 * GET    /connectors/logs      — list recent sync logs
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createConnector, dataPipeline } from '@gymiq/connectors';
import type { ConnectorConfig } from '@gymiq/connectors';
import { authenticate, requireGymAccess } from '../middleware/authentication';

export const connectorRouter = Router();

// Apply authentication to all routes
connectorRouter.use(authenticate);
connectorRouter.use(requireGymAccess);

// ─── Validation schemas ───────────────────────────────────────────────────────

const ApiConfigSchema = z.object({
  type: z.literal('api'),
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  siteId: z.string().optional(),
  baseUrl: z.string().url().optional(),
  credentials: z.record(z.string()).optional(),
});

const BrowserConfigSchema = z.object({
  type: z.literal('browser'),
  provider: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  branchId: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

const EmailConfigSchema = z.object({
  type: z.literal('email'),
  host: z.string().min(1),
  port: z.number().int().positive(),
  secure: z.boolean(),
  username: z.string().min(1),
  password: z.string().min(1),
  folder: z.string().optional(),
  subjectFilter: z.string().optional(),
});

const UploadConfigSchema = z.object({ type: z.literal('upload') });
const ManualConfigSchema = z.object({ type: z.literal('manual') });

const ConnectorConfigSchema = z.discriminatedUnion('type', [
  ApiConfigSchema,
  BrowserConfigSchema,
  EmailConfigSchema,
  UploadConfigSchema,
  ManualConfigSchema,
]);

const SetConnectorBody = z.object({
  config: ConnectorConfigSchema,
  syncSchedule: z.string().optional(), // cron expression
});

const ScheduleBody = z.object({
  syncSchedule: z.string(), // cron expression
});

// ─── Helper — redact secrets from config ──────────────────────────────────────

function redactConfig(config: ConnectorConfig): Record<string, unknown> {
  const copy = { ...(config as unknown as Record<string, unknown>) };
  // Redact known secret fields
  for (const key of ['password', 'apiKey', 'credentials']) {
    if (key in copy) copy[key] = '***';
  }
  return copy;
}

// ─── GET /connectors/:gymId ───────────────────────────────────────────────────

connectorRouter.get('/', async (req: Request, res: Response) => {
  const gymId = req.user!.gymId;

  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: {
      id: true,
      connectorType: true,
      connectorConfig: true,
      syncSchedule: true,
      lastSyncAt: true,
      lastSyncStatus: true,
    },
  });

  if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });

  return res.json({
    success: true,
    data: {
      gymId: gym.id,
      connectorType: gym.connectorType,
      connectorConfig: gym.connectorConfig
        ? redactConfig(gym.connectorConfig as unknown as ConnectorConfig)
        : null,
      syncSchedule: gym.syncSchedule,
      lastSyncAt: gym.lastSyncAt,
      lastSyncStatus: gym.lastSyncStatus,
    },
  });
});

// ─── POST /connectors/:gymId ──────────────────────────────────────────────────

connectorRouter.post('/', async (req: Request, res: Response) => {
  const gymId = req.user!.gymId;

  const body = SetConnectorBody.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ success: false, error: 'Invalid body', details: body.error.flatten() });
  }

  const gym = await prisma.gym.findUnique({ where: { id: gymId } });
  if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });

  await prisma.gym.update({
    where: { id: gymId },
    data: {
      connectorType: body.data.config.type,
      connectorConfig: body.data.config as any,
      syncSchedule: body.data.syncSchedule ?? null,
      lastSyncStatus: null,
    },
  });

  return res.json({
    success: true,
    message: `Connector set to type "${body.data.config.type}"`,
  });
});

// ─── PATCH /connectors/:gymId/schedule ───────────────────────────────────────

connectorRouter.patch('/schedule', async (req: Request, res: Response) => {
  const gymId = req.user!.gymId;

  const body = ScheduleBody.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ success: false, error: 'Invalid body', details: body.error.flatten() });
  }

  const gym = await prisma.gym.findUnique({ where: { id: gymId } });
  if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });

  await prisma.gym.update({
    where: { id: gymId },
    data: { syncSchedule: body.data.syncSchedule },
  });

  return res.json({ success: true, message: `Sync schedule updated to "${body.data.syncSchedule}"` });
});

// ─── POST /connectors/:gymId/sync ─────────────────────────────────────────────

connectorRouter.post('/sync', async (req: Request, res: Response) => {
  const gymId = req.user!.gymId;

  const gym = await prisma.gym.findUnique({ where: { id: gymId } });
  if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });

  if (!gym.connectorType || !gym.connectorConfig) {
    return res.status(400).json({ success: false, error: 'No connector configured for this gym' });
  }

  const connectorType = gym.connectorType as ConnectorConfig['type'];

  // Tier D (upload) and E (manual) don't have automated sync
  if (connectorType === 'upload' || connectorType === 'manual') {
    return res.status(400).json({
      success: false,
      error: `Connector type "${connectorType}" does not support automated sync`,
    });
  }

  // Start sync in background — respond immediately
  const syncLogId = await dataPipeline.createSyncLog(gymId, connectorType);

  res.json({
    success: true,
    message: 'Sync started',
    syncLogId,
  });

  // Run async without blocking the response
  (async () => {
    try {
      const config = gym.connectorConfig as unknown as ConnectorConfig;
      const connector = createConnector(gym.id, config);

      const [members, leads] = await Promise.all([
        connector.syncMembers(),
        connector.syncLeads(),
      ]);

      await dataPipeline.run(gym.id, connectorType, members, leads, syncLogId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Connectors] Manual sync failed for gym ${gym.id}:`, message);
      await dataPipeline.failSyncLog(syncLogId, message);
    }
  })();
});

// ─── POST /connectors/:gymId/test ─────────────────────────────────────────────

connectorRouter.post('/test', async (req: Request, res: Response) => {
  const gymId = req.user!.gymId;

  const gym = await prisma.gym.findUnique({ where: { id: gymId } });
  if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });

  if (!gym.connectorConfig) {
    return res.status(400).json({ success: false, error: 'No connector config found' });
  }

  try {
    const config = gym.connectorConfig as unknown as ConnectorConfig;
    const connector = createConnector(gym.id, config);
    const ok = await connector.testConnection();
    return res.json({ success: true, connected: ok });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.json({ success: false, connected: false, error: message });
  }
});

// ─── GET /connectors/:gymId/logs ──────────────────────────────────────────────

connectorRouter.get('/logs', async (req: Request, res: Response) => {
  const gymId = req.user!.gymId;

  const limit = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 100);

  const logs = await prisma.syncLog.findMany({
    where: { gymId: gymId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return res.json({ success: true, data: logs });
});
