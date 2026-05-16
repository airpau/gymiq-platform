# GymIQ

AI-powered retention agent for independent gyms. Bolts on to existing CRMs (Glofox, Mindbody, ClubRight), works the dormant-member database with outbound SMS/WhatsApp conversations, classifies replies, saves cancellations.

Live at [gymiq.ai](https://gymiq.ai).

## Architecture

Single Next.js 15 app with Supabase. Everything lives under `unified/`.

```
gymiq-platform/
├── unified/                  # The whole app
│   ├── src/
│   │   ├── app/              # Next.js pages (marketing + dashboard + audit + api routes)
│   │   ├── components/       # marketing/, dashboard/, audit/
│   │   ├── lib/
│   │   │   ├── ai/           # gateway, reply-classifier
│   │   │   ├── csv/          # member-export parser
│   │   │   ├── email/        # Resend wrapper
│   │   │   ├── messaging/    # Twilio (dry-run gate, quiet hours, opt-out)
│   │   │   ├── services/     # cancel-save, churn-engine, audit-analysis
│   │   │   └── supabase/     # SSR client helpers
│   │   └── middleware.ts
│   ├── supabase/migrations/  # SQL migrations applied via Supabase MCP
│   └── package.json
├── CLAUDE.md                 # Operating manual — read at start of every session
├── SAFETY.md                 # Messaging dry-run rules
└── GYMIQ_AUDIT_*.md          # Discovery/state audits
```

## Tech stack

- **Framework:** Next.js 15, React 19, TypeScript strict, Tailwind v4
- **Database & Auth:** Supabase (PostgreSQL + Auth)
- **AI:** Anthropic Claude Sonnet (cancel-save, hard decisions) + OpenAI GPT-4o-mini (cheap routing)
- **Messaging:** Twilio (WhatsApp + SMS)
- **Email:** Resend
- **File parsing:** SheetJS (xlsx)
- **Hosting:** Vercel

## Getting started

```bash
cd unified
cp .env.local.example .env.local   # then fill in keys
npm install
npm run dev
```

Open http://localhost:3000.

## Environment variables

Set these in `unified/.env.local` for development; in Vercel project settings for production.

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Twilio (start in dry-run mode)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
TWILIO_SMS_NUMBER=
MESSAGING_LIVE=false           # flip to "true" only per gym

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=GymIQ <audit@gymiq.ai>

# App
NEXT_PUBLIC_APP_URL=https://gymiq.ai
CRON_SECRET=
```

## Safety

The messaging layer is **dry-run by default** — `MESSAGING_LIVE=false` blocks every outbound send. Per-gym opt-in lives in the `gyms.messaging_enabled` column.

See [SAFETY.md](./SAFETY.md) for the rules. The audit ([GYMIQ_AUDIT_2026-05-16.md](./GYMIQ_AUDIT_2026-05-16.md)) has the full state-of-play.
