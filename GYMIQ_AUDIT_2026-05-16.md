# GymIQ — Discovery Audit
**Date:** 2026-05-16
**Auditor:** Claude (assistant), read-only pass per Paul's brief
**Working tree HEAD:** `3770aad` (May 16, 2026)
**Branch:** `main`, in sync with `origin/main`

> Read-only audit. No code was modified, no dependencies installed, no databases migrated, no commits made during this pass.

> **One important honesty note up front:** earlier today (2026-05-16) significant new code was committed to this repo by an AI assistant (the author of this audit), introducing the redesigned marketing homepage, the audit-upload feature, and the `unified/` Next.js 15 app being live on gymiq.ai right now. That work is real and shipping, but it's only hours old. Treat anything dated 2026-05-16 in `git log` as work that hasn't yet had a human review pass.

---

## 1. What this product currently is

Based only on the code: GymIQ is **two parallel attempts at the same product**, only one of which is currently live.

- **Live (May 16, 2026):** a Next.js 15 + Supabase application under `unified/`, currently serving `gymiq.ai`, `www.gymiq.ai`, `gymiq.co.uk`, `www.gymiq.co.uk`, and `app.gymiq.ai`. It is a marketing landing page plus a working CSV-upload audit feature that scores members for churn risk and produces a retention report. The dashboard pages exist but are mostly empty shells.
- **Dormant (March 20, 2026):** an Express + Prisma monorepo under `apps/` and `packages/` that contains a substantially more complete product — full retention CRM, AI cancel-save conversation engine, Twilio integration, BullMQ workers, CRM connectors (Glofox / Mindbody / ClubRight), staff task queue. It is **not deployed anywhere** and its last 30+ commits are all infrastructure firefighting around failed Railway/Render builds.

Net: the live site is a thin shell with a strong audit feature; the heavy retention logic exists in an older codebase that nothing currently runs.

---

## 2. Tech stack

### Live unified app (`unified/`)
- **Framework:** Next.js 15.5.14, React 19, TypeScript strict
- **Styling:** Tailwind CSS v4, Inter font
- **Database / Auth:** Supabase (PostgreSQL, project ref `fugixpfgwhnmhtttdzym`, region `eu-west-2`). `@supabase/ssr` for the SSR cookie pattern, service-role key for server routes.
- **AI:** `@anthropic-ai/sdk` and `openai` client libraries installed; a lightweight `unified/src/lib/ai/gateway.ts` exists as a stub. The full AI gateway from the monorepo is **not** present here.
- **Email:** Resend (installed but `RESEND_API_KEY` not yet set, so audit emails silently no-op).
- **File parsing:** SheetJS (`xlsx` from the Sheet.JS CDN tarball — the canonical npm package is no longer on the public registry).
- **Hosting:** Vercel project `web` (id `prj_6Dqhdcgzh4tqZMA8I6RoDe3KBfsp`, team `airpaus-projects`), root directory `unified`, connected to GitHub `airpau/gymiq-platform` on `main` with deploy hooks. The build's been green since 2026-05-16 13:35 UTC.

### Dormant Express monorepo (`apps/`, `packages/`)
- **API:** Express + TypeScript, JWT auth, BullMQ (Redis) for queues, Prisma 5 against PostgreSQL.
- **Web dashboard:** Next.js 14 (`apps/web`), basic dashboard pages.
- **Marketing site:** separate Next.js 14 app (`apps/marketing`), the original visual design.
- **Messaging:** Twilio (WhatsApp + SMS + voice), Nodemailer for SMTP email.
- **AI gateway:** `packages/ai-gateway` — cost-routing across GPT-4o-mini and Claude Sonnet.
- **CRM connectors:** `packages/connectors` — Glofox (browser/Playwright), Mindbody (API), ClubRight (API), email/IMAP CSV parser, file upload, manual.
- **Hosting attempts:** Render and Railway configs both exist (`render.yaml`, `railway.toml`, `nixpacks.toml`, `Dockerfile`). Neither is currently working — last 30+ commits are unsuccessful attempts to make the monorepo build on either platform.

