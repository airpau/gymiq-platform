/**
 * DataPipeline — single place for ALL database writes and workflow triggers.
 *
 * Every connector feeds normalised data into this pipeline.  The pipeline:
 *   1. Validates each record
 *   2. Upserts members / leads into Postgres via Prisma
 *   3. Queues 3-step abandoned-cart follow-up sequences via BullMQ
 *   4. Creates / updates the SyncLog record
 *   5. Updates Gym.lastSyncAt and Gym.lastSyncStatus
 *
 * Nothing else should write members or leads directly — this is the single
 * source of truth for all data ingestion.
 */

import { prisma } from '@gymiq/database';
import { Queue } from 'bullmq';
import type { NormalizedMember, NormalizedLead, ConnectorType, SyncResult, SyncCounters } from './types';

// ─── BullMQ queue (mirrors apps/api/src/lib/queue.ts) ────────────────────────
// We create a Queue (producer) here.  The Worker lives in apps/api.

function parseRedisOpts(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '6379', 10),
      password: u.password || undefined,
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
    };
  }
}

let _followupQueue: Queue | null = null;

function getFollowupQueue(): Queue {
  if (!_followupQueue) {
    _followupQueue = new Queue('lead-followup', {
      connection: parseRedisOpts(process.env.REDIS_URL || 'redis://localhost:6379'),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    });
    _followupQueue.on('error', (err) =>
      console.error('[Pipeline:Queue] lead-followup error:', err.message)
    );
  }
  return _followupQueue;
}

// ─── Risk score helper ────────────────────────────────────────────────────────

function calcRiskScore(lastVisit: Date | undefined, visitCount30d = 0, status = 'active'): number {
  // Status-based risk scoring (overrides visit-based scoring)
  if (status === 'overdue') return 85; // Payment overdue = high churn risk
  if (status === 'paused' || status === 'frozen') return 65; // Paused members = elevated risk

  // Visit-based risk scoring
  if (!lastVisit) return 60;
  const daysSince = Math.floor((Date.now() - lastVisit.getTime()) / 86_400_000);
  if (daysSince >= 60) return 85;
  if (daysSince >= 30) return 70;
  if (daysSince >= 14) return 50;
  if (daysSince >= 7) return 30;
  if (visitCount30d === 0) return 50;
  if (visitCount30d <= 2) return 35;
  if (visitCount30d <= 6) return 20;
  return 10;
}

// ─── DataPipeline ─────────────────────────────────────────────────────────────

