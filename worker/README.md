# gymIQ worker: the hosted agent runtime

This is the piece that lets a customer gym get gymIQ without Cowork, openclaw or
Paul's Mac mini. It runs **playbooks** (the same shape as Cowork skills: a
markdown prompt plus a tool allowlist) per tenant, on a schedule, with tools
that are scoped to one site, and logs every run to `iq.agent_runs`.

```
Supabase pg_cron (every 5 min)
  -> iq.dispatch_playbooks()        due rows in iq.playbooks, once per local day
  -> POST https://gymiq-worker.fly.dev/run  { playbook, site_id }
       -> runner.ts: Claude Agent SDK + tenant-scoped MCP tools (tools.ts)
            run_ingest   deterministic: unified/scripts/iq/daily-ingest.mts (shared with the CLI)
            get_metrics / get_alerts / get_movements / get_site   read-only, this site only
            deliver      Telegram and/or email, channels from iq.playbooks.channels
       -> iq.agent_runs (tokens, cost, status, output, error) + iq.playbooks.last_*
```

CRM exports arrive by HTTP (`POST /artifacts/:siteId/:filename`) into the private
`iq-artifacts` Storage bucket, keyed `<site_id>/<file>`. Today the Mac mini
openclaw job pushes the file after it downloads it (`scripts/push-artifact.sh`);
tomorrow a customer's script, inbound email, or the hosted browser collector
does exactly the same call. The ingest never reads a laptop directory.

## Layout

```
worker/
  src/index.ts        HTTP: /health, /run, /artifacts/:siteId/:filename, /playbooks
  src/runner.ts       one playbook run through the Agent SDK; caps on turns and USD; logging
  src/tools.ts        the tenant-scoped tools (no site_id argument anywhere, on purpose)
  src/tenant.ts       site + tenant loader, Vault secrets resolved as <vault_prefix><key> then <key>
  src/artifacts.ts    Storage bucket upload / list / materialise to a temp dir
  src/deliver.ts      Telegram + Resend senders
  src/playbook.ts     playbook file loader (frontmatter + prompt)
  src/cli.ts          local runner, dry run by default
  playbooks/*.md      the playbooks; daily-brief.md is playbook one
  scripts/push-artifact.sh   the one-liner for anything that produces an export
  Dockerfile, fly.toml       deploy from the REPO ROOT (the image needs unified/src/lib/iq)
```

`unified/scripts/iq/daily-ingest.mts` now exports `runDailyIngest(opts)`; the
CLI behaviour (print JSON, exit codes) is unchanged, so the existing Cowork
task keeps working until cutover.

## Channels

`iq.playbooks.channels` per site, any combination:

```json
{ "telegram": { "chat_id_secret": "telegram_chat_id_paul" },
  "email":    { "to": ["owner@gym.com"] },
  "whatsapp": { "to": ["+447700900000", "+447700900001"] } }
```

WhatsApp goes through Twilio with shared Vault secrets `twilio_account_sid`,
`twilio_auth_token`, `twilio_whatsapp_from` (the WhatsApp-enabled Twilio number,
E.164) and `whatsapp_brief_template_sid` (site-prefixed names win). WhatsApp
rules: free-form text only inside 24h of the owner's last message to the
number, otherwise only an approved template. The worker tries free-form first
and falls back to the template `gymiq_daily_brief` (utility category, body:
"gymIQ brief for {{1}}, {{2}}: {{3}} Reply for the full brief.") whose reply
opens the window for the next day. Create it in Twilio Console, Content
Template Builder, submit for WhatsApp approval, paste its HX... SID into Vault.

## CRMs

`iq.sites.crm_type` picks the connector: `glofox` (its own XLSX dialect) or the
generic table connector for `clubright`, `teamup`, `ashbourne`, `xplor`,
`mindbody`, `gymmaster`, `csv`. The generic connector has a preset per CRM
(header aliases, status words, date order, fee period) plus auto-detection, and
`crm_config` on the site overrides anything:

```json
{ "column_map": { "status": "Member state", "joined_at": "Signed up" },
  "status_map": { "Notice given": "active", "Lapsed": "cancelled" },
  "date_format": "dmy", "fee_period": "auto", "sheet": "Members", "full_snapshot": true }
```

