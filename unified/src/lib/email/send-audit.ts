/**
 * Send the audit email via Resend.
 *
 * Falls back silently if RESEND_API_KEY is missing — the report is still
 * viewable on the /audit/[reportId] URL we save in Supabase.
 */
import { Resend } from 'resend'
import type { AuditReport } from '@/lib/services/audit-analysis'

interface SendAuditEmailParams {
  to: string
  firstName: string
  gymName: string
  reportId: string
  report: AuditReport
  appUrl: string
}

export async function sendAuditEmail(
  p: SendAuditEmailParams,
): Promise<{ sent: true; id: string } | { sent: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { sent: false, error: 'RESEND_API_KEY not configured' }
  }

  const resend = new Resend(apiKey)
  const from = process.env.RESEND_FROM_EMAIL ?? 'GymIQ <audit@gymiq.ai>'
  const reportUrl = `${p.appUrl.replace(/\/$/, '')}/audit/${p.reportId}`

  try {
    const result = await resend.emails.send({
      from,
      to: p.to,
      subject: `${p.gymName}: your membership file audit`,
      html: htmlBody(p, reportUrl),
      text: textBody(p, reportUrl),
    })
    if (result.error) {
      return { sent: false, error: result.error.message ?? 'Resend returned an error' }
    }
    return { sent: true, id: result.data?.id ?? '' }
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Unknown email error',
    }
  }
}

function gbp(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`
}

function htmlBody(p: SendAuditEmailParams, reportUrl: string): string {
  const r = p.report
  const i = r.insights
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(p.gymName)}: membership file audit</title>
</head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,Inter,'Segoe UI',Roboto,sans-serif;color:#18181b;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafafa;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 32px 0;">
          <div style="font-weight:600;font-size:18px;letter-spacing:-0.01em;">
            <span style="display:inline-block;width:24px;height:24px;background:linear-gradient(135deg,#10b981,#047857);border-radius:6px;color:#fff;text-align:center;font-size:11px;line-height:24px;vertical-align:middle;">IQ</span>
            <span style="vertical-align:middle;margin-left:8px;">GymIQ</span>
          </div>
        </td></tr>
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#047857;">Your audit is ready</p>
          <h1 style="margin:0;font-size:28px;line-height:1.15;letter-spacing:-0.02em;font-weight:600;color:#18181b;">
            Hi ${escapeHtml(p.firstName)}, here is what we found at ${escapeHtml(p.gymName)}.
          </h1>
        </td></tr>
        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0 0;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:18px 20px;border-bottom:1px solid #e4e4e7;">
                <div style="font-size:12px;color:#71717a;">Money on the table, a month</div>
                <div style="font-size:24px;font-weight:600;color:#18181b;margin-top:4px;">${gbp(i ? i.money.totalMonthly : r.revenue.monthlyRevenueAtRisk)} <span style="font-size:14px;color:#71717a;font-weight:400;">${i ? gbp(i.money.totalAnnual) + ' a year' : ''}</span></div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px;border-bottom:1px solid #e4e4e7;">
                <div style="font-size:12px;color:#71717a;">Live members and monthly run rate</div>
                <div style="font-size:24px;font-weight:600;color:#18181b;margin-top:4px;">${(i ? i.membership.roster : r.totals.liveMembers).toLocaleString('en-GB')} <span style="font-size:14px;color:#71717a;font-weight:400;">${gbp(i ? i.membership.mrr : r.revenue.totalMonthlyRevenue)} a month</span></div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px;border-bottom:1px solid #e4e4e7;">
                <div style="font-size:12px;color:#71717a;">Overdue members</div>
                <div style="font-size:24px;font-weight:600;color:#18181b;margin-top:4px;">${(i ? i.payments.overdueCount : r.payments.overdueCount).toLocaleString('en-GB')} <span style="font-size:14px;color:#71717a;font-weight:400;">${gbp(i ? i.payments.overdueMonthly : r.revenue.monthlyRevenueOverdue)} outstanding</span></div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px;">
                <div style="font-size:12px;color:#71717a;">Biggest single item</div>
                <div style="font-size:18px;font-weight:600;color:#18181b;margin-top:4px;">${escapeHtml(i && i.money.items[0] ? i.money.items[0].label : `${r.sleepers.deep} members 21 to 45 days since a visit`)}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <a href="${escapeAttr(reportUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;">Open my full audit &rarr;</a>
          <p style="margin:16px 0 0;font-size:13px;color:#52525b;">
            The report has the named lists: overdue by payment method, memberships ending unasked, members below current price, students past the age for their rate, who is drifting, and what to do this week in order.
          </p>
        </td></tr>
        <tr><td style="padding:24px 32px 32px;">
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 18px;" />
          <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
            This audit was generated from the file you uploaded on gymiq.ai. We keep an aggregate copy at the URL above so you can come back to it any time. Reply to this email if you want to talk through what to do next — we&rsquo;re a small UK team and we read every reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function textBody(p: SendAuditEmailParams, reportUrl: string): string {
  const r = p.report
  const i = r.insights
  return [
    `Hi ${p.firstName},`,
    ``,
    `Here's what GymIQ found at ${p.gymName}:`,
    ``,
    `Money on the table: ${gbp(i ? i.money.totalMonthly : r.revenue.monthlyRevenueAtRisk)} a month`,
    `Live members: ${(i ? i.membership.roster : r.totals.liveMembers)} billing ${gbp(i ? i.membership.mrr : r.revenue.totalMonthlyRevenue)} a month`,
    `Overdue: ${(i ? i.payments.overdueCount : r.payments.overdueCount)} members, ${gbp(i ? i.payments.overdueMonthly : r.revenue.monthlyRevenueOverdue)} outstanding`,
    ``,
    `Open the full report: ${reportUrl}`,
    ``,
    `Reply to this email if you want to talk through what to do next.`,
    `— The GymIQ team`,
  ].join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
