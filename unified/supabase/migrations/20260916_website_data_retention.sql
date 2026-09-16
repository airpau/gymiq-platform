-- Website data retention, to match the privacy policy (16 Sep 2026).
--
--   audit reports (public.audits)          12 months from creation, unless the
--                                          gym subscribed (converted_gym_id)
--   website enquiries (public.leads with   24 months from last activity
--   no gym_id and a website source)        (created, updated, last contact or
--                                          closed, whichever is latest), unless
--                                          the person became a customer
--   public.website_leads (legacy form)     24 months from creation
--   public.ad_visits                       24 months from creation
--
-- Gym Lead Desk rows (leads with a gym_id) belong to the gym and are never
-- touched here. Nothing in this file deletes anything by itself and nothing is
-- scheduled: retention_purge(true) has to be called, or scheduled with
--   select cron.schedule('website-data-retention-monthly', '0 3 1 * *',
--                        $$select public.retention_purge(true)$$);
-- Each run posts counts (never names or emails) to Paul on Telegram, including
-- what falls due in the next 30 days, so every deletion is announced about a
-- month ahead.

create table if not exists public.retention_log (
  id               bigserial primary key,
  run_at           timestamptz not null default now(),
  mode             text not null check (mode in ('dry_run', 'purge', 'erasure_check', 'erasure')),
  category         text not null,
  due              integer not null default 0,
  deleted          integer not null default 0,
  due_next_30_days integer not null default 0,
  blocked          integer not null default 0,
  detail           text,
  run_by           text not null default current_user
);
comment on table public.retention_log is 'One row per category per retention or erasure run. Counts only, never personal data.';
alter table public.retention_log enable row level security;
revoke all on public.retention_log from anon, authenticated;

-- The lead sources that come from the gymIQ website (see src/app/api).
create or replace function public.retention_website_sources()
returns text[] language sql immutable set search_path = '' as $$
  select array['audit_form', 'demo_form', 'book_call', 'start_form']::text[]
$$;

-- Everything the policy covers, with the date each row falls due. Read only.
create or replace function public.retention_due()
returns table (category text, row_id text, due_on date, blocked_reason text)
language sql stable security definer set search_path = '' as $$
  select 'audit_report', a.id::text, (a.created_at + interval '12 months')::date, null::text
  from public.audits a
  where a.converted_gym_id is null
  union all
  select 'website_enquiry', l.id::text,
         (greatest(l.created_at, l.updated_at, coalesce(l.last_contact_at, l.created_at), coalesce(l.closed_at, l.created_at))
           + interval '24 months')::date,
         case when exists (select 1 from public.bookings b where b.lead_id = l.id) then 'has booking rows' end
  from public.leads l
  where l.gym_id is null
    and l.converted_user_id is null
    and l.converted_at is null
    and l.source = any (public.retention_website_sources())
  union all
  select 'website_form_legacy', w.id::text, (w.created_at + interval '24 months')::date, null
  from public.website_leads w
  union all
  select 'ad_visit', v.id::text, (v.created_at + interval '24 months')::date, null
  from public.ad_visits v
$$;

-- Counts, and with p_apply = true the deletions. Logs every run.
create or replace function public.retention_purge(p_apply boolean default false, p_notify boolean default true)
returns table (category text, due integer, deleted integer, due_next_30_days integer, blocked integer, unclassified_no_gym integer)
language plpgsql security definer set search_path = '' as $$
declare
  c text;
  v_due integer;
  v_soon integer;
  v_blocked integer;
  v_deleted integer;
  v_unclassified integer;
  v_ids text[];
  v_lines text := '';
  v_tok text;
  v_chat text;
  v_total integer := 0;
