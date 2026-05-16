-- Retention-agent schema.
--
-- Adds the tables the salvaged services (cancel-save engine, Twilio service,
-- AI gateway, sequence runner) need to operate. Lifted from the dormant
-- Prisma schema and simplified for the MVP scope:
--   - drops the inbound-receptionist-only models (calls, bookings, workflows,
--     lead_journey, message_templates, knowledge_base).
--   - drops the lead pipeline tables (out of scope for retention MVP).
--   - converts JSON columns to JSONB.
--   - everything uses RLS-deny-by-default + service-role bypass — public
--     visitors never touch these tables directly.

-- ─── Multi-tenancy root ─────────────────────────────────────────────────────

create table if not exists public.gyms (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text unique,
  timezone        text not null default 'Europe/London',

  -- Twilio config — per-gym senders for WhatsApp + SMS
  whatsapp_number text,
  sms_number      text,

  -- Settings & knowledge base (JSON for flexibility while we iterate)
  settings        jsonb not null default '{}'::jsonb,
  knowledge_base  jsonb not null default '{}'::jsonb,

  -- When messaging is enabled for this gym
  messaging_enabled boolean not null default false,

  -- Linked Supabase user — the gym owner
  owner_user_id   uuid references auth.users(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists gyms_owner_user_id_idx on public.gyms (owner_user_id);

-- ─── Members ────────────────────────────────────────────────────────────────

create table if not exists public.members (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,

  -- Source-of-truth ID from the gym's CRM (for dedup on re-imports)
  external_id     text,

  name            text not null,
  email           text,
  phone           text,

  -- Membership data
  join_date       date,
  status          text not null default 'active', -- 'active', 'frozen', 'sleeper', 'cancelled'
  plan_name       text,
  monthly_fee     numeric(8,2),
  next_payment    date,

  -- Engagement
  last_visit      date,
  visit_count_30d integer not null default 0,
  lifetime_value  numeric(10,2) not null default 0,

  -- Risk scoring (set by churn-engine)
  risk_score      integer not null default 0,
  risk_factors    jsonb not null default '[]'::jsonb,

  -- Free-form metadata from the source export
  source_metadata jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists members_gym_id_status_idx on public.members (gym_id, status);
create index if not exists members_gym_id_risk_idx   on public.members (gym_id, risk_score desc);
create index if not exists members_gym_id_external_id_idx on public.members (gym_id, external_id);

-- ─── Retention conversations ────────────────────────────────────────────────

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  member_id       uuid references public.members(id) on delete set null,

  phone           text not null,
  channel         text not null,            -- 'whatsapp' | 'sms'
  status          text not null default 'active',  -- 'active' | 'closed' | 'waiting_human'

  -- Lightweight working memory for the agent (last classified intent etc.)
  context         jsonb not null default '{}'::jsonb,

  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists conversations_gym_id_status_idx on public.conversations (gym_id, status);
create index if not exists conversations_phone_idx          on public.conversations (phone);
create index if not exists conversations_member_idx         on public.conversations (member_id);

-- ─── Individual messages ────────────────────────────────────────────────────

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,

  direction       text not null,            -- 'inbound' | 'outbound'
  content         text not null,
  content_type    text not null default 'text',

  -- Twilio tracking
  twilio_sid      text,
  channel         text not null,            -- 'whatsapp' | 'sms'

  -- Classification (only on inbound)
  reply_category    text,                   -- busy | cost | problem | leaving | positive | opt_out | other
  reply_confidence  numeric(4,3),
  reply_rationale   text,

  -- AI cost attribution
  ai_model        text,
  ai_cost_usd     numeric(10,6),

  -- Delivery tracking
  sent_at         timestamptz,
  delivered_at    timestamptz,

  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

-- ─── Cancel-save attempts ──────────────────────────────────────────────────

create table if not exists public.cancel_save_attempts (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,

  stage           text not null default 'initiate',     -- initiate | reason_inquiry | offer | objection_handling | closing
  outcome         text not null default 'in_progress',  -- in_progress | saved | lost | escalated

  reason          text,
  reason_category text,                                 -- too_expensive | not_using | moving | injury | unhappy | other

  offer_made      text,                                 -- freeze | downgrade | discount | free_session | pt_session | none
  offer_details   text,

  conversation_log jsonb not null default '[]'::jsonb,  -- [{direction, content, at}]

  -- Estimated revenue protected if the save succeeded (monthly_fee × est. tenure)
  revenue_protected numeric(10,2),

  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cs_attempts_gym_outcome_idx on public.cancel_save_attempts (gym_id, outcome);
create index if not exists cs_attempts_member_idx       on public.cancel_save_attempts (member_id);

-- ─── Outbound sequences ─────────────────────────────────────────────────────

create table if not exists public.sequences (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,

  name            text not null,
  description     text,
  status          text not null default 'draft',        -- 'draft' | 'active' | 'paused'

  -- Step templates: [{step, delay_hours, channel, body_template}]
  steps           jsonb not null default '[]'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists sequences_gym_status_idx on public.sequences (gym_id, status);

-- A member's path through a sequence
create table if not exists public.sequence_runs (
  id              uuid primary key default gen_random_uuid(),
  sequence_id     uuid not null references public.sequences(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  gym_id          uuid not null references public.gyms(id) on delete cascade,

  status          text not null default 'pending',      -- 'pending' | 'in_progress' | 'completed' | 'replied' | 'opted_out' | 'failed'
  current_step    integer not null default 0,
  next_send_at    timestamptz,

  -- Tracking
  contacted_at    timestamptz,
  replied_at      timestamptz,
  reply_category  text,

  -- Outcome (set by the cancel-save engine or staff dashboard)
  outcome         text,                                 -- 'saved' | 'lost' | 'escalated' | null
  outcome_set_at  timestamptz,
  revenue_protected numeric(10,2),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists seq_runs_status_send_at_idx on public.sequence_runs (status, next_send_at);
create index if not exists seq_runs_gym_status_idx     on public.sequence_runs (gym_id, status);
create index if not exists seq_runs_member_idx          on public.sequence_runs (member_id);

-- ─── Opt-out list ───────────────────────────────────────────────────────────

create table if not exists public.messaging_optouts (
  phone           text primary key,         -- E.164, no whatsapp: prefix
  opted_out_at    timestamptz not null default now(),
  reason          text                       -- 'stop_keyword' | 'manual' | 'complaint'
);

-- ─── AI cost log ────────────────────────────────────────────────────────────

create table if not exists public.ai_cost_log (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid references public.gyms(id) on delete set null,

  model           text not null,
  task            text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  cost_usd        numeric(10,6) not null default 0,

  created_at      timestamptz not null default now()
);

create index if not exists ai_cost_gym_idx     on public.ai_cost_log (gym_id, created_at desc);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
--
-- Deny-by-default for everything. The Next.js server uses the service-role
-- key which bypasses RLS. Anything that needs to be readable by gym owners
-- via the anon key gets a specific gym-scoped policy below.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'gyms', 'members', 'conversations', 'messages',
    'cancel_save_attempts', 'sequences', 'sequence_runs',
    'messaging_optouts', 'ai_cost_log'
  ]) loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- A gym owner can read their own gym row.
drop policy if exists "gyms_owner_select" on public.gyms;
create policy "gyms_owner_select" on public.gyms
  for select using (owner_user_id = auth.uid());

-- A gym owner can read their own members, conversations, etc.
drop policy if exists "members_owner_select" on public.members;
create policy "members_owner_select" on public.members
  for select using (
    gym_id in (select id from public.gyms where owner_user_id = auth.uid())
  );

drop policy if exists "conversations_owner_select" on public.conversations;
create policy "conversations_owner_select" on public.conversations
  for select using (
    gym_id in (select id from public.gyms where owner_user_id = auth.uid())
  );

drop policy if exists "messages_owner_select" on public.messages;
create policy "messages_owner_select" on public.messages
  for select using (
    conversation_id in (
      select c.id from public.conversations c
      join public.gyms g on c.gym_id = g.id
      where g.owner_user_id = auth.uid()
    )
  );

drop policy if exists "cs_attempts_owner_select" on public.cancel_save_attempts;
create policy "cs_attempts_owner_select" on public.cancel_save_attempts
  for select using (
    gym_id in (select id from public.gyms where owner_user_id = auth.uid())
  );

drop policy if exists "sequences_owner_select" on public.sequences;
create policy "sequences_owner_select" on public.sequences
  for select using (
    gym_id in (select id from public.gyms where owner_user_id = auth.uid())
  );

drop policy if exists "sequence_runs_owner_select" on public.sequence_runs;
create policy "sequence_runs_owner_select" on public.sequence_runs
  for select using (
    gym_id in (select id from public.gyms where owner_user_id = auth.uid())
  );

-- messaging_optouts and ai_cost_log: service role only. No anon access.
-- (RLS enabled with no policies = no anon access by default.)
