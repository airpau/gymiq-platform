/**
 * EmailConnector — Tier C connector.
 *
 * Connects to a gym's IMAP inbox, finds emails matching an optional subject
 * filter, parses CSV or plain-text attachments, and returns normalised member
 * and lead records.
 *
 * Typical use-case: GloFox (or any CRM) sends an automated daily/weekly export
 * email to the gym's inbox.  We connect, download the attachment, parse it.
 *
 * Config (EmailConnectorConfig):
 *   host, port, secure   — IMAP server details
 *   username, password   — mailbox credentials
 *   folder               — IMAP folder (default 'INBOX')
 *   subjectFilter        — only process emails containing this string in Subject
 */

import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail, type Attachment } from 'mailparser';
import { BaseConnector } from '../base';
import type { NormalizedMember, NormalizedLead, ConnectorConfig, EmailConnectorConfig } from '../types';
import { parseCSV, parseDate, normalisePhone, normaliseMemberStatus } from '../utils/csv';

export class EmailConnector extends BaseConnector {
  private readonly emailConfig: EmailConnectorConfig;

  constructor(gymId: string, config: ConnectorConfig) {
    super(gymId, 'email', config);
    this.emailConfig = config as EmailConnectorConfig;
  }

  // ─── testConnection ───────────────────────────────────────────────────────

  async testConnection(): Promise<boolean> {
    const client = this.buildClient();
    try {
      await client.connect();
      await client.logout();
      return true;
    } catch {
      return false;
    }
  }

  // ─── syncMembers ──────────────────────────────────────────────────────────

  async syncMembers(): Promise<NormalizedMember[]> {
    const csvTexts = await this.fetchLatestCSVAttachments('members');
    const members: NormalizedMember[] = [];
    for (const csv of csvTexts) {
      members.push(...this.parseMembersCSV(csv));
    }
    this.log(`Parsed ${members.length} members from email attachments`);
    return members;
  }

  // ─── syncLeads ────────────────────────────────────────────────────────────

  async syncLeads(): Promise<NormalizedLead[]> {
    const csvTexts = await this.fetchLatestCSVAttachments('leads');
    const leads: NormalizedLead[] = [];
    for (const csv of csvTexts) {
      leads.push(...this.parseLeadsCSV(csv));
    }
    this.log(`Parsed ${leads.length} leads from email attachments`);
    return leads;
  }

  // ─── IMAP fetching ────────────────────────────────────────────────────────

