# CLAUDE.md — GymIQ AI Operating Manual
# Read this file at the start of every session. Single source of truth for the entire project.

---

## CRITICAL — READ THIS FIRST

This project is being migrated from an Express monorepo to a unified Next.js app (Supabase + Vercel).
The existing Express codebase contains production-ready business logic that must be preserved during migration.

1. Audit what already exists — the Express services contain mature, tested business logic
2. Never lose existing functionality — migrate, don't rewrite from scratch
3. All database changes must be written as migration files
4. When in doubt, ask before you build

---

## PRODUCT OVERVIEW

**Company:** GymIQ AI
**Website:** gymiq.ai
**Domain:** Registered and configured
**Contact:** Paul (founder)

GymIQ is an AI-powered gym CRM and retention platform. It helps gym owners stop losing members, recover cancelled memberships, automate lead follow-up, and answer calls with AI — all from one dashboard.

**Target audience:** Independent gym owners and small chain operators in the UK, expanding internationally. Gyms using CRM systems like Glofox, Mindbody, ClubRight, or manual spreadsheets.

**Pilot gym:** Energie Fitness Hoddesdon (Glofox CRM)

---

## CORE VALUE PROPOSITION

"Most gyms lose 30-50% of members annually without knowing why. GymIQ predicts who's about to leave, saves cancellations with AI, and converts leads 3x faster — for £4-6/month in AI costs per gym."

**Key stats (from pilot data):**
- £2,494 average revenue at risk per gym per month
- 72% cancel-save rate (AI retention conversations)
- 3x faster lead response vs manual follow-up

---

## PRICING (PLANNED)

**Starter — £99/month:**
- 1 location
- Up to 500 members
- Churn prediction + alerts
- Lead pipeline
- Basic AI messaging (WhatsApp/SMS)
- CSV import

**Growth — £199/month:**
- Up to 3 locations
- Up to 2,000 members
- Cancel-save AI conversations
- CRM connector (Glofox, Mindbody, ClubRight)
- Email nurture sequences
- Staff task queue

**Enterprise — £399/month:**
- Unlimited locations and members
- AI voice receptionist
- Custom integrations
- Priority support
- Dedicated account manager

---

## TECH STACK (TARGET — UNIFIED NEXT.JS)

### Current (Express Monorepo — Being Migrated)
- **API:** Express + TypeScript (apps/api)
- **Dashboard:** Next.js 14 (apps/web)
- **Marketing:** Next.js 14 (apps/marketing)
- **Database:** PostgreSQL + Prisma (packages/database)
- **Queue:** BullMQ + Redis
- **AI:** OpenAI (GPT-4o-mini) + Anthropic (Claude Sonnet) via AI Gateway
- **Messaging:** Twilio (WhatsApp, SMS, Voice)
- **Email:** Nodemailer (SMTP)
- **CRM Connectors:** Mindbody API, ClubRight API, Glofox (Playwright browser)
- **Deployment:** Render (API), Vercel (marketing), Railway (attempted)

### Target (Unified Next.js — Like Paybacker)
- **Framework:** Next.js 15, React, TypeScript, Tailwind CSS
- **Database:** Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **AI:** Anthropic Claude API (primary) + OpenAI (secondary, for cheap tasks)
- **Messaging:** Twilio (WhatsApp, SMS, Voice)
- **Email:** Resend (transactional) or Nodemailer (SMTP)
- **Queue:** Supabase Edge Functions + pg_cron (replace BullMQ/Redis)
- **Hosting:** Vercel
- **Analytics:** PostHog
- **Voice AI:** ElevenLabs or Twilio + Claude (AI receptionist)

---

## ARCHITECTURE RULES

1. **ALL AI routing goes through a single gateway module.** Route to cheapest model per task. Never use GPT-4 when GPT-4o-mini works.
2. **Retention actions are DRY-RUN by default.** No outbound messages without explicit gym owner approval. See SAFETY.md.
3. **All CRM connectors normalize to a standard format** before entering the data pipeline.
4. **Churn scoring uses heuristics first, AI second.** The churn engine is pure functions (fast, no API cost). Only use AI for cancel-save conversations.
5. **Never expose API keys in client-side code.** All external API calls must be server-side only.
6. **Multi-tenant from day one.** Every query must be scoped to a gymId. Never return data across gym boundaries.
7. **Lead pipeline is a state machine.** All stage transitions must go through the validated pipeline service.

---

## EXISTING CODEBASE — WHAT'S BUILT

