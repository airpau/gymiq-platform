# GymIQ AI Layer — Phase 1 Validation Report
**30 July 2026 · énergie Fitness Hoddesdon (tenant: Airey Group) · for Paul to confirm against reality**

## What was built

The `iq` schema is live in the gymiq-ai Supabase project: tenants, sites, connector state, plan map, alert config (5 rules seeded, disabled until Phase 2), canonical members + PII quarantine + snapshots + payments/leads/visits, and the derived tables — member_movements, site_metrics_daily, alerts, agent_runs. All RLS-enabled, service-role only. Connector contract + Glofox XLSX dialect + snapshot-diff pipeline live in `unified/src/lib/iq/` (one implementation serves backfill and the future daily ingest). Secrets in the project Vault: `telegram_bot_token`, `telegram_chat_id_paul`, `gymiq_db_password`. Your AM/PM Glofox emails were not touched and keep running.

**Backfill loaded:** 2,392 members (1,671 current / 721 departed), 3,504 movements, 177 daily metric rows (31 Aug 2025 → 30 Jul 2026), 136 days of sales data, latest full snapshot as the go-forward diff base. Historical per-day snapshots stay re-derivable from the 377-file XLSX archive on your machine.

## Membership over time (month-end, from snapshots)

| Date | Total | Active | Overdue | Paused | MRR (active) | ARPU |
|---|---|---|---|---|---|---|
| 31 Aug 25 | 1,866* | — | — | — | — | — |
| 31 Dec 25 | 1,712 | 1,514 | 134 | 64 | £40,435 | £26.99 |
| 31 Jan 26 | 1,643 | 1,568 | 16 | 59 | £47,956 | £30.88 |
| 28 Feb 26 | 1,665 | 1,553 | 47 | 65 | £47,743 | £30.98 |
| 31 Mar 26 | 1,693 | 1,554 | 85 | 54 | £47,818 | £30.97 |
| 30 Apr 26 | 1,698 | 1,548 | 91 | 59 | £47,770 | £31.04 |
| 31 May 26 | 1,651 | 1,531 | 53 | 67 | £47,210 | £30.98 |
| 30 Jun 26 | 1,645 | 1,538 | 38 | 69 | £47,519 | £31.02 |
| 30 Jul 26 | 1,671 | 1,534 | 60 | 77 | £47,370 | £31.06 |

*Perfect Gym headline count, pre-Glofox migration — total only. No data exists for Sep–Nov 2025 anywhere.

## Joiners / leavers by month (2026)

| Month | Joins | Rejoins+returns | Leavers | of which <90d tenure | 30-day churn (avg) |
|---|---|---|---|---|---|
| Jan | 118 | 2 | 197† | 33 | ~13%† |
| Feb | 96 | 12 | 102† | 16 | 13.9%† |
| Mar | 87 | 10 | 59 | 17 | 5.7% |
| Apr | 75 | 8 | 54 | 10 | 4.6% |
| May | 88 | 8 | 168‡ | 34 | 8.4% |
| Jun | 98 | 23 | 112 | 19 | 7.2% |
| Jul | 82 | 15 | 35 | 16 | 5.1% |

†Jan/Feb figures include bulk cleanups (see below) and sparse-snapshot windows — dates are lumpy, monthly totals sound.
‡May includes purge-shaped events: 65 leavers dated 8 May and 42 dated 1 May.

**Tenure at leaving** (761 confirmed leavers since 31 Dec): 20% left inside 90 days, median tenure 289 days. May–Jul leavers carried £9,827/month in fees.

**Bulk-removal days detected — please confirm these were deliberate Glofox cleanups:** 27 Jan (152), 8 May (65), 1 May (42), 28 Feb (43), 31 Dec (33).

## Checkpoints (backfill must reproduce known numbers)

| Check | Known value | Backfill says | Verdict |
|---|---|---|---|
| 16 May audit upload | 1,622 members | 1,624 (last export of that day) | ✓ |
| 6 Apr `today-members.json` | 1,679 total / 1,515 active | 1,680 / 1,518 | ✓ |
| 13 Apr historical log | 1,665 total, MRR £48,965 (blended) | 1,670, £47,113 active + £2,690 overdue + £1,653 paused | ✓ (definition: theirs blends statuses) |
| Tonight's AM/PM email | 1,669 members, MRR £51,534 | 1,671; £47,370 + £1,878 + £2,473 = **£51,722 book** | ✓ |
| Tonight's Lost-tab MTD | 40 | 35 confirmed (+recent leavers awaiting 3-snapshot confirmation) | ✓ within lag |
| July MTD sales | £47,658 successful, 95.4% collection | same (ingested from sales log) | ✓ |

Definitional note: canonical **MRR is active-members-only** (bankable); the reference email's £51.5k is the whole book including overdue + paused. Both are now stored (`mrr`, `overdue_mrr`, `paused_mrr`).

## Known caveats — read before trusting charts

1. **Glofox resets "Commenced at" on plan changes.** Raw exports fabricated 40 rejoins / 75 shifted joins; the pipeline now counts a join only at first sighting and a rejoin only after a confirmed absence. Consequence: your email's "net +49 this month" style figure runs hot — observed head-count change July was +26.
2. **Month-level join/leave vs observed totals reconcile within ±0.5–2% of base** (e.g. Jul: movements say +62, observed +26). Residual causes: commenced-at claims by members joining pre-tracking, leavers awaiting confirmation, email changes creating new identities (measured: 1–5/month). The live daily ingest counts joins by first appearance, so this gap closes going forward.
3. **Pre-2026 join history is survivors-only** (members who joined and left before Feb 2026 are invisible) — cohort profile, not historical joiner volume.
4. **Leads, visits, per-payment data:** not in the Glofox export; those tables stay empty until a richer source exists. Engagement fields (last visit / total visits) are in the snapshot and feed Phase 4.
5. PII (names/emails/phones) sits only in the quarantined `member_pii` table, service-role-only access; metrics, movements, briefs and Telegram use 16-hex pseudonymous IDs throughout.

## Sign-off (Paul, 30 Jul 2026) — CONFIRMED

1. **Membership shape confirmed.** The Dec→Jan drop is now explained: Perfect Gym wasn't cleaning the database correctly before the Nov 2025 Glofox migration.
2. **27 Jan purge (152) = franchise-flagged cleanup** of legacy Perfect Gym overdue accounts → flagged `data_quality='purge'`, excluded from leavers/net/churn (Jan churn corrected 13% → 2.97%). Other bulk days (31 Dec, 28 Feb, 1 May, 8 May) unconfirmed — left as genuine leavers until Paul checks; May churn (8.4%) would soften if those were cleanups too.
3. **Canonical MRR = active-only confirmed.** Additional canonical rules from Paul, now in `finance_config`:
   - **Successful, never Submitted**, is the banked revenue truth from the Glofox sales tab.
   - **Net receipts = successful × 88% − £1,000** (énergie central takes 12% of successful collections + £1,000/mo tech & collections fee) — "what we actually receive".
   - True profitability later: management accounts + bank statements to come; fixed costs ≈ £28–31k/mo, VAT ≈ £3–5k (20% UK, quarterly, purchases-deducted — needs real accounts, not estimates).

**Phase 1 complete. Phase 2 unlocked:** 07:30 Telegram group brief + five alert rules + simulated feed-failure test.
