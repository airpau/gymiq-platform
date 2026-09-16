# GymGlitch — Reverse-Engineering Teardown
**Date:** 2026-07-21
**Prepared for:** Paul Airey (GymIQ AI)
**Method:** Live logged-in walkthrough of Paul's own GymGlitch account (`app.gymglitch.ai`, Energie Fitness Hoddesdon sub-account) + public pricing/feature research.
**One-line verdict:** GymGlitch is a **GoHighLevel white-label** running a single AI chat agent + a call-centric sales pipeline. It is a competent *front-of-funnel lead converter* with **no real retention capability** — and GymIQ already owns the code to replicate the whole thing and beat it.

> Data-handling note: this teardown documents **structure, configuration and workflow**, not the personal details of your leads. Individual lead names/numbers seen in the inbox are deliberately omitted.

---

## 1. What GymGlitch actually is

GymGlitch is **not** a bespoke product. It is a **GoHighLevel (GHL / "LeadConnector") sub-account** with a gym "snapshot" loaded on top and a custom logo. Your friend has configured one AI agent, two pipelines, a set of tags, a booking calendar and (hidden from you) a set of automation workflows. That's the product.

This matters because it sets a ceiling on what GymGlitch can ever be: it inherits GoHighLevel's generic **contacts + opportunities** data model. It has no concept of a *member* with visit-frequency, risk score, tenure or payment health — so it structurally **cannot do retention**. It can only work leads.

