/**
 * Delivery channels. Each function is dumb and idempotent-enough: it sends one
 * message and reports what happened. Which channels a playbook uses for a site
 * comes from iq.playbooks.channels, resolved in tools.ts. Nothing here reads
 * member PII: these are owner/manager channels, not member messaging (that
 * stays behind the app's MESSAGING_LIVE + gyms.messaging_enabled gates).
 */
import { config } from './config.js'

export interface DeliveryResult { channel: 'telegram' | 'email' | 'whatsapp'; ok: boolean; detail: string }

export async function sendTelegram(botToken: string, chatId: string, text: string): Promise<DeliveryResult> {
  // Telegram caps messages at 4096 chars; split on paragraph boundaries.
  const chunks: string[] = []
  let buf = ''
  for (const para of text.split(/\n{2,}/)) {
    if ((buf + '\n\n' + para).length > 3900 && buf) { chunks.push(buf); buf = para } else buf = buf ? buf + '\n\n' + para : para
  }
  if (buf) chunks.push(buf)
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
    })
    if (!res.ok) return { channel: 'telegram', ok: false, detail: `telegram ${res.status}: ${(await res.text()).slice(0, 300)}` }
  }
  return { channel: 'telegram', ok: true, detail: `${chunks.length} message(s) to chat ${chatId}` }
}

export async function sendEmail(to: string[], subject: string, text: string): Promise<DeliveryResult> {
  if (!config.resendApiKey) return { channel: 'email', ok: false, detail: 'RESEND_API_KEY not set; email channel disabled' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.resendFrom, to, subject, text }),
  })
  if (!res.ok) return { channel: 'email', ok: false, detail: `resend ${res.status}: ${(await res.text()).slice(0, 300)}` }
  return { channel: 'email', ok: true, detail: `sent to ${to.join(', ')}` }
}

export interface TwilioWhatsAppCreds { accountSid: string; authToken: string; from: string; templateSid?: string }

/**
 * WhatsApp to an owner/manager via Twilio.
 *
 * WhatsApp only allows free-form text inside a 24-hour window after the person
 * last messaged the number. Outside it, only an approved template goes through.
 * So: try free-form first (full brief, line breaks intact). If Twilio refuses
 * with 63016 (outside window) fall back to the approved utility template, whose
 * variables carry the site, the day and a one-paragraph summary (template
 * variables cannot contain newlines, so the summary is flattened). The template
 * ends with "Reply for the full brief", which opens the window for tomorrow.
 */
export async function sendWhatsApp(creds: TwilioWhatsAppCreds, to: string, text: string, summary: { site: string; day: string; headline: string }): Promise<DeliveryResult> {
  const auth = 'Basic ' + Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`
  const from = creds.from.startsWith('whatsapp:') ? creds.from : `whatsapp:${creds.from}`
  const dest = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  const post = async (form: Record<string, string>) => {
    const res = await fetch(url, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) })
    const j = await res.json().catch(() => ({})) as { sid?: string; code?: number; message?: string; status?: string }
    return { ok: res.ok, j }
  }

  // 1. free-form (only lands inside the 24h service window)
  const ff = await post({ From: from, To: dest, Body: text.slice(0, 4000) })
  if (ff.ok) return { channel: 'whatsapp', ok: true, detail: `free-form ${ff.j.sid} to ${to}` }
  const outsideWindow = ff.j.code === 63016 || /window/i.test(ff.j.message ?? '')
  if (!outsideWindow) return { channel: 'whatsapp', ok: false, detail: `twilio ${ff.j.code ?? ''}: ${(ff.j.message ?? '').slice(0, 200)}` }

  // 2. template fallback
  if (!creds.templateSid) return { channel: 'whatsapp', ok: false, detail: 'outside 24h window and no whatsapp_brief_template_sid in Vault' }
  const flat = (s: string) => s.replace(/\s*\n+\s*/g, ' | ').replace(/\s{2,}/g, ' ').trim().slice(0, 1000)
  const tpl = await post({
    From: from, To: dest, ContentSid: creds.templateSid,
    ContentVariables: JSON.stringify({ '1': summary.site, '2': summary.day, '3': flat(summary.headline) }),
  })
  if (tpl.ok) return { channel: 'whatsapp', ok: true, detail: `template ${tpl.j.sid} to ${to} (outside window; reply opens it)` }
  return { channel: 'whatsapp', ok: false, detail: `twilio template ${tpl.j.code ?? ''}: ${(tpl.j.message ?? '').slice(0, 200)}` }
}
