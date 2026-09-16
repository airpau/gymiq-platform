# GymIQ — Product, Pricing & Go-To-Market Strategy
**Date:** 2026-07-21
**Prepared for:** Paul Airey, Founder, GymIQ AI
**Companion doc:** `GYMGLITCH_TEARDOWN_2026-07-21.md`
**Status:** Strategy + implementation plan, grounded in the live `unified/` codebase, the May-2026 audit, the real Glofox audit data, a live GymGlitch teardown, and fresh 2025–2026 industry research.

---

## 0. TL;DR — the one-paragraph version

GymIQ should evolve from "AI retention agent" into the **AI operating system for independent gyms** — five modules on one platform (Retention, Lead Recovery, Operations, Marketing, Intelligence), sold to independents first and franchisees as a bolt-on. Retention stays the **wedge** because it's the hardest thing to copy and the thing nobody serves at your price point (Keepme owns AI retention but only at ~£19k/year for enterprise). The near-term priority is smaller than it looks: **both the retention engine and the lead-recovery engine are already substantially built in your codebase** (verified against the live files — your CLAUDE.md roadmap is stale). What's left to replace GymGlitch at Energie is a **narrow, specific gap** — a booking backend, real lead intake, Stripe, WhatsApp-sender approval, and QA — not a ground-up build. Close it, switch GymGlitch off, save £300/mo, and turn "Lead Recovery AI" (already advertised on your site) into a shipped product. Then build the three genuinely-new modules (Operations, Marketing, Intelligence). Lead with the loss ("£6,920/mo is leaking out of your gym"), prove it at Energie, and sell owner-to-owner.

---

## 1. The strategic shift (and the two decisions it forces)