begin
  -- Leads with no gym and a source this policy does not know about: reported, never deleted.
  select count(*) into v_unclassified
  from public.leads l
  where l.gym_id is null and not (coalesce(l.source, '') = any (public.retention_website_sources()));

  foreach c in array array['audit_report', 'website_enquiry', 'website_form_legacy', 'ad_visit'] loop
    select count(*) filter (where d.due_on <= current_date and d.blocked_reason is null),
           count(*) filter (where d.due_on > current_date and d.due_on <= current_date + 30),
           count(*) filter (where d.due_on <= current_date and d.blocked_reason is not null),
           array_agg(d.row_id) filter (where d.due_on <= current_date and d.blocked_reason is null)
      into v_due, v_soon, v_blocked, v_ids
    from public.retention_due() d
    where d.category = c;

    v_deleted := 0;
    if p_apply and v_due > 0 then
      if c = 'audit_report' then
        delete from public.audits where id::text = any (v_ids);
      elsif c = 'website_enquiry' then
        delete from public.leads where id::text = any (v_ids) and gym_id is null;
      elsif c = 'website_form_legacy' then
        delete from public.website_leads where id::text = any (v_ids);
      elsif c = 'ad_visit' then
        delete from public.ad_visits where id::text = any (v_ids);
      end if;
      get diagnostics v_deleted = row_count;
    end if;

    insert into public.retention_log (mode, category, due, deleted, due_next_30_days, blocked, detail)
    values (case when p_apply then 'purge' else 'dry_run' end, c, v_due, v_deleted, v_soon, v_blocked,
            case when c = 'website_enquiry' and v_unclassified > 0 then v_unclassified || ' no-gym leads with an unknown source were left alone' end);

    v_total := v_total + v_due + v_soon + v_blocked;
    if v_due + v_soon + v_blocked > 0 then
      v_lines := v_lines || c || ': ' ||
        case when p_apply then v_deleted || ' deleted' else v_due || ' due now' end ||
        ', ' || v_soon || ' due in the next 30 days' ||
        case when v_blocked > 0 then ', ' || v_blocked || ' due but blocked (check manually)' else '' end || E'\n';
    end if;

    category := c; due := v_due; deleted := v_deleted; due_next_30_days := v_soon; blocked := v_blocked;
    unclassified_no_gym := v_unclassified;
    return next;
  end loop;

  if p_notify and (v_total > 0 or v_unclassified > 0) then
    select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'telegram_bot_token';
    select decrypted_secret into v_chat from vault.decrypted_secrets where name = 'telegram_chat_id_paul';
    if v_tok is not null and v_chat is not null then
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || v_tok || '/sendMessage',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object(
          'chat_id', v_chat,
          'disable_web_page_preview', true,
          'text', 'gymIQ data retention (' || case when p_apply then 'monthly clean up' else 'check only' end || ')' || E'\n' ||
                  v_lines ||
                  case when v_unclassified > 0 then v_unclassified || ' website leads with an unknown source were not touched' || E'\n' else '' end ||
                  'To keep something past its date, see unified/docs/DATA_RETENTION.md.'));
    end if;
  end if;
end;
$$;

-- Right to erasure for one website contact, by email. p_apply = false only counts.
-- Customers (converted) and anything with bookings are reported, not deleted.
create or replace function public.retention_erase_contact(p_email text, p_apply boolean default false)
returns table (category text, matched integer, deleted integer, held_back integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_hash text;
  v_m integer; v_d integer; v_h integer;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'retention_erase_contact: a valid email is required';
  end if;
  v_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');

  -- Website enquiries
  select count(*),
         count(*) filter (where l.converted_user_id is not null or l.converted_at is not null
                          or exists (select 1 from public.bookings b where b.lead_id = l.id))
    into v_m, v_h
  from public.leads l where l.gym_id is null and lower(l.email) = v_email;
  v_d := 0;
  if p_apply then
    delete from public.leads l
    where l.gym_id is null and lower(l.email) = v_email
      and l.converted_user_id is null and l.converted_at is null
      and not exists (select 1 from public.bookings b where b.lead_id = l.id);
    get diagnostics v_d = row_count;
  end if;
  insert into public.retention_log (mode, category, due, deleted, blocked, detail)
  values (case when p_apply then 'erasure' else 'erasure_check' end, 'website_enquiry', v_m, v_d, v_h, 'email sha256 ' || v_hash);
  category := 'website_enquiry'; matched := v_m; deleted := v_d; held_back := v_h; return next;

  -- Audit reports requested with that email
  select count(*), count(*) filter (where a.converted_gym_id is not null) into v_m, v_h
  from public.audits a where lower(a.email) = v_email;
  v_d := 0;
  if p_apply then
    delete from public.audits a where lower(a.email) = v_email and a.converted_gym_id is null;
    get diagnostics v_d = row_count;
  end if;
  insert into public.retention_log (mode, category, due, deleted, blocked, detail)
  values (case when p_apply then 'erasure' else 'erasure_check' end, 'audit_report', v_m, v_d, v_h, 'email sha256 ' || v_hash);
  category := 'audit_report'; matched := v_m; deleted := v_d; held_back := v_h; return next;

  -- Legacy website form
  select count(*) into v_m from public.website_leads w where lower(w.email) = v_email;
  v_d := 0;
  if p_apply then
    delete from public.website_leads w where lower(w.email) = v_email;
    get diagnostics v_d = row_count;
  end if;
  insert into public.retention_log (mode, category, due, deleted, blocked, detail)
  values (case when p_apply then 'erasure' else 'erasure_check' end, 'website_form_legacy', v_m, v_d, 0, 'email sha256 ' || v_hash);
  category := 'website_form_legacy'; matched := v_m; deleted := v_d; held_back := 0; return next;
end;
$$;

revoke all on function public.retention_due() from public, anon, authenticated;
revoke all on function public.retention_purge(boolean, boolean) from public, anon, authenticated;
revoke all on function public.retention_erase_contact(text, boolean) from public, anon, authenticated;
revoke all on function public.retention_website_sources() from public, anon, authenticated;
grant execute on function public.retention_due() to service_role;
grant execute on function public.retention_purge(boolean, boolean) to service_role;
grant execute on function public.retention_erase_contact(text, boolean) to service_role;
