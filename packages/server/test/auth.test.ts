import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AirysChatTokenIntrospector,
  OAuthError,
  OAuthErrorCode,
  SlidingWindowRateLimiter,
  createProtectedResourceMetadataResponse,
  formatStructuredLog,
  loadInstanceAllowlist,
  resolveRequestRoute,
  tokenFingerprint,
  validateInstanceOrigin,
} from '../src/auth.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('validateInstanceOrigin enforces https, bare origin, no credentials, and blocks metadata hosts', () => {
  assert.equal(validateInstanceOrigin('https://airys.chat/').origin, 'https://airys.chat');
  assert.equal(validateInstanceOrigin('http://127.0.0.1:4100/').origin, 'http://127.0.0.1:4100');
  assert.equal(validateInstanceOrigin('http://localhost:3000').origin, 'http://localhost:3000');

  assert.throws(() => validateInstanceOrigin('not-a-url'), /Invalid instance URL/);
  assert.throws(() => validateInstanceOrigin('http://airys.chat'), /must use https/);
  assert.throws(() => validateInstanceOrigin('https://user:pass@airys.chat'), /must not embed credentials/);
  assert.throws(() => validateInstanceOrigin('https://airys.chat/api'), /bare origin/);
  assert.throws(() => validateInstanceOrigin('https://airys.chat?x=1'), /bare origin/);
  assert.throws(() => validateInstanceOrigin('https://169.254.169.254'), /forbidden host/);
  assert.throws(() => validateInstanceOrigin('https://metadata.google.internal'), /forbidden host/);
});

test('loadInstanceAllowlist and resolveRequestRoute map hosts and /<instance>/mcp paths and reject unknown instances', () => {
  const allowlist = loadInstanceAllowlist({
    AIRYSCHAT_ALLOWED_INSTANCES: 'acme=https://acme.airys.chat,https://custom.airys.chat',
    AIRYSCHAT_DEFAULT_INSTANCE: 'staging',
  });

  // Health checks
  assert.equal(
    resolveRequestRoute(new URL('https://mcp.airys.chat/healthz'), new Headers(), allowlist).kind,
    'health',
  );
  assert.equal(
    resolveRequestRoute(new URL('https://mcp.airys.chat/health'), new Headers(), allowlist).kind,
    'health',
  );

  // Host mapping: mcp.airys.chat -> https://airys.chat
  const prodRoute = resolveRequestRoute(
    new URL('https://mcp.airys.chat/mcp'),
    new Headers({ host: 'mcp.airys.chat' }),
    allowlist,
  );
  assert.equal(prodRoute.kind, 'mcp');
  assert.equal(prodRoute.instance.baseUrl, 'https://airys.chat');
  assert.equal(prodRoute.resourceUrl, 'https://mcp.airys.chat/mcp');
  assert.equal(prodRoute.metadataUrl, 'https://mcp.airys.chat/.well-known/oauth-protected-resource');

  // Managed instance path routing (REM-15): /acme/mcp -> https://acme.airys.chat
  const acmeRoute = resolveRequestRoute(
    new URL('https://mcp.airys.chat/acme/mcp'),
    new Headers({ host: 'mcp.airys.chat' }),
    allowlist,
  );
  assert.equal(acmeRoute.kind, 'mcp');
  assert.equal(acmeRoute.instance.baseUrl, 'https://acme.airys.chat');
  assert.equal(acmeRoute.resourceUrl, 'https://mcp.airys.chat/acme/mcp');
  assert.equal(acmeRoute.metadataUrl, 'https://mcp.airys.chat/.well-known/oauth-protected-resource/acme/mcp');

  // Metadata path variants
  const meta1 = resolveRequestRoute(
    new URL('https://mcp.staging.airys.chat/.well-known/oauth-protected-resource'),
    new Headers({ host: 'mcp.staging.airys.chat' }),
    allowlist,
  );
  assert.equal(meta1.kind, 'metadata');
  assert.equal(meta1.instance.baseUrl, 'https://staging.airys.app');

  const meta2 = resolveRequestRoute(
    new URL('https://mcp.airys.chat/acme/.well-known/oauth-protected-resource'),
    new Headers({ host: 'mcp.airys.chat' }),
    allowlist,
  );
  assert.equal(meta2.kind, 'metadata');
  assert.equal(meta2.instance.baseUrl, 'https://acme.airys.chat');

  // Rejects unknown path instance, unknown header instance, conflicting instance, and unmapped host
  const badPath = resolveRequestRoute(
    new URL('https://mcp.airys.chat/evil/mcp'),
    new Headers({ host: 'mcp.airys.chat' }),
    allowlist,
  );
  assert.equal(badPath.kind, 'invalid_instance');

  const badHeader = resolveRequestRoute(
    new URL('https://mcp.airys.chat/mcp'),
    new Headers({ host: 'mcp.airys.chat', 'x-airyschat-instance': 'https://evil.example' }),
    allowlist,
  );
  assert.equal(badHeader.kind, 'invalid_instance');

  const conflict = resolveRequestRoute(
    new URL('https://mcp.airys.chat/acme/mcp'),
    new Headers({ host: 'mcp.airys.chat', 'x-airyschat-instance': 'staging' }),
    allowlist,
  );
  assert.equal(conflict.kind, 'invalid_instance');

  const unmappedHost = resolveRequestRoute(
    new URL('https://unknown.example.com/mcp'),
    new Headers({ host: 'unknown.example.com' }),
    loadInstanceAllowlist({}),
  );
  assert.equal(unmappedHost.kind, 'invalid_instance');

  const notFound = resolveRequestRoute(
    new URL('https://mcp.airys.chat/other'),
    new Headers({ host: 'mcp.airys.chat' }),
    allowlist,
  );
  assert.equal(notFound.kind, 'not_found');
});