Your `CLAUDE.md` currently says lead capture / receptionist / voice are **out of scope "unless we change our minds in writing."** Your message is that change in writing: you want the GymGlitch lead-follow-up functionality *inside* GymIQ, plus operations, social, and manager/staff checks. openclaw's instinct — expand to a 5-module "AI operations co-pilot" — is right. This document grounds it in what you actually have and adds the two things openclaw missed: (a) you've **already built most of the lead engine** (it's parked), and (b) the honest read on **pricing and sequencing**.

**Two decisions this forces (flagged for you, not assumed):**
- **D1 — Scope:** Confirm GymIQ is now *retention + lead recovery + operations + marketing + intelligence*, retention-first. (I recommend yes.)
- **D2 — Pricing:** Whether to move Complete from £299 → £399 and introduce add-on modules. (I recommend a **staged** move — see §6 — not an immediate jump.)

---

## 2. The gym owner pain-point map

Ranked by **revenue impact** (biggest recurring-money leak first), with the strongest sourced stat under each and what AI automates. Full sources in §11. UK-first; US where UK data is thin.

### ① Member churn / retention — the biggest recurring leak *(your core)*
- Industry retention ~**66%** → ~1 in 3 members lost yearly (HFA 2025). Traditional gyms run ~40% churn; **50% of new members quit within 6 months** (IHRSA).
- Early inactivity is the tell: members **inactive 14+ days are ~6× more likely to cancel** (48% vs 8%). Non-use is the #1 stated reason (~46% "not visiting enough to justify cost", IHRSA).
- **AI automates:** risk scoring from visit-recency, sleeper/dormant detection, and outbound WhatsApp save conversations *before* the direct debit cancels. **← GymIQ's churn engine + cancel-save already do this.**

### ② Failed payments / involuntary churn — the highest-certainty "found money"
- **UK gym direct debits fail at 4.44% — the highest of any tracked sector** (ONS / Pay.UK, 2023). Involuntary (payment-failure) churn is **20–40% of all churn**; ABC says failed payments now drive **up to 1 in 3 gym cancellations**.
- Smart dunning (retry + card-updater + a friendly pre-charge nudge) **recovers 45–70%** of failed transactions.
- **AI automates:** retry scheduling, card-expiry pre-emption, "your payment didn't go through" WhatsApp nudge. Near-pure-margin recovery.

### ③ Sales / lead response — speed-to-lead & missed calls *(GymGlitch's turf)*
- Contact a lead **within 5 minutes → 21× more likely to qualify**; the average business takes far longer. Only ~2% of sales close on first contact — nearly all leads need multi-touch follow-up.
- Slow/poor follow-up drags lead→member conversion to **15–20%** vs **30–50%** best-practice.
- **AI automates:** sub-60-second first response to every web/DM/missed-call lead, 5–7-touch nurture, trial booking. **← This is the GymGlitch replacement (Lead Recovery AI).**

### ④ Onboarding / member experience — the upstream lever on churn
- Members who build a habit in the first **12 weeks retain at ~87% at 6 months vs ~60% baseline**. 4+ staff interactions/month → **80% more likely to return**.
- **AI automates:** triggered day-1/3/7/30 onboarding, milestone celebration, class booking + waitlist backfill, "we miss you" nudges.

### ⑤ Marketing / reviews / referrals — acquisition efficiency
- A 5-star Google rating earns **~25% more clicks** from the local pack. Referrals convert at **~41%** vs 1–3% for cold paid social and carry **~37% higher LTV**. A small gym pays a social agency **£400–£800/mo**.
- **AI automates:** review-request triggers post-milestone, review replies, referral asks at peak satisfaction, always-on social content — displacing the agency line.

### ⑥ Staff / daily operations — labour & consistency *(your "manager/staff checks")*
- Rent + staff ≈ **70% of gym operating costs**. Opening/closing checks, cleaning logs, equipment checks and H&S are done inconsistently and invisibly.
- **AI automates:** daily staff checklists with photo/tick sign-off, maintenance/cleaning logs, incident reporting, shift reminders, SOP generation, and a **manager's daily digest** ("all opening checks done ✓, 2 equipment faults logged, pool test missed").

### ⑦ Financial visibility — the enabler
- Retention costs **5–7× less than acquisition**, yet most independents track neither CAC nor real-time churn. Personal training is ~**47% of club revenue** but only ~**23% of members use a PT**.
- **AI automates:** a daily "gym health score", ARPU/LTV/at-risk surfacing (your audit engine already does this), secondary-spend gap-spotting, multi-site rollup.

### ⑧ Compliance / admin — time drain & risk
- UK SMBs lose ~**24 days/year** to financial admin; **49%** spend 4+ hrs/week on payment issues; **63%** believe AI will help.
- **AI automates:** STOP/opt-out handling (built), audit-ready message logs, reminder-driven H&S/compliance checklists, GDPR-safe consent tracking.

> **⚠️ Correction for your CLAUDE.md:** the line *"a single warm email to dormant members cuts monthly cancellations ~80%"* could **not** be verified against a primary source in this research pass. The nearest *sourced* facts are "**4+ staff interactions/month → 80% more likely to return**" (Dr Paul Bedford) and "**~23% of at-risk members recovered via automated win-back**" (Jeri Commerce, 2026). Recommend restating the claim to one of those before it appears in any sales material — using an unverifiable 80% stat in front of gym owners is a credibility risk.

---

## 3. The revenue-at-risk model (your core sales argument)

For a typical **500-member UK independent at £40/mo (= £20,000 MRR / £240k ARR)**:

| Leak | Sourced assumption | Gross £/mo exposed | Realistically recoverable |
|---|---|---|---|
| **Churn** | 40% annual churn; ~46% of it non-use | ~£668/mo of MRR walks; ~£307/mo is the savable "sleeper" slice | ~£1k–1.5k/yr protected at 25–30% save-rate |
| **Failed payments** | 4.44% DD failure (ONS, UK fitness) × £20k | **£888/mo** fails first presentation | 45–70% recoverable → **£300–450/mo** saved |
| **Failed leads** | ~40 enquiries/mo; 15–20% vs 30–50% conversion | ~£120–160/mo new MRR forgone (compounds) | Most recoverable with <60-sec response |

**Headline:** ~**£1,700–2,000/month** flows through these three leaks; ~**£700–1,200/month is realistically recoverable** with automation. Your own May-2026 audit found **£6,920/mo at risk on a 1,622-member base (£4.27/member/mo)** — scaled to 500 members that's ~£2,133/mo, dead in line with the model. Either way the at-risk pool is **7–12× the subscription price**. That ratio *is* the pitch.

---

## 4. Product architecture — five modules on one platform

> **⚡ Reality check (verified against the live code on 21 Jul, not the stale CLAUDE.md):** you are **much further along than your operating manual says.** Both the retention engine *and* the lead-recovery engine are **already substantially built** in `unified/src`. The CLAUDE.md roadmap still lists sequence runner, inbound webhook, dashboard and lead recovery as "next/not built" — but the actual filesystem shows them **done**, including a `20260722_lead_recovery.sql` migration built essentially last night. What follows marks true current status: ✅ built & substantial · 🟡 built but needs hardening/QA · 🔴 genuine gap · 🆕 net-new module.

### Module 1 — Retention AI *(the wedge — built, needs hardening)*
Churn prediction, sleeper/dormant detection, 5-stage cancel-save, payment recovery, win-back sequences.
- ✅ `churn-engine.ts` (302 ln), `cancel-save.ts` (409 ln), `reply-classifier.ts`, `contact-policy.ts` (quiet hours/opt-out), `twilio.ts` (dry-run gated), `gateway.ts`, `default-sequence.ts` (a genuinely good 3-touch WhatsApp recovery sequence).
- ✅ **Sequence runner** `api/cron/sequences` (377 ln) · **Twilio inbound webhook** `api/webhooks/twilio` (685 ln) · **dashboard** pages real (overview 323, retention 273, members 308, conversations 249 ln) · **audit→onboarding** `onboard/[auditId]` + `api/onboard/claim` · payment-recovery email `send-recovery.ts`.
- ✅ DB: retention schema live (gyms, members, conversations, messages, cancel_save_attempts, sequences, sequence_runs, messaging_optouts, ai_cost_log).
- 🔴 **Real gaps:** Stripe billing (not wired at all), automated tests/CI (none), and end-to-end QA on live data.

### Module 2 — Lead Recovery AI *(the GymGlitch replacement — largely built as of ~last night)*
Speed-to-lead <60s across WhatsApp/SMS, 5–7-touch nurture, abandoned-lead reactivation, lead pipeline, trial/tour booking.
- ✅ `lead-conversation.ts` (200 ln — a full Lead Conversation AI: KB answers, booking-intent detection, buying-signal → "converting" stage, human escalation, opt-out) — **this is your honest-but-warm answer to GymGlitch's "Jessica," and it already exists.**
- ✅ `lead-pipeline.ts` (233), `lead-sequences.ts` (233), `api/cron/lead-sequences` (371), `api/cron/abandoned-leads` (143 — the GymGlitch abandoned-cart equivalent), `api/leads/{enrol,start}`, leads dashboard (215 ln), `20260722_lead_recovery` migration (lead_sequence_runs, lead_journey).
- 🔴 **Real gaps to hit full GymGlitch parity:** (1) a **booking/calendar backend** — the AI detects booking intent but there's no service that actually reserves a slot (legacy `booking.ts` was *not* ported; you have **Google Calendar connected via MCP** — use it, or Cal.com); (2) **lead intake from real sources** — currently only API/CSV enrolment; needs a website capture form, Meta lead-ads webhook, and missed-call text-back.
- **Already advertised on your site at £179/mo — this is finishing, not new scope.**

### Module 3 — Operations AI *(new — your "manager/staff checks")*
Daily opening/closing checklists with tick/photo sign-off, cleaning & maintenance logs, equipment-fault reporting, incident logging, H&S/compliance reminders, SOP generation, staff shift reminders, and a **manager's daily digest**.
- 🆕 New tables (`checklists`, `checklist_runs`, `tasks`, `incidents`), a mobile-friendly staff view, and a daily digest via Resend/WhatsApp. Reuses the Cron + messaging infra from Module 1.

### Module 4 — Marketing AI *(new)*
AI social-post generation + scheduling (gym-specific), Google review requests + AI replies, Google Business Profile prompts, referral-ask triggers at peak satisfaction.
- 🆕 Content generation via AI gateway; review integration; scheduling via Cron. Displaces the £400–800/mo agency line.

### Module 5 — Intelligence AI *(new — extends your audit engine)*
Daily "gym health score", revenue-at-risk dashboard, ARPU/LTV/benchmarking, secondary-spend gaps, **multi-site rollup** (this is also the franchise hook), weekly owner email.
- 🆕 Aggregate queries + a scored daily email. Your `audit-analysis.ts` is the seed.

**Sequencing principle (agree with openclaw, but be firmer):** do **not** build 3–5 in parallel. Nail Modules 1 + 2 at Energie until they're boringly reliable, *then* add 3, then 4/5. Expanding before the core is bulletproof is the single biggest risk (openclaw flagged this too — it's correct).