### Auth state
- **Unified (live):** Supabase Auth (email/password). Login + signup routes exist (`/auth/login`, `/auth/signup`, `/auth/callback`). Middleware refreshes sessions. Has not been smoke-tested today.
- **Monorepo (dormant):** JWT-based session model in Prisma (`User`, `Session`, `PasswordReset` tables) with hashed passwords. Not running anywhere.

### Payment provider
- **None configured anywhere.** No Stripe, Paddle, or similar in the code. The marketing site advertises £179/£299/£399 plans with a "Start free trial" button that links to `/auth/signup` — there is no billing wired in.

### Integrations actually wired
| Integration | Wired in code | Active right now |
|---|---|---|
| Supabase Auth + Postgres | ✅ unified | ✅ live |
| Resend (email) | ✅ unified | ❌ no API key set |
| Anthropic / OpenAI SDKs | ✅ unified (stub) + ✅ packages/ai-gateway (full) | ❌ no key set on unified |
| Twilio (WhatsApp/SMS/voice) | ✅ apps/api | ❌ Express not deployed |
| Glofox / Mindbody / ClubRight | ✅ packages/connectors | ❌ Express not deployed |
| BullMQ / Redis queues | ✅ apps/api | ❌ Express not deployed |
| Stripe / billing | ❌ not present | ❌ |

---

## 3. Data model

Two completely separate schemas. They don't talk to each other.

### Live: Supabase (`unified/supabase/migrations/`)
Only **one** table exists in production right now:

- **`audits`** — anonymous lead-capture for the CSV audit feature. Stores: first name, gym name, email, source filename, parsed report (as JSONB), aggregate stats (rows parsed, high-risk count, revenue at risk), and email-delivery status. RLS is on; only the service role can read/write.

That's it. There are no users, gyms, members, leads, conversations, or messages in Supabase yet. Auth uses Supabase's built-in `auth.users` but no profile tables are linked.

### Dormant: Prisma (`packages/database/prisma/schema.prisma`, 534 lines, 16 models)
Substantially more developed. Models:

- **Auth:** `User`, `Session`, `PasswordReset`, `Role` enum (SUPER_ADMIN / GYM_OWNER / GYM_STAFF)
- **Tenancy:** `Gym` (with `connectorType`, `connectorConfig`, sync schedule, knowledge base, Twilio config)
- **People:** `Member` (status, risk score 0-100, last visit, visit count 30d, next payment, LTV) and `Lead` (9-stage pipeline, source tracking, contact attempts, conversion tracking)
- **Engagement:** `LeadJourney` (audit trail of stage transitions), `Booking` (tours / trial classes), `Conversation` + `Message` (multi-channel — WhatsApp, SMS, voice — with AI intent tagging and per-message cost tracking), `Workflow` (automation sequences), `Call` (Twilio logs with transcripts)
- **Operations:** `SyncLog`, `CancelSaveAttempt` (with reason category, offer made, outcome), `MessageTemplate` (with A/B variants), `StaffTask` (action queue)
- **Migrations:** 7 migration files dated March 14–19, 2026.

**Half-defined or contradictory:**

- `Gym.crmType` and `Gym.crmTier` are tagged "legacy tier classification" in a comment, but `Gym.connectorType` is the live field. Both exist on the same model.
- `Member.lifetimeValue` is declared `Decimal(10,2)` and defaulted to 0 but no code in the repo writes to it.
- `Member.status` is a `String` with no enum, even though the comment enumerates expected values. Same for `Lead.currentStage`, `Conversation.channel`, `Workflow.type`, `Call.status` — schema is intentionally loose for v0 but will need tightening.
- `StaffTask.assignedTo` is a free-text string ("staff member name"), not a foreign key to `User`.
- `StaffTask.cancelSaveId` is a string field but never declared as a relation to `CancelSaveAttempt`.

---

## 4. Feature inventory

