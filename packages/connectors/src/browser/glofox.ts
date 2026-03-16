/**
 * GloFoxConnector — Tier B (browser automation) connector for GloFox CRM.
 *
 * Used by Energie Hoddesdon and other gyms that have GloFox but no direct
 * API access (GloFox API is gated behind an enterprise plan).
 *
 * Flow:
 *   1. Navigate to app.glofox.com/portal
 *   2. Log in with email + password
 *   3. Go to Members → Export CSV
 *   4. Go to Leads / Abandoned Carts → Export CSV
 *   5. Parse both CSVs and return normalised data
 *
 * Config (BrowserConnectorConfig):
 *   username   — GloFox login email
 *   password   — GloFox login password
 *   branchId   — optional branch/location slug (used in URL path)
 */

import type { Page } from 'playwright';
import { BrowserConnector, type DownloadedReports } from './base';
import type { NormalizedMember, NormalizedLead, ConnectorConfig } from '../types';
import { parseCSV, parseDate, normalisePhone, normaliseMemberStatus } from '../utils/csv';

const GLOFOX_BASE = 'https://app.glofox.com';

export class GloFoxConnector extends BrowserConnector {
  constructor(gymId: string, config: ConnectorConfig) {
    super(gymId, config);
    this.browserConfig.baseUrl = this.browserConfig.baseUrl ?? GLOFOX_BASE;
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  protected async login(page: Page): Promise<void> {
    this.log('Navigating to GloFox login page…');
    await page.goto(`${GLOFOX_BASE}/portal/#/login`, { waitUntil: 'networkidle' });

    // Fill email
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 15_000 });
    await page.fill('input[type="email"], input[name="email"]', this.browserConfig.username);

    // Fill password
    await page.fill('input[type="password"], input[name="password"]', this.browserConfig.password);

    // Submit
    await page.click('button[type="submit"], .login-button, button:has-text("Sign in")');

    // Wait for dashboard to load
    await page.waitForURL(/dashboard|home|portal\/#\//, { timeout: 30_000 });
    this.log('Login successful');
  }

  // ─── Report downloads ─────────────────────────────────────────────────────

  protected async downloadReports(page: Page): Promise<DownloadedReports> {
    const membersCSV = await this.downloadMembersReport(page);
    const leadsCSV = await this.downloadLeadsReport(page);
    return { membersCSV, leadsCSV };
  }

  private async downloadMembersReport(page: Page): Promise<string> {
    this.log('Navigating to Members report…');

    // Navigate to the members section
    const branchPath = this.browserConfig.branchId ? `/${this.browserConfig.branchId}` : '';
    await page.goto(`${GLOFOX_BASE}/portal/#${branchPath}/members`, { waitUntil: 'networkidle' });

    // Wait for members list to load
    await page.waitForSelector('[data-test="members-table"], .members-list, table', { timeout: 20_000 });

    // Click Export / Download button
    await page.click(
      'button:has-text("Export"), button:has-text("Download"), [data-test="export-btn"], .export-button',
      { timeout: 10_000 }
    );

    // If a dropdown appeared, select CSV
    const csvOption = page.locator('text=CSV, text=.csv').first();
    if (await csvOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await csvOption.click();
    }

    const csv = await this.captureDownload(page, async () => {
      // The download is triggered by the Export click above; if it didn't start
      // yet, try clicking a confirm button
      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Download CSV")');
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
    });

    this.log(`Downloaded members CSV (${csv.length} bytes)`);
    return csv;
  }

  private async downloadLeadsReport(page: Page): Promise<string> {
    this.log('Navigating to Leads / Abandoned Carts report…');

    const branchPath = this.browserConfig.branchId ? `/${this.browserConfig.branchId}` : '';

    // Try abandoned carts first, fall back to leads
    const urls = [
      `${GLOFOX_BASE}/portal/#${branchPath}/abandoned-carts`,
      `${GLOFOX_BASE}/portal/#${branchPath}/leads`,
      `${GLOFOX_BASE}/portal/#${branchPath}/prospects`,
    ];

    for (const url of urls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });

        // Check if this page has data
        const table = page.locator('table, .leads-list, [data-test="leads-table"]');
        if (!(await table.isVisible({ timeout: 5_000 }).catch(() => false))) continue;

        // Click export
        await page.click(
          'button:has-text("Export"), button:has-text("Download"), [data-test="export-btn"]',
          { timeout: 8_000 }
        );