---

## 5. Competitive positioning

The map (see teardown + research briefs for detail):
- **Keepme** owns real AI retention — but at **~£19k/year, enterprise-only**. It cannot serve a 100–1,000-member independent. **This is the white space GymIQ occupies:** *"enterprise-grade churn AI without the enterprise price."*
- **ABC Glofox** shipped an AI Churn Predictor in 2025 — but it locks you into Glofox. GymIQ's edge is **CRM-agnostic, bolt-on, no migration**.
- **GymGlitch / GoHighLevel snapshots** are front-of-funnel lead tools on a generic contacts model — **no retention, ever** (see teardown). You concede lead-capture parity and **own the retention lane**, then take the lead lane too because you already have the code.
- **ClubRight / PushPress / TeamUp / Gymdesk** = rules-based automation labelled "AI"; real churn prediction is absent.

**Your five defensible differentiators** (put these on the site):
1. **Built by a gym owner** who watched a real 1,622-member base leak £6,920/mo — and built the tool to plug it. (Tie the founder story to the *audit*, so it doesn't read as a GymGlitch echo — GymGlitch uses the identical "built by a gym owner" line.)
2. **Works on top of your existing CRM** — Glofox/Mindbody/ClubRight/PushPress/spreadsheets. No rip-and-replace.
3. **Retention *and* leads on one platform** — the only tool doing both for independents.
4. **UK GDPR-native & dry-run-safe** — STOP list, quiet hours, `MESSAGING_LIVE` + per-gym `messaging_enabled` dual gate. Safety as a feature, not fine print. (And an honest-but-warm AI that doesn't pretend to be human — unlike GymGlitch.)
5. **Transparent** — the owner sees exactly what the AI is doing (GymGlitch hides its workflows even from you, the customer).

**One-line positioning:** *"GymIQ is the AI team for independent gyms — it wins back leads, saves members before they quit, and runs your daily ops. Enterprise-grade, bolted onto the CRM you already use, built UK-first, from £179/month."*

---

## 6. Pricing recommendation

Your canonical live pricing is **£179 Retention / £179 Lead Recovery / £299 Complete** (Enterprise custom). openclaw proposed jumping Complete to £399 and adding £49–99 module add-ons. Here's the honest read.

**The £399 logic is sound but premature.** Yes, the at-risk pool (£2k+/mo) dwarfs £399. But you have **zero paying customers and no case study yet**. Raising the flagship price *before* you can prove ROI raises your own sales friction at the exact moment you need momentum. Price is easy to raise later, painful to cut.

**Recommended structure — a staged path:**

**Now (0–3 months): keep it simple, land the first 10.**
- Retention AI **£179** · Lead Recovery AI **£179** · **Complete £299**.
- Add a **Founding-Member offer**: e.g. **£99–149/mo for the first 10 clubs, card-on-file, 90-day performance guarantee, done-with-you setup.** (A card-on-file pilot converts ~2× better than a free trial — see §9.)

**Next (3–9 months, once Operations/Marketing ship + case study exists): introduce modularity.**
- Core **Complete £299** = Retention + Lead Recovery.
- **Operations AI +£79/mo**, **Marketing AI +£79/mo**, **Intelligence AI +£49/mo** as add-ons.
- **New top bundle "GymIQ Everything" £399/mo** = all five modules (the £399 lands *here*, justified by five modules and a proven ROI number, not as a naked price hike).

**Franchise / multi-site:** keep **Enterprise custom**, priced **per-site with a multi-site discount** (e.g. £129–149/site at 5+ sites) plus the Intelligence multi-site rollup. This is where franchise HQs buy.

**Reconcile the record:** your CLAUDE.md still references £99/£199/£399 in places while the site shows £179/£179/£299. **Pick one and make CLAUDE.md + site + Stripe agree** before a customer asks. Recommendation: the £179/£179/£299 line above.

---

## 7. Franchise vs independent (your specific question)

You own a **franchised** club (Energie Hoddesdon) and asked whether GymIQ has to target independents. Short answer: **independents are the primary market, franchises are a real secondary bolt-on — but sold differently.**

- **Independents (primary):** no head-office software rules, owner is the sole decision-maker, short sales cycle, feel the churn/lead pain directly. This is where a founder-led, owner-to-owner motion converts fastest. ~3,000–4,000 UK sites — reachable by name.
- **Franchisees (secondary bolt-on):** the nuance you raised is correct — franchises have rules about the **CRM/core software** they must run (Glofox, etc.). But **GymIQ bolts *on top* of that mandated CRM rather than replacing it** — which is exactly why it can slip past franchise software rules where a rip-and-replace CRM can't. Sell it to franchisees as *"keep your Glofox, add the AI layer HQ doesn't give you."*
- **Franchise HQ (channel play, later):** one endorsement from an Energie/UBX/Snap/Anytime HQ = dozens of near-identical clubs on the same stack. Your Energie pilot is the wedge into Energie HQ. The **Intelligence multi-site rollup** is the feature HQs actually want (consolidated retention/lead reporting across the estate).

**Practical framing for the site:** primary headline speaks to independents; add a "Franchisee?" strip — *"Bolt GymIQ onto the CRM your franchise already mandates — no migration, no head-office fight."*

---

## 8. Implementation roadmap (mapped to the *real* current code)

Because both engines are already built, the roadmap is not "build it" — it's **close five specific gaps, harden, and prove at Energie**, then build the three new modules.

**Phase 0 — Decide & reconcile (this week).**
Confirm D1 (scope) + D2 (pricing). Reconcile CLAUDE.md/site/pricing + fix the "80% email" stat. Start the **WhatsApp Business sender** submission now (24–72h Meta clock — it gates everything outbound). Add **Vitest + a Vercel CI check** (you have zero tests and no paying customer yet — do it before you do).

**Phase 1 — Close the GymGlitch-parity gaps (≈1–2 weeks).**
The lead engine exists; make it end-to-end usable: (a) **booking backend** — wire the AI's booking-intent to a real calendar (Google Calendar via your MCP, or Cal.com) so it can actually reserve trial slots; (b) **lead intake** — a website capture form + Meta lead-ads webhook + missed-call text-back so real leads flow in (today it's API/CSV only); (c) end-to-end **QA on live data** in dry-run. Then flip WhatsApp live for leads at Energie.

**Phase 2 — Billing + retention hardening (≈1 week, parallel).**
Wire **Stripe** (Payment Link is enough for MVP) — the one true gap in the retention stack. QA the cancel-save + payment-recovery flows on real member data. Ship the "saved outcome + £ recovered" capture so the case-study number is automatic.

**Phase 3 — Cut over GymGlitch at Energie (target ≈2–3 weeks from now).**
Run GymIQ's lead engine alongside GymGlitch, confirm parity on your own leads, then **switch GymGlitch off** — saving £300/mo and giving you a product you own.

**Phase 4 — Operations AI (≈2–3 weeks).**
Daily checklist generator + tick/photo sign-off, cleaning/maintenance logs, incident logging, manager's daily digest. Mobile-first staff view. Reuses the Cron + messaging infra already built.

**Phase 5 — Marketing AI + Intelligence AI (≈3–4 weeks).**
Social content generator + scheduler, Google review request/reply automation; daily gym-health email + benchmarking + multi-site rollup (the franchise hook). Seeded by `audit-analysis.ts`.

**Cross-cutting:** encrypt `connectorConfig` credentials at rest before any real gym's CRM keys land in the DB; add per-IP rate limiting on `/api/audit`.

**Realistic windows:** GymGlitch parity + cut-over in **~2–3 weeks** (not the ~2 months a from-scratch read implies); Operations in ~3 weeks after; Marketing/Intelligence ~1 month after that.

---

## 9. Advertising & go-to-market

**Golden rule:** don't spend on paid acquisition until the **Energie case study exists** — it's the multiplier on every other channel.

**Channels, ranked for a bootstrapped founder:**
1. **The Energie case study + warm franchise network** (CAC ~£0–50). You're a gym owner selling to gym owners with a live pilot. One great case study unlocks the Energie franchise network.
2. **The free retention audit as lead magnet** (you already built it; CAC ~£20–80). Gate lightly (email), deliver an instant £-at-risk number, CTA = "want GymIQ to message these 180 sleepers for you?" Every channel points here.
3. **Gym-owner communities** — **Independent Gyms UK & Ireland (~2,300+ owners)** is the single highest-leverage UK partnership; plus Two-Brain, Gym Launch, Loud Rumor masterminds. Show up, give the audit, don't hard-sell.
4. **Owner-to-owner outbound** (email + LinkedIn), founder-signed, personalised with their likely £-at-risk. Owners reply to cold email ~0.57% on average — a hand-built list of 200 UK independents will beat that several-fold.
5. **Partnerships** — CRM marketplaces (Glofox/TeamUp/PushPress), equipment suppliers (Matrix, Technogym), franchise HQs, gym insurers/accountants. Affiliate rev-share 20–30%.
6. **Content/SEO + podcast guesting** (Fitness Business Insights, UK PTs Podcast) — slow-burn, cheap, builds the founder narrative.
7. **Paid ads — later & surgical:** Meta retargeting of audit visitors first; then narrow Google Search ("reduce gym churn", "gym lead follow-up software", "win back lapsed members"). UK CPCs ~£2.50–4; expect ~£350–650 CAC — affordable but not where you start.
8. **Trade shows (Elevate London, SIBEC UK):** attend & network year 1; booth only once the close is repeatable.

**Ad angles (lead with loss, prove with ROI):**
- *"You're losing £6,900 a month to members who quietly stopped showing up."*
- *"180 of your members haven't been in for a month — and they're about to cancel. Want their names?"*
- *"I run Energie Hoddesdon. I got sick of watching direct debits cancel — so I built the AI that saves them."*
- *"It converts your leads AND stops members leaving. GymGlitch only does half of that."*
- Risk-reversal: *"If GymIQ doesn't save more members than it costs in 90 days, you don't pay."*

**Funnel:** Awareness → **Free Retention Audit** (email gate, instant £ number) → activation offer ("contact these for me") → self-book 15-min founder demo *or* monthly "Cut churn 20% in 90 days" webinar → **90-day card-on-file paid pilot w/ performance guarantee** (converts ~2× a free trial and funds the AI/Twilio COGS) → saved-member proof → referral loop ("which 2 gym-owner mates should see *their* number?").

**Case-study playbook (start now, at Energie):** baseline the numbers *before* you scale outreach; capture £ recovered, sleepers reactivated, cancellations prevented; produce a 1-page PDF, a 90-second gym-floor video testimonial, a live dashboard screenshot, and a "how we found £6,920/mo hiding in 1,622 members" teardown post.

**90-day launch:** *Days 0–30* freeze Energie pilot metrics + ship the 4-format proof stack + hand-build a 200-name list. *Days 31–60* founder-signed outbound + go active in Independent Gyms UK + 2–3 podcasts + Meta retargeting. *Days 61–90* first webinar + 1–2 partnerships + convert pilots + fire the referral loop + *then* test Google Search. North star: **~10 paying clubs, one bulletproof case study, blended CAC <£500.**

---

## 10. How this differs from openclaw's plan (honest read)

openclaw's strategy is directionally good — the 5-module vision, the "AI operations co-pilot" framing, the loss-led marketing, and "nail the core before expanding" are all right, and I've kept them. Where this plan is **better grounded**:

1. **It's tied to your actual code — and it caught that you're weeks ahead of where you think.** openclaw wrote a generic strategy (and its `notes/gymiq-expansion-strategy.md` didn't actually persist to your repo — it isn't there). I read the live filesystem and found that **both engines are already built** (Lead Conversation AI, lead + retention sequence runners, abandoned-lead cron, a 685-line inbound webhook, real dashboards, and a `20260722_lead_recovery` migration from last night). openclaw planned to *build* all of this from scratch and would have had you re-doing work that's already done. The real task is closing five specific gaps, not a multi-month build.
2. **The GymGlitch teardown is real.** I logged into your account and documented the GPT-4.1 "Jessica" prompt, the 8 bot actions, the 6-stage Sales pipeline, the hidden workflows, and the caller-ID/reliability gaps. That's the difference between "here's roughly what it does" and "here's exactly how to replicate and beat it."
3. **Pricing is staged, not hiked.** I'd *not* jump to £399 today (no proof yet). Land 10 clubs at the current price with a guarantee, *then* introduce modular add-ons and a £399 five-module top bundle.
4. **The franchise nuance is answered directly** (bolt-on-top-of-mandated-CRM is the key), which your message specifically raised.
5. **It catches an error in your own CLAUDE.md** (the unverifiable "80% warm email" stat) before it reaches a customer.

**Biggest risks (unchanged and real):** expanding before the retention/lead core is bulletproof; WhatsApp sender approval delay; no tests/CI before first paid customer; plaintext CRM credentials; and honesty in marketing (don't claim "live with Energie" or unverifiable stats until true).

---

## 11. Immediate next actions (this week)

1. **Confirm D1 (scope) + D2 (pricing).** One line each.
2. **Start the WhatsApp Business sender submission** (24–72h clock).
3. **Reconcile pricing** across CLAUDE.md, the site, and Stripe; fix the "80% email" stat.
4. **Green-light Phase 1** (close the parity gaps: booking backend + lead intake + Stripe + QA) — or tell me to start it.
5. **Baseline the Energie numbers now** so the case study is real when you scale.
6. **Decide the GymGlitch cut-over date** — target ~2–3 weeks, once Lead Recovery hits parity in dry-run.

Tell me which of these to start and I'll begin implementing against the `unified/` codebase (Supabase migrations via MCP, ported modules, dashboard, Stripe).

---

## Appendix — Sources (2024–2026)

**Industry / pain-points:** HFA 2025 Benchmarking (via ABC Fitness); IHRSA Retention Report; ABC Fitness "Billing Inertia Is Ending" (dunning, involuntary churn); ONS/Pay.UK (UK DD 4.44% failure); Jeri Commerce Retention Statistics 2026; Dr Paul Bedford / Health Club Management (UK retention); Glofox (lead-response, referrals); getAira (missed calls); Leisure DB State of the UK Fitness Industry 2024/25; Sage 2025 (SMB admin burden); GymMaster (KPIs); Geo Growth Media (UK social-agency cost).
**Competitive:** GymGlitch (live account + public pricing/features); GoHighLevel/NetPartners pricing; Keepme + PricingNow TCO; ABC Glofox AI Churn Predictor; Mindbody Messenger[ai]; ClubRight, PushPress, TeamUp, Gymdesk, Hapana, Xplor.
**GTM:** WordStream 2025 Google Ads benchmarks; LocaliQ 2025 Meta benchmarks; The B2B House LinkedIn benchmarks; Belkins 2026 cold-email study; Baremetrics trial-conversion; Proven SaaS CAC benchmarks; aevent webinar benchmarks; Independent Gyms UK & Ireland; Two-Brain; Elevate/SIBEC.

*(Full URLs are held in the research briefs behind this document and can be appended on request.)*
