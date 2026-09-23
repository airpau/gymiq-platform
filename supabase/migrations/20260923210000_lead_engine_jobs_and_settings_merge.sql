-- Applied to fugixpfgwhnmhtttdzym on 23 Sep 2026 (via MCP apply_migration:
-- schedule_engine_v6_jobs, gym_settings_merge_rpc). Kept here as the record.

-- The lead engine's timed work. These call v6 routes; until v6 is deployed they
-- return 403 (v5 only knows the demo header) and do nothing, and they start
-- working the moment it is, with no further step to remember.

-- Openers for leads the Glofox pull has landed. Runs 2 minutes after each pull.
select cron.schedule('engine-first-touch-due', '2-59/5 * * * *', $$
  select net.http_post(
    url := 'https://fugixpfgwhnmhtttdzym.supabase.co/functions/v1/gymiq-lead-engine?route=first-touch-due',
    headers := jsonb_build_object('Content-Type','application/json','x-desk-key', public.gymiq_job_secret()),
    body := '{}'::jsonb, timeout_milliseconds := 90000)
$$);

-- No-reply nudges, unanswered proposals, day-before reminders.
select cron.schedule('engine-tick', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://fugixpfgwhnmhtttdzym.supabase.co/functions/v1/gymiq-lead-engine?route=tick',
    headers := jsonb_build_object('Content-Type','application/json','x-desk-key', public.gymiq_job_secret()),
    body := '{}'::jsonb, timeout_milliseconds := 90000)
$$);

-- Post-visit follow-ups: lead_followups_process composes at :00 and :30, dispatch sends at :05 and :35.
select cron.schedule('dispatch-followups', '5,35 * * * *', $$
  select net.http_post(
    url := 'https://fugixpfgwhnmhtttdzym.supabase.co/functions/v1/gymiq-dispatch?route=followups',
    headers := jsonb_build_object('Content-Type','application/json','x-desk-key', public.gymiq_job_secret()),
    body := '{"limit": 30}'::jsonb, timeout_milliseconds := 90000)
$$);

-- Merge a patch into gyms.settings atomically. Pollers that used to read the
-- whole settings blob and write it back could clobber a change made between
-- the read and the write (test_identities, alert_email). This cannot.
create or replace function public.gym_settings_merge(p_gym_id uuid, p_patch jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  update public.gyms
     set settings = coalesce(settings, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb),
         updated_at = now()
   where id = p_gym_id
  returning settings;
$$;
revoke all on function public.gym_settings_merge(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.gym_settings_merge(uuid, jsonb) to service_role;
