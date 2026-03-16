/**
 * BrowserConnector — abstract base for Tier B (browser automation) connectors.
 *
 * Uses Playwright (chromium) to:
 *   1. Launch a headless browser
 *   2. Navigate to the CRM login page
 *   3. Authenticate
 *   4. Navigate to reports / export pages
 *   5. Download CSVs
 *   6. Parse and return normalised data
 *
 * Subclasses implement:
 *   login()         — authenticate in the browser
 *   downloadReports() — navigate to export pages and return raw CSV strings
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { BaseConnector } from '../base';
import type { BrowserConnectorConfig, ConnectorConfig } from '../types';

export interface DownloadedReports {
  membersCSV?: string;
  leadsCSV?: string;
}

export abstract class BrowserConnector extends BaseConnector {
  protected readonly browserConfig: BrowserConnectorConfig;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;

  constructor(gymId: string, config: ConnectorConfig) {
    super(gymId, 'browser', config);
    this.browserConfig = config as BrowserConnectorConfig;
  }

  // ─── Abstract hooks ───────────────────────────────────────────────────────

  /** Log in to the CRM using the stored credentials. */
  protected abstract login(page: Page): Promise<void>;

  /**
   * Navigate to export pages and return raw CSV text.
   * Each returned string will be parsed by the appropriate CSV parser.
   */
  protected abstract downloadReports(page: Page): Promise<DownloadedReports>;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  protected async launch(): Promise<Page> {
    this.log('Launching headless Chromium…');
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    return this.context.newPage();
  }

  protected async cleanup(): Promise<void> {
    try {
      await this.browser?.close();
    } catch {
      // swallow cleanup errors
    } finally {
      this.browser = null;
      this.context = null;
    }
  }

  // ─── testConnection ───────────────────────────────────────────────────────

  async testConnection(): Promise<boolean> {
    const page = await this.launch();
    try {
      await this.login(page);
      this.log('Login test succeeded');
      return true;
    } catch (err) {
      this.logError('Login test failed', err);
      return false;
    } finally {
      await this.cleanup();
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Wait for a download triggered by `triggerFn` and return the file contents
   * as a UTF-8 string.
   */
  protected async captureDownload(page: Page, triggerFn: () => Promise<void>): Promise<string> {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      triggerFn(),
    ]);
    const stream = await download.createReadStream();
    return streamToString(stream);
  }

  /** Take a screenshot for debugging failed automation runs. */
  protected async screenshot(page: Page, label: string): Promise<void> {
    try {
      const path = `/tmp/gymiq-connector-${this.gymId}-${label}-${Date.now()}.png`;
      await page.screenshot({ path, fullPage: true });
      this.log(`Screenshot saved: ${path}`);
    } catch {
      // non-fatal
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}
