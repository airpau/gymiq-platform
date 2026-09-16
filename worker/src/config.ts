/**
 * Worker configuration.
 *
 * Exactly ONE secret lives in the Fly environment: DATABASE_URL. Every other
 * secret is read from Supabase Vault through that connection (env vars still
 * win when set, for local runs), so rotating a key is a Vault update, not a
 * redeploy, and the worker secret is generated inside the database and never
 * handled by a person.
 *
 *   Vault name            env override         used for
 *   gymiq_worker_secret   WORKER_SECRET        bearer auth on /run, /artifacts, /playbooks
 *   anthropic_api_key     ANTHROPIC_API_KEY    Agent SDK
 *   resend_api_key        RESEND_API_KEY       email channel (optional)
 */
function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing required env var ${name}`)
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  /** Postgres DSN for the gymiq-ai project. Use the session pooler (aws-1-eu-west-2), not the direct host. */
  databaseUrl: need('DATABASE_URL'),
  /** Default model for playbooks that do not pin one in their frontmatter. */
  defaultModel: process.env.PLAYBOOK_MODEL ?? 'claude-haiku-4-5',
  /** Hard ceiling per run, USD. Playbooks may set a lower value; never a higher one. */
  maxBudgetUsd: Number(process.env.MAX_BUDGET_USD ?? 0.5),
  resendFrom: process.env.RESEND_FROM ?? 'gymIQ <brief@gymiq.ai>',
  /** Local scratch directory for materialised artifacts. */
  scratchDir: process.env.SCRATCH_DIR ?? '/tmp/gymiq-worker',
  /** How many artifacts per site to keep in iq.artifacts (older ones are pruned on upload). */
  artifactsKeepPerSite: Number(process.env.ARTIFACTS_KEEP_PER_SITE ?? 20),
}

const SECRET_MAP = {
  workerSecret: { env: 'WORKER_SECRET', vault: 'gymiq_worker_secret' },
  anthropicApiKey: { env: 'ANTHROPIC_API_KEY', vault: 'anthropic_api_key' },
  resendApiKey: { env: 'RESEND_API_KEY', vault: 'resend_api_key' },
} as const
export type PlatformSecret = keyof typeof SECRET_MAP

const cache = new Map<PlatformSecret, { value: string; at: number }>()
const TTL_MS = 5 * 60_000

/** Platform secret from env, else Vault (cached 5 minutes so a Vault rotation takes effect without a redeploy). */
export async function platformSecret(key: PlatformSecret): Promise<string> {
  const { env, vault } = SECRET_MAP[key]
  if (process.env[env]) return process.env[env] as string
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const { vaultSecret } = await import('./db.js')
  const value = (await vaultSecret(vault)) ?? ''
  cache.set(key, { value, at: Date.now() })
  return value
}
