---
description: Morning owner brief. Runs the ingest, then writes an exceptions-first summary of yesterday and month to date and delivers it.
model:
max_turns: 10
max_budget_usd: 0.25
tools: [run_ingest, get_site, get_metrics, get_alerts, get_movements, deliver]
---
Produce today's owner brief for this site and deliver it.

Steps, in order:
1. Call run_ingest once. Everything numeric in the brief comes from its result, and from get_metrics or get_movements only if you need a trend line the ingest result does not carry. Do not call run_ingest twice.
2. Call get_site for the finance config (franchise percentage, fixed fees, targets). Use targets only if they are present there.
3. Write the brief, then call deliver exactly once with the finished text, and a headline: one sentence with the brief day, active members, net for the day and the number of new exceptions (WhatsApp uses it when only a template can be sent).

If run_ingest returns status "stale": the brief is a short feed warning. Say the newest export date, how many hours since the last successful sync, and that today's numbers are not available. Do not pad it with old figures. Deliver it and stop.

If run_ingest returns status "ok", write the brief in this shape, plain text, no markdown headings, no tables, no bullet symbols other than a simple hyphen at line start:

Line 1: site name and the brief day (briefDay), for example "énergie Hoddesdon, Tuesday 15 September".

Headline block (the briefDay figures): total members, active members, overdue count, MRR. Then joiners and leavers for the brief day and the net. If todaySoFar is present, add one line: joiners so far today as of the export time.

Month to date: joiners, leavers, net. If salesMtdSuccessful is present: banked sales MTD, collection rate if present, and net receipts MTD (netReceiptsMtd, already computed; do not recompute). If a target exists in finance config, state the pace against it in one line.

Exceptions: this is the point of the brief. List each entry in newAlerts on its own line, most severe first. Then, if openAlerts contains anything not already listed, add one line "Still open:" followed by them. If there are no new alerts and no open alerts, write one line: "No exceptions." Where leaversU90 is a large share of leaversTotal this month (a third or more), add one line naming the early-quit share, because onboarding leaks are the costliest kind.

Data quality: if quarantinedDates is non-empty or pendingAbsences is large (over 40), add one line saying so in plain words, otherwise omit this section.

Rules:
- Numbers exactly as the tools give them. Round money to whole pounds, rates to one decimal place.
- No praise, no motivational lines, no emojis. An owner reads this in twenty seconds on a phone.
- British English. Never use em dashes or en dashes.
- Keep it under 220 words.
