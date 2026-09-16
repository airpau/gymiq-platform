# Website data retention and erasure

What the privacy policy (gymiq.ai/privacy) promises, and how it is enforced.
Controller: Gym IQ Ltd (17093442). Database: Supabase `fugixpfgwhnmhtttdzym`.
Migration: `supabase/migrations/20260916_website_data_retention.sql`.

## What is kept, and for how long

| Data | Where | Kept for | Never deleted by the job |
|---|---|---|---|
| Audit reports | `public.audits` | 12 months from creation | reports whose gym subscribed (`converted_gym_id`) |
| Website enquiries (audit, demo, book a call, start forms) | `public.leads` with no `gym_id` and a website source | 24 months from the latest of created, updated, last contact, closed | customers (`converted_user_id` / `converted_at`), leads with rows in `bookings` (reported as blocked) |
| Legacy website form | `public.website_leads` | 24 months from creation | |
| Ad landing visits | `public.ad_visits` | 24 months from creation | |

**Out of scope:** every lead with a `gym_id`. Those are a gym's own Lead Desk
records (énergie Hoddesdon's GymGlitch import, trials, walk ins). The gym is
the controller and sets its own retention. A no-gym lead with a source the job
does not recognise is reported, never deleted; add the source to
`public.retention_website_sources()` once it is confirmed as a website form.

## The functions

```sql
-- What is covered and when each row falls due (read only)
select category, count(*), min(due_on) from public.retention_due() group by 1;

-- Check only: counts, logs, no deletion. Second argument false = no Telegram.
select * from public.retention_purge(false, false);

-- The clean up itself
select * from public.retention_purge(true);

-- History (counts only, no personal data)
select * from public.retention_log order by run_at desc limit 20;
```

Every run posts counts to Paul on Telegram when anything is due, blocked, or
falls due within the next 30 days. On a monthly schedule, every deletion is
therefore announced about a month before it happens.

## Switching the monthly clean up on

Not scheduled yet. To schedule it (03:00 UTC on the 1st of each month):

```sql
select cron.schedule('website-data-retention-monthly', '0 3 1 * *',
                     $$select public.retention_purge(true)$$);
```

To stop it: `select cron.unschedule('website-data-retention-monthly');`

Nothing is due before 16 May 2027 (the first audit report), so switching it on
now only produces a Telegram notice in April 2027.

## Keeping something past its date

If a Telegram notice lists something that should stay (for example a prospect
who is about to sign):

- a report for a gym that subscribes: set `audits.converted_gym_id`;
- an enquiry that became a customer: set `leads.converted_user_id` or `converted_at`;
- a live conversation: log the contact (`leads.last_contact_at = now()`), which
  restarts its 24 months. Only do this when there really was contact.

## Erasure requests ("please delete my data")

Respond within one month. Steps:

1. **Find the rows first** (the lead id is needed for PostHog):
   ```sql
   select id, source, stage, created_at from public.leads
   where gym_id is null and lower(email) = lower('person@example.com');
   select id, created_at from public.audits where lower(email) = lower('person@example.com');
   select * from public.retention_erase_contact('person@example.com', false);  -- counts only
   ```
2. **Delete from the database:**
   `select * from public.retention_erase_contact('person@example.com', true);`
   Rows it holds back (customers, leads with bookings) need a manual decision:
   a customer's billing records have to be kept for tax purposes (six years for a UK company), but their
   marketing details can still be cleared.
3. **PostHog (EU):** Persons, search the distinct id `lead:<lead id>` from step 1,
   delete the person and their events.
4. **Telegram:** search Paul's chat for the email and delete the new lead alerts.
5. **Email:** delete the enquiry and report emails in paul@gymiq.ai. Resend keeps
   its own delivery logs for a limited period and they expire by themselves.
6. **Calendly:** if they booked through the calendar, delete the event and
   invitee in Calendly.
7. **Stripe:** if they paid, keep the payment records (legal requirement) and
   tell them so.
8. **Meta:** server events carried hashed contact details only and Meta applies
   its own retention; nothing to delete on our side. Mention it in the reply.
9. Reply to confirm what was deleted and what had to be kept, and why.

The `retention_log` row keeps a SHA-256 hash of the email, not the email, so a
repeat request can be recognised without keeping the address.
