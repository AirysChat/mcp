/**
 * Hosted MCP Resource Server: instance allowlist, OAuth 2.1 Protected Resource Metadata,
 * token introspection with bounded TTL cache (≤ 60 s), rate limiting, and structured
 * secret-free logging (ADRs 0004 & 0006; REM-03, REM-05, REM-15).
 */

import { createHash } from 'node:crypto';
import {
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
  buildOAuthProtectedResourceMetadata,
  verifyBearerToken,
  type AuthInfo,
} from '@modelcontextprotocol/server';
import {
  ConfigError,
  DEFAULT_TOOLSETS,
  TOOLSET_NAMES,
  parseTokenScopes,
  type AccessLevel,
  type ToolsetName,
} from './config.js';

export const SUPPORTED_MCP_SCOPES: string[] = [
  'mcp:read',
  'mcp:write',
  'mcp:irreversible',
  ...TOOLSET_NAMES.map((name) => `mcp:toolset:${name}`),
];

export interface AllowedInstance {
  /** Short identifier used in `/<instance>/mcp` routes and logs (e.g. `airys.chat`, `staging`). */
  slug: string;
  /** Canonical upstream AirysChat origin without trailing slash (e.g. `https://airys.chat`). */
  baseUrl: string;
}

export interface InstanceAllowlist {
  /** Map from slug or hostname to the resolved `AllowedInstance`. */
  byKey: Map<string, AllowedInstance>;
  /** Map from incoming MCP `Host` header hostname to the resolved `AllowedInstance`. */
  byMcpHost: Map<string, AllowedInstance>;
  /** Optional fallback instance when accessed via `localhost` or Cloud Run `*.run.app`. */
  defaultInstance?: AllowedInstance;
}

const BLOCKED_METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
  '0.0.0.0',
]);

/**
 * Validates and normalizes an upstream AirysChat origin for the anti-SSRF allowlist.
 * Only `https://` origins (or `http://localhost` / `http://127.0.0.1` / `http://[::1]`
 * for local test harnesses) with no credentials, path, query, or fragment are accepted.
 */
export function validateInstanceOrigin(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim().replace(/\/+$/, ''));
  } catch {
    throw new ConfigError(`Invalid instance URL "${rawUrl}"`);
  }

  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]');

  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    throw new ConfigError(`Instance URL "${rawUrl}" must use https:// (http:// is only allowed for localhost)`);
  }
  if (parsed.username || parsed.password) {
    throw new ConfigError(`Instance URL "${rawUrl}" must not embed credentials`);
  }
  if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new ConfigError(`Instance URL "${rawUrl}" must be a bare origin without path, query, or hash`);
  }
  if (BLOCKED_METADATA_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new ConfigError(`Instance URL "${rawUrl}" points to a forbidden host`);
  }

  return parsed;
}

/**
 * Loads the anti-SSRF instance allowlist from environment configuration.
 *
 * Built-in defaults:
 * - `mcp.airys.chat` / slug `airys.chat` / slug `prod` → `https://airys.chat`
 * - `mcp.staging.airys.chat` / slug `staging` / slug `staging.airys.app` → `https://staging.airys.app`
 *
 * Additional managed instances can be supplied via `AIRYSCHAT_ALLOWED_INSTANCES`
 * as comma-separated `<slug>=<https://origin>` or `<https://origin>` entries.
 */
