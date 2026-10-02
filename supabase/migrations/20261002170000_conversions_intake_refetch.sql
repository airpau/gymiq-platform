-- 2 Oct 2026: applied directly to fugixpfgwhnmhtttdzym, recorded here.
-- Gym Telegram alerts (Energie Gym Monitor bot only), service_role only.
create or replace function public.gym_alert_telegram() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'token',   (select decrypted_secret from vault.decrypted_secrets where name = 'telegram_bot_token_energie_monitor' limit 1),
    'chat_id', (select decrypted_secret from vault.decrypted_secrets where name = 'telegram_chat_id_paul' limit 1));
$$;
revoke all on function public.gym_alert_telegram() from public, anon, authenticated;
grant execute on function public.gym_alert_telegram() to service_role;

-- Abandoned carts wait an hour before the opener.
select public.gym_settings_merge('d3a32b32-6930-4660-8c5b-9df3a90aeb11',
  '{"lead_engine":{"abandoned_cart_delay_minutes":60},
    "intake":{"senders":["twotaps.io","energieonline.co.uk","hoddesdon@energiefitness.com"],
              "receiving_address":"hoddesdon-leads@iaecheenex.resend.app"}}'::jsonb);

-- Glofox conversion check every 15 minutes.
select cron.schedule('glofox-conversions', '7-59/15 * * * *', $c$
  select net.http_post(
    url := 'https://fugixpfgwhnmhtttdzym.supabase.co/functions/v1/glofox-leads-pull?route=conversions',
    headers := jsonb_build_object('Content-Type','application/json','x-sync-secret', public.gymiq_job_secret()),
    body := '{"limit": 40}'::jsonb, timeout_milliseconds := 120000)
$c$);

-- Retry mailbox emails whose body Resend would not return (needs a full access key).
select cron.schedule('intake-refetch', '*/5 * * * *', $c$
  select net.http_post(
    url := 'https://fugixpfgwhnmhtttdzym.supabase.co/functions/v1/lead-intake?route=refetch',
    headers := jsonb_build_object('Content-Type','application/json','x-desk-key', public.gymiq_job_secret()),
    body := '{}'::jsonb, timeout_milliseconds := 90000)
  where exists (select 1 from public.lead_intake_emails where parse_status = 'fetch_failed')
$c$);
