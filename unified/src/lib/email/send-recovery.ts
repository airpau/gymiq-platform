/**
 * Send the abandoned-audit "recovery" nudge via Resend.
 *
 * Triggered by the cron route /api/cron/abandoned-leads ~15 min cadence,
 * targets leads that:
 *   - have stage='audit_started' or 'audit_completed'
 *   - haven't already received a recovery email
 *   - have been quiet for 30+ min but < 24 h
 *
 * Style is plain, personal, and reply-friendly — Paul should feel like he
 * wrote it. No marketing aesthetic, no big buttons, just a short prompt.
 */
import { Resend } from 'resend'

export interface RecoveryEmailParams {
  to: string
  firstName: string | null
  gymName: string | null
  stage: 'audit_started' | 'audit_completed'
  auditId: string | null
  appUrl: string
}

export async function sendRecoveryEmail(
  p: RecoveryEmailParams,
): Promise<{ sent: true; id: string } | { sent: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not configured' }

  const resend = new Resend(apiKey)
  const from = process.env.RESEND_FROM_RECOVERY ?? 'Paul at GymIQ <paul@gymiq.ai>'
  const replyTo = process.env.RESEND_REPLY_TO ?? 'paul@gymiq.ai'

  const firstName = (p.firstName ?? '').trim() || 'there'
  const gymName = (p.gymName ?? '').trim()
  const auditUrl = p.auditId ? `${p.appUrl.replace(/\/$/, '')}/audit/${p.auditId}` : p.appUrl
  const subject = subjectFor(p.stage, gymName)

  try {
    const result = await resend.emails.send({
      from,
      to: p.to,
      replyTo,
      subject,
      html: htmlBody(p.stage, firstName, gymName, auditUrl),
      text: textBody(p.stage, firstName, gymName, auditUrl),
    })
    if (result.error) {
      return { sent: false, error: result.error.message ?? 'Resend returned an error' }
    }
    return { sent: true, id: result.data?.id ?? '' }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Unknown email error' }
  }
}

function subjectFor(stage: RecoveryEmailParams['stage'], gymName: string): string {
  if (stage === 'audit_completed') {
    return gymName
      ? `Your ${gymName} audit is still here when you're ready`
      : 'Your retention audit is still here when you ready'
  }
  return gymName
    ? `Did the ${gymName} upload not work?`
    : 'Did the audit upload not work?'
}

function htmlBody(
  stage: RecoveryEmailParams['stage'],
  firstName: string,
  gymName: string,
  auditUrl: string,
): string {
  const opener =
    stage === 'audit_completed'
      ? `<p>Hey ${escapeHtml(firstName)},</p>
         <p>I noticed your GymIQ audit${gymName ? ` for ${escapeHtml(gymName)}` : ''} finished but never got opened. It's still saved here:</p>
         <p><a href="${escapeAttr(auditUrl)}">${escapeAttr(auditUrl)}</a></p>
         <p>If anything in there looks off — or you want to talk through which sleepers to actually contact first — hit reply. I'm a real person.</p>`
      : `<p>Hey ${escapeHtml(firstName)},</p>
         <p>I saw you started a retention audit${gymName ? ` for ${escapeHtml(gymName)}` : ''} but didn't finish uploading. If the file didn't go through, the most common reason is the CSV being from a different CRM than we currently parse cleanly.</p>
         <p>Reply with what CRM you're using (Glofox, Mindbody, ClubRight, etc.) and I'll either tell you which export to use or run it for you manually.</p>`

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,Inter,'Segoe UI',Roboto,sans-serif;color:#18181b;font-size:15px;line-height:1.55;">
  <div style="max-width:540px;margin:32px auto;padding:0 24px;">
    ${opener}
    <p>— Paul, founder of GymIQ</p>
    <p style="margin-top:24px;font-size:12px;color:#71717a;">
      You're getting this because you started a free retention audit on gymiq.ai. Reply STOP and I won't email again.
    </p>
  </div>
</body></html>`
}

function textBody(
  stage: RecoveryEmailParams['stage'],
  firstName: string,
  gymName: string,
  auditUrl: string,
): string {
  if (stage === 'audit_completed') {
    return [
      `Hey ${firstName},`,
      ``,
      `I noticed your GymIQ audit${gymName ? ` for ${gymName}` : ''} finished but never got opened. It's still saved here:`,
      auditUrl,
      ``,
      `If anything in there looks off — or you want to talk through which sleepers to actually contact first — hit reply. I'm a real person.`,
      ``,
      `— Paul, founder of GymIQ`,
      ``,
      `Reply STOP and I won't email again.`,
    ].join('\n')
  }
  return [
    `Hey ${firstName},`,
    ``,
    `I saw you started a retention audit${gymName ? ` for ${gymName}` : ''} but didn't finish uploading. If the file didn't go through, the most common reason is the CSV being from a different CRM than we currently parse cleanly.`,
    ``,
    `Reply with what CRM you're using (Glofox, Mindbody, ClubRight, etc.) and I'll either tell you which export to use or run it for you manually.`,
    ``,
    `— Paul, founder of GymIQ`,
    ``,
    `Reply STOP and I won't email again.`,
  ].join('\n')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function escapeAttr(s: string): string { return escapeHtml(s) }