### Live unified app (`unified/`)
| Area | Status | Notes |
|---|---|---|
| Marketing homepage (`/`) | ✅ Complete | Premium SaaS aesthetic, integrated audit-upload widget, pricing tiers, stats, action plan teaser. Committed today (2026-05-16). |
| Audit upload (`/api/audit` + form) | ✅ Complete | CSV/TSV/XLSX parser, smart column detection (sniffs money/date columns by content), full retention analysis, persists to Supabase, optional Resend email. Verified working on a 1,622-row Glofox export. |
| Audit report (`/audit/[reportId]`) | ✅ Complete | Server-component, loads from Supabase, renders KeyMetrics + RevenueSnapshot + Benchmarks + VisitDistribution + SleeperBreakdown + PlanMix + TenureCohorts + FrozenBreakdown + PaymentHealth + ActionPlan + Lists + Diagnostics. |
| Audit preview (`/audit/preview`) | ✅ Complete | Fallback path for when service-role key isn't set — renders from sessionStorage. |
| Auth (`/auth/login`, `/signup`, `/callback`) | 🟡 Partial | Pages exist with Supabase wiring; signup creates a user but no profile/gym record. Not smoke-tested today. |
| Dashboard `/overview` | 🟡 Partial | Layout + sidebar exist, page is mostly placeholder content. |
| Dashboard `/members` | 🟡 Partial | Calls `/api/members` route — route exists but has no auth-gated tenancy logic worth speaking of. |
| Dashboard `/leads` | 🟡 Partial | Same shape. `/api/leads` returns from Supabase tables that don't exist yet. |
| Dashboard `/retention` | 🟡 Partial | Same. `/api/retention/run` route exists. |
| Dashboard `/cancel-save` | 🟡 Partial | Page exists; no backend wired. |
| Dashboard `/conversations`, `/settings` | 🟡 Partial | Skeleton pages. |
| AI gateway (`lib/ai/gateway.ts`) | 🟡 Partial | A stub. Most of the real logic lives in the dormant `packages/ai-gateway`. |
| Resend email | 🟡 Partial | Code path exists; `RESEND_API_KEY` env var not configured, so emails silently no-op. |

### Dormant Express monorepo (`apps/`, `packages/`)
| Area | Status | Notes |
|---|---|---|
| Express API (15 route files) | 🔴 Broken | Builds locally but **deploys nowhere**. Last serious commits Mar 19. |
| Auth (JWT + bcrypt) | ✅ Complete (code) / 🔴 Broken (deploy) | Login/signup/refresh/forgot-password all coded. |
| Members CRUD + filtering | ✅ Complete (code) | Routes + service exist. |
| Leads + 9-stage pipeline | ✅ Complete (code) | Full state machine in `services/lead-pipeline.ts`, audit trail. |
| Churn engine | ✅ Complete (code) | Pure-functions risk scorer. Has been ported into `unified/src/lib/services/churn-engine.ts` already. |
| Cancel-save AI flow | ✅ Complete (code) | 5-stage conversation flow in `services/cancel-save.ts`. **Not ported to unified.** |
| AI intent classifier | ✅ Complete (code) | 12 intent classes. Not ported. |
| Conversation router | ✅ Complete (code) | Routes inbound messages to handler (booking / cancel-save / KB / general). Not ported. |
| Knowledge base | ✅ Complete (code) | FAQ + hours + pricing JSON storage. Not ported. |
| Booking | ✅ Complete (code) | Tour/trial slots. Not ported. |
| Workflow engine | ✅ Complete (code) | Generic step runner. Not ported. |
| Email service (Nodemailer) | ✅ Complete (code) | Superseded by Resend in unified. |
| Email templates + A/B variants | ✅ Complete (code) | Welcome / audit sequences. Not ported. |
| Twilio service | ✅ Complete (code) | WhatsApp + SMS + signature validation. Not ported. |
| BullMQ workers (follow-up, retention, email-nurture, lead-nurture) | ✅ Complete (code) | Daily 02:00 retention batch, 3-step lead follow-up. Not ported. |
| CRM connectors | ✅ Complete (code) | Mindbody + ClubRight (API), Glofox (Playwright), Email/IMAP, manual upload. Not ported. |
| AI gateway with cost routing | ✅ Complete (code) | GPT-4o-mini + Claude Sonnet with cost tracking. Not ported. |
| Original Next.js 14 dashboard (`apps/web`) | 🟡 Partial / 🔴 Broken | Pages exist for login/register/leads/retention/cancel-save/conversations/settings. Has hardcoded `API_URL` — the API it points at isn't running. |
| Original marketing site (`apps/marketing`) | ✅ Complete (code) / 🔴 Broken (deploy) | Includes a fully-built `/audit` page with lead-capture and Glofox-style file upload — predates the unified version. Has the original product positioning. |
| `temp-auth/` directory | 🔴 Broken | Looks like an abandoned hot-fix for an auth deployment failure. Has its own `.vercel/` config. Has not been touched since Mar 19. |
| Root-level `check_gym.js`, `temp-auth-fix.js`, `test-members.csv` | ❓ | Throwaway scripts left behind. Safe to delete in a future cleanup. |