export function loadInstanceAllowlist(env: NodeJS.ProcessEnv = process.env): InstanceAllowlist {
  const byKey = new Map<string, AllowedInstance>();
  const byMcpHost = new Map<string, AllowedInstance>();

  const register = (slug: string, rawBaseUrl: string, aliases: string[] = [], mcpHosts: string[] = []): AllowedInstance => {
    const cleanSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(cleanSlug)) {
      throw new ConfigError(`Invalid instance slug "${slug}"`);
    }
    const parsed = validateInstanceOrigin(rawBaseUrl);
    const entry: AllowedInstance = { slug: cleanSlug, baseUrl: parsed.origin };
    byKey.set(cleanSlug, entry);
    byKey.set(parsed.hostname.toLowerCase(), entry);
    byKey.set(parsed.host.toLowerCase(), entry);
    for (const alias of aliases) byKey.set(alias.toLowerCase(), entry);
    for (const host of mcpHosts) byMcpHost.set(host.toLowerCase(), entry);
    return entry;
  };

  register('airys.chat', 'https://airys.chat', ['prod', 'app.airys.chat'], ['mcp.airys.chat']);
  register(
    'staging',
    'https://staging.airys.app',
    ['staging.airys.app'],
    ['mcp.staging.airys.chat', 'mcp.staging.airys.app'],
  );

  if (env.AIRYSCHAT_ALLOWED_INSTANCES?.trim()) {
    for (const rawEntry of env.AIRYSCHAT_ALLOWED_INSTANCES.split(',')) {
      const item = rawEntry.trim();
      if (!item) continue;
      const eq = item.indexOf('=');
      if (eq !== -1) {
        const slug = item.slice(0, eq).trim();
        const url = item.slice(eq + 1).trim();
        const parsed = validateInstanceOrigin(url);
        register(slug, parsed.origin, [], [`mcp.${slug}.airys.chat`]);
      } else {
        const parsed = validateInstanceOrigin(item);
        register(parsed.hostname, parsed.origin);
      }
    }
  }

  let defaultInstance: AllowedInstance | undefined;
  const rawDefault = env.AIRYSCHAT_DEFAULT_INSTANCE?.trim();
  if (rawDefault) {
    const existing = byKey.get(rawDefault.toLowerCase());
    if (existing) {
      defaultInstance = existing;
    } else {
      const parsed = validateInstanceOrigin(rawDefault);
      defaultInstance = register('default', parsed.origin);
    }
  }

  return { byKey, byMcpHost, defaultInstance };
}

export type ResolvedRoute =
  | { kind: 'health' }
  | {
      kind: 'metadata';
      instance: AllowedInstance;
      resourceUrl: string;
      metadataUrl: string;
    }
  | {
      kind: 'mcp';
      instance: AllowedInstance;
      resourceUrl: string;
      metadataUrl: string;
    }
  | {
      kind: 'invalid_instance';
      message: string;
    }
  | {
      kind: 'not_found';
    };

/**
 * Resolves an incoming HTTP request URL and headers to a health check, OAuth Protected
 * Resource Metadata route, or MCP endpoint (`/mcp` or `/<instance>/mcp`), enforcing the
 * instance allowlist before any network I/O can happen.
 */
