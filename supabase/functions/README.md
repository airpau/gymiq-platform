# Edge functions

Source of truth for the Supabase edge functions on project `fugixpfgwhnmhtttdzym`.
Everything deployed is in this folder as of 23 Sep 2026. Deploy from here, not
from the dashboard editor, so the repo and the project never drift.

Deploy one function (all of ours run their own auth, so JWT verification stays off):

    supabase functions deploy gymiq-lead-engine --project-ref fugixpfgwhnmhtttdzym --no-verify-jwt

First time on a machine: `supabase login` (opens the browser once).

| Function            | Deployed | Role                                                                 |
| ------------------- | -------- | -------------------------------------------------------------------- |
| gymiq-lead-engine   | v5 (repo is v6, deploy it) | The brain: understands a reply, resolves it against real availability, books, reschedules, cancels, follows up. v6 sends through gymiq-dispatch and accepts the Twilio inbound hop. |
| gymiq-dispatch      | v2       | The one door out: gates (live flag, per-gym switch, consent, TEST MODE), then WhatsApp > SMS > email. v2 adds `fallback` (re-send down the order when Twilio reports a delivery failure) and remembers numbers that are not on WhatsApp. Also drains post-visit follow-ups and notifies the team. |
| gymiq-whatsapp      | v3       | Meta's rules: consent basis, 24h window, approved templates only outside it. v3 fixes the allowed-basis list to match the consent views. |
| gymiq-messaging     | v7       | Resend email, Twilio SMS, the inbound and delivery-status webhooks. Inbound is handed to the engine (`route=inbound`, fire-and-forget); a failed delivery triggers dispatch `fallback`. |
| lead-intake         | v1       | THE TRIGGER. Notification emails from the club mailbox (hoddesdon@energiefitness.com: free-trial clicks, abandoned carts) arrive via Resend Receiving webhook, are stored in `lead_intake_emails`, parsed, turned into a lead and handed to the engine for an immediate first touch. Rules in `gyms.settings.intake`. |
| glofox-leads-pull   | v13      | BACKSTOP. Every 5 minutes: Glofox leads the mailbox path missed, with source and consent flags. Watermark saved with `gym_settings_merge()`. |
| lead-desk           | v4       | Capture, import, the human call list, outcome logging, daily digest. |

Version numbers are Supabase's own deploy counters (see `supabase functions list`);
the header comment inside each file carries the meaningful change history.

## How the pieces talk

    Mailbox --redirect--> Resend Receiving --email.received--> lead-intake --route=first-touch--> gymiq-lead-engine
    Twilio  --inbound webhook-->  gymiq-messaging  --route=inbound-->  gymiq-lead-engine
                                                                             |
                                                          sendToLead --> gymiq-dispatch --> gymiq-whatsapp / gymiq-messaging(sms, email)
    Twilio  --status webhook--->  gymiq-messaging  --route=fallback--> gymiq-dispatch (next channel)
    pg_cron --every 5 min------->  glofox-leads-pull  (backstop: leads the mailbox missed, metadata.needs_first_touch)
    pg_cron --2-59/5-------------> gymiq-lead-engine?route=first-touch-due
    pg_cron --*/5---------------->  gymiq-lead-engine?route=tick
    pg_cron --:05,:35------------> gymiq-dispatch?route=followups

Sibling calls authenticate with the job secret from Vault (`internal_desk_key()` /
`lead_desk_auth()`), the same key pg_cron presents. No function holds another's key.