### Test coverage
**None observed.** No `*.test.ts`, no `vitest.config`, no `jest.config`. No CI test step.

---

## 5. Alignment with the retention-agent thesis

Paul's revised thesis: **outbound retention agent for dormant members** sitting on top of an existing CRM, working SMS/email replies, classifying reasons, saving or routing the exit.

| Module | Verdict | Why |
|---|---|---|
| `unified/` audit feature | **Keep** | This IS the front door for the retention agent. The audit produces the dormant-member list it would work on. |
| `unified/` marketing site | **Keep** | Already pitched correctly. Pricing tiers ("Retention AI / Lead Recovery AI / GymIQ Complete") are about retention. |
| `unified/` dashboard shells | **Keep & finish** | Sidebar + layout are reusable. Pages need real backends. |
| Supabase Auth + `audits` table | **Keep** | Foundation for tenancy, leads, sequences. |
| `packages/ai-gateway` (cost-routed AI) | **Repurpose** | The cost-routing logic is genuinely useful and not present in unified yet. Port it. |
| `apps/api/services/cancel-save.ts` | **Repurpose** | Core retention conversation engine. Heart of the new thesis. Needs porting from Prisma → Supabase and from Express → Next.js routes. |
| `apps/api/services/conversation-router.ts` | **Repurpose** | Routes inbound message → handler. Directly applicable. |
| `apps/api/services/intent-classifier.ts` | **Repurpose** | 12 intents incl. cancellation_intent, freeze_request, complaint. Applicable. |
| `apps/api/services/messaging.ts` + `twilio.ts` | **Repurpose** | Need a Twilio integration to make the retention agent actually outbound. |
| `apps/api/workers/retention.worker.ts` | **Repurpose** | Daily batch that scores members and queues actions. Needs to move from BullMQ → Supabase Edge Functions or Vercel Cron. |
| `apps/api/workers/followup.worker.ts` | **Repurpose** | The 3-step sequence runner. This is exactly the "3-touch SMS/email sequence" in your MVP brief. |
| `apps/api/routes/cancel-save.ts` | **Repurpose** | Wraps the engine in HTTP routes. Reimplement as Next.js API. |
| `apps/api/services/churn-engine.ts` | **Already kept** | Ported to `unified/src/lib/services/churn-engine.ts`. |
| `apps/api/services/lead-pipeline.ts` | **Park (for now)** | Lead-management belongs to a future phase per the new thesis — retention-only first. |
| `apps/api/services/lead-capture.ts`, `booking.ts`, `email-nurture.worker.ts`, `lead-nurture.worker.ts` | **Park** | Lead-side. Still useful later but out of scope for the retention MVP. |
| `apps/api/services/knowledge-base.ts` | **Park** | Inbound-receptionist territory; competition already owns this slot. |
| `apps/api/routes/whatsapp.ts`, voice receptionist features | **Park or Discard** | Per the thesis, inbound AI receptionists (Replify, Keepme Antares, HireBob) already exist — this is outbound territory only. |
| `apps/marketing` original site | **Discard** | Replaced by the redesigned site in `unified/`. Keep the file for one more cycle as a reference for old copy/FAQ. |
| `apps/web` original dashboard | **Discard** | Replaced by the dashboard scaffolding in `unified/`. |
| `apps/api` Express server | **Discard after porting the modules above** | The Express layer adds nothing once routes are ported. Keeping it alive doubles ops surface. |
| `packages/database` Prisma schema | **Repurpose** | Use it as the *blueprint* for Supabase migrations. Don't keep Prisma running. |
| `packages/connectors` (Glofox/Mindbody/ClubRight) | **Park (long-term value)** | Not needed for an MVP — CSV upload is enough. But these are real assets. Hold for phase 2. |
| `temp-auth/`, `check_gym.js`, `temp-auth-fix.js` | **Discard** | Abandoned scratch work. |
| `.deploy-trigger`, duplicate `node_modules/` at root | **Discard** | Cleanup artefacts. |