export function resolveRequestRoute(
  requestUrl: URL,
  headers: Headers,
  allowlist: InstanceAllowlist,
  publicOriginOverride?: string,
): ResolvedRoute {
  const pathname = requestUrl.pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/healthz' || pathname === '/health') {
    return { kind: 'health' };
  }

  // Classify pathname into metadata or mcp, with optional `/<instance>` prefix (REM-15).
  let routeKind: 'metadata' | 'mcp' | undefined;
  let pathInstanceSlug: string | undefined;

  if (pathname === '/mcp') {
    routeKind = 'mcp';
  } else if (
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname === '/.well-known/oauth-protected-resource/mcp'
  ) {
    routeKind = 'metadata';
  } else {
    const mcpMatch = /^\/([^/]+)\/mcp$/.exec(pathname);
    const wellKnownPrefixMatch = /^\/\.well-known\/oauth-protected-resource\/([^/]+)\/mcp$/.exec(pathname);
    const instanceWellKnownMatch = /^\/([^/]+)\/\.well-known\/oauth-protected-resource$/.exec(pathname);

    if (mcpMatch) {
      routeKind = 'mcp';
      pathInstanceSlug = decodeURIComponent(mcpMatch[1]!);
    } else if (wellKnownPrefixMatch) {
      routeKind = 'metadata';
      pathInstanceSlug = decodeURIComponent(wellKnownPrefixMatch[1]!);
    } else if (instanceWellKnownMatch && instanceWellKnownMatch[1] !== '.well-known') {
      routeKind = 'metadata';
      pathInstanceSlug = decodeURIComponent(instanceWellKnownMatch[1]!);
    }
  }

  if (!routeKind) {
    return { kind: 'not_found' };
  }

  // 1. Validate optional X-AirysChat-Instance header against allowlist.
  const headerInstanceRaw = headers.get('x-airyschat-instance')?.trim();
  let headerInstance: AllowedInstance | undefined;
  if (headerInstanceRaw) {
    headerInstance = allowlist.byKey.get(headerInstanceRaw.toLowerCase());
    if (!headerInstance) {
      return {
        kind: 'invalid_instance',
        message: `Instance "${headerInstanceRaw}" is not in the AirysChat allowlist.`,
      };
    }
  }

  // 2. Validate path-prefix instance (`/<instance>/mcp`) against allowlist.
  let pathInstance: AllowedInstance | undefined;
  if (pathInstanceSlug !== undefined) {
    pathInstance = allowlist.byKey.get(pathInstanceSlug.toLowerCase());
    if (!pathInstance) {
      return {
        kind: 'invalid_instance',
        message: `Instance "${pathInstanceSlug}" is not in the AirysChat allowlist.`,
      };
    }
    if (headerInstance && headerInstance.baseUrl !== pathInstance.baseUrl) {
      return {
        kind: 'invalid_instance',
        message: 'Conflicting instance in URL path and X-AirysChat-Instance header.',
      };
    }
  }

  // 3. Resolve from path, header, Host header mapping, or configured default.
  const hostHeader = (headers.get('x-forwarded-host') ?? headers.get('host') ?? requestUrl.host).split(',')[0]!.trim();
  let reqHostname = requestUrl.hostname.toLowerCase();
  try {
    reqHostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return {
      kind: 'invalid_instance',
      message: `Malformed Host header "${hostHeader}".`,
    };
  }

  const hostInstance = allowlist.byMcpHost.get(reqHostname) ?? allowlist.byKey.get(reqHostname);
  const isLocalOrCloudRunHost =
    reqHostname === 'localhost' ||
    reqHostname === '127.0.0.1' ||
    reqHostname === '[::1]' ||
    reqHostname.endsWith('.run.app');

  if (!pathInstance && !headerInstance && !hostInstance && !isLocalOrCloudRunHost) {
    return {
      kind: 'invalid_instance',
      message: `Host "${reqHostname}" is not mapped to an allowlisted AirysChat instance.`,
    };
  }

  const resolvedInstance = pathInstance ?? headerInstance ?? hostInstance ?? allowlist.defaultInstance;
  if (!resolvedInstance) {
    return {
      kind: 'invalid_instance',
      message: 'No AirysChat instance specified or mapped for this host.',
    };
  }

  const proto = (headers.get('x-forwarded-proto') ?? requestUrl.protocol.replace(':', '')).split(',')[0]!.trim();
  const origin = publicOriginOverride
    ? publicOriginOverride.replace(/\/+$/, '')
    : `${proto}://${hostHeader}`;

  const resourcePath = pathInstanceSlug ? `/${encodeURIComponent(resolvedInstance.slug)}/mcp` : '/mcp';
  const resourceUrl = `${origin}${resourcePath}`;
  const metadataUrl = pathInstanceSlug
    ? `${origin}/.well-known/oauth-protected-resource/${encodeURIComponent(resolvedInstance.slug)}/mcp`
    : `${origin}/.well-known/oauth-protected-resource`;

  return {
    kind: routeKind,
    instance: resolvedInstance,
    resourceUrl,
    metadataUrl,
  };
}

