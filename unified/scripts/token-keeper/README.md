# Glofox token keeper

Keeps the Glofox session token alive in Supabase, unattended, forever.

## Why

There is no Glofox API key. The gymIQ Telegram bot and the `glofox-sales-pulse`
edge function both authenticate with a session JWT that only a logged-in browser
can mint. A freshly minted token is good for **24 hours**.

The old arrangement had the `hourly-sales-pulse` scheduled task re-mint it
through Claude in Chrome. That needs an interactive permission approval an
unattended run rarely gets, so the stored token was whatever partly-used one a
lucky run had scraped, it drifted towards expiry, and Paul got a "token
expiring" warning every day. The warning was real, the architecture was wrong.

This script takes the job off the scheduled task. It drives its **own**
Chromium profile that stays signed in to Glofox. It does not touch the openclaw
Glofox automation, its profile, or its session.

## Setup, once

```bash
cd unified/scripts/token-keeper
npm install
npx playwright install chromium

# Sign in to Glofox by hand. This is the only manual step, ever.
npm run login
```

A browser opens. Sign in, wait for the report to load, return to the terminal
and press Enter. The session is saved to `~/.gymiq/glofox-profile`.

## Run it on a schedule

```bash
cp ai.gymiq.token-keeper.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/ai.gymiq.token-keeper.plist
```

It then refreshes every 2 hours, headless, no prompts. Check it with:

```bash
npm run status
tail /tmp/gymiq-token-keeper.log
```

Optionally set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the plist to get a
nudge on the one occasion this needs you: when Glofox logs the profile out
entirely and a fresh `npm run login` is required. At most one message per day.

## Safety

- The JWT goes from the page straight to `glofox-token-ingest` via `fetch`
  inside the page context. It is never read into this process, printed, logged
  or written to disk. Only its expiry is stored, in `~/.gymiq/token-keeper-state.json`.
- `glofox-token-ingest` validates the token against Glofox before storing it, so
  a bad token cannot poison the bot's credentials.
- No Glofox password is stored anywhere. The persistent browser profile holds
  the session, exactly as a normal signed-in browser does.

## Once this is running

`hourly-sales-pulse` still has its own fallback refresh, but it will almost
never fire, because the token will never drop below its 1.5 hour threshold.