---

## 6. Gap to a retention-agent MVP

What an MVP can do (per your brief):
1. Ingest a CSV of dormant members (name, mobile, email, last visit, fee).
2. Send a 3-touch SMS + email sequence on a configurable schedule.
3. Capture inbound replies and classify (busy / cost / problem / leaving / other).
4. Surface a dashboard: contacted / replied / saved / revenue retained.

### What you already have shipping
- ✅ CSV ingestion + smart column detection (works today on real Glofox exports)
- ✅ Risk-scoring engine that surfaces the dormant list
- ✅ Lead capture form (email + gym name + first name) attached to the upload
- ✅ Hosted, public, SSL-good, on `gymiq.ai`
- ✅ Supabase database, RLS-policy-aware, with a service-role server boundary
- ✅ Sleeper categorisation aligned to industry research (no more "do not contact" anti-pattern)
- ✅ Action plan output that explicitly tells the gym which dormant members to act on

### What's missing for the MVP
| Gap | Build estimate (focused days) | Notes |
|---|---|---|
| Twilio integration on the unified app | 0.5d | Port `twilio.ts`. Need verified WhatsApp sender + SMS sender. The hard part is your existing Twilio account state, not the code. |
| Sequence runner (3-touch over N days) | 1.5d | Vercel Cron + Supabase `sequences` + `sequence_steps` tables. Pure logic — already exists in `followup.worker.ts` as a reference. |
| Inbound webhook + reply classification | 1.5d | Twilio webhook → store message in Supabase → classify intent via Claude Sonnet → tag conversation. Port from `conversation-router.ts` + `intent-classifier.ts`. |
| Reason classification on save/loss | 0.5d | Already exists in `cancel-save.ts`. Port the prompt and the JSON-output handling. |
| Lightweight conversation UI | 1d | One table in the dashboard listing conversations with status, last message, last reply class. Drill-in shows the message thread. |
| Dashboard metrics: contacted / replied / saved / revenue retained | 0.5d | Supabase aggregate query + four big-number cards. Reuse `KeyMetrics` from the audit report view. |
| "Saved" outcome capture | 0.5d | Action button on each conversation: "marked as saved" / "lost" / "freeze accepted" / "downgrade accepted", + a £ field. |
| Quiet hours + opt-out handling (UK legal) | 0.5d | A small but non-negotiable feature. Default 09:00–20:00. Honour STOP keyword. |
| Audit → sequence onboarding flow | 1d | Once a gym finishes an audit, gate the sequence runner behind an "I want GymIQ to contact these for me" button. Capture the gym's WhatsApp/Twilio creds at that point. |
| Pricing / billing | 1d (Stripe Checkout) or 0d (Stripe Payment Links + Webhook) | Cleanest MVP: Stripe Payment Link for £200–400 deposit, manual onboarding from there. |
| **Subtotal** | **~7–9 focused days** | Working in pairs with you. |

Plus 2–3 days of contingency for Twilio sender approval (WhatsApp Business templates often need 24–72h review) and Supabase migration polish.

**Realistic MVP-ready window: 2 working weeks.**

---

## 7. Risks and red flags