export class DataPipeline {
  /**
   * Process a full sync batch.
   *
   * @param gymId         Target gym
   * @param connectorType For audit logging
   * @param members       Normalised members from the connector (may be empty)
   * @param leads         Normalised leads from the connector (may be empty)
   * @param syncLogId     Optional — ID of a pre-created SyncLog to update in place
   */
  async run(
    gymId: string,
    connectorType: ConnectorType,
    members: NormalizedMember[],
    leads: NormalizedLead[],
    syncLogId?: string
  ): Promise<SyncResult> {
    const startedAt = new Date();

    // Create or reuse SyncLog
    const log = syncLogId
      ? await prisma.syncLog.update({
          where: { id: syncLogId },
          data: { status: 'running', startedAt },
        })
      : await prisma.syncLog.create({
          data: { gymId, connectorType, startedAt, status: 'running' },
        });

    // Update gym status to running
    await prisma.gym.update({
      where: { id: gymId },
      data: { lastSyncStatus: 'running' },
    });

    const memberCounters = await this.upsertMembers(gymId, members);
    const leadCounters = await this.upsertLeads(gymId, leads);

    const completedAt = new Date();
    const hasErrors = memberCounters.errors > 0 || leadCounters.errors > 0;
    const status: SyncResult['status'] =
      memberCounters.errors + leadCounters.errors === memberCounters.total + leadCounters.total &&
      memberCounters.total + leadCounters.total > 0
        ? 'failed'
        : hasErrors
        ? 'partial'
        : 'success';

    // Update SyncLog
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        completedAt,
        status,
        membersCreated: memberCounters.created,
        membersUpdated: memberCounters.updated,
        membersSkipped: memberCounters.skipped,
        membersErrors: memberCounters.errors,
        leadsCreated: leadCounters.created,
        leadsUpdated: leadCounters.updated,
        leadsSkipped: leadCounters.skipped,
        leadsErrors: leadCounters.errors,
        followupQueued: leadCounters.followupQueued,
      },
    });

    // Update Gym summary fields
    await prisma.gym.update({
      where: { id: gymId },
      data: { lastSyncAt: completedAt, lastSyncStatus: status },
    });

    return {
      gymId,
      connectorType,
      startedAt,
      completedAt,
      status,
      members: memberCounters,
      leads: leadCounters,
    };
  }

  // ─── Member upserts ─────────────────────────────────────────────────────────

  private async upsertMembers(gymId: string, members: NormalizedMember[]): Promise<SyncCounters> {
    const counters: SyncCounters = { created: 0, updated: 0, skipped: 0, errors: 0, total: members.length };

    for (const m of members) {
      try {
        const existing = m.crmId
          ? await prisma.member.findFirst({ where: { gymId, crmId: m.crmId } })
          : m.email
          ? await prisma.member.findFirst({ where: { gymId, email: m.email } })
          : null;

        if (!existing && !m.name) {
          counters.skipped++;
          continue;
        }

        const daysSinceVisit = m.lastVisit
          ? Math.floor((Date.now() - m.lastVisit.getTime()) / 86_400_000)
          : null;

        const isSleeper = daysSinceVisit !== null && daysSinceVisit >= 14;
        const rawStatus = m.status ?? 'active';
        const status = isSleeper && rawStatus === 'active' ? 'sleeper' : rawStatus;
        const riskScore = calcRiskScore(m.lastVisit, m.visitCount30d ?? 0, status);

        const data = {
          name: m.name,
          email: m.email ?? null,
          phone: m.phone ?? null,
          crmId: m.crmId ?? null,
          status,
          membershipTier: m.membershipTier ?? null,
          joinDate: m.joinDate ?? null,
          lastVisit: m.lastVisit ?? null,
          visitCount30d: m.visitCount30d ?? 0,
          lifetimeValue: m.lifetimeValue ?? 0,
          riskScore,
        };

        if (existing) {
          await prisma.member.update({ where: { id: existing.id }, data });
          counters.updated++;
        } else {
          await prisma.member.create({ data: { gymId, ...data } });
          counters.created++;
        }
      } catch (err) {
        console.error('[Pipeline] Member upsert error:', err);
        counters.errors++;
        counters.skipped++;
      }
    }

    return counters;
  }

  // ─── Lead upserts ───────────────────────────────────────────────────────────

  private async upsertLeads(
    gymId: string,
    leads: NormalizedLead[]
  ): Promise<SyncCounters & { followupQueued: number }> {
    const counters = { created: 0, updated: 0, skipped: 0, errors: 0, total: leads.length, followupQueued: 0 };
    const newAbandonedLeads: { id: string; phone: string }[] = [];

    for (const l of leads) {
      try {
        if (!l.email && !l.phone) {
          counters.skipped++;
          continue;
        }

        const existing = l.crmId
          ? await prisma.lead.findFirst({ where: { gymId, metadata: { path: ['crmId'], equals: l.crmId } } })
          : l.email
          ? await prisma.lead.findFirst({ where: { gymId, email: l.email } })
          : l.phone
          ? await prisma.lead.findFirst({ where: { gymId, phone: l.phone } })
          : null;

        const data = {
          source: l.source,
          name: l.name ?? null,
          email: l.email ?? null,
          phone: l.phone ?? null,
          enquiryDate: l.enquiryDate ?? new Date(),
          score: l.score ?? 0,
          metadata: { ...(l.metadata ?? {}), ...(l.crmId ? { crmId: l.crmId } : {}) },
        };

        if (existing) {
          await prisma.lead.update({ where: { id: existing.id }, data });
          counters.updated++;
        } else {
          const newLead = await prisma.lead.create({ data: { gymId, currentStage: 'new', ...data } });
          if (l.source === 'abandoned_cart' && newLead.phone) {
            newAbandonedLeads.push({ id: newLead.id, phone: newLead.phone });
          }
          counters.created++;
        }
      } catch (err) {
        console.error('[Pipeline] Lead upsert error:', err);
        counters.errors++;
        counters.skipped++;
      }
    }

    // Queue 3-step abandoned-cart follow-up sequences
    if (newAbandonedLeads.length > 0) {
      const queue = getFollowupQueue();
      const MS_24H = 24 * 60 * 60 * 1_000;
      const MS_72H = 72 * 60 * 60 * 1_000;

      for (const { id: leadId, phone } of newAbandonedLeads) {
        const base = { leadId, gymId, phone };
        await queue.add(`followup-${leadId}-s1`, { ...base, step: 1 });
        await queue.add(`followup-${leadId}-s2`, { ...base, step: 2 }, { delay: MS_24H });
        await queue.add(`followup-${leadId}-s3`, { ...base, step: 3 }, { delay: MS_72H });
        counters.followupQueued++;
      }
    }

    return counters;
  }

  /** Create a SyncLog in 'running' state before the sync starts */
  async createSyncLog(gymId: string, connectorType: ConnectorType): Promise<string> {
    const log = await prisma.syncLog.create({
      data: { gymId, connectorType, startedAt: new Date(), status: 'running' },
    });
    return log.id;
  }

  /** Mark a SyncLog as failed (e.g. connector threw before producing any data) */
  async failSyncLog(syncLogId: string, errorMessage: string): Promise<void> {
    await prisma.syncLog.update({
      where: { id: syncLogId },
      data: { completedAt: new Date(), status: 'failed', errorMessage },
    });
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const dataPipeline = new DataPipeline();
