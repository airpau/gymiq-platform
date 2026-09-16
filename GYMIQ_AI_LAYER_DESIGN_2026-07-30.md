# GymIQ AI Layer — Canonical Schema & Connector Contract
**2026-07-30 · Proposal for approval before any migration runs**

The AI Layer is a CRM-agnostic intelligence system: connectors translate any gym CRM into one canonical model; everything above (briefs, alerts, league table, retention/sales modules) reads only the canonical model. Paul's group is tenant #1; every future customer is a config row, never a code change.

---

## 1. What exists today (inventoried 30 Jul)

| Asset | State |
|---|---|
| `gymiq-ai` Supabase (`fugixpfgwhnmhtttdzym`) | Retention+lead app schema in `public.*` — **empty of member data**; Vault empty |
| `audits` row 16 May | Hoddesdon, 1,622 members, 173 high-risk, £6,920/mo at risk — aggregate snapshot, useful as a **validation checkpoint** |
| `unified/` repo | Retention + lead engines, CSV parser (`parse-members.ts` — already handles Glofox/Mindbody quirks), Twilio, AI gateway. **No live Glofox API client** |
| Openclaw AM/PM updater | **Inventoried 30 Jul** (`~/.openclaw/workspace/glofox-*`): Playwright automation against app.glofox.com — persistent Chrome session (survives 2FA), downloads the Members XLSX export, scrapes/OCRs Sales + Lost tabs, emails Paul (full) + Dan (redacted) via gog CLI, Telegram KPI ping to chat 1003645878. **No REST API anywhere.** Working as of tonight's 22:01 run (1,669 members, MRR £51,534). Keeps running untouched |
| Stored history (backfill) | `downloads/Members_*.xlsx` — **377 per-member snapshots, 2026-02-10 → today, 2–3/day**; `manual-imports/` sparse snapshots back to Aug 2025 (incl. one Perfect Gym export); `historical-gym-analysis.json` daily aggregates 2025-08-31 → 2026-04-13; `glofox-sales-log/` daily sales+member aggregates Mar–Jul 2026 (sales figures are cumulative MTD — daily deltas need within-month differencing) |
| LocalWins Supabase (`txxhsrirotkiefxtsltk`) | **Hard boundary — not used for anything** |

## 2. Where it lives

