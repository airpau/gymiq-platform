-- Applied to fugixpfgwhnmhtttdzym on 23 Sep 2026 (via MCP apply_migration: lead_intake_emails).
-- The club mailbox hoddesdon@energiefitness.com is the trigger for lead response:
-- every free-trial / abandoned-cart notification email is stored here verbatim
-- with what was parsed and the lead it produced. Glofox pull = backstop only.
create table if not exists public.lead_intake_emails (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(id),
  provider          text not null default 'resend',      -- resend | manual | mailhub
  provider_email_id text,                                -- Resend received-email id
  message_id        text,                                -- RFC 5322 Message-ID
  from_addr         text,
  to_addr           text[],
  subject           text,
  received_at       timestamptz not null default now(),
  kind              text,                                -- free_trial | abandoned_cart | other
  parse_status      text not null default 'pending',     -- parsed | unparsed | ignored | duplicate | error
  parsed            jsonb,
  lead_id           uuid references public.leads(id),
  lead_created      boolean,
  error             text,
  text_body         text,
  html_body         text,
  created_at        timestamptz not null default now()
);
create unique index if not exists lead_intake_emails_provider_id_idx
  on public.lead_intake_emails (provider, provider_email_id) where provider_email_id is not null;
create unique index if not exists lead_intake_emails_message_id_idx
  on public.lead_intake_emails (message_id) where message_id is not null;
create index if not exists lead_intake_emails_received_idx on public.lead_intake_emails (gym_id, received_at desc);
alter table public.lead_intake_emails enable row level security;
-- no policies: service role only

-- Intake rules live in gyms.settings.intake so they can be tuned against real
-- samples without a redeploy: senders (substrings of From; empty = any),
-- rules [{kind, match}] (first regex hit on subject+body wins), reenquiry_days, notify_unparsed.
update public.gyms
   set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('intake', jsonb_build_object(
     'mailbox', 'hoddesdon@energiefitness.com',
     'senders', '[]'::jsonb,
     'rules', jsonb_build_array(
       jsonb_build_object('kind','abandoned_cart','match','abandon|incomplete (join|purchase|sign|checkout)|did not complete|didn''t complete|left (the|their) (checkout|basket|cart)|unfinished'),
       jsonb_build_object('kind','free_trial','match','free trial|trial request|trial pass|day pass|guest pass|free pass|trial enquiry|book a trial'),
       jsonb_build_object('kind','free_trial','match','new lead|new enquiry|enquiry from|website enquiry|contact form')
     ),
     'reenquiry_days', 30,
     'notify_unparsed', true
   ))
 where id = 'd3a32b32-6930-4660-8c5b-9df3a90aeb11';
