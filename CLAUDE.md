# CLAUDE.md — GymIQ AI Operating Manual
# Read this file at the start of every session. Single source of truth.

---

## CRITICAL — READ THIS FIRST

GymIQ is **one Next.js 15 + Supabase app** under `unified/`. The old Express + Prisma monorepo (`apps/`, `packages/`) was salvaged and deleted on 2026-05-16. If you find anything referencing those paths in code, comments, or docs, that's a stale reference — flag it.

Operating rules:

1. **The retention thesis is the spec.** GymIQ is the outbound retention agent: it works the dormant-member database via SMS/WhatsApp, classifies replies, runs the cancel-save flow. Lead capture, AI receptionist, voice agent — out of scope unless we change our minds in writing.
2. **Never send a real outbound message without the `MESSAGING_LIVE=true` env var AND the gym's `gyms.messaging_enabled=true` flag.** See [SAFETY.md](./SAFETY.md). The TwilioService enforces both gates.
3. **All Supabase schema changes go through a migration file in `unified/supabase/migrations/`** and are applied via the Supabase MCP. Don't edit tables directly from Studio in production.
4. **Multi-tenant from day one.** Every query is scoped to `gym_id`. RLS policies restrict gym owners to their own data.
5. **AI routing through `unified/src/lib/ai/gateway.ts`.** Never use GPT-4 when GPT-4o-mini works. Cancel-save and other empathy-required calls use Claude Sonnet.

---

## PRODUCT OVERVIEW

**Company:** GymIQ AI
**Website:** gymiq.ai
**Founder:** Paul Airey (aireypaul@googlemail.com)
**First pilot:** Energie Fitness Hoddesdon (Glofox CRM) — Paul's own club

**Target audience:** UK independent gym owners and boutique studios, 100–1,000 members, using Glofox / Mindbody / PushPress / ClubRight or spreadsheets.

---

## CORE VALUE PROPOSITION

"Most gyms lose 30–50% of members annually without knowing why. GymIQ predicts who's about to leave, runs cancel-save conversations on autopilot, and recovers dormant payers — bolting on to your existing CRM."

**Audit-derived stats (real Glofox export, 1,622 members, May 16 2026):**
- 173 high-risk members (11% of base)
- 180 deep sleepers (21–45 days no visit) — most savable cohort
- £6,920/month revenue at risk

**Industry research (Health & Fitness Association / Motionsoft / GymMaster):**
- 23% of all gym cancellations come from non-use
- 50% of new members quit within first 6 months
- A single warm email to dormant members cuts monthly cancellations ~80% (debunks the old "let sleeping dogs lie" advice)
- Comprehensive onboarding lifts 6-month retention from 60% → 87%

---

## PRICING (CANONICAL — matches the live site)

**Retention AI — £179/month:**
- Churn prediction, sleeper detection, cancel-save AI, payment recovery
- Up to 4,000 members, 500 WhatsApp + 200 AI conversations / month

**Lead Recovery AI — £179/month:**
- AI lead nurturing, 30-sec response, 5-touch follow-up, tour booking
- Up to 500 leads / month, 1,000 WhatsApp + 300 AI conversations / month

**GymIQ Complete — £299/month** (Popular — save £59/mo vs. buying both):
- Everything in Retention AI + Lead Recovery AI
- Priority support, custom AI personality, advanced analytics
- 4,000 members + unlimited leads, 1,500 WhatsApp + 500 AI conversations / month

**Enterprise — custom:** 4,000+ members or multi-site.

---

## TECH STACK

- **Framework:** Next.js 15.5, React 19, TypeScript strict
- **Styling:** Tailwind v4, Inter font
- **Database & Auth:** Supabase (PostgreSQL + Auth + RLS)
- **AI:** Anthropic Claude Sonnet (cancel-save, hard decisions) + OpenAI GPT-4o-mini (cheap routing). All routed through `unified/src/lib/ai/gateway.ts` with cost tracking to `ai_cost_log`.
- **Messaging:** Twilio (WhatsApp + SMS). Wrapped in `unified/src/lib/messaging/twilio.ts` with dry-run gate, quiet hours, STOP opt-out.
- **Email:** Resend (transactional)
- **File parsing:** SheetJS (xlsx via Sheet.JS CDN tarball)
- **Hosting:** Vercel (`web` project, prj_6Dqhdcgzh4tqZMA8I6RoDe3KBfsp, root directory `unified`)
- **Live domains:** gymiq.ai, www.gymiq.ai, gymiq.co.uk, www.gymiq.co.uk, app.gymiq.ai

---

## SUPABASE SCHEMA

Project ref: `fugixpfgwhnmhtttdzym` (region eu-west-2).