All new tables in a dedicated **`iq` schema** in the gymiq-ai project. Zero collision with the existing app; RLS on every table; full rollback = drop the schema — the retention app is untouched. Connector + pipeline code lives in the product repo: `unified/src/lib/connectors/` and `unified/src/lib/iq/`, with ingestion API routes on Vercel — product-shaped from day one (a customer gym never depends on Paul's laptop). Openclaw scheduled tasks only *trigger* HTTPS endpoints and deliver Telegram; no business logic in task prompts. `iq.sites.gym_id` optionally links a site to `public.gyms` when a site is also a messaging customer.

## 3. Canonical schema (`iq.*`) — all keyed `tenant_id` + `site_id`

**Identity & config**
- `tenants` — id, name. Tenant #1 = Paul's group.
- `sites` — tenant_id, name, timezone (default Europe/London), `crm_type` (glofox | clubright | teamup | ashbourne | xplor | mindbody | gymmaster | csv), `crm_config` jsonb (non-secret: branch id etc.), `vault_prefix` (e.g. `glofox_hoddesdon_` → secrets in the project Vault), gym_id nullable.
- `connector_state` — per site: last_attempt, last_success, cursor, consecutive_failures. Feeds the silent-feed alert: **a missed sync is an alert, never a silent gap**.
- `plan_map` — raw CRM plan name → canonical category + monthly value + recurring flag. **Onboarding a gym = choose connector, add Vault secrets, fill plan_map. Nothing else.**
- `alert_config` — one row per rule per site (null site = tenant default): rule key, threshold, sigma, consecutive_days, enabled. Phase-2 DoD "thresholds tunable in one table" lands here.

**Canonical entities (what every connector must deliver, nullable where a CRM can't)**
- `members` — source_member_id (unique per site), status (active/frozen/cancelled/expired), joined_at, cancelled_at, plan_raw → plan_map FK, monthly_fee, last_visit_at, dd_status (ok/failed/arrears/na), arrears_amount. **No name/email/phone here.**
- `member_pii` — 1:1 quarantine table: name, email, phone. Service-role-only RLS (no owner read policy until the dashboard needs it), retention policy documented, purge honours deletion requests. Metrics, briefs and Telegram only ever see pseudonymous IDs — UK-GDPR-by-design is a selling point.
- `member_snapshots` — one row per member per sync day (status, plan, fee, dd_ok, last_visit). This is the universal mechanism: **diffing consecutive snapshots derives joins/cancels/freezes even from a bare CSV**, and catches members who silently vanish from an export. CRMs with real event feeds emit movements directly as well; the pipeline reconciles. Pruned after ~400 days (config).
- `payments` — per-payment where the CRM exposes it (amount, status, due/paid, failure reason); else dd_status on the member is the fallback.
- `leads` — source, created_at, first_response_at, status (new/contacted/trial/joined/lost), converted_member_id. Powers sales-module response-time + conversion-by-source.
- `visits` — member ref, visited_at, kind (gym/class) — where available.

**Derived (computed by pure SQL/TS after each sync — no LLM anywhere in ingestion)**
- `site_metrics_daily` — date × site: active/frozen counts, joiners, leavers, net, churn_30d_pct, arrears + failed-DD counts & amount, MRR, yield/member, leads_new, lead_conversion, visits. Unique (tenant, site, date).
- `member_movements` — movement (join/cancel/freeze/unfreeze/rejoin/disappear), occurred_on, **tenure_days_at_leaving**, join_cohort (month), plan + fee at the time, detected_by (crm_event | snapshot_diff | csv).
- `alerts` — rule, severity, status (new/acknowledged/resolved), metric vs threshold, dedupe key, delivery log.
- `agent_runs` — every brief/pack/draft generated: kind, model, tokens in/out, est. cost, delivery status. **Per-tenant AI cost is a margin line from day one.** (Different grain from the app's per-message `ai_cost_log`, so no double-count.)
- `risk_scores` (Phase 4) — daily member churn-risk: score, band, top factors. Logic ported once from `churn-engine.ts` — one source of truth.

## 4. Connector contract (the plug-and-play boundary)

```ts
interface CrmConnector {
  crm: CrmType
  capabilities: { members: true; payments: 'full'|'status_only'|'none';
                  visits: boolean; leads: boolean; webhooks: boolean }
  auth(secrets: SecretBag): Promise<AuthCtx>           // Vault-fed, per site
  pullSnapshot(ctx, site, since?): Promise<CanonicalBatch>  // mode 1: scheduled pull
  parseWebhook?(raw): CanonicalBatch                   // mode 2: push
  parseCsv?(files): CanonicalBatch                     // mode 3: CSV drop
}
// CanonicalBatch = { asOf, members[], payments?[], leads?[], visits?[] } — canonical shapes only
```

One shared pipeline consumes `CanonicalBatch` regardless of source: validate → idempotent upserts on (site_id, source_id) → write snapshots → diff → movements → recompute `site_metrics_daily` → run alert rules → update `connector_state`. Any failure raises an `alerts` row + Telegram. Adding ClubRight/TeamUp/Ashbourne/Xplor/Mindbody/GymMaster = implementing this interface, touching nothing else.

**Glofox connector v1 = the file-mode contract with a Glofox XLSX dialect.** The reference impl proved there's no practical Glofox REST API for a franchisee (dashboard automation only, 2FA, UI-fragile). So: the existing openclaw automation keeps downloading the Members XLSX exactly as it does today, and the connector ingests those artifacts (plus the sales-log JSONs) — zero interference with the AM/PM flow, and structurally identical to how a customer gym with "CSV export only" onboards. Key dialect facts absorbed: sheet "Current members", 28 columns, statuses ACTIVE/OVERDUE/SUSPENDED/PAUSED, DD/MM/YYYY dates, annual plans detected via `Payment type` → ÷12, **cancelled members drop off the export** (disappearance = the cancellation signal; `Commenced at` is authoritative for joins). A true API connector slots in later if Glofox ever grants credentials — same contract.

**Snapshot-diff movement rules (core, CRM-agnostic):** join = `Commenced at` (crm_event); cancel/disappear = present in snapshot N−1, absent in N (End Date refines the date); freeze/unfreeze = status ↔ PAUSED; rejoin = reappearance. Works identically for any full-list CSV/XLSX source.

## 5. Backfill plan (Phase 1) — sources found, in precedence order

1. **377 daily member-level XLSX snapshots** (10 Feb → 30 Jul 2026): full snapshot-diff pipeline → members, movements (with tenure-at-leaving + cohort), daily metrics. Last-of-day file wins where 2–3 exist. Full daily snapshot history stays re-derivable from the XLSX archive on disk; DB keeps weekly snapshots + the latest (movements/metrics carry the daily story).
2. **Sparse manual imports** (Dec 2025 → Feb 2026): coarse diffs, flagged `coarse` in data_quality.
3. **`historical-gym-analysis.json` aggregates** (Aug 2025 → Apr 2026): fill `site_metrics_daily` where no snapshot exists (`source='aggregate_import'`); the Feb–Apr overlap doubles as an internal cross-check.
4. **Sales log** (Mar → Jul 2026): MTD figures differenced within month → daily sales columns.
5. Joins before Feb 2026 reconstructed from `Commenced at` of members seen since — lower-bound (members who joined and left pre-Feb are invisible); stated in the report.

**Validation checkpoints the backfill must reproduce:** 16 May audit (1,622 members); 6 Apr `today-members.json` (1,679 total / 1,515 active); tonight's live run (1,669 total, MRR £51,534, 40 lost this month, net +49); historical-json overlap.

## 5b. Absorbed as first-class product features (from the reference impl)

- **Role-scoped briefs**: Paul gets financials, Dan's version is redacted (`glofox-settings.json` sensitive-fields list + recipient allowlist) → becomes per-recipient `role: owner|manager` config on briefs. A gymIQ customer gets the same owner/manager split.
- **Per-site `finance_config`** (jsonb on `iq.sites`): franchise %, fixed fees, VAT estimate, net-income target, monthly joiner targets — the reference hardcodes Paul's numbers (12%, £1,000 tech fee, £4,000 VAT, £45k target, joiner targets); every customer gets their own values, core code never changes.
- **Engagement segmentation** (healthy ≤13d / drifting 14–20 / at-risk 21–29 / sleepers vs recoverable-dormant with the visits×age rules, sleepers deliberately not contacted): ported once into the metrics core, feeds the Phase-4 retention module.
- **Cumulative-MTD sales trap** and DD/MM/YYYY parsing quirks: handled inside the Glofox dialect, invisible to the core.
- **Revenue truth (Paul, 30 Jul):** headline revenue = sales **Successful** (banked), never Submitted. **Net receipts = successful × (1 − franchise%) − fixed platform fees** — per-site `finance_config`, so a non-franchise customer just sets franchise_pct 0.
- **Purge rule:** bulk administrative removals are `data_quality='purge'` movements — excluded from leavers/net/churn metrics, recorded in the day's `data_quality` jsonb. CRM cleanups must never read as churn.

## 5c. Retention Radar — daily at-risk list with sleeper protection (added 31 Jul, research-backed)

Research consensus (PerfectGym, GymMaster, ABC Fitness, Keepme, fitDEGREE, Vibefam + the reference impl's own data): **attendance decline is the #1 churn predictor** — members can be re-engaged up to ~6 weeks before cancelling; 15–30 days absent is the danger zone; churn spikes at ~90 days, 6–7 months, and 12-month renewal; 50% of new members quit inside 6 months; structured onboarding lifts 6-month retention 60%→87%; personal (human) touches at days 7/30/60/90 roughly double conversion to long-term. Equally: **~23% of cancellations are from non-use, and low-cost/high-volume clubs (énergie's model) depend on sleeper income — ~31% of Hoddesdon sleeps, ~70% self-return. Waking a sleeper invites a "why am I paying?" moment.**

Therefore the radar separates *engagement decline* (intervene, human-first) from *established absence with healthy payment* (protect, monitor in aggregate):

| Band | Definition (defaults; tunable in config) | Manager action |
|---|---|---|
| `onboarding_watch` | tenure ≤90d AND (no visit in first 7d ∥ <4 visits in first 30d ∥ >10d gap) | Welcome call / induction / day-30/60/90 touch |
| `frequency_crash` | trailing 2-wk visit rate <40% of member's own 8-wk baseline (baseline ≥1/wk), from Δtotal_visits between snapshots | Personal "we miss you" from a human |
| `drifting` | 14–20d since last visit, was previously regular | Light-touch check-in |
| `at_risk` | 21–29d since last visit, was previously regular | Strongest intervention window — call |
| `payment_risk` | OVERDUE (worklist of the overdue-payments skill); overdue AND low recent usage ranks highest | Payment fix first, usage nudge second |
| `sleeper_protected` | 30d+ absent AND never-built-habit profile (≤3 visits & >60d tenure ∥ ≤5 & >180d ∥ lapsed >365d) AND payment healthy | **NEVER contacted, never listed.** Aggregate count + £value only. Exception: payment fails → they're already awake → `payment_risk` |
| `recoverable_dormant` | 30–60d absent, previously regular | Weekly section only, not daily |

Daily list capped at ~12, ranked by monthly fee × intervention-window urgency; each entry = name (manager list is a deliberate, documented PII use — staff-only channel), tenure, fee, signal ("no visit 24d, was 3×/wk"), one recommended action. Scores land in `iq.risk_scores` daily; thresholds in one config row; computation is deterministic (no LLM). All movements/aggregates elsewhere stay pseudonymous.

## 5d. Openclaw AM/PM email absorption path

The two emails are the prototype of gymIQ's role-scoped briefs: Paul = owner brief (financials, £45k path, KPI pace), Dan = manager brief (ops actions, overdue calls, engagement focus, no financials). Absorption: Retention Radar supersedes the contact-CSV logic now (with sleeper protection the CSV lacks); Phase 3 pre-visit pack + league table absorb the ops content; owner brief absorbs the financial path once management accounts land. The openclaw emails keep running unchanged until Paul decides gymIQ has parity — additive throughout, nothing breaks.

## 6. Runtime & cost posture

Ingestion + metrics: zero LLM. Briefs/packs/drafts: Haiku-class by default, Sonnet only where judgement matters (retention drafts), batched, logged to `agent_runs`. Retention drafts are **approval-gated — no automated outbound to members without explicit per-site config** (and the existing app's `MESSAGING_LIVE` + per-gym gates stay authoritative for anything that sends).

## 7. Assumptions (proceeding on these unless corrected)

- Tenant #1 name "Airey Group", site #1 "énergie Fitness Hoddesdon" (rename is a one-line update).
- Glofox stays pull-mode on a schedule (no Glofox webhooks assumed).
- Briefs to Telegram + email via Resend; 07:30 Europe/London.
- Existing AM/PM openclaw updates continue unchanged; the 07:30 group brief is additive.
- Small, named, reversible migrations via Supabase MCP; every table RLS-enabled (owner-read via tenant membership later; service-role for pipeline now).

## 8. Phase plan (unchanged from spec)

P1 map+generalise+backfill → validation report · P2 07:30 brief + alert rules (incl. simulated feed-failure test) · P3 league table + pre-visit pack · P4 retention + sales modules; second tenant = config only.
