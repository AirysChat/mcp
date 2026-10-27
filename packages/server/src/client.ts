/**
 * HTTP client for the AirysChat API.
 *
 * AirysChat serves account-scoped prefixes that are not interchangeable:
 *
 *   core    — /api/v1/accounts/{id}        features extending an existing Chatwoot resource
 *   core_v2 — /api/v2/accounts/{id}        analytics and v2 summary reports
 *   saas    — /saas/api/v1/accounts/{id}   AirysChat-only features
 *   raw     — no prefix                    non-account-scoped endpoints, e.g. /api/v1/profile
 *
 * Both authenticate with the same header, but `saas` controllers add feature-flag and
 * plan-entitlement gates that answer 403 with a JSON `error`. That is not an auth
 * failure and must not be reported as one — see ApiError.isPlanGate.
 */

import type { Config } from './config.js';

export type Prefix = 'core' | 'core_v2' | 'saas' | 'raw';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  prefix?: Prefix;
  query?: Record<string, unknown>;
  body?: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly method: string,
    readonly payload: unknown,
  ) {
    super(`${method} ${url} → ${status}`);
    this.name = 'ApiError';
  }

  /** Server-side message, when the API bothered to give one. */
  get detail(): string | undefined {
    if (typeof this.payload === 'string' && this.payload.trim()) return this.payload.trim();
    if (this.payload && typeof this.payload === 'object') {
      const record = this.payload as Record<string, unknown>;
      for (const key of ['error', 'message', 'errors']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }
    return undefined;
  }

  /**
   * A 403 carrying an `error` body from a /saas or /meta_agent endpoint (or matching
   * Concerns::Saas::FeatureGate's plan messages) means the account's plan or feature
   * flags do not include the capability — the credentials are fine. Telling the caller
   * to check their API key here sends them down the wrong path entirely.
   */
  get isPlanGate(): boolean {
    if (this.status !== 403 || this.detail === undefined) return false;
    if (/not authorized|permission|administrator/i.test(this.detail)) return false;
    if (this.url.includes('/saas/api/') || this.url.includes('/meta_agent')) return true;
    return /plano atual|limite do plano/i.test(this.detail);
  }
}

export class AirysChatClient {
  constructor(private readonly config: Config) {}

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const url = this.buildUrl(path, options.prefix ?? 'core', options.query);

    const response = await fetch(url, {
      method,
      headers: {
        api_access_token: this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    const payload = await parseBody(response);
    if (!response.ok) throw new ApiError(response.status, url, method, payload);
    return payload as T;
  }

  private buildUrl(path: string, prefix: Prefix, query?: Record<string, unknown>): string {
    const suffix = path.startsWith('/') ? path : `/${path}`;
    const apiVersion = prefix === 'core_v2' ? 'v2' : 'v1';
    const base =
      prefix === 'raw'
        ? `${this.config.baseUrl}${suffix}`
        : `${this.config.baseUrl}${prefix === 'saas' ? '/saas' : ''}/api/${apiVersion}/accounts/${this.config.accountId}${suffix}`;

    const url = new URL(base);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      // Rails reads repeated `key[]` params as an array; a comma-joined string would
      // arrive as one scalar and silently filter on a value that matches nothing.
      if (Array.isArray(value)) {
        for (const entry of value) url.searchParams.append(`${key}[]`, String(entry));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Error pages and proxy responses are not JSON; keep the text so the caller can
    // see what actually came back rather than a parse failure.
    return text;
  }
}
