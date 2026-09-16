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

CRM exports arrive by HTTP (`POST /artifacts/:siteId/:filename`) into the
`iq.artifacts` table (bytea, newest 20 per site kept, service-role only). Today the Mac mini
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
  src/artifacts.ts    iq.artifacts upload / list / materialise to a temp dir
  src/deliver.ts      Telegram, Resend and Twilio WhatsApp senders
  src/config.ts       env + platform secrets (Vault, 5 min cache)
  src/playbook.ts     playbook file loader (frontmatter + prompt)
  src/cli.ts          local runner, dry run by default
  playbooks/*.md      the playbooks; daily-brief.md is playbook one
  scripts/push-artifact.sh   the one-liner for anything that produces an export
  Dockerfile                 built from the REPO ROOT (the image needs unified/src/lib/iq)
../fly.toml                  Fly app config, at the repo root for that reason
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

## Secrets

Only **one** secret lives in Fly: `DATABASE_URL`. Everything else is read from
Supabase Vault through that connection (env vars override for local runs):

| Vault name | What | Who creates it |
|---|---|---|
| `gymiq_worker_secret` | bearer secret for /run, /artifacts | generated in-database by migration `20260916_iq_artifacts_table` |
| `gymiq_worker_url` | `https://gymiq-worker.fly.dev`, read by the dispatcher | same migration |
| `<vault_prefix>ingest_token` | per-site upload token (`glofox_hoddesdon_ingest_token`) | same migration, one per site at onboarding |
| `anthropic_api_key` | Agent SDK key | Paul, in the Supabase dashboard (Vault, Add new secret) |
| `resend_api_key` | email channel (optional) | Paul |
| `twilio_account_sid`, `twilio_auth_token`, `twilio_whatsapp_from`, `whatsapp_brief_template_sid` | WhatsApp channel | Paul, once the WhatsApp sender is approved |
| `telegram_bot_token`, `telegram_chat_id_paul` | Telegram channel | already present |

## Deploy (first time)

1. Fly dashboard, "Launch an App", GitHub repo `airpau/gymiq-platform`, branch `main`:
   app name `gymiq-worker`, region `lhr`, 1GB memory, working directory and
   config path blank (the root `fly.toml` is used), one environment variable
   `DATABASE_URL` = `postgresql://postgres.fugixpfgwhnmhtttdzym:<gymiq_db_password>@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`.
   After the app exists, move `DATABASE_URL` from an env var to a Fly secret
   (app, Secrets) if the launcher stored it as plain config.
   CLI equivalent from the repo root: `fly launch --no-deploy --copy-config --name gymiq-worker --region lhr`,
   `fly secrets set DATABASE_URL=...`, `fly deploy`.
2. `curl https://gymiq-worker.fly.dev/health` lists the playbooks.
3. Add `anthropic_api_key` to Vault.
4. Feed exports: `worker/scripts/push-artifact.sh` with `GYMIQ_INGEST_TOKEN` =
   the site's `<vault_prefix>ingest_token` (Hoddesdon: `glofox_hoddesdon_ingest_token`),
   after each openclaw download.
5. Dry run (the worker secret is in Vault as `gymiq_worker_secret`):
   ```
   curl -X POST https://gymiq-worker.fly.dev/run -H "authorization: Bearer <gymiq_worker_secret>" \
     -H 'content-type: application/json' \
     -d '{"playbook":"daily-brief","site_id":"95f75b9f-2ff3-4c83-9fd0-168651ed7128","dry_run":true,"wait":true}'
   ```
   Or from SQL, without handling the secret at all:
   ```sql
   select net.http_post(
     url := (select decrypted_secret from vault.decrypted_secrets where name='gymiq_worker_url') || '/run',
     body := '{"playbook":"daily-brief","site_id":"95f75b9f-2ff3-4c83-9fd0-168651ed7128","dry_run":true}'::jsonb,
     headers := jsonb_build_object('content-type','application/json','authorization','Bearer ' ||
       (select decrypted_secret from vault.decrypted_secrets where name='gymiq_worker_secret')));
   -- then read the result:
   select status, output, error, est_cost_usd, ran_at from iq.agent_runs order by ran_at desc limit 1;
   ```
6. When the brief reads right: `update iq.playbooks set enabled = true where playbook = 'daily-brief';`
   and disable the Cowork scheduled task that used to send it.

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
