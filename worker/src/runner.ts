/**
 * Runs one playbook for one site through the Claude Agent SDK, with only the
 * tenant-scoped tools from tools.ts (no built-in tools, no filesystem, no
 * network), a turn cap and a dollar cap, and logs the run to iq.agent_runs.
 */
import * as fs from 'node:fs'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { config } from './config.js'
import { sql } from './db.js'
import { loadSite } from './tenant.js'
import { loadPlaybook } from './playbook.js'
import { buildServer, type ChannelConfig, type RunState } from './tools.js'

export interface RunRequest { playbook: string; siteId: string; dryRun?: boolean; channels?: ChannelConfig }
export interface RunResult {
  runId: string | null
  status: 'ok' | 'error' | 'dry_run'
  output: string | null
  deliveries: RunState['deliveries']
  model: string
  turns: number
  costUsd: number
  inputTokens: number
  outputTokens: number
  error?: string
}

async function channelsFor(playbook: string, siteId: string): Promise<ChannelConfig> {
  const rows = await sql<{ channels: ChannelConfig | null }>(
    `select channels from iq.playbooks where site_id=$1 and playbook=$2 limit 1`, [siteId, playbook]).catch(() => [])
  return rows[0]?.channels ?? {}
}

export async function runPlaybook(req: RunRequest): Promise<RunResult> {
  const site = await loadSite(req.siteId)
  const pb = loadPlaybook(req.playbook)
  const state: RunState = {
    site, playbook: pb.name, dryRun: !!req.dryRun,
    channels: req.channels ?? (await channelsFor(pb.name, site.siteId)),
    deliveries: [],
  }
  const { server, allowedTools } = buildServer(state, pb.tools)
  const model = pb.model ?? config.defaultModel
  const budget = Math.min(pb.maxBudgetUsd ?? config.maxBudgetUsd, config.maxBudgetUsd)
  fs.mkdirSync(config.scratchDir, { recursive: true })

  const today = new Intl.DateTimeFormat('en-GB', { timeZone: site.timezone, dateStyle: 'full' }).format(new Date())
  const systemPrompt = [
    `You are gymIQ, the operating intelligence for ${site.siteName} (tenant: ${site.tenantName}).`,
    `Today is ${today} (${site.timezone}).`,
    `You have tools scoped to this one site. Facts come only from tool results; never invent numbers, names or targets.`,
    `You never see member names or contact details and never ask for them.`,
    `Write in British English. Never use em dashes or en dashes; use commas, colons or full stops.`,
    state.dryRun ? `This is a DRY RUN: still call deliver with the finished text, nothing will be sent.` : '',
  ].filter(Boolean).join('\n')

  let result: RunResult = {
    runId: null, status: 'error', output: null, deliveries: state.deliveries,
    model, turns: 0, costUsd: 0, inputTokens: 0, outputTokens: 0,
  }
  try {
    for await (const msg of query({
      prompt: pb.prompt,
      options: {
        systemPrompt,
        model,
        mcpServers: { gymiq: server },
        allowedTools,
        tools: [],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: pb.maxTurns,
        maxBudgetUsd: budget,
        settingSources: [],
        persistSession: false,
        cwd: config.scratchDir,
        env: { ...process.env, ANTHROPIC_API_KEY: config.anthropicApiKey },
      },
    })) {
      if (msg.type === 'result') {
        result.turns = msg.num_turns
        result.costUsd = msg.total_cost_usd
        result.inputTokens = msg.usage?.input_tokens ?? 0
        result.outputTokens = msg.usage?.output_tokens ?? 0
        if (msg.subtype === 'success') {
          result.status = state.dryRun ? 'dry_run' : 'ok'
          result.output = state.output ?? msg.result
          if (!state.output) result.error = 'agent finished without calling deliver'
          if (!state.dryRun && state.deliveries.length && state.deliveries.every((d) => !d.ok)) { result.status = 'error'; result.error = 'all deliveries failed' }
        } else {
          result.error = `agent ended: ${msg.subtype}`
          result.output = state.output ?? null
        }
      }
    }
  } catch (e: any) {
    result.error = String(e?.message ?? e)
  }

  try {
    const rows = await sql<{ id: string }>(
      `insert into iq.agent_runs (tenant_id, site_id, kind, model, input_tokens, output_tokens, est_cost_usd, status, delivery, output, error)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) returning id`,
      [site.tenantId, site.siteId, pb.name, model, result.inputTokens, result.outputTokens, result.costUsd, result.status,
        JSON.stringify({ dry_run: state.dryRun, channels: Object.keys(state.channels), results: state.deliveries, turns: result.turns }),
        result.output, result.error ?? null])
    result.runId = rows[0]?.id ?? null
    await sql(`update iq.playbooks set last_status=$1, last_run_id=$2, last_run_at=now() where site_id=$3 and playbook=$4`,
      [result.status, result.runId, site.siteId, pb.name]).catch(() => undefined)
  } catch (e: any) {
    // Logging must never mask the run outcome; surface it in the error field instead.
    result.error = (result.error ? result.error + '; ' : '') + `agent_runs insert failed: ${String(e?.message ?? e)}`
  }
  return result
}
