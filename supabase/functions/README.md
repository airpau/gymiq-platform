# Edge functions

Source of truth for the Supabase edge functions on project `fugixpfgwhnmhtttdzym`.
Until 23 Sep 2026 these lived only in Supabase; anything not in this folder is
still only there and should be pulled in.

Deploy one function (all of ours run their own auth, so JWT verification stays off):

    supabase functions deploy gymiq-lead-engine --project-ref fugixpfgwhnmhtttdzym --no-verify-jwt

First time on a machine: `supabase login` (opens the browser once).

| Function            | Role                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| gymiq-lead-engine   | The brain: understands a reply, resolves it against real availability, books, reschedules, cancels, follows up. v6 sends through gymiq-dispatch. |
| gymiq-dispatch      | The one door out: gates (live flag, per-gym switch, consent, TEST MODE), then WhatsApp > SMS > email. Also drains post-visit follow-ups and notifies the team. |
| gymiq-whatsapp      | Meta's rules: consent basis, 24h window, approved templates only outside it. |
| gymiq-messaging     | Resend email, Twilio SMS, the inbound and delivery-status webhooks. |
| glofox-leads-pull   | Every 5 minutes: new Glofox leads onto the desk with source and consent flags. |
| lead-desk           | Capture, import, the human call list, outcome logging, daily digest. |
