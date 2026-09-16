-- gymIQ hosted agent runtime: playbook schedule + dispatcher + artifact bucket.
-- Replaces the Cowork scheduled task as the thing that fires the daily brief.
-- Reversible: drop iq.playbooks, the two functions, the cron job and the bucket.

-- 1. Per-site playbook schedule -------------------------------------------------
create table if not exists iq.playbooks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references iq.tenants(id) on delete cascade,
  site_id       uuid not null references iq.sites(id) on delete cascade,
  playbook      text not null,                       -- file name under worker/playbooks, e.g. daily-brief
  enabled       boolean not null default true,
  run_at        time not null default '07:30',       -- local time of day, in `timezone`
  timezone      text not null default 'Europe/London',
  days_of_week  int[] not null default '{0,1,2,3,4,5,6}',  -- 0 = Sunday, matches extract(dow)
  channels      jsonb not null default '{}'::jsonb,  -- {"telegram":{"chat_id_secret":"..."},"email":{"to":["..."]}}
  last_run_on   date,                                -- set by the dispatcher when it fires (dedupe)
  last_run_at   timestamptz,                         -- set by the worker when the run finishes
  last_run_id   uuid,
  last_status   text,
  created_at    timestamptz not null default now(),
  unique (site_id, playbook)
);
alter table iq.playbooks enable row level security;   -- service role only, like the rest of iq
comment on table iq.playbooks is 'Which agent playbooks run for which site, when, and where the output goes. Onboarding a gym adds rows here.';

-- 2. Observability columns on agent_runs ----------------------------------------
alter table iq.agent_runs add column if not exists output text;
alter table iq.agent_runs add column if not exists error  text;

-- 3. Artifact bucket (CRM exports per site, private) ----------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('iq-artifacts', 'iq-artifacts', false, 52428800)
on conflict (id) do nothing;

-- 4. Dispatcher: fire due playbooks at the worker via pg_net ---------------------
-- Needs two Vault secrets: gymiq_worker_url (https://gymiq-worker.fly.dev) and gymiq_worker_secret.
create or replace function iq.dispatch_playbooks()
returns integer
language plpgsql
security definer
set search_path = iq, public, extensions, net, vault
as $$
declare
  v_url    text;
  v_secret text;
  p        record;
  fired    integer := 0;
  local_ts timestamp;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'gymiq_worker_url'    limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'gymiq_worker_secret' limit 1;
  if v_url is null or v_secret is null then
    raise notice 'iq.dispatch_playbooks: gymiq_worker_url / gymiq_worker_secret missing in Vault, nothing fired';
    return 0;
  end if;

  for p in
    select pb.id, pb.site_id, pb.playbook, pb.run_at, pb.timezone, pb.days_of_week, pb.last_run_on
    from iq.playbooks pb
    join iq.sites s on s.id = pb.site_id and coalesce(s.active, true)
    where pb.enabled
    order by pb.run_at
  loop
    local_ts := (now() at time zone p.timezone);
    if local_ts::time >= p.run_at
       and (p.last_run_on is null or p.last_run_on < local_ts::date)
       and extract(dow from local_ts)::int = any (p.days_of_week)
    then
      -- Mark first so a slow worker or a retry never double-fires the same day.
      update iq.playbooks set last_run_on = local_ts::date where id = p.id;
      perform net.http_post(
        url     := rtrim(v_url, '/') || '/run',
        body    := jsonb_build_object('playbook', p.playbook, 'site_id', p.site_id),
        headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || v_secret),
        timeout_milliseconds := 600000
      );
      fired := fired + 1;
    end if;
  end loop;
  return fired;
end;
$$;
revoke all on function iq.dispatch_playbooks() from public;

-- 5. pg_cron: check every 5 minutes (each playbook still fires at most once per local day).
do $$
begin
  perform cron.unschedule('iq-dispatch-playbooks');
exception when others then
  null;
end $$;
select cron.schedule('iq-dispatch-playbooks', '*/5 * * * *', $$select iq.dispatch_playbooks()$$);

-- 6. Tenant #1 seed, DISABLED until the worker is deployed and a dry run has been read.
insert into iq.playbooks (tenant_id, site_id, playbook, enabled, run_at, timezone, channels)
values (
  'b9fd9f2e-9154-4fea-a211-daef5f9f5640',
  '95f75b9f-2ff3-4c83-9fd0-168651ed7128',
  'daily-brief',
  false,
  '07:30',
  'Europe/London',
  '{"telegram": {"chat_id_secret": "telegram_chat_id_paul"}}'::jsonb
)
on conflict (site_id, playbook) do nothing;
