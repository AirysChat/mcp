/**
 * HTTP client for the Airys Platform API (`api.airys.chat` / `AirysBR/airys-platform`, PLT-02).
 *
 * Respects the platform neutrality contract:
 * - Separate base URL (`AIRYS_PLATFORM_URL`, default `https://api.airys.chat`)
 * - Separate Bearer credential (`AIRYS_API_TOKEN`), never `AIRYSCHAT_API_KEY`
 * - Never shares cookies or sessions with the AirysChat host
 */

import { ApiError } from './client.js';
import { DEFAULT_PLATFORM_BASE_URL, type Config } from './config.js';

export interface PlatformRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, unknown>;
  body?: unknown;
  /** Whether the endpoint requires `Authorization: Bearer <AIRYS_API_TOKEN>` (default `true`). */
  auth?: boolean;
}

export class PlatformAuthConfigError extends Error {
  constructor() {
    super(
      'AIRYS_API_TOKEN is not configured. The `platform` toolset talks to the Airys Platform API ' +
        '(api.airys.chat) using its own Bearer token (AIRYS_API_TOKEN), separate from AIRYSCHAT_API_KEY.',
    );
    this.name = 'PlatformAuthConfigError';
  }
}

export class AirysPlatformClient {
  constructor(private readonly config: Pick<Config, 'platformBaseUrl' | 'platformApiToken' | 'timeoutMs'>) {}

  get baseUrl(): string {
    return (this.config.platformBaseUrl ?? DEFAULT_PLATFORM_BASE_URL).replace(/\/+$/, '');
  }

  async request<T = unknown>(path: string, options: PlatformRequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const requiresAuth = options.auth ?? true;

    if (requiresAuth && !this.config.platformApiToken) {
      throw new PlatformAuthConfigError();
    }

    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (requiresAuth && this.config.platformApiToken) {
      headers.Authorization = `Bearer ${this.config.platformApiToken}`;
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    const payload = await parseResponseBody(response);
    if (!response.ok) throw new ApiError(response.status, url, method, payload);
    return payload as T;
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const suffix = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${suffix}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const entry of value) url.searchParams.append(key, String(entry));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