### How I confirmed it's GoHighLevel (five independent tells)
1. **Login flow** — the "Verify Security Code" 2FA screen (send OTP to email/phone) is GHL's exact mandatory-2FA flow.
2. **URL structure** — every page is `app.gymglitch.ai/v2/location/{locationId}/...` — the `/v2/location/` path is GoHighLevel's signature.
3. **Help links** — in-app "Learn More" links point to `help.leadconnectorhq.com` (LeadConnector = GoHighLevel's white-label brand).
4. **Snapshot loader** — a "Load Snapshot Template" dialog is present (`snapshots.loadSnapshotsTemplate`), i.e. it's built from a reusable GHL snapshot.
5. **Feature fingerprint + pricing** — the module set (Conversations, Opportunities, Calendars, AI Agents, Social Planner, Funnels/Sites) and the £297/£497 pricing exactly mirror GHL's $297/$497 agency tiers.

**Location ID (yours):** `rmak5Zndi0uU3aBpiu8f`. Useful if you ever export your own contacts/data out via the GHL API before you cancel.

---

## 2. Module map (what's switched on in your account)

| Left-nav module | GHL feature | What it does for GymGlitch |
|---|---|---|
| **Conversations** | Unified inbox | One inbox across WhatsApp + SMS (+ email). 393 unread at time of review. |
| **Calendars** | Calendar booking | Trial/tour booking into staff calendars — **Paul Airey, Dan Groom, Gym Reception**. |
| **Contacts** | Smart Lists | Lead/contact records with custom fields (source, DOB, contact type = Lead). |
| **Opportunities** | Pipelines | Two pipelines: **Sales** (6 stages) + **Retention** (2 stages — token gesture). |
| **AI Agents** | AI Employee | **Voice AI**, **Conversation AI**, **Knowledge Base**, **Agent Templates**, **Agent Logs**. |
| **Call Management** | Dialer / phone | Outbound calling. Caller ID is **"Hassan's number +447888862744"** (the agency owner's number — see §7). |
| **Marketing** | Social Planner | Social post scheduling. |
| **Sites** | Funnels / Client Portal | Landing pages / funnels. |
| **Reporting** | Facebook Ads reporting | Meta ad reporting (the £497 "full-service" tier manages your ads). |
| **Media Storage / Settings** | Standard GHL | Assets + config. |

---

## 3. The AI agent — the crown jewel (and it's very copyable)

One primary bot: **"General Support Bot"**, persona name **"Jessica"**, status **Auto-Pilot**, channels **SMS + WhatsApp**.

**Engine:** OpenAI **GPT-4.1**, ~4,100–5,100-token system prompt. Response delay 10 seconds; max 25 messages per conversation.

**The prompt is built from three GHL "Bot Goals" fields:**

**① Personality** (verbatim, as configured):
> "Hey you, you're a fun remote receptionist named **Jessica** who works for a gym called `{{location.name}}`. This gym is super local and well trusted in the community, so the person doesn't have to worry about a thing. If the person asks you a personal question, come up with a sincere response. **Do not tell the person you are a bot.** You should … not sound like an assistant, especially not some boring minimum wage earning assistant. That means not using the gym's name or the person's name in your responses. Give answers in full detail and don't miss out key information."

**② Goal** (verbatim):
> "Your goal is to assist the customers with their queries and provide full, informative answers."

**③ Additional Information** — conversation guidelines + an **embedded knowledge base** ("the wiki"):
> Conversation Guidelines: *Avoid using emojis. *Always refer wiki if you think more info can add value. *When giving appointment availability include morning, afternoon and evening but **don't give exact time slots**…
> …followed by the gym's facts: recovery equipment (Hyperice Normatec compression boots, massage guns, heat & cold therapy guns), 45-minute sessions, and membership pricing (**Classic £31.99 / Wow £36.99 / Epic £49.99**).

**Actions wired to the bot** (GHL "Setup your Actions"):
`Appointment Booking` · `Trigger a Workflow` (×2) · `Contact Info` (capture) · `Stop Bot` · `Human Handover` (×3) · `Transfer Bot` · `Auto Followup` (×2) · `Enable Conversation Summary`.

**Read that back:** the entire "AI" is a single GPT-4.1 prompt telling the model to pose as a human receptionist named Jessica, pull from an inline knowledge base, and trigger a booking/workflow action. **There is nothing here GymIQ can't reproduce — and improve — in a day.**

### The agent seen in the wild (real WhatsApp threads in your inbox)
- **Abandoned-cart recovery:** *"Hey [name], just wanted to check in — was there anything that held you back from finishing your sign-up yesterday? We'd love to have you on board…"*
- **Pricing + timetable Q&A:** posts the class timetable link and the three membership tiers.
- **Free-trial handling + booking:** *"You can do a free trial of either a gym session or one of the classes… let me know what time of day works best and I'll check availability."*

### The lead lifecycle it maintains (contact tags)
`abandoned cart` · `sales lead` · `valid whatsapp` · `appointment booked` · `showed for appointment` · `cancelled appointment`. These tags are what the hidden workflows fire on.

### The Sales pipeline (6 stages — call/appointment centric)
`A) New lead (1st Call)` → `B) Showed for App` → `C) No-Show for App` → `D) Call Back Later` → `E) 2nd Call` → `[F) Won/Joined]`.
The **Retention pipeline has only 2 stages** — effectively a placeholder. This is the gap GymIQ was built to own.

---

## 4. What's deliberately hidden from you

The **Automation / Workflows** menu is **not visible in your sub-account**, and navigating to `/automation/workflows` directly **redirects you back to Conversations**. Translation: your friend has **restricted the workflow menu** so that you — the paying customer — cannot see or copy the follow-up sequences (the timing, the message copy, the branching). The workflows are the one genuinely bespoke asset, and they're behind glass.

**Two implications:**
1. You're paying £300/month for a build you're not allowed to inspect or take with you. If the relationship ever ends, the workflows don't come with you.
2. We can still reconstruct the cadence from the evidence (abandoned-cart trigger → 24h check-in → pricing → trial-booking → no-show re-engagement → 2nd-call), which is a bog-standard **speed-to-lead + 5–7-touch** recipe. Nothing proprietary.

---

## 5. Weaknesses & risks (your ammunition for "we beat GymGlitch")

1. **Zero real retention.** Front-of-funnel only. It cannot see an existing member's behaviour, predict churn, or run a cancel-save. The "Retention" pipeline is 2 empty stages.
2. **Generic data model.** GHL knows "contacts," not "members." No risk score, no visit recency, no tenure cohort, no payment health.
3. **Agency lock-in & opacity.** Workflows hidden; you can't self-serve. You rent it; you don't own it.
4. **Caller ID is the agency owner's personal mobile** (`Hassan's number +447888862744`). Your leads may get calls/texts stamped with someone else's number — unprofessional and off-brand for Energie.
5. **Reliability wobble.** WhatsApp showed **"not connected — Connect WhatsApp"** during the review. WhatsApp is the primary channel; a silent disconnect means leads go unanswered.
6. **Stacked, opaque cost.** GHL platform fee + AI token usage + WhatsApp/SMS + the agency's margin, bundled into £300/mo. You have no line-of-sight on unit economics.
7. **"Don't tell them you're a bot" is a compliance grey area** in the UK. For a product you intend to *sell to other gyms*, impersonating a human without disclosure is a reputational and potentially regulatory risk (ASA/CAP, GDPR transparency). GymIQ can make honest-but-warm the default and turn it into a trust feature.
8. **Not multi-tenant as a product.** It's one agency serving clients one sub-account at a time — fine as a service, not a scalable SaaS you can sell.

Fair caveat: current usage at your club is low (July: **22 unique contacts, 81 messages, 6 appointments booked, ~13.5 min "time saved"**) — that's early single-site volume, not proof the product is bad. The point isn't that GymGlitch is broken; it's that **it's shallow, rentable, and trivially replicable**, and it can never grow into retention.

---

## 6. Feature-parity + "beat it" matrix

> **Status column reflects the *live* code as of 21 Jul 2026 — not the stale CLAUDE.md roadmap.** Most of the lead engine is already built; the true gaps are marked 🔴.

| GymGlitch capability | How GymIQ replicates | How GymIQ *beats* it | Real status in GymIQ |
|---|---|---|---|
| AI chat agent (GPT-4.1 "Jessica" persona) | `lib/services/lead-conversation.ts` + cost-routed `gateway.ts` | Route empathy turns to **Claude Sonnet**, cheap turns to GPT-4o-mini; **honest-but-warm** persona (no bot-deception risk) | ✅ **already built** (200 ln: KB answers, booking-intent, buying-signal, escalation, opt-out) |
| WhatsApp/SMS auto-response <60s | `api/webhooks/twilio` → engine → reply | Dry-run gate, quiet hours, STOP list already enforced (UK GDPR-native) | ✅ **already built** (685-line inbound webhook) |
| 5–7 touch follow-up sequences | `sequences`/`lead_sequence_runs` + Vercel Cron | Owner can **see** the cadence (vs GymGlitch hiding it) | ✅ **already built** (`cron/sequences` 377 ln + `cron/lead-sequences` 371 ln) |
| Abandoned-cart / DBR reactivation | `api/cron/abandoned-leads` | Same engine as retention win-back | ✅ **already built** (143 ln) |
| Sales/lead pipeline (stages) | `lib/services/lead-pipeline.ts` + leads dashboard | Auto-advance from message classification (reply-classifier exists) | ✅ **already built** (233 ln + 215-ln dashboard) |
| Trial/tour booking | Google Calendar (connected via MCP) or Cal.com | Book into staff calendars w/ confirmations + reminders | 🔴 **gap** — AI detects intent but no booking backend yet (legacy `booking.ts` not ported) |
| Missed-call text-back | Twilio inbound-call webhook → SMS | Same safety gating | 🔴 **gap** — small build |
| Lead intake (web form / Meta ads) | Public capture form + Meta lead-ads webhook | Ties straight into the sequence engine | 🔴 **gap** — today only API/CSV enrolment (`leads/enrol`) |
| Billing | Stripe Payment Link / Checkout | One bill, no agency margin | 🔴 **gap** — Stripe not wired at all |
| Lifecycle tags | status fields on leads/members | Plus **risk scoring** on members | ✅ status model exists |
| Social planner / FB ad reporting | Marketing + Intelligence modules | Gym-specific AI posts; tie spend to *joined members* | 🆕 later phases |
| Retention pipeline (2 stubs) | **GymIQ's entire core** | Churn prediction + 5-stage cancel-save + payment recovery — GymGlitch has nothing here | ✅ **already built** (churn-engine 302 ln, cancel-save 409 ln) |

**Bottom line:** GymIQ isn't weeks-of-building away from GymGlitch parity — most of it **already exists in your repo.** The remaining gap is four concrete items: **booking backend, lead intake sources, missed-call text-back, and Stripe.** Close those and you can switch GymGlitch off — starting from a position GymGlitch can *never* reach: real retention.

---

## 7. You've already built most of this (verified against the live code)

Contrary to what your CLAUDE.md roadmap implies, the lead engine is **not** merely "parked on `legacy-monorepo`" — it has **already been ported into the live `unified/` app**, apparently in the last day or two (there's a `20260722_lead_recovery.sql` migration from ~last night). Verified present and substantial:

- `lib/services/lead-conversation.ts` — the Lead Conversation AI (your "Jessica" answer). ✅
- `lib/services/lead-pipeline.ts`, `lib/services/lead-sequences.ts`. ✅
- `api/cron/lead-sequences`, `api/cron/abandoned-leads`, `api/webhooks/twilio` (685 ln). ✅
- `api/leads/{enrol,start}`, the leads dashboard, and the `lead_sequence_runs` + `lead_journey` tables. ✅
- Retention side: `churn-engine.ts`, `cancel-save.ts`, `default-sequence.ts` (a genuinely good 3-touch WhatsApp recovery flow), real dashboard pages. ✅

The `legacy-monorepo` branch **still exists** (locally and on origin) as a reference for anything not yet ported — notably `services/booking.ts`, which is the one piece you still need for real trial-slot booking.

---

## 8. Recommendation

1. **Finish, don't rebuild.** The lead engine is mostly done. Close the four gaps: **booking backend** (use your connected Google Calendar, or port legacy `booking.ts`), **lead intake** (web form + Meta lead-ads webhook + missed-call text-back), and **Stripe billing**.
2. **Stand it up at Energie Hoddesdon alongside GymGlitch**, dry-run first, then live on WhatsApp. Prove parity on your own leads.
3. **Cut GymGlitch once parity holds** — saving £300/mo (~£3,600/yr) and giving you a product you *own* and can *sell*. Realistic timeline: **~2–3 weeks**, not months.
4. **Lead with what GymGlitch can't do** when you sell: "It converts leads. We convert leads *and* stop members leaving — on one platform, built UK-first, and you can see exactly what it's doing."

See the companion **GYMIQ_STRATEGY_2026-07-21.md** for the full product architecture, pricing, roadmap and go-to-market.