### Database Schema (Prisma — 14 Models)
| Model | Purpose | Status |
|-------|---------|--------|
| User | Staff auth (SUPER_ADMIN, GYM_OWNER, GYM_STAFF) | ✅ Complete |
| Session | JWT session tracking | ✅ Complete |
| PasswordReset | Password recovery flow | ✅ Complete |
| Gym | Multi-tenant root entity, CRM config, knowledge base | ✅ Complete |
| Member | Active members with risk scoring (0-100) | ✅ Complete |
| Lead | 9-stage pipeline (new→converted) | ✅ Complete |
| LeadJourney | Full audit trail of stage transitions | ✅ Complete |
| Booking | Trial/tour scheduling | ✅ Complete |
| Conversation | WhatsApp/SMS/Voice chat threads | ✅ Complete |
| Message | Chat messages with AI cost tracking | ✅ Complete |
| Workflow | Automation sequences | ✅ Complete |
| Call | Twilio call logs with transcription | ✅ Complete |
| SyncLog | CRM sync audit trail | ✅ Complete |
| CancelSaveAttempt | Retention conversation tracking | ✅ Complete |
| MessageTemplate | A/B testing templates | ✅ Complete |
| StaffTask | Action queue for gym staff | ✅ Complete |

### API Routes (Express — 15 Route Files)
| Route | Endpoints | Status |
|-------|-----------|--------|
| /auth | register, login, logout, refresh, forgot/reset password | ✅ Complete |
| /members | CRUD, full-profile, filtering | ✅ Complete |
| /leads | Pipeline management, audit-signup, bookings | ✅ Complete |
| /retention | Sleepers, overdue, dashboard, run-analysis | ✅ Complete |
| /cancel-save | Initiate, respond, active list, stats | ✅ Complete (DRY-RUN) |
| /conversations | Message threads | 🟡 Basic |
| /connectors | CRM sync config, test, logs | ✅ Complete |
| /import | CSV bulk import | ✅ Complete |
| /gyms | Config, knowledge base, settings | ✅ Complete |
| /knowledge-base | FAQ, hours, pricing storage | ✅ Complete |
| /tasks | Staff action queue | ✅ Complete |
| /stats | Dashboard analytics | ✅ Complete |
| /webhooks | Twilio inbound routing | ✅ Complete |
| /whatsapp | WhatsApp message handling | ✅ Complete |
| /audit | Summary, potential revenue, save rate | ✅ Complete |

### Services (16 Files — Core Business Logic)
| Service | Purpose | Status |
|---------|---------|--------|
| ai-conversation.ts | AI-powered member/lead conversations | ✅ Complete |
| cancel-save.ts | 5-stage retention flow with offers | ✅ Complete (DRY-RUN) |
| churn-engine.ts | Heuristic risk scoring (0-100, no AI) | ✅ Production-ready |
| lead-pipeline.ts | 9-stage state machine with validation | ✅ Production-ready |
| conversation-router.ts | Message routing and escalation | ✅ Complete |
| intent-classifier.ts | Intent detection (book, cancel, etc.) | ✅ Complete |
| knowledge-base.ts | Gym-specific FAQ/pricing storage | ✅ Complete |
| lead-capture.ts | Lead ingestion from webhooks | ✅ Complete |
| booking.ts | Trial/tour scheduling | ✅ Complete |
| email-templates.ts | Template variants + A/B testing | ✅ Complete |
| email.ts | SMTP sending via Nodemailer | ✅ Complete |
| messaging.ts | Multi-channel send (WhatsApp/SMS/email) | ✅ Complete |
| message-templates.ts | Template management | ✅ Complete |
| retention-log.ts | Dry-run action logging | ✅ Complete |
| twilio.ts | Twilio SDK wrapper | ✅ Complete |
| workflow.ts | Workflow execution engine | ✅ Complete |

### Background Workers (BullMQ + Redis)
| Worker | Purpose | Status |
|--------|---------|--------|
| followup.worker | 3-step lead follow-up sequence | ✅ Complete |
| retention.worker | Daily churn batch analysis (02:00 UTC) | ✅ Complete |
| email-nurture.worker | Automated email sequences | ✅ Complete |
| lead-nurture.worker | Lead nurture sequences | ✅ Complete |

### CRM Connectors
| Connector | Type | Status |
|-----------|------|--------|
| Glofox | Browser (Playwright) | ✅ Complete |
| Mindbody | API | ✅ Complete |
| ClubRight | API | ✅ Complete |
| Email/IMAP | CSV from email | ✅ Complete |
| CSV Upload | Manual | ✅ Complete |

### AI Gateway (Cost-Optimised Model Routing)
| Task | Model | Cost/1K tokens | Status |
|------|-------|----------------|--------|
| Member replies | GPT-4o-mini | $0.00075 | ✅ |
| Intent classification | GPT-4o-mini | $0.00075 | ✅ |
| Churn analysis | Claude Sonnet | $0.003 | ✅ |
| Cancel-save | Claude Sonnet | $0.003 | ✅ |
| CSV parsing | GPT-4.1 | $0.005 | ✅ |

