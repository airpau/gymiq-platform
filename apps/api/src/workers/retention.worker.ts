/**
 * Retention Worker
 *
 * Processes jobs from the 'member-churn' BullMQ queue.
 *
 * Each job runs a full heuristic churn analysis for a gym (or all gyms),
 * updates member risk scores, and logs the retention actions that WOULD be
 * taken (dry-run — no actual messages sent). See SAFETY.md.
 *
 * Scheduling:
 *   A repeatable job is registered on startup to run at 02:00 UTC daily.
 *   Manual runs can be triggered via POST /retention/run-analysis.
 */

import { Worker, Job } from 'bullmq';
import { churnQueue, ChurnJobData, redisConnectionOptions } from '../lib/queue';
import { prisma } from '../lib/prisma';
import { runBatchChurnAnalysis, BatchResult } from '../services/churn-engine';
import { logRetentionAction } from '../services/retention-log';

// ─── Daily cron expression ────────────────────────────────────────────────────

const DAILY_CRON = '0 2 * * *'; // 02:00 UTC every day

// ─── Worker logic ─────────────────────────────────────────────────────────────

async function processChurnJob(job: Job<ChurnJobData>): Promise<void> {
  const { gymId, triggeredBy } = job.data;

  console.log(
    `[RetentionWorker] Starting churn analysis | ` +
    `gym: ${gymId ?? 'ALL'} | triggered: ${triggeredBy}`
  );

  // Determine which gyms to process
  const gyms = gymId
    ? [{ id: gymId }]
    : await prisma.gym.findMany({ select: { id: true, name: true } });

  let totalProcessed = 0;
  let totalActionsLogged = 0;

  for (const gym of gyms) {
    await job.updateProgress({ gym: gym.id, phase: 'scoring' });

    // ── Score all members for this gym ──────────────────────────────────────
    const summary = await runBatchChurnAnalysis(prisma, gym.id);
    totalProcessed += summary.processed;

    // ── Log retention actions that WOULD fire (DRY-RUN) ────────────────────
    // Only act on members we can actually reach (have a phone number)
    const actionableMembers = summary.results.filter(
      (r: BatchResult) => r.score.riskBand !== 'low'
    );

    // Fetch phone numbers for actionable members in one query
    const memberPhones = await prisma.member.findMany({
      where: { id: { in: actionableMembers.map((r: BatchResult) => r.memberId) } },
      select: { id: true, name: true, phone: true },
    });
    const phoneMap = new Map(memberPhones.map((m) => [m.id, m]));

    for (const result of actionableMembers) {
      const info = phoneMap.get(result.memberId);
      if (!info) continue;

      const { score } = result;

      // Priority: payment recovery > sleeper category > general high risk
      if (score.paymentRecoveryStage === 3) {
        logRetentionAction({
          gymId: result.gymId, memberId: result.memberId,
          memberName: info.name, phone: info.phone,
          actionType: 'payment_final_notice',
          riskScore: score.riskScore,
          daysOverdue: score.daysOverdue,
          paymentRecoveryStage: 3,
        });
        totalActionsLogged++;

      } else if (score.paymentRecoveryStage === 2) {
        logRetentionAction({
          gymId: result.gymId, memberId: result.memberId,
          memberName: info.name, phone: info.phone,
          actionType: 'payment_warning',
          riskScore: score.riskScore,
          daysOverdue: score.daysOverdue,
          paymentRecoveryStage: 2,
        });
        totalActionsLogged++;

      } else if (score.paymentRecoveryStage === 1) {
        logRetentionAction({
          gymId: result.gymId, memberId: result.memberId,
          memberName: info.name, phone: info.phone,
          actionType: 'payment_reminder',
          riskScore: score.riskScore,
          daysOverdue: score.daysOverdue,
          paymentRecoveryStage: 1,
        });
        totalActionsLogged++;

      } else if (score.interventionType === 'do_not_contact') {
        // 60+ days — sleeping dogs, do not contact (may trigger cancellation)
        // Still log for visibility but mark as DO NOT CONTACT
        console.log(
          `[RetentionWorker] Member ${result.memberId} — ${score.daysSinceLastVisit} days no visit — DO NOT CONTACT (sleeping dog)`
        );

      } else if (score.interventionType === 'manual_call') {
        // 46-60 days — critical, manual staff call
        logRetentionAction({
          gymId: result.gymId, memberId: result.memberId,
          memberName: info.name, phone: info.phone,
          actionType: 'critical_manual_call',
          riskScore: score.riskScore,
          daysSinceVisit: score.daysSinceLastVisit,
        });
        totalActionsLogged++;

      } else if (score.interventionType === 'priority_offer') {
        // 21-45 days — deep sleeper, priority with offer
        logRetentionAction({
          gymId: result.gymId, memberId: result.memberId,
          memberName: info.name, phone: info.phone,
          actionType: 'deep_sleeper_offer',
          riskScore: score.riskScore,
          daysSinceVisit: score.daysSinceLastVisit,
        });
        totalActionsLogged++;

      } else if (score.sleeperCategory === 'light') {
        logRetentionAction({
          gymId: result.gymId, memberId: result.memberId,
          memberName: info.name, phone: info.phone,
          actionType: 'light_sleeper_checkin',
          riskScore: score.riskScore,
          daysSinceVisit: score.daysSinceLastVisit,
        });
        totalActionsLogged++;

      } else if (score.riskBand === 'high') {
        logRetentionAction({
          gymId: result.gymId, memberId: result.memberId,
          memberName: info.name, phone: info.phone,
          actionType: 'high_risk_retention',
          riskScore: score.riskScore,
        });
        totalActionsLogged++;
      }
    }

    // ── Summary log for this gym ────────────────────────────────────────────
    console.log(
      `[RetentionWorker] Gym ${gym.id} | ` +
      `processed: ${summary.processed} | ` +
      `high: ${summary.highRisk}, medium: ${summary.mediumRisk}, low: ${summary.lowRisk} | ` +
      `sleepers: ${summary.sleeperCount} | overdue: ${summary.overdueCount} | ` +
      `actions logged: ${totalActionsLogged}`
    );
  }

  console.log(
    `[RetentionWorker] Complete | ` +
    `total members scored: ${totalProcessed} | ` +
    `total actions logged (dry-run): ${totalActionsLogged}`
  );
}

