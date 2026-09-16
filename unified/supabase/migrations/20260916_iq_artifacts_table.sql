-- CRM export artifacts move from Storage into a table, so the worker needs no
-- service role key: DATABASE_URL is its only secret. Also creates the worker's
-- generated secrets (values are random, produced here, never written anywhere else).

create table if not exists iq.artifacts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references iq.tenants(id) on delete cascade,
  site_id       uuid not null references iq.sites(id) on delete cascade,
  name          text not null,
  content_type  text not null default 'application/octet-stream',
  bytes         bytea not null,
  size_bytes    integer not null,
  uploaded_at   timestamptz not null default now(),
  unique (site_id, name)
);
create index if not exists artifacts_site_uploaded on iq.artifacts (site_id, uploaded_at desc);
alter table iq.artifacts enable row level security;   -- service role / worker only
comment on table iq.artifacts is 'Raw CRM exports per site (newest ~20 kept). Contains member PII: service-role only, never exposed via the API.';

-- The Storage bucket 'iq-artifacts' from 20260916_iq_playbooks_scheduler is no longer used.
-- It is empty; Supabase blocks deleting storage rows from SQL, so remove it in the dashboard if wanted.

-- Generated secrets (idempotent).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'gymiq_worker_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'gymiq_worker_secret', 'Bearer secret for the gymIQ worker (Fly). Generated in-database.');
  end if;
  if not exists (select 1 from vault.secrets where name = 'gymiq_worker_url') then
    perform vault.create_secret('https://gymiq-worker.fly.dev', 'gymiq_worker_url', 'Base URL of the gymIQ worker, read by iq.dispatch_playbooks().');
  end if;
  if not exists (select 1 from vault.secrets where name = 'glofox_hoddesdon_ingest_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'glofox_hoddesdon_ingest_token', 'Artifact upload token for site énergie Fitness Hoddesdon.');
  end if;
end $$;