/** Builds the RFC 9728 OAuth Protected Resource Metadata HTTP response. */
export function createProtectedResourceMetadataResponse(instance: AllowedInstance, resourceUrl: string): Response {
  const metadata = buildOAuthProtectedResourceMetadata({
    oauthMetadata: {
      issuer: instance.baseUrl,
      authorization_endpoint: `${instance.baseUrl}/oauth/authorize`,
      token_endpoint: `${instance.baseUrl}/oauth/token`,
      revocation_endpoint: `${instance.baseUrl}/oauth/revoke`,
      introspection_endpoint: `${instance.baseUrl}/oauth/introspect`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
    },
    resourceServerUrl: new URL(resourceUrl),
    scopesSupported: SUPPORTED_MCP_SCOPES,
    resourceName: 'AirysChat MCP',
    dangerouslyAllowInsecureIssuerUrl: instance.baseUrl.startsWith('http://'),
  });
  return Response.json(metadata, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}

/** Returns the first 12 hex characters of SHA-256(token) — safe for logs and rate-limit buckets. */
export function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

function introspectionCacheKey(instanceBaseUrl: string, resourceUrl: string, token: string): string {
  return createHash('sha256').update(`${instanceBaseUrl}\0${resourceUrl}\0${token}`).digest('hex');
}

export interface VerifiedMcpAuth extends AuthInfo {
  accountId: number;
  maxAccess: AccessLevel;
  toolsets: Set<ToolsetName>;
  toolsetsRestricted: boolean;
  tokenFp: string;
}

export interface IntrospectionPayload {
  active?: boolean;
  token_type?: string;
  token_use?: string;
  is_mcp_token?: boolean;
  client_id?: string;
  sub?: string;
  account_id?: number;
  aud?: string | string[];
  scope?: string;
  scopes?: string[];
  exp?: number;
}

interface CachedIntrospection {
  auth: VerifiedMcpAuth;
  expiresAtMs: number;
}

export interface IntrospectionVerifierOptions {
  /** Maximum cache TTL in seconds. Capped at 60 s per ADR 0006 so revocation lands within 1 min. */
  cacheTtlSeconds?: number;
  /** Maximum cached entries before oldest entries are evicted. Default 1000. */
  maxCacheEntries?: number;
  /** Timeout for the POST `/oauth/introspect` call in ms. Default 5000. */
  timeoutMs?: number;
  /** Optional shared secret / bearer token for calling `/oauth/introspect`. */
  introspectionSecret?: string;
  /** Default toolsets when the token does not specify `mcp:toolset:<name>`. */
  defaultToolsets?: Iterable<ToolsetName>;
}

/**
 * Bounded OAuth 2.1 token introspection cache and verifier against AirysChat's
 * `/oauth/introspect` endpoint (ADR 0006, REM-03).
 */
export class AirysChatTokenIntrospector {
  private readonly cache = new Map<string, CachedIntrospection>();
  private readonly cacheTtlSeconds: number;
  private readonly maxCacheEntries: number;
  private readonly timeoutMs: number;
  private readonly introspectionSecret?: string;
  private readonly defaultToolsets: Set<ToolsetName>;

  constructor(options: IntrospectionVerifierOptions = {}) {
    this.cacheTtlSeconds = Math.min(Math.max(options.cacheTtlSeconds ?? 60, 0), 60);
    this.maxCacheEntries = Math.max(options.maxCacheEntries ?? 1000, 1);
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.introspectionSecret = options.introspectionSecret;
    this.defaultToolsets = new Set(options.defaultToolsets ?? DEFAULT_TOOLSETS);
  }

  /** Clears the introspection cache (useful in tests). */
  clearCache(): void {
    this.cache.clear();
  }

  async verifyRequest(
    request: Request,
    instance: AllowedInstance,
    resourceUrl: string,
    metadataUrl: string,
  ): Promise<VerifiedMcpAuth> {
    // Reject classic `api_access_token` headers explicitly (ADR 0006: hosted accepts only MCP tokens).
    if (request.headers.get('api_access_token')) {
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        'Hosted MCP accepts only scoped AirysChat MCP tokens via Authorization: Bearer (ADR 0006). Classic api_access_token headers are only supported over local stdio.',
      );
    }

    const authHeader = request.headers.get('authorization') ?? undefined;
    const expectedResource = new URL(resourceUrl);

    const authInfo = await verifyBearerToken(authHeader, {
      expectedResource,
      requiredScopes: ['mcp:read'],
      resourceMetadataUrl: metadataUrl,
      verifier: {
        verifyAccessToken: async (token: string) =>
          this.introspectToken(token, instance, expectedResource, metadataUrl, request.headers),
      },
    });

    return authInfo as VerifiedMcpAuth;
  }

  private async introspectToken(
    token: string,
    instance: AllowedInstance,
    expectedResource: URL,
    metadataUrl: string,
    requestHeaders: Headers,
  ): Promise<VerifiedMcpAuth> {
    // Classic AirysChat tokens never carry the `mcp_` prefix; reject them before hitting upstream
    // when they clearly use the legacy format, and also verify `token_type: "mcp"` on the response.
    if (!token.startsWith('mcp_')) {
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        'Classic api_access_token keys are rejected on hosted MCP; use an AirysChat MCP token (mcp_...).',
      );
    }

    const key = introspectionCacheKey(instance.baseUrl, expectedResource.toString(), token);
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);

    const cached = this.cache.get(key);
    if (cached) {
      if (cached.expiresAtMs > nowMs && cached.auth.expiresAt && cached.auth.expiresAt > nowSec) {
        this.enforceAccountHeaderMatch(cached.auth.accountId, requestHeaders);
        return cached.auth;
      }
      this.cache.delete(key);
    }

    const introspectUrl = `${instance.baseUrl}/oauth/introspect`;
    const body = new URLSearchParams({
      token,
      token_type_hint: 'access_token',
      resource: expectedResource.toString(),
    });

    let response: Response;
    try {
      response = await fetch(introspectUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          ...(this.introspectionSecret ? { Authorization: `Bearer ${this.introspectionSecret}` } : {}),
        },
        body: body.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new OAuthError(OAuthErrorCode.ServerError, 'Authorization server introspection failed');
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Token rejected by authorization server');
      }
      throw new OAuthError(OAuthErrorCode.ServerError, `Introspection endpoint returned HTTP ${response.status}`);
    }

    let payload: IntrospectionPayload;
    try {
      payload = (await response.json()) as IntrospectionPayload;
    } catch {
      throw new OAuthError(OAuthErrorCode.ServerError, 'Invalid JSON from authorization server introspection');
    }

    if (payload.active !== true) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Token is inactive or has been revoked');
    }

    if (
      payload.token_use === 'classic' ||
      payload.is_mcp_token === false ||
      (payload.token_type !== undefined &&
        payload.token_type.toLowerCase() !== 'mcp' &&
        payload.token_type.toLowerCase() !== 'bearer')
    ) {
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        'Hosted MCP requires a scoped MCP token issued by AirysChat',
      );
    }

    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= nowSec) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Token has expired or has no expiration time');
    }

    const accountId = Number(payload.account_id);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Token is missing a valid AirysChat account_id claim');
    }
    this.enforceAccountHeaderMatch(accountId, requestHeaders);

    // Audience binding check (RFC 8707 / ADR 0006).
    const audiences = Array.isArray(payload.aud)
      ? payload.aud
      : typeof payload.aud === 'string'
        ? [payload.aud]
        : [];
    if (audiences.length === 0) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Token is missing required audience (aud) binding');
    }

    const normalizedExpectedFull = expectedResource.toString().replace(/\/+$/, '');
    const normalizedExpectedOrigin = expectedResource.origin.replace(/\/+$/, '');
    const audienceMatches = audiences.some((aud) => {
      const clean = String(aud).trim().replace(/\/+$/, '');
      return clean === normalizedExpectedFull || clean === normalizedExpectedOrigin;
    });

    if (!audienceMatches) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Token was not issued for this MCP resource');
    }

    // Scope parsing and hierarchy expansion (`mcp:read` ⊂ `mcp:write` ⊂ `mcp:irreversible`).
    const rawScopes = payload.scopes ?? payload.scope ?? '';
    let parsedScopes;
    try {
      parsedScopes = parseTokenScopes(rawScopes, this.defaultToolsets);
    } catch (error) {
      throw new OAuthError(
        OAuthErrorCode.InsufficientScope,
        error instanceof Error ? error.message : 'Insufficient token scope',
      );
    }

    const verified: VerifiedMcpAuth = {
      token,
      clientId: typeof payload.client_id === 'string' && payload.client_id ? payload.client_id : 'airyschat-mcp-client',
      scopes: parsedScopes.expandedScopes,
      expiresAt: payload.exp,
      resource: expectedResource,
      resourceMetadataUrl: metadataUrl,
      accountId,
      maxAccess: parsedScopes.maxAccess,
      toolsets: parsedScopes.toolsets,
      toolsetsRestricted: parsedScopes.toolsetsRestricted,
      tokenFp: tokenFingerprint(token),
    };

    if (this.cacheTtlSeconds > 0) {
      if (this.cache.size >= this.maxCacheEntries) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) this.cache.delete(oldestKey);
      }
      const tokenRemainingMs = Math.max(0, (payload.exp - nowSec) * 1000);
      const ttlMs = Math.min(this.cacheTtlSeconds * 1000, tokenRemainingMs);
      if (ttlMs > 0) {
        this.cache.set(key, { auth: verified, expiresAtMs: nowMs + ttlMs });
      }
    }

    return verified;
  }

  private enforceAccountHeaderMatch(tokenAccountId: number, headers: Headers): void {
    const headerAccount = headers.get('x-airyschat-account')?.trim();
    if (!headerAccount) return;
    if (Number(headerAccount) !== tokenAccountId) {
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        `Token is bound to account ${tokenAccountId} and cannot access account ${headerAccount}`,
      );
    }
  }
}