### Dashboard Pages (Next.js)
| Page | Status | Notes |
|------|--------|-------|
| / (Dashboard home) | ✅ Functional | Stats, tasks, activity feed |
| /login | ✅ Complete | JWT auth |
| /register | ✅ Complete | Gym owner registration |
| /leads | ✅ Complete | Pipeline kanban view |
| /retention | ✅ Complete | At-risk member list |
| /cancel-save | ✅ Complete | Active conversations + stats |
| /conversations | 🟡 Basic | Chat interface needs work |
| /settings | 🟡 Basic | Connector setup, knowledge base |

### Marketing Site
| Page | Status |
|------|--------|
| / (Landing) | ✅ Complete — hero, features, social proof |
| /pricing | ✅ Complete |
| /audit | ✅ Complete — lead capture form |

---

## MIGRATION PLAN — EXPRESS → UNIFIED NEXT.JS

### Phase 1: Foundation (Week 1)
- [ ] Create new Supabase project for gymIQ
- [ ] Migrate Prisma schema to Supabase SQL migrations
- [ ] Set up Next.js 15 app with Supabase Auth
- [ ] Configure Vercel deployment
- [ ] Port auth system (Supabase Auth replaces custom JWT)
- [ ] Create CLAUDE.md (this file) ✅

### Phase 2: Core API Migration (Week 2)
- [ ] Port churn-engine service (pure functions — easy)
- [ ] Port lead-pipeline service (state machine — easy)
- [ ] Port AI gateway as lib module
- [ ] Create Next.js API routes for: members, leads, stats, tasks
- [ ] Port data pipeline + CSV import
- [ ] Set up Supabase RLS policies (multi-tenant security)

### Phase 3: Dashboard Build (Week 3)
- [ ] Dashboard home with real-time stats
- [ ] Members page (list, search, risk scores)
- [ ] Leads page (pipeline kanban board)
- [ ] Retention page (at-risk members, intervention actions)
- [ ] Cancel-save page (active conversations, stats)
- [ ] Settings page (gym config, knowledge base, connector setup)

### Phase 4: Messaging & AI (Week 4)
- [ ] Port Twilio webhook handlers to Next.js API routes
- [ ] Port AI conversation service
- [ ] Port cancel-save conversation flow
- [ ] Port messaging service (WhatsApp/SMS/email)
- [ ] Replace BullMQ workers with Supabase Edge Functions or Vercel cron

### Phase 5: CRM Connectors (Week 5)
- [ ] Port Glofox browser connector (may need separate service for Playwright)
- [ ] Port Mindbody + ClubRight API connectors
- [ ] Port email/IMAP connector
- [ ] Port CSV upload handler
- [ ] Set up sync scheduling via cron

### Phase 6: Advanced Features (Week 6+)
- [ ] AI Voice Receptionist (Twilio + ElevenLabs/Claude)
- [ ] Marketing site integration (same Next.js app or separate)
- [ ] Stripe billing integration
- [ ] PostHog analytics
- [ ] Email sequences via Resend
- [ ] Mobile-responsive dashboard polish

---

## AI COST OPTIMISATION

**Estimated monthly AI cost per gym: £4-6**

| Task | Model | Cost/call | Frequency | Monthly cost |
|------|-------|-----------|-----------|-------------|
| Member replies | GPT-4o-mini | £0.0001 | ~500/month | £0.05 |
| Intent classification | GPT-4o-mini | £0.0001 | ~500/month | £0.05 |
| Churn analysis | Claude Sonnet | £0.002 | ~500 members/month | £1.00 |
| Cancel-save | Claude Sonnet | £0.004 | ~20 conversations | £0.08 |
| CSV parsing | GPT-4.1 | £0.008 | ~30 imports/month | £0.24 |
| **TOTAL** | | | | **~£1.42** |

This is 10-40x cheaper than competitors using GPT-4 for everything.

---

## CHURN SCORING SYSTEM

### Risk Score (0-100, pure heuristics, no AI)
- Days since last visit: up to 40 pts (highest weight)
- Visit frequency (30d): up to 25 pts
- Payment overdue: up to 20 pts
- Member status: up to 15 pts
- New-member early dropout: up to 20 pts

### Intervention Windows
| Days Since Visit | Category | Action |
|-----------------|----------|--------|
| 0-13 | Healthy | No action |
| 14-20 | Light sleeper | Friendly check-in |
| 21-45 | Deep sleeper | **PRIORITY CONTACT** with offer |
| 46-60 | Critical | Manual staff call only |
| 60+ | Lost | DO NOT CONTACT (sleeping dogs keep paying) |

---

## LEAD PIPELINE (State Machine)