| Table | Purpose |
|---|---|
| `audits` | Public landing-page upload reports (anonymous lead capture + retention analysis) |
| `gyms` | Tenant root. Owned by a Supabase auth user via `owner_user_id`. |
| `members` | Imported member list per gym. Risk score, plan, monthly fee, last visit. |
| `conversations` | A WhatsApp/SMS thread with a member (or future lead) |
| `messages` | Individual messages within a conversation, with classification + AI cost |
| `cancel_save_attempts` | The 5-stage cancel-save engine state per attempt |
| `sequences` | 3-touch outbound campaign templates |
| `sequence_runs` | A member's path through a sequence |
| `messaging_optouts` | STOP list — phone numbers we will never message |
| `ai_cost_log` | Per-call AI cost tracking, used for the £/gym/month KPI |

All tables have RLS enabled. Gym owners can `select` their own gym's rows. Service role bypasses RLS (used by all server API routes).

---

## CODE LAYOUT

```
unified/src/
├── app/
│   ├── page.tsx                  # Marketing landing (Premium SaaS aesthetic, audit upload in hero)
│   ├── layout.tsx                # Inter font, root metadata
│   ├── globals.css               # Tailwind v4 imports, base styles
│   ├── auth/{login,signup,callback}/  # Supabase auth pages
│   ├── audit/
│   │   ├── [reportId]/page.tsx   # Server component, loads from Supabase
│   │   └── preview/page.tsx      # Client component, sessionStorage fallback
│   ├── (dashboard)/              # Logged-in dashboard (still skeleton; finish next)
│   └── api/
│       ├── audit/route.ts        # POST: parse upload → analyse → save to audits → email link
│       ├── members/route.ts
│       ├── leads/route.ts
│       ├── stats/route.ts
│       └── retention/run/route.ts
├── components/
│   ├── marketing/AuditUpload.tsx
│   ├── audit/AuditReportView.tsx
│   └── dashboard/sidebar.tsx
└── lib/
    ├── ai/gateway.ts             # Cost-routed AI calls + Supabase cost-flush
    ├── ai/reply-classifier.ts    # Retention reply → category + outcome signal
    ├── csv/parse-members.ts      # Smart Glofox/Mindbody/CSV parser
    ├── email/send-audit.ts       # Resend wrapper for audit emails
    ├── messaging/twilio.ts       # Twilio with dry-run gate, quiet hours, STOP list
    ├── services/audit-analysis.ts # The retention-audit analyzer
    ├── services/cancel-save.ts   # 5-stage cancel-save engine
    ├── services/churn-engine.ts  # Heuristic risk scorer (no AI)
    └── supabase/{client,server,middleware}.ts
```

---

## RETENTION-AGENT MVP ROADMAP

What's already built (✅) vs. what's left (🟡):

- ✅ Marketing landing page + integrated CSV audit upload
- ✅ Smart CSV parser (handles Glofox column quirks, money sniffing, plan-name price extraction)
- ✅ Audit analysis (ARPU, LTV, plan mix, tenure cohorts, sleeper buckets, action plan, industry benchmarks)
- ✅ Resend audit-email template
- ✅ Supabase schema for retention agent
- ✅ AI gateway (cost-routed)
- ✅ Twilio service (dry-run + quiet hours + STOP)
- ✅ Reply classifier (busy / cost / problem / leaving / positive / opt_out)
- ✅ Cancel-save engine (5-stage)
- 🟡 Sequence runner (Vercel Cron + sequence_runs polling) — **next**
- 🟡 Twilio inbound webhook (`/api/webhooks/twilio`) — **next**
- 🟡 Audit → "GymIQ contact these for me" onboarding flow
- 🟡 Dashboard pages (overview, members, retention, conversations, settings) — currently shells
- 🟡 Stripe Payment Link for billing
- 🟡 WhatsApp Business Sender registration (24–72h Meta clock — start now)

---

## SAFETY RULES

Detail in [SAFETY.md](./SAFETY.md). Key:

- The Twilio service has a `MESSAGING_LIVE` env-var gate and a per-gym `messaging_enabled` boolean.
- Quiet hours default 09:00–20:00 Europe/London.
- STOP keyword adds the phone to `messaging_optouts`. The service refuses to message anyone on that list.
- `cancel_save_attempts.outcome` is the source of truth for "did we save them?" — never override outside of the staff dashboard.

---

## ENVIRONMENT VARIABLES

See `unified/.env.local.example`. Set in Vercel project settings for production.

Critical: `SUPABASE_SERVICE_ROLE_KEY` is the bypass-RLS key. Never import it into a client component or expose it client-side. Vercel marks it Sensitive.

---

## DEPLOYMENT

- Push to `main` → Vercel auto-builds → live on gymiq.ai / app.gymiq.ai within 90 seconds.
- Preview branches get their own auto-built URL.
- Deploy hooks exist (`Settings → Git → Deploy Hooks`) for manual triggering without a commit.
- The `legacy-monorepo` branch on GitHub holds the dormant code as our rollback point for 30 days after the May 16 salvage.

---

## HOUSEKEEPING

- Audit doc: [GYMIQ_AUDIT_2026-05-16.md](./GYMIQ_AUDIT_2026-05-16.md). Re-do every quarter or after major scope changes.
- Test coverage: none yet. Add Vitest before the first paid customer.
- CI: none yet. Add Vercel checks + `npm run lint` + `npm run typecheck` on PR before the first second engineer.
