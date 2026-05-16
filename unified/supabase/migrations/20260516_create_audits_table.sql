-- Audits — public landing-page upload reports.
-- Each row is one anonymous (or pre-signup) audit run.
create table if not exists public.audits (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- Lead info captured on the upload form
  first_name      text not null,
  gym_name        text not null,
  email           text not null,

  -- Uploaded source metadata
  source_filename text,
  source_size_bytes integer,

  -- The full analysis output stored as JSONB (see AuditReport type in TS)
  report          jsonb not null,

  -- Aggregate quick-stats (extracted for dashboarding / filtering)
  rows_parsed       integer not null default 0,
  high_risk_count   integer not null default 0,
  monthly_revenue_at_risk numeric(12,2) not null default 0,

  -- Email delivery status
  email_sent_at   timestamptz,
  email_error     text,

  -- Optional reverse-lookup to a converted gym row
  converted_gym_id uuid
);

create index if not exists audits_email_idx on public.audits (email);
create index if not exists audits_created_at_idx on public.audits (created_at desc);

-- Public visitors don't have a Supabase session, so the API uses the service-role
-- key. RLS is on for safety in case anyone ever connects with anon key.
alter table public.audits enable row level security;

-- Service role bypasses RLS automatically; nobody else can read these reports
-- without the unguessable UUID anyway, which is enforced by the API layer.
drop policy if exists "audits_no_anon_read" on public.audits;
create policy "audits_no_anon_read" on public.audits for select using (false);

drop policy if exists "audits_no_anon_write" on public.audits;
create policy "audits_no_anon_write" on public.audits for insert with check (false);