```
new → contacted → engaged → booked → visited → converting → converted
         ↓           ↓         ↓         ↓           ↓
       lost        lost      lost      lost        lost
         ↓           ↓         ↓         ↓           ↓
      nurturing   nurturing nurturing nurturing   nurturing
```

Valid transitions are enforced — invalid stage changes are rejected.

---

## CANCEL-SAVE FLOW (5 Stages)

1. **Initiate** — Empathetic acknowledgment, ask for reason
2. **Reason Inquiry** — Probe for details, categorize
3. **Offer Stage** — Make retention offer based on reason:
   - Too expensive → Downgrade or discount
   - Not using → Free sessions
   - Moving → Freeze membership
   - Injury → Freeze + recovery support
   - Unhappy → Escalate to human
4. **Objection Handling** — Address concerns, accept gracefully
5. **Closing** — Confirm outcome or process cancellation

---

## CRM CONNECTOR TIERS

| Tier | Type | Connectors | How It Works |
|------|------|-----------|-------------|
| A | API | Mindbody, ClubRight | Direct API integration |
| B | Browser | Glofox | Playwright automation (login → export CSV) |
| C | Email | IMAP | Parse CSV attachments from automated reports |
| D | Manual | CSV Upload | Gym staff uploads spreadsheet |

All connectors normalize data to `NormalizedMember` / `NormalizedLead` format before entering the data pipeline.

---

## COMPETITORS

- **Keepme** — AI retention, expensive (£500+/month), enterprise-only
- **GymSales** — Lead management, no AI, manual processes
- **ABC Fitness** — Full CRM, no AI retention features
- **Glofox/Mindbody** — CRM platforms, no predictive analytics or AI messaging

**GymIQ's advantage:** AI-native from day one, 10-40x cheaper AI costs, works WITH existing CRMs (doesn't replace them), cancel-save conversations that actually retain members.

---

## SAFETY RULES

See SAFETY.md for full details. Key rules:
- **NO outbound messages until gym owner explicitly approves**
- Test mode by default — import data, calculate scores, view dashboards only
- Retention worker logs actions but does NOT send messages (dry-run)
- Cancel-save conversations are dry-run until activated

---

## ENVIRONMENT VARIABLES

```env
# Supabase (target)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Twilio (WhatsApp + SMS + Voice)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=

# Email
RESEND_API_KEY= (or SMTP_USER + SMTP_PASS)

# App
NEXT_PUBLIC_APP_URL=https://app.gymiq.ai
CRON_SECRET=

# Analytics
POSTHOG_API_KEY=
POSTHOG_HOST=https://app.posthog.com

# Voice AI (Phase 6)
ELEVENLABS_API_KEY=
```

---

## GIT WORKFLOW

- Main branch is production
- Feature branches: feature/description
- Commit messages: Conventional Commits format
- Always include Co-Authored-By: Claude when pair programming

---

## KEY FILES (Current Express Codebase)

### Business Logic to Preserve
- `apps/api/src/services/churn-engine.ts` — Risk scoring (CRITICAL — port as-is)
- `apps/api/src/services/lead-pipeline.ts` — State machine (CRITICAL — port as-is)
- `apps/api/src/services/cancel-save.ts` — Retention AI flow
- `apps/api/src/services/ai-conversation.ts` — AI message handling
- `apps/api/src/services/conversation-router.ts` — Message routing
- `apps/api/src/services/intent-classifier.ts` — Intent detection
- `packages/ai-gateway/src/index.ts` — AI model routing
- `packages/connectors/src/` — All CRM connectors
- `packages/database/prisma/schema.prisma` — Data models

### Dashboard Pages to Rebuild
- `apps/web/src/app/page.tsx` — Dashboard home
- `apps/web/src/app/leads/page.tsx` — Lead pipeline
- `apps/web/src/app/retention/page.tsx` — At-risk members
- `apps/web/src/app/cancel-save/page.tsx` — Cancel-save conversations
- `apps/marketing/src/app/page.tsx` — Marketing landing page

---

## KNOWN ISSUES TO FIX DURING MIGRATION

1. **Cancel-save is DRY-RUN** — Needs production activation path
2. **Risk score calculated in two places** — Churn engine vs data pipeline (consolidate)
3. **Credentials stored in plain JSON** — connectorConfig needs encryption
4. **Staff tasks use string names** — Should be foreign key references
5. **Quiet hours hardcoded (9am-8pm)** — Make configurable per gym
6. **Conversation context limited to 10 messages** — May need expansion
7. **AI cost tracking in-memory only** — Persist to database
8. **No error monitoring** — Add Sentry or similar
9. **No structured logging** — Replace console.log with proper logging
10. **GloFox CSS selector broken** — Line 79 in browser connector