### Architectural
1. **Two codebases solve the same problem.** Until the dormant Express monorepo is either ported or deleted, the repo will continue to look confusing and onboarding any second engineer will be painful.
2. **Schema split-brain.** The dormant Prisma schema describes the product you're building toward; the live Supabase has one table. There is no migration plan in the repo to bridge them. This must be decided in week 1, not month 3.
3. **The `unified/` dashboard pages call API routes that read from Supabase tables that don't exist yet.** The dashboard would silently return nothing today, but errors are a real risk once a user logs in.
4. **SafetyMode.** `SAFETY.md` declares "no outbound messages until Paul approves." That rule is currently enforced by *absence of Twilio configuration*, not by any code check. When Twilio is wired in for the retention agent, this needs to become a project-level feature flag, not a hope.

### Security
5. **`Gym.connectorConfig` is `Json?` (plaintext credentials in DB).** The schema comment says "encrypt at rest in production." This is unimplemented. If any real gym's Glofox / Mindbody credentials land here, they're stored as cleartext.
6. **No rate limiting on `/api/audit`.** The Vercel `web` project doesn't enforce per-IP limits. A small attacker could blast the audit endpoint and rack up Supabase + email costs.
7. **`SUPABASE_SERVICE_ROLE_KEY` was added to Vercel today.** It is set "Sensitive" and only used server-side, but it's worth confirming no client component imports `createServiceClient` (a quick `grep` of `unified/src/components/**` for `SUPABASE_SERVICE_ROLE_KEY` should return zero hits).
8. **Audit reports contain partial member PII** (name, partly-masked email, status, plan). Anyone with the report UUID can view it. UUIDs are unguessable in practice but the URL has no auth gate. Acceptable for v0 if the user is told. Not OK long-term — should expire after 30 days.
9. **`temp-auth/` directory** appears to be a half-finished hack to deploy an auth-only endpoint when the main API was broken in March. It's still in the repo and could be deployable. Delete in cleanup.

### Operational
10. **30+ commits in March 19–20 are Render/Railway/Nixpacks/Prisma firefighting.** The monorepo build pipeline was extremely painful. Re-deploying it is not a quick task. Better to leave it dormant.
11. **`packages/database/package.json` requires Prisma ^5.22, root `package.json` requires `@prisma/client` ^7.5.** These are major-version-incompatible. The monorepo can't currently install cleanly without flag-overrides. (This is what caused the failed Vercel builds back in March.)
12. **No CI.** Nothing runs on push other than Vercel's own builds. No linter check, no type check, no test runner. A junior PR could break production without anyone noticing.
13. **Knowledge of the codebase is split** between the original work (March), the CLAUDE.md doc (March 31), and the substantial recent work today (May 16 — by an AI). Reviewers should pay particular attention to today's commits — they have not had a second pair of eyes.