        const csvOption = page.locator('text=CSV').first();
        if (await csvOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await csvOption.click();
        }

        const csv = await this.captureDownload(page, async () => {
          const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Download CSV")');
          if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await confirmBtn.click();
          }
        });

        this.log(`Downloaded leads CSV from ${url} (${csv.length} bytes)`);
        return csv;
      } catch (err) {
        this.log(`Could not download from ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.log('No leads CSV available — returning empty');
    return '';
  }

  // ─── syncMembers / syncLeads ──────────────────────────────────────────────

  async syncMembers(): Promise<NormalizedMember[]> {
    const page = await this.launch();
    try {
      await this.login(page);
      const { membersCSV } = await this.downloadReports(page);
      if (!membersCSV) return [];
      return this.parseMembersCSV(membersCSV);
    } catch (err) {
      await this.screenshot(page, 'members-error');
      throw err;
    } finally {
      await this.cleanup();
    }
  }

  async syncLeads(): Promise<NormalizedLead[]> {
    const page = await this.launch();
    try {
      await this.login(page);
      const { leadsCSV } = await this.downloadReports(page);
      if (!leadsCSV) return [];
      return this.parseLeadsCSV(leadsCSV);
    } catch (err) {
      await this.screenshot(page, 'leads-error');
      throw err;
    } finally {
      await this.cleanup();
    }
  }

  // ─── CSV parsers ──────────────────────────────────────────────────────────

  private parseMembersCSV(csvText: string): NormalizedMember[] {
    const rows = parseCSV(csvText);
    const members: NormalizedMember[] = [];

    for (const row of rows) {
      const firstName = row['first_name'] ?? '';
      const lastName = row['last_name'] ?? '';
      const fullName = row['full_name'] ?? row['name'] ?? `${firstName} ${lastName}`.trim();
      if (!fullName) continue;

      members.push({
        crmId: row['id'] ?? row['member_id'] ?? row['client_id'] ?? undefined,
        name: fullName,
        email: row['email'] ?? row['email_address'] ?? undefined,
        phone: normalisePhone(row['phone'] ?? row['mobile'] ?? ''),
        status: normaliseMemberStatus(row['status'] ?? row['member_status'] ?? ''),
        membershipTier: row['membership'] ?? row['membership_type'] ?? row['plan'] ?? undefined,
        joinDate: parseDate(row['join_date'] ?? row['joined'] ?? row['start_date'] ?? ''),
        lastVisit: parseDate(row['last_check_in'] ?? row['last_visit'] ?? row['last_attendance'] ?? ''),
        visitCount30d: (row['visits_30_days'] ?? row['check_ins_30d'])
          ? parseInt(row['visits_30_days'] ?? row['check_ins_30d'] ?? '0', 10)
          : undefined,
      });
    }

    this.log(`Parsed ${members.length} members from CSV`);
    return members;
  }

  private parseLeadsCSV(csvText: string): NormalizedLead[] {
    const rows = parseCSV(csvText);
    const leads: NormalizedLead[] = [];

    for (const row of rows) {
      const rawEmail = (row['email'] ?? row['email_address'] ?? '').toLowerCase();
      const email = rawEmail || undefined;
      const phone = normalisePhone(row['phone'] ?? row['mobile'] ?? '');
      if (!email && !phone) continue;

      const firstName = row['first_name'] ?? '';
      const lastName = row['last_name'] ?? '';
      const rawName = row['full_name'] ?? row['name'] ?? `${firstName} ${lastName}`.trim();
      const fullName = rawName || undefined;

      const rawSrc = (row['source'] ?? row['lead_source'] ?? '').toLowerCase();
      let source = 'abandoned_cart'; // GloFox default
      if (rawSrc.includes('web') || rawSrc.includes('form')) source = 'web_form';
      else if (rawSrc.includes('walk')) source = 'walk_in';
      else if (rawSrc.includes('refer')) source = 'referral';
      else if (rawSrc.includes('call') || rawSrc.includes('phone')) source = 'call';

      leads.push({
        crmId: row['id'] ?? row['lead_id'] ?? undefined,
        name: fullName,
        email,
        phone,
        source,
        enquiryDate: parseDate(row['date'] ?? row['enquiry_date'] ?? row['created_at'] ?? ''),
      });
    }

    this.log(`Parsed ${leads.length} leads from CSV`);
    return leads;
  }
}
