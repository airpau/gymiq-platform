/**
 * ApiConnector — abstract base for Tier A (direct API) integrations.
 *
 * Provides:
 *  - Typed HTTP helpers (get / post) with auth-header injection
 *  - Rate-limit aware retry logic (exponential back-off)
 *  - Pagination helper for cursor / page-based APIs
 */

import { BaseConnector } from '../base';
import type { ApiConnectorConfig, ConnectorConfig } from '../types';

export abstract class ApiConnector extends BaseConnector {
  protected readonly apiConfig: ApiConnectorConfig;

  constructor(gymId: string, config: ConnectorConfig) {
    super(gymId, 'api', config);
    this.apiConfig = config as ApiConnectorConfig;
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  /** Build the Authorization header for this provider. */
  protected abstract buildAuthHeaders(): Record<string, string>;

  protected async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>('GET', url);
  }

  protected async post<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>('POST', url, body);
  }

  protected buildUrl(path: string, params?: Record<string, string>): string {
    const base = (this.apiConfig.baseUrl ?? '').replace(/\/$/, '');
    const fullPath = `${base}${path}`;
    if (!params || Object.keys(params).length === 0) return fullPath;
    const qs = new URLSearchParams(params).toString();
    return `${fullPath}?${qs}`;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
    attempt = 1
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.buildAuthHeaders(),
    };

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
      });

      // 429 — rate limited: back off and retry (up to 3 times)
      if (res.status === 429 && attempt <= 3) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
        this.log(`Rate limited — retrying in ${retryAfter}s (attempt ${attempt}/3)`);
        await sleep(retryAfter * 1_000);
        return this.request<T>(method, url, body, attempt + 1);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      if (attempt <= 3 && isNetworkError(err)) {
        const delay = 1_000 * 2 ** (attempt - 1); // 1s, 2s, 4s
        this.log(`Network error — retrying in ${delay}ms (attempt ${attempt}/3)`);
        await sleep(delay);
        return this.request<T>(method, url, body, attempt + 1);
      }
      throw err;
    }
  }

  // ─── Pagination helper ────────────────────────────────────────────────────

  /**
   * Fetch all pages of a paginated endpoint.
   *
   * @param fetchPage  Function that receives the current page number and returns
   *                   { items: T[], hasMore: boolean }
   */
  protected async fetchAllPages<T>(
    fetchPage: (page: number) => Promise<{ items: T[]; hasMore: boolean }>
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 1;

    while (true) {
      const { items, hasMore } = await fetchPage(page);
      results.push(...items);
      if (!hasMore) break;
      page++;
    }

    return results;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('ECONNREFUSED') ||
    err.message.includes('ETIMEDOUT') ||
    err.message.includes('fetch failed')
  );
}
