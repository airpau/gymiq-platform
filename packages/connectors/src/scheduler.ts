/**
 * ConnectorScheduler — polls for gyms whose scheduled sync is due and runs
 * the appropriate connector.
 *
 * Lifecycle:
 *   const scheduler = new ConnectorScheduler();
 *   scheduler.start();   // begin polling every 60 s
 *   scheduler.stop();    // graceful shutdown
 *
 * Each gym stores a cron expression in Gym.syncSchedule (e.g. '0 *\/1 * * *').
 * We use node-cron to evaluate whether the schedule is due and maintain one
 * ScheduledTask per gym.  On each 60-second heartbeat we detect added / removed
 * gyms and adjust the running tasks accordingly.
 */

import cron from 'node-cron';
import { prisma } from '@gymiq/database';
type Gym = any; // TODO: Import from @gymiq/database when types are exported
import { dataPipeline } from './pipeline';
import { createConnector } from './factory';
import type { ConnectorConfig } from './types';

type ScheduledTask = ReturnType<typeof cron.schedule>;

export class ConnectorScheduler {
  private tasks = new Map<string, ScheduledTask>();
  private heartbeat: NodeJS.Timeout | null = null;
  private running = false;

  /** Start the scheduler (idempotent). */
  start(): void {
    if (this.running) return;
    this.running = true;
    console.log('[Scheduler] Starting connector scheduler…');
    // Immediate first load, then every 60 s
    void this.refreshSchedules();
    this.heartbeat = setInterval(() => void this.refreshSchedules(), 60_000);
  }

  /** Graceful shutdown — stops all cron tasks and the heartbeat. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    for (const [gymId, task] of this.tasks) {
      task.stop();
      console.log(`[Scheduler] Stopped task for gym ${gymId}`);
    }
    this.tasks.clear();
    console.log('[Scheduler] Stopped.');
  }

  /** Trigger a sync for a single gym immediately (used by the REST endpoint). */
  async triggerNow(gymId: string): Promise<void> {
    const gym = await prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) throw new Error(`Gym ${gymId} not found`);
    await this.runSync(gym);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async refreshSchedules(): Promise<void> {
    try {
      const gyms = await prisma.gym.findMany({
        where: {
          connectorType: { not: null },
          syncSchedule: { not: null },
        },
      });

      const activeIds = new Set(gyms.map((g) => g.id));

      // Remove tasks for gyms that no longer have a connector / schedule
      for (const [gymId, task] of this.tasks) {
        if (!activeIds.has(gymId)) {
          task.stop();
          this.tasks.delete(gymId);
          console.log(`[Scheduler] Removed task for gym ${gymId}`);
        }
      }

      // Add tasks for new gyms
      for (const gym of gyms) {
        if (!this.tasks.has(gym.id)) {
          this.scheduleGym(gym);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error refreshing schedules:', err);
    }
  }

  private scheduleGym(gym: Gym): void {
    const schedule = gym.syncSchedule ?? '0 */1 * * *'; // default: every hour

    if (!cron.validate(schedule)) {
      console.warn(`[Scheduler] Invalid cron expression for gym ${gym.id}: "${schedule}" — skipping`);
      return;
    }

    const task = cron.schedule(schedule, () => {
      void this.runSync(gym);
    });

    this.tasks.set(gym.id, task);
    console.log(`[Scheduler] Scheduled gym ${gym.id} (${gym.name}) with cron "${schedule}"`);
  }

  private async runSync(gym: Gym): Promise<void> {
    const connectorType = gym.connectorType as string;
    console.log(`[Scheduler] Running sync for gym ${gym.id} (${gym.name}) via ${connectorType}…`);

    const syncLogId = await dataPipeline.createSyncLog(gym.id, connectorType as any);

    try {
      if (!gym.connectorConfig) {
        throw new Error('No connectorConfig set on gym');
      }

      const config = gym.connectorConfig as unknown as ConnectorConfig;
      const connector = createConnector(gym.id, config);

      const [members, leads] = await Promise.all([
        connector.syncMembers(),
        connector.syncLeads(),
      ]);

      const result = await dataPipeline.run(gym.id, connectorType as any, members, leads, syncLogId);

      console.log(
        `[Scheduler] Sync complete for gym ${gym.id}: ` +
          `members +${result.members.created}/~${result.members.updated} ` +
          `leads +${result.leads.created}/~${result.leads.updated} ` +
          `status=${result.status}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Scheduler] Sync failed for gym ${gym.id}:`, message);
      await dataPipeline.failSyncLog(syncLogId, message);
      await prisma.gym.update({
        where: { id: gym.id },
        data: { lastSyncAt: new Date(), lastSyncStatus: 'failed' },
      });
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const connectorScheduler = new ConnectorScheduler();