test('createProtectedResourceMetadataResponse returns RFC 9728 metadata JSON', async () => {
  const res = createProtectedResourceMetadataResponse(
    { slug: 'staging', baseUrl: 'https://staging.airys.app' },
    'https://mcp.staging.airys.chat/mcp',
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    resource: string;
    authorization_servers: string[];
    scopes_supported: string[];
  };
  assert.equal(body.resource, 'https://mcp.staging.airys.chat/mcp');
  assert.deepEqual(body.authorization_servers, ['https://staging.airys.app']);
  assert.ok(body.scopes_supported.includes('mcp:read'));
  assert.ok(body.scopes_supported.includes('mcp:irreversible'));
  assert.ok(body.scopes_supported.includes('mcp:toolset:crm'));
});

test('AirysChatTokenIntrospector verifies MCP tokens, caches within TTL, and rejects invalid tokens', async () => {
  const instance = { slug: 'staging', baseUrl: 'https://staging.airys.app' };
  const resourceUrl = 'https://mcp.staging.airys.chat/mcp';
  const metadataUrl = 'https://mcp.staging.airys.chat/.well-known/oauth-protected-resource';
  const futureExp = Math.floor(Date.now() / 1000) + 600;

  let introspectCalls = 0;
  let mockPayload: Record<string, unknown> = {
    active: true,
    token_type: 'mcp',
    client_id: 'claude-ai',
    account_id: 6,
    aud: 'https://mcp.staging.airys.chat/mcp',
    scope: 'mcp:write mcp:toolset:crm',
    exp: futureExp,
  };

  globalThis.fetch = (async () => {
    introspectCalls += 1;
    return Response.json(mockPayload, { status: 200 });
  }) as typeof fetch;

  const introspector = new AirysChatTokenIntrospector({ cacheTtlSeconds: 60, maxCacheEntries: 2 });

  // 1. Valid MCP token introspeced and cached on second call
  const req1 = new Request(resourceUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer mcp_tok_valid_1', 'x-airyschat-account': '6' },
  });
  const auth1 = await introspector.verifyRequest(req1, instance, resourceUrl, metadataUrl);
  assert.equal(auth1.accountId, 6);
  assert.equal(auth1.maxAccess, 'write');
  assert.equal(auth1.toolsetsRestricted, true);
  assert.deepEqual([...auth1.toolsets], ['crm']);
  assert.equal(introspectCalls, 1);

  const auth2 = await introspector.verifyRequest(req1, instance, resourceUrl, metadataUrl);
  assert.equal(auth2.accountId, 6);
  assert.equal(introspectCalls, 1); // Served from cache!

  // Account header mismatch against cached token -> 401 InvalidToken
  const reqMismatch = new Request(resourceUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer mcp_tok_valid_1', 'x-airyschat-account': '999' },
  });
  await assert.rejects(
    introspector.verifyRequest(reqMismatch, instance, resourceUrl, metadataUrl),
    (err: unknown) => err instanceof OAuthError && err.code === OAuthErrorCode.InvalidToken,
  );

  // 2. Classic api_access_token header or non-mcp_ bearer token rejected without calling upstream
  const reqClassicHeader = new Request(resourceUrl, {
    method: 'POST',
    headers: { api_access_token: 'classic_token' },
  });
  await assert.rejects(
    introspector.verifyRequest(reqClassicHeader, instance, resourceUrl, metadataUrl),
    (err: unknown) => err instanceof OAuthError && err.code === OAuthErrorCode.InvalidToken,
  );
  assert.equal(introspectCalls, 1);

  const reqClassicBearer = new Request(resourceUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer classic_user_token_123' },
  });
  await assert.rejects(
    introspector.verifyRequest(reqClassicBearer, instance, resourceUrl, metadataUrl),
    (err: unknown) => err instanceof OAuthError && err.code === OAuthErrorCode.InvalidToken,
  );
  assert.equal(introspectCalls, 1);

  // 3. Inactive / revoked token
  mockPayload = { active: false };
  await assert.rejects(
    introspector.verifyRequest(
      new Request(resourceUrl, { headers: { Authorization: 'Bearer mcp_revoked' } }),
      instance,
      resourceUrl,
      metadataUrl,
    ),
    (err: unknown) => err instanceof OAuthError && err.code === OAuthErrorCode.InvalidToken,
  );

  // 4. Wrong audience
  mockPayload = {
    active: true,
    token_type: 'mcp',
    account_id: 6,
    aud: 'https://other-service.example.com',
    scope: 'mcp:read',
    exp: futureExp,
  };
  await assert.rejects(
    introspector.verifyRequest(
      new Request(resourceUrl, { headers: { Authorization: 'Bearer mcp_wrong_aud' } }),
      instance,
      resourceUrl,
      metadataUrl,
    ),
    (err: unknown) => err instanceof OAuthError && err.code === OAuthErrorCode.InvalidToken,
  );

  // 5. Expired token
  mockPayload = {
    active: true,
    token_type: 'mcp',
    account_id: 6,
    aud: resourceUrl,
    scope: 'mcp:read',
    exp: Math.floor(Date.now() / 1000) - 10,
  };
  await assert.rejects(
    introspector.verifyRequest(
      new Request(resourceUrl, { headers: { Authorization: 'Bearer mcp_expired' } }),
      instance,
      resourceUrl,
      metadataUrl,
    ),
    (err: unknown) => err instanceof OAuthError && err.code === OAuthErrorCode.InvalidToken,
  );

  // 6. Insufficient scope (missing mcp:read|write|irreversible)
  mockPayload = {
    active: true,
    token_type: 'mcp',
    account_id: 6,
    aud: resourceUrl,
    scope: 'profile',
    exp: futureExp,
  };
  await assert.rejects(
    introspector.verifyRequest(
      new Request(resourceUrl, { headers: { Authorization: 'Bearer mcp_no_scope' } }),
      instance,
      resourceUrl,
      metadataUrl,
    ),
    (err: unknown) => err instanceof OAuthError && err.code === OAuthErrorCode.InsufficientScope,
  );
});

test('SlidingWindowRateLimiter and formatStructuredLog enforce limits and strip sensitive fields', () => {
  const limiter = new SlidingWindowRateLimiter(2, 60_000, 2);
  assert.equal(limiter.check('k1', 1000).allowed, true);
  assert.equal(limiter.check('k1', 2000).allowed, true);
  const blocked = limiter.check('k1', 3000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  // After window expires, allowed again
  assert.equal(limiter.check('k1', 62_000).allowed, true);

  const fp = tokenFingerprint('mcp_secret_token_do_not_log');
  assert.equal(fp.length, 12);
  assert.equal(fp.includes('secret'), false);

  const line = formatStructuredLog(
    {
      severity: 'INFO',
      request_id: 'req-1',
      method: 'POST',
      path: '/mcp',
      status: 200,
      duration_ms: 14.4,
      instance: 'staging',
      account_id: 6,
      token_fp: fp,
    },
    new Date('2026-10-28T12:00:00Z'),
  );
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), [
    'account_id',
    'duration_ms',
    'instance',
    'method',
    'path',
    'request_id',
    'severity',
    'status',
    'timestamp',
    'token_fp',
  ]);
});
