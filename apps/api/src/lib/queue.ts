import { Queue } from 'bullmq';

// ─── Job data shapes ─────────────────────────────────────────────────────────

export interface FollowupJobData {
  leadId: string;
  gymId: string;
  step: 1 | 2 | 3;
  phone: string;
}

export interface RetentionJobData {
  memberId: string;
  gymId: string;
}

export interface ChurnJobData {
  /** If set, only analyse members for this gym. Otherwise process all gyms. */
  gymId?: string;
  triggeredBy: 'cron' | 'manual';
}

// ─── Connection options ───────────────────────────────────────────────────────
// BullMQ bundles its own ioredis, so we pass plain RedisOptions (not an
// ioredis instance from the top-level package — that causes type conflicts).

function parseRedisOpts(url: string): {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
} {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '6379', 10),
      password: u.password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
}

export const redisConnectionOptions = parseRedisOpts(
  process.env.REDIS_URL || 'redis://localhost:6379'
);

// ─── Queues ───────────────────────────────────────────────────────────────────

const defaultJobOptions = {
  removeOnComplete: 100,
  removeOnFail: 50,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
};

/** 3-step lead follow-up sequence (step 1 immediate, 2 at +24h, 3 at +72h) */
export const followupQueue = new Queue<FollowupJobData, void, string>('lead-followup', {
  connection: redisConnectionOptions,
  defaultJobOptions,
});

/** Member churn analysis + retention outreach */
export const retentionQueue = new Queue<RetentionJobData, void, string>('member-retention', {
  connection: redisConnectionOptions,
  defaultJobOptions,
});

/** Daily batch churn analysis — scores all members heuristically and logs retention actions */
export const churnQueue = new Queue<ChurnJobData, void, string>('member-churn', {
  connection: redisConnectionOptions,
  defaultJobOptions,
});

followupQueue.on('error', (err) =>
  console.error('[Queue:lead-followup] Error:', err.message)
);

retentionQueue.on('error', (err) =>
  console.error('[Queue:member-retention] Error:', err.message)
);

churnQueue.on('error', (err) =>
  console.error('[Queue:member-churn] Error:', err.message)
);