### Dependencies
14. **`xlsx` is pulled from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`** — not the npm registry. The Sheet.JS team moved it after npm versions were briefly compromised. This is the recommended way to install it, but it means a CDN outage = your install fails.
15. **React 19 + Next 15.5** is current but very new. There are still known SSR/hydration edge-cases in the wild. Watch for them.
16. **Prisma 7 (root) is alpha-ish** for some adapters. Doesn't matter while we're not using Prisma in the live app.

### Product
17. **You are pre-customer.** No paying gym is on this. "Energie Fitness Hoddesdon" is described as the pilot but I see no actual gym data in Supabase beyond Paul's own audit upload. This is fine and normal, but be honest in marketing copy that says "live with Energie Fitness Hoddesdon."
18. **Pricing changed mid-flight.** CLAUDE.md says £99/£199/£399. The original `apps/marketing/pricing/page.tsx` says £179/£179/£299. The live site (restored today) shows £179/£179/£299. Decide which is real before a customer asks.
19. **The "retention agent" thesis is competitive but defensible.** Inbound AI receptionists (your note) are crowded. Outbound retention is still underserved — Keepme has some of it, but UK independents are largely unaddressed. The thesis is sound.

---

## 8. Recommended next steps

### Option A — Build on what's there
Finish the unified app's dashboard pages, port the cancel-save engine + sequence runner from the dormant monorepo, wire Twilio, ship retention MVP.

- **Pros:** Fastest path. The live app is already real. The dormant code is high-quality reference material — most of the hard thinking (intent classifier, cancel-save 5-stage flow, churn engine) is done.
- **Cons:** Carrying two codebases until everything is ported. Easy to leave half the monorepo lying around as confusing dead code.
- **Effort to MVP:** ~2 weeks of focused work.

### Option B — Salvage and restart
Keep `unified/` and Supabase as-is. Extract the cancel-save engine, intent classifier, AI gateway, and Twilio service from `apps/api` into new files in `unified/src/lib/`. Delete `apps/`, `packages/`, `temp-auth/`, and the Render/Railway/Nixpacks files in one PR. Reset the project to one clean Next.js + Supabase codebase.

- **Pros:** Clean repo. One mental model. New collaborators don't have to ask "which codebase is real?"
- **Cons:** A day of careful porting work before any new feature lands. Some logic will get lost in translation (Prisma transactions and BullMQ patterns translate awkwardly to Supabase + Vercel Cron).
- **Effort to MVP:** ~2.5 weeks (extra ~3 days vs A for the cleanup pass, paid back later).

### Option C — Greenfield
Archive everything. Start a new Next.js + Supabase repo with the retention thesis as the spec from day one.

- **Pros:** Maximum clarity. Easiest to onboard a second engineer.
- **Cons:** Throws away genuinely useful work: the cancel-save 5-stage prompts, the intent classifier, the cost-routing AI gateway, the connectors, the churn scoring weights, the migration history of figuring this out. You'd rebuild a lot of what's already correct.
- **Effort to MVP:** ~3–4 weeks. You'd be re-discovering decisions Paul already made.

### My recommendation: **Option B — Salvage and restart.**

The reason: the live app already proves the thesis fits, and its bones are clean (Next.js 15 + Supabase, no monorepo, no workspace deps). The dormant Express monorepo is the source of every recurring pain in this repo — failed builds, schema-split, two front-ends, a confused dependency tree. Option A keeps that pain alive until the day someone "gets around to" deleting it; that day usually never arrives.

The Option B port is a contained ~3-day cleanup that pays itself back the first time you need to ship something quickly without untangling two codebases. After that, you're on one Next.js app, one database, one deploy target. Every decision afterward becomes simpler.

The one caveat: **don't delete `apps/` until the port is verified working.** Keep the dormant code as a reference branch (`legacy-monorepo`) for 30 days. Once you've shipped the first paid retention engagement and haven't needed to reach back into it, delete with confidence.

---

## Appendix: open questions surfaced during the audit

1. **Energie Fitness Hoddesdon — is this a real pilot, a paid relationship, or aspirational copy?** The marketing site says "Live with Energie Fitness Hoddesdon." There is no corresponding Gym row in any database. Need to know whether this is a real commitment we'd be embarrassed to walk back.
2. **Is the Supabase project on a paid plan or Free?** The Free tier auto-pauses after 7 days of inactivity, which is what happened today. Paid avoids that, but adds cost and changes the security envelope.
3. **WhatsApp Business sender** — do you already have an approved sender, or do we need to start that submission process now? It's a 24–72h gate and worth queuing immediately if so.
4. **Pricing of record** — £99/£199/£399 or £179/£179/£299? The site shows the latter; CLAUDE.md says the former. Decide.
5. **AI cost ceiling per gym** — CLAUDE.md says £4-6/month. The dormant code routes to GPT-4o-mini + Claude Sonnet to stay under this. Is this still the target, or has the retention thesis (which sends more outbound messages and processes more inbound) shifted the budget?
6. **Twilio numbers** — how many WhatsApp / SMS senders do we have? Per-gym or shared? Affects the routing model significantly.
7. **CRM integration urgency** — is CSV upload enough for v1, or does the first paying gym expect live Glofox sync from day one? The connectors exist but require porting.
