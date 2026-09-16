/**
 * Tenant-scoped tools handed to the agent for ONE run. Every tool closes over
 * the SiteContext, so the model cannot address another tenant: there is no
 * site_id argument anywhere. Deterministic work (ingest, metrics, alerts) is
 * plain code the agent calls; the model only composes and decides.
 */
import { z } from 'zod'
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { sql } from './db.js'
import { loadSiteSecrets, type SiteContext } from './tenant.js'
import { materialiseArtifacts, cleanupDir } from './artifacts.js'
import { sendTelegram, sendEmail, sendWhatsApp, type DeliveryResult } from './deliver.js'
import { runDailyIngest, type IngestOutput } from '../../unified/scripts/iq/daily-ingest.mts'
import { memberArtifactPattern } from '../../unified/src/lib/iq/connectors/index.ts'
import { config } from './config.js'

export interface ChannelConfig {
  telegram?: { chat_id_secret?: string; chat_id?: string }
  email?: { to: string[]; subject?: string }
  /** Owner/manager WhatsApp numbers in E.164 (+44...). Twilio creds come from Vault:
   *  twilio_account_sid, twilio_auth_token, twilio_whatsapp_from, whatsapp_brief_template_sid (site-prefixed first). */
  whatsapp?: { to: string[] }
}

export interface RunState {
  site: SiteContext
  playbook: string
  dryRun: boolean
  channels: ChannelConfig
  ingest?: IngestOutput
  deliveries: DeliveryResult[]
  output?: string
}

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })

export function buildTools(state: RunState) {
  const { site } = state

  const run_ingest = tool(
    'run_ingest',
    'Runs the deterministic daily ingest for this site: pulls the newest CRM export from storage, diffs it against the rolling snapshots, writes members/movements/metrics, evaluates alert rules. Returns the brief-data JSON. Call this first; call it once.',
    {},
    async () => {
      if (state.ingest) return text(state.ingest)
      const members = await materialiseArtifacts(site.siteId, memberArtifactPattern(site.crmType), 3)
      const sales = await materialiseArtifacts(site.siteId, /^\d{4}-\d{2}-\d{2}\.json$/, 3)
      try {
        if (!members.files.length) return text({ status: 'stale', siteName: site.siteName, error: `no member export artifacts in storage for this site (crm ${site.crmType})` })
        const out = await runDailyIngest({
          tenantId: site.tenantId, siteId: site.siteId, siteName: site.siteName,
          artifactDir: members.dir,
          crmType: site.crmType, crmConfig: site.crmConfig, timezone: site.timezone,
          salesLogDir: sales.files.length ? sales.dir : undefined,
          dsn: config.databaseUrl,
        })
        state.ingest = out
        return text(out)
      } finally {
        cleanupDir(members.dir)
        cleanupDir(sales.dir)
      }
    },
  )

  const get_metrics = tool(
    'get_metrics',
    'Daily site metrics for the last N days (members, MRR, joiners, leavers, net, churn, sales MTD). Oldest first.',
    { days: z.number().int().min(1).max(120).default(14) },
    async ({ days }) => text(await sql(
      `select metric_date::text as date, total_members, active_members, overdue_members, paused_members, mrr, overdue_mrr, joiners, leavers, net_change, churn_30d_pct, sales_mtd_successful, collection_rate
       from iq.site_metrics_daily where site_id=$1 order by metric_date desc limit $2`, [site.siteId, days]).then((r) => r.reverse())),
  )

  const get_alerts = tool(
    'get_alerts',
    'Alerts for this site. status defaults to new (unacknowledged).',
    { status: z.enum(['new', 'acknowledged', 'resolved', 'all']).default('new'), limit: z.number().int().min(1).max(50).default(20) },
    async ({ status, limit }) => text(await sql(
      `select id, rule, severity, status, triggered_on::text as triggered_on, metric_value, threshold_value, message
       from iq.alerts where site_id=$1 and ($2='all' or status=$2) order by created_at desc limit $3`, [site.siteId, status, limit])),
  )

  const get_movements = tool(
    'get_movements',
    'Member movements (join/rejoin/disappear/cancel) per day for the last N days, purge-excluded, with leaver tenure buckets. Pseudonymous: no names.',
    { days: z.number().int().min(1).max(60).default(7) },
    async ({ days }) => text(await sql(
      `select occurred_on::text as date, movement, count(*)::int as n,
              count(*) filter (where tenure_days < 30)::int as under_30d,
              count(*) filter (where tenure_days >= 30 and tenure_days < 90)::int as d30_90,
              count(*) filter (where tenure_days >= 90)::int as over_90d
       from iq.member_movements where site_id=$1 and data_quality<>'purge' and occurred_on > current_date - $2::int
       group by 1,2 order by 1,2`, [site.siteId, days])),
  )

  const get_site = tool(
    'get_site',
    'Site name, timezone, CRM type and finance config (franchise %, fixed fees, targets). Use targets and fee rules from here, never invent them.',
    {},
    async () => text({ name: site.siteName, tenant: site.tenantName, timezone: site.timezone, crmType: site.crmType, financeConfig: site.financeConfig }),
  )

  const deliver = tool(
    'deliver',
    'Sends the finished brief to the channels configured for this playbook and site. Call exactly once, at the end, with the final text. headline is one sentence with the key numbers (used when WhatsApp can only send a template). In dry-run mode nothing is sent and the text is only recorded.',
    { text: z.string().min(1).max(12000), subject: z.string().max(200).optional(), headline: z.string().max(400).optional() },
    async ({ text: body, subject, headline }) => {
      state.output = body
      const results: DeliveryResult[] = []
      const ch = state.channels
      if (state.dryRun) {
        results.push({ channel: 'telegram', ok: true, detail: 'dry run: not sent' })
      } else {
        if (ch.telegram) {
          const secrets = await loadSiteSecrets(site, ['telegram_bot_token', ...(ch.telegram.chat_id_secret ? [ch.telegram.chat_id_secret] : [])])
          const chatId = ch.telegram.chat_id ?? (ch.telegram.chat_id_secret ? secrets[ch.telegram.chat_id_secret] : undefined)
          if (!secrets.telegram_bot_token || !chatId) results.push({ channel: 'telegram', ok: false, detail: 'telegram bot token or chat id missing in Vault' })
          else results.push(await sendTelegram(secrets.telegram_bot_token, chatId, body))
        }
        if (ch.email?.to?.length) results.push(await sendEmail(ch.email.to, subject ?? ch.email.subject ?? `${site.siteName}: daily brief`, body))
        if (ch.whatsapp?.to?.length) {
          const s = await loadSiteSecrets(site, ['twilio_account_sid', 'twilio_auth_token', 'twilio_whatsapp_from', 'whatsapp_brief_template_sid'])
          if (!s.twilio_account_sid || !s.twilio_auth_token || !s.twilio_whatsapp_from) results.push({ channel: 'whatsapp', ok: false, detail: 'twilio_account_sid / twilio_auth_token / twilio_whatsapp_from missing in Vault' })
          else {
            const day = new Intl.DateTimeFormat('en-GB', { timeZone: site.timezone, day: 'numeric', month: 'long' }).format(new Date())
            for (const num of ch.whatsapp.to) {
              results.push(await sendWhatsApp(
                { accountSid: s.twilio_account_sid, authToken: s.twilio_auth_token, from: s.twilio_whatsapp_from, templateSid: s.whatsapp_brief_template_sid },
                num, body, { site: site.siteName, day, headline: headline ?? body.split('\n').slice(0, 3).join(' ') }))
            }
          }
        }
        if (!ch.telegram && !ch.email && !ch.whatsapp) results.push({ channel: 'telegram', ok: false, detail: 'no channels configured for this playbook and site' })
      }
      state.deliveries.push(...results)
      return text(results)
    },
  )

  const all = { run_ingest, get_metrics, get_alerts, get_movements, get_site, deliver }
  return all
}

export type ToolName = keyof ReturnType<typeof buildTools>

export function buildServer(state: RunState, allow: string[]) {
  const all = buildTools(state)
  const chosen = (Object.keys(all) as ToolName[]).filter((n) => allow.includes(n)).map((n) => all[n])
  const server = createSdkMcpServer({ name: 'gymiq', version: '1.0.0', tools: chosen })
  const allowedTools = chosen.map((t) => `mcp__gymiq__${t.name}`)
  return { server, allowedTools }
}
