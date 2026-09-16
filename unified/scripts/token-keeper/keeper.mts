/**
 * GymIQ Glofox token keeper.
 *
 * Why this exists
 * ---------------
 * There is no Glofox API key. Everything server-side (the gymIQ Telegram bot,
 * the glofox-sales-pulse edge function) authenticates with a session JWT that
 * only a logged-in browser can mint. A freshly minted token is good for 24
 * hours. Previously the hourly-sales-pulse scheduled task tried to re-mint it
 * through Claude in Chrome, which needs an interactive permission approval that
 * unattended runs rarely get. So the stored token was whatever partly-used one
 * a lucky run had managed to scrape, it drifted towards expiry every day, and
 * Paul got a warning about it every day.
 *
 * This script owns the job instead. It drives its own dedicated Chromium
 * profile that stays logged in to Glofox, reads the JWT out of localStorage,
 * and posts it to the glofox-token-ingest edge function. It never touches the
 * openclaw automation, its profile, or its session.
 *
 * Usage
 *   npm run login     once, headed, so you can sign in to Glofox by hand
 *   npm run refresh   what launchd runs, headless, every 2 hours
 *   npm run status    prints the stored token's expiry, mints nothing
 *
 * The JWT is never printed, logged or written to disk. Only its expiry is.
 */

import { chromium, type BrowserContext } from "playwright";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const PROFILE_DIR = process.env.GYMIQ_PROFILE_DIR
  ?? join(homedir(), ".gymiq", "glofox-profile");
const STATE_FILE = join(homedir(), ".gymiq", "token-keeper-state.json");

const SUPABASE_URL = "https://fugixpfgwhnmhtttdzym.supabase.co";
const INGEST_URL = `${SUPABASE_URL}/functions/v1/glofox-token-ingest`;
const GLOFOX_REPORT = "https://app.glofox.com/dashboard/#/reports/new-memberships-gf";
// On a brand new profile the deep hash route can render blank because the SPA
// has no session to route from, so manual login starts at the app root and lets
// Glofox redirect to its own login screen.
const GLOFOX_ROOT = "https://app.glofox.com/";

// Optional. Set both to get a Telegram nudge when, and only when, a manual
// login is genuinely required. At most one message per day.
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID ?? "";

const args = new Set(process.argv.slice(2));
const LOGIN_MODE = args.has("--login");
const STATUS_MODE = args.has("--status");

type State = { last_ok?: string; last_expiry?: string; last_login_warn?: string };

function readState(): State {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    return {};
  }
}

function writeState(s: State): void {
  mkdirSync(join(homedir(), ".gymiq"), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

async function telegram(text: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text }),
    });
  } catch {
    // A failed nudge must never fail the run.
  }
}

async function warnLoginNeeded(): Promise<void> {
  const state = readState();
  if (state.last_login_warn === today()) return;
  await telegram(
    "Glofox token keeper is logged out. Run: cd unified/scripts/token-keeper && npm run login, "
    + "sign in to Glofox, then close the window. Until then the gymIQ bot and hourly sales pulse have no live Glofox access.",
  );
  writeState({ ...state, last_login_warn: today() });
}

async function openContext(headless: boolean): Promise<BrowserContext> {
  mkdirSync(PROFILE_DIR, { recursive: true });
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1440, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

/** True when the page is sitting on a Glofox login screen rather than the app. */
async function isLoggedOut(page: import("playwright").Page): Promise<boolean> {
  const url = page.url();
  if (/login|signin|auth/i.test(url)) return true;
  const hasJwt = await page.evaluate(() => !!localStorage.getItem("jwt"));
  return !hasJwt;
}

async function login(): Promise<number> {
  const ctx = await openContext(false);
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto(GLOFOX_ROOT, { waitUntil: "domcontentloaded" });

  console.log("\nA browser window is open. Sign in to Glofox, wait until the report loads,");
  console.log("then come back here and press Enter. Your session is saved to:");
  console.log(`  ${PROFILE_DIR}\n`);

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  const ok = !(await isLoggedOut(page));
  if (!ok) {
    console.error("Still no Glofox session on this profile. Nothing was saved.");
    await ctx.close();
    return 2;
  }

  const result = await pushToken(page);
  await ctx.close();
  return result;
}

async function pushToken(page: import("playwright").Page): Promise<number> {
  // The token goes straight from the page to the edge function. It is never
  // returned into this process, so it cannot end up in a log or a crash dump.
  const outcome = await page.evaluate(async (ingestUrl: string) => {
    const raw = localStorage.getItem("jwt");
    if (!raw) return { ok: false, reason: "no jwt in localStorage" };
    let token: string;
    try {
      token = JSON.parse(raw);
    } catch {
      token = raw;
    }
    const res = await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.status === 200 && body?.ok === true, status: res.status, expires_at: body?.expires_at, reason: body?.error };
  }, INGEST_URL);

  if (!outcome.ok) {
    console.error(`token push failed: ${outcome.reason ?? `http ${outcome.status}`}`);
    return 1;
  }

  const state = readState();
  writeState({ ...state, last_ok: new Date().toISOString(), last_expiry: outcome.expires_at });
  console.log(`token refreshed, expires ${outcome.expires_at}`);
  return 0;
}

async function refresh(): Promise<number> {
  const ctx = await openContext(true);
  try {
    const page = ctx.pages()[0] ?? await ctx.newPage();
    await page.goto(GLOFOX_REPORT, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // The SPA writes the jwt after it boots, so give it a moment.
    await page.waitForTimeout(8_000);

    if (await isLoggedOut(page)) {
      console.error("logged out, manual login required");
      await warnLoginNeeded();
      return 2;
    }
    return await pushToken(page);
  } catch (e) {
    console.error(`refresh failed: ${String(e)}`);
    return 1;
  } finally {
    await ctx.close();
  }
}

function status(): number {
  const s = readState();
  if (!s.last_ok) {
    console.log("no successful refresh recorded yet");
    return 1;
  }
  const left = s.last_expiry
    ? (new Date(s.last_expiry).getTime() - Date.now()) / 3_600_000
    : NaN;
  console.log(`last refresh: ${s.last_ok}`);
  console.log(`token expiry: ${s.last_expiry ?? "unknown"}`);
  console.log(`hours left:   ${Number.isFinite(left) ? left.toFixed(1) : "unknown"}`);
  console.log(`profile:      ${existsSync(PROFILE_DIR) ? PROFILE_DIR : "MISSING, run npm run login"}`);
  return 0;
}

const code = STATUS_MODE ? status() : await (LOGIN_MODE ? login() : refresh());
process.exit(code);