Artifacts for non-Glofox sites are any `members*.csv|xlsx`, `clients*`,
`export*` or `snapshot*` file; the date comes from the filename (YYYY-MM-DD) or
the file's modified time. The ingest result carries `connector.warnings`
(unrecognised statuses, skipped rows) so the first run of a new gym tells you
exactly what to put in `crm_config`.

## Playbooks

```md
---
description: one line
model:                 # blank = PLAYBOOK_MODEL env (Haiku by default)
max_turns: 10
max_budget_usd: 0.25   # never above MAX_BUDGET_USD
tools: [run_ingest, get_site, get_metrics, get_alerts, get_movements, deliver]
---
The prompt. Steps, output shape, rules.
```

The model gets no built-in tools (no shell, files or web), only the listed
gymIQ tools. Facts come from tool results; the playbook says so and the system
prompt repeats it.

## Deploy (first time)

1. Fly app, from the repo root:
   ```
   fly launch --config worker/fly.toml --no-deploy --copy-config --name gymiq-worker --region lhr
   fly secrets set -a gymiq-worker \
     WORKER_SECRET="$(openssl rand -hex 32)" \
     DATABASE_URL="postgresql://postgres.fugixpfgwhnmhtttdzym:<db password>@aws-1-eu-west-2.pooler.supabase.com:5432/postgres" \
     SUPABASE_URL="https://fugixpfgwhnmhtttdzym.supabase.co" \
     SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
     ANTHROPIC_API_KEY="<key>" \
     RESEND_API_KEY="<key, optional>"
   fly deploy --config worker/fly.toml --dockerfile worker/Dockerfile .
   curl https://gymiq-worker.fly.dev/health
   ```
2. Vault secrets the dispatcher reads (Supabase SQL editor or MCP):
   ```sql
   select vault.create_secret('https://gymiq-worker.fly.dev', 'gymiq_worker_url');
   select vault.create_secret('<the WORKER_SECRET above>', 'gymiq_worker_secret');
   -- per-site ingest token for artifact pushes (site vault_prefix + 'ingest_token'):
   select vault.create_secret('<random>', '<vault_prefix>ingest_token');
   ```
   The migration `20260916_iq_playbooks_scheduler.sql` is already applied: it
   created `iq.playbooks`, the dispatcher, the 5-minute cron job, the bucket,
   and a **disabled** `daily-brief` row for Hoddesdon.
3. Feed the bucket. Add to the openclaw Glofox job, after the download:
   ```
   GYMIQ_WORKER_URL=https://gymiq-worker.fly.dev GYMIQ_SITE_ID=95f75b9f-2ff3-4c83-9fd0-168651ed7128 \
   GYMIQ_INGEST_TOKEN=<token> worker/scripts/push-artifact.sh <Members_*.xlsx> <sales-log/<date>.json>
   ```
   Or backfill once: push the newest three `Members_*.xlsx` from
   `~/.openclaw/workspace/downloads` and today's sales-log JSON.
4. Dry run, read it, then enable:
   ```
   curl -X POST https://gymiq-worker.fly.dev/run -H "authorization: Bearer $WORKER_SECRET" \
     -H 'content-type: application/json' \
     -d '{"playbook":"daily-brief","site_id":"95f75b9f-2ff3-4c83-9fd0-168651ed7128","dry_run":true}'
   ```
   The response carries `output` (the brief), cost and turns; the same lands
   in `iq.agent_runs`. When it reads right:
   ```sql
   update iq.playbooks set enabled = true where playbook = 'daily-brief';
   ```
   and disable the Cowork scheduled task that used to send the brief.

## Local run

```
cd worker && npm install && (cd ../unified/scripts/iq && npm install)
cp .env.example .env   # fill it in
set -a; . ./.env; set +a
npm run cli -- daily-brief 95f75b9f-2ff3-4c83-9fd0-168651ed7128          # dry run
npm run cli -- daily-brief 95f75b9f-2ff3-4c83-9fd0-168651ed7128 --send   # real delivery
npm run typecheck
```

## Onboarding a second gym

A site row in `iq.sites` (crm_type, vault_prefix, finance_config), its secrets
in Vault under that prefix, a `plan_map`, an `iq.playbooks` row per playbook
with the owner's channels, and something that pushes exports to
`/artifacts/:siteId/...`. No code change.

## What is deliberately not here yet

Hosted Glofox browser collector (replaces the openclaw download itself);
inbound-email artifacts; overdue-payments and lead playbooks; per-tenant
monthly token budgets (per-run caps exist); a dashboard view of `agent_runs`.
