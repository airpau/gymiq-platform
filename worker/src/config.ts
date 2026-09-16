/**
 * Worker configuration. Everything comes from the environment (Fly secrets in
 * production, .env locally). Per-tenant secrets do NOT live here: they are read
 * from Supabase Vault at run time (see db.ts / tenant.ts).
 */
function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing required env var ${name}`)
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  /** Bearer token pg_cron (and you) must present to POST /run. */
  workerSecret: need('WORKER_SECRET'),
  /** Postgres DSN for the gymiq-ai project. Use the session pooler (aws-1-eu-west-2), not the direct host. */
  databaseUrl: need('DATABASE_URL'),
  /** Supabase project URL + service role key, for Storage (artifact bucket). */
  supabaseUrl: need('SUPABASE_URL'),
  supabaseServiceKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  /** Storage bucket holding CRM export artifacts, keyed <site_id>/<filename>. */
  artifactBucket: process.env.ARTIFACT_BUCKET ?? 'iq-artifacts',
  /** Anthropic key used by the Agent SDK. */
  anthropicApiKey: need('ANTHROPIC_API_KEY'),
  /** Default model for playbooks that do not pin one in their frontmatter. */
  defaultModel: process.env.PLAYBOOK_MODEL ?? 'claude-haiku-4-5',
  /** Hard ceiling per run, USD. Playbooks may set a lower value; never a higher one. */
  maxBudgetUsd: Number(process.env.MAX_BUDGET_USD ?? 0.5),
  /** Resend API key for email delivery (optional; email channel disabled if absent). */
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  resendFrom: process.env.RESEND_FROM ?? 'gymIQ <brief@gymiq.ai>',
  /** Local scratch directory for downloaded artifacts. */
  scratchDir: process.env.SCRATCH_DIR ?? '/tmp/gymiq-worker',
}