// ─── Worker setup ─────────────────────────────────────────────────────────────

export function startRetentionWorker() {
  const worker = new Worker<ChurnJobData, void, string>(
    'member-churn',
    processChurnJob,
    { connection: redisConnectionOptions, concurrency: 1 }
  );

  worker.on('completed', (job) =>
    console.log(`[RetentionWorker] Job ${job.id} completed (${job.data.triggeredBy})`)
  );

  worker.on('failed', (job, err) =>
    console.error(`[RetentionWorker] Job ${job?.id} failed:`, err.message)
  );

  worker.on('error', (err) =>
    console.error('[RetentionWorker] Worker error:', err)
  );

  console.log('[RetentionWorker] Started — listening on member-churn queue');
  return worker;
}

// ─── Daily schedule ───────────────────────────────────────────────────────────

/**
 * Register (or refresh) the daily repeatable churn job.
 * Safe to call on every server start — BullMQ deduplicates by job name.
 */
export async function scheduleDailyChurnAnalysis(): Promise<void> {
  try {
    await churnQueue.add(
      'daily-churn-all-gyms',
      { triggeredBy: 'cron' },
      {
        repeat: { pattern: DAILY_CRON },
        jobId: 'daily-churn-all-gyms', // deterministic ID prevents duplicates
      }
    );
    console.log(`[RetentionWorker] Daily cron registered — pattern: ${DAILY_CRON}`);
  } catch (err) {
    console.warn('[RetentionWorker] Failed to register daily cron (Redis unavailable?):', err);
  }
}