  /**
   * Connect to IMAP, find the most recent matching email, and return any
   * CSV attachments as strings.
   *
   * @param hint  'members' | 'leads' — used to try to pick the right attachment
   *              if there are multiple in one email.
   */
  private async fetchLatestCSVAttachments(hint: 'members' | 'leads'): Promise<string[]> {
    const client = this.buildClient();
    const results: string[] = [];

    try {
      await client.connect();

      const folder = this.emailConfig.folder ?? 'INBOX';
      const lock = await client.getMailboxLock(folder);

      try {
        // Search for unseen emails (or all from the last 7 days as fallback)
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
        const uids = await client.search({ since }, { uid: true });

        if (!uids || uids.length === 0) {
          this.log(`No emails found in ${folder} since ${since.toISOString()}`);
          return [];
        }

        // Process emails newest-first, stop after the first match
        const sortedUids = [...uids].reverse();

        for (const uid of sortedUids) {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          // imapflow types: fetchOne returns FetchMessageObject | false
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msgAny = msg as any;
          if (!msgAny || !msgAny.source) continue;

          const parsed: ParsedMail = await simpleParser(msgAny.source as Buffer);

          // Apply subject filter if configured
          if (this.emailConfig.subjectFilter) {
            const subject = parsed.subject ?? '';
            if (!subject.toLowerCase().includes(this.emailConfig.subjectFilter.toLowerCase())) {
              continue;
            }
          }

          // Extract CSV attachments
          const attachments = (parsed.attachments ?? []) as Attachment[];
          for (const att of attachments) {
            const filename = (att.filename ?? '').toLowerCase();
            const isCsv = filename.endsWith('.csv') || att.contentType === 'text/csv';
            if (!isCsv) continue;

            // Try to pick attachment that matches the hint
            const matchesHint =
              filename.includes(hint) ||
              filename.includes(hint === 'members' ? 'client' : 'lead') ||
              filename.includes(hint === 'members' ? 'member' : 'prospect') ||
              attachments.length === 1; // only one attachment — use it regardless

            if (matchesHint) {
              const text = att.content.toString('utf-8');
              results.push(text);
            }
          }

          // Also check the email body if it looks like CSV
          if (results.length === 0 && parsed.text) {
            const text = parsed.text.trim();
            if (text.split('\n').length > 2 && text.includes(',')) {
              results.push(text);
            }
          }

          if (results.length > 0) break; // found what we need
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err) {
      this.logError('IMAP fetch failed', err);
    }

    return results;
  }

  // ─── CSV parsers ──────────────────────────────────────────────────────────

  private parseMembersCSV(csvText: string): NormalizedMember[] {
    const rows = parseCSV(csvText);
    const members: NormalizedMember[] = [];

    for (const row of rows) {
      const firstName = row['first_name'] ?? row['forename'] ?? '';
      const lastName = row['last_name'] ?? row['surname'] ?? '';
      const fullName = row['full_name'] ?? row['name'] ?? `${firstName} ${lastName}`.trim();
      if (!fullName) continue;

      members.push({
        crmId: row['id'] ?? row['member_id'] ?? row['client_id'] ?? undefined,
        name: fullName,
        email: (row['email'] ?? row['email_address'] ?? '').toLowerCase() || undefined, // parenthesised ??, outer ||
        phone: normalisePhone(row['phone'] ?? row['mobile'] ?? ''),
        status: normaliseMemberStatus(row['status'] ?? row['member_status'] ?? ''),
        membershipTier: row['membership'] ?? row['membership_type'] ?? row['plan'] ?? undefined,
        joinDate: parseDate(row['join_date'] ?? row['joined'] ?? row['start_date'] ?? ''),
        lastVisit: parseDate(row['last_check_in'] ?? row['last_visit'] ?? ''),
        visitCount30d: row['visits_30_days']
          ? parseInt(row['visits_30_days'], 10)
          : undefined,
      });
    }

    return members;
  }

  private parseLeadsCSV(csvText: string): NormalizedLead[] {
    const rows = parseCSV(csvText);
    const leads: NormalizedLead[] = [];

    for (const row of rows) {
      const email = (row['email'] ?? row['email_address'] ?? '').toLowerCase() || undefined;
      const phone = normalisePhone(row['phone'] ?? row['mobile'] ?? '');
      if (!email && !phone) continue;

      const firstName = row['first_name'] ?? row['forename'] ?? '';
      const lastName = row['last_name'] ?? row['surname'] ?? '';
      const rawLeadName = row['full_name'] ?? row['name'] ?? `${firstName} ${lastName}`.trim();
      const fullName = rawLeadName || undefined;

      const rawSrc = (row['source'] ?? row['lead_source'] ?? '').toLowerCase();
      let source = 'web_form';
      if (rawSrc.includes('abandon') || rawSrc.includes('cart')) source = 'abandoned_cart';
      else if (rawSrc.includes('walk')) source = 'walk_in';
      else if (rawSrc.includes('refer')) source = 'referral';
      else if (rawSrc.includes('call')) source = 'call';

      leads.push({
        crmId: row['id'] ?? row['lead_id'] ?? undefined,
        name: fullName,
        email,
        phone,
        source,
        enquiryDate: parseDate(row['date'] ?? row['enquiry_date'] ?? row['created_at'] ?? ''),
      });
    }

    return leads;
  }

  // ─── IMAP client factory ──────────────────────────────────────────────────

  private buildClient(): ImapFlow {
    return new ImapFlow({
      host: this.emailConfig.host,
      port: this.emailConfig.port,
      secure: this.emailConfig.secure,
      auth: {
        user: this.emailConfig.username,
        pass: this.emailConfig.password,
      },
      logger: false,
    });
  }
}