export { OAuthError, OAuthErrorCode, bearerAuthChallengeResponse };

/**
 * Per-key sliding-window rate limiter (REM-05).
 */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number = 120,
    private readonly windowMs: number = 60_000,
    private readonly maxKeys: number = 5_000,
  ) {}

  check(key: string, nowMs: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const cutoff = nowMs - this.windowMs;
    const existing = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);

    if (existing.length >= this.limit) {
      const oldest = existing[0] ?? nowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - nowMs) / 1000));
      this.hits.set(key, existing);
      return { allowed: false, retryAfterSeconds };
    }

    existing.push(nowMs);
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) {
      const firstKey = this.hits.keys().next().value;
      if (firstKey !== undefined) this.hits.delete(firstKey);
    }
    this.hits.set(key, existing);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * Strict structured log schema (REM-05, airys-platform rule 8, secrets-and-evidence rule).
 * Only allowlisted operational metadata fields are serialized — never headers, bodies, or tokens.
 */
export interface StructuredHttpLogEntry {
  severity: 'INFO' | 'WARNING' | 'ERROR';
  request_id: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  instance?: string;
  account_id?: number;
  token_fp?: string;
  error_code?: string;
}

export function formatStructuredLog(entry: StructuredHttpLogEntry, now: Date = new Date()): string {
  const safeRecord: Record<string, unknown> = {
    severity: entry.severity,
    timestamp: now.toISOString(),
    request_id: entry.request_id,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    duration_ms: Math.round(entry.duration_ms),
  };
  if (entry.instance !== undefined) safeRecord.instance = entry.instance;
  if (entry.account_id !== undefined) safeRecord.account_id = entry.account_id;
  if (entry.token_fp !== undefined) safeRecord.token_fp = entry.token_fp;
  if (entry.error_code !== undefined) safeRecord.error_code = entry.error_code;
  return `${JSON.stringify(safeRecord)}\n`;
}
