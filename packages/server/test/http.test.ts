import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpApp, startHttpServer } from '../src/http.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('createHttpApp serves health, metadata, anti-SSRF 400, OAuth challenges, and scope-filtered MCP tools', async () => {
  const logs: string[] = [];
  const outboundUrls: string[] = [];
  const futureExp = Math.floor(Date.now() / 1000) + 600;

  const tokens: Record<string, Record<string, unknown>> = {
    mcp_read_token: {
      active: true,
      token_type: 'mcp',
      account_id: 6,
      aud: 'https://mcp.staging.airys.chat',
      scope: 'mcp:read',
      exp: futureExp,
    },
    mcp_write_crm_token: {
      active: true,
      token_type: 'mcp',
      account_id: 6,
      aud: 'https://mcp.staging.airys.chat/mcp',
      scope: 'mcp:write mcp:toolset:crm',
      exp: futureExp,
    },
    mcp_irreversible_token: {
      active: true,
      token_type: 'mcp',
      account_id: 6,
      aud: 'https://mcp.staging.airys.chat/mcp',
      scope: 'mcp:irreversible',
      exp: futureExp,
    },
  };

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    outboundUrls.push(url);

    if (url.endsWith('/oauth/introspect')) {
      const params = new URLSearchParams(String(init?.body ?? ''));
      const tok = params.get('token') ?? '';
      const entry = tokens[tok];
      if (!entry) return Response.json({ active: false }, { status: 200 });
      return Response.json(entry, { status: 200 });
    }

    if (url.endsWith('/api/v1/accounts/6/inboxes')) {
      return Response.json({ payload: [{ id: 9, name: 'Demo WhatsApp' }] }, { status: 200 });
    }

    return Response.json({ ok: true, url }, { status: 200 });
  }) as typeof fetch;

  const app = createHttpApp({
    env: {
      AIRYSCHAT_FEATURES: 'beta',
      AIRYSCHAT_RATE_LIMIT_PER_MIN: '50',
    },
    log: (line) => logs.push(line),
  });

  // 1. /healthz
  const healthRes = await app.fetch(new Request('https://mcp.staging.airys.chat/healthz'));
  assert.equal(healthRes.status, 200);
  const healthBody = (await healthRes.json()) as { status: string };
  assert.equal(healthBody.status, 'ok');

  // 2. /.well-known/oauth-protected-resource
  const metaRes = await app.fetch(
    new Request('https://mcp.staging.airys.chat/.well-known/oauth-protected-resource'),
  );
  assert.equal(metaRes.status, 200);
  const metaBody = (await metaRes.json()) as { authorization_servers: string[] };
  assert.deepEqual(metaBody.authorization_servers, ['https://staging.airys.app']);

  // 3. Unknown instance -> 400 with ZERO outbound calls
  outboundUrls.length = 0;
  const ssrfRes = await app.fetch(
    new Request('https://mcp.staging.airys.chat/evil.internal/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_read_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
  );
  assert.equal(ssrfRes.status, 400);
  assert.equal(outboundUrls.length, 0);

  // 4. Missing Authorization header -> 401 with WWW-Authenticate challenge
  const unauthRes = await app.fetch(
    new Request('https://mcp.staging.airys.chat/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
  );
  assert.equal(unauthRes.status, 401);
  assert.match(unauthRes.headers.get('www-authenticate') ?? '', /Bearer error="invalid_token"/);
  assert.match(unauthRes.headers.get('www-authenticate') ?? '', /resource_metadata=/);

  // 5. mcp:read token lists only read tools (and airyschat_api for GET), refuses POST on airyschat_api
  const listReadRes = await app.fetch(
    new Request('https://mcp.staging.airys.chat/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_read_token',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    }),
  );
  assert.equal(listReadRes.status, 200);
  const listReadJson = (await listReadRes.json()) as {
    result: { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> };
  };
  assert.ok(listReadJson.result.tools.length > 0);
  assert.equal(
    listReadJson.result.tools.every((tool) => tool.annotations.readOnlyHint === true),
    true,
  );
  assert.equal(
    listReadJson.result.tools.some((tool) => tool.name === 'conversation_reply'),
    false,
  );

  // Calling GET via airyschat_api succeeds on mcp:read
  const getCallRes = await app.fetch(
    new Request('https://mcp.staging.airys.chat/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_read_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'airyschat_api', arguments: { path: '/inboxes', method: 'GET' } },
      }),
    }),
  );
  assert.equal(getCallRes.status, 200);
  const getCallJson = (await getCallRes.json()) as { result: { isError?: boolean } };
  assert.equal(Boolean(getCallJson.result.isError), false);

  // Calling POST via airyschat_api is refused on mcp:read
  const postOnReadRes = await app.fetch(
    new Request('https://mcp.staging.airys.chat/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_read_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'airyschat_api',
          arguments: { path: '/labels', method: 'POST', body: { title: 'x' }, confirm: true },
        },
      }),
    }),
  );
  const postOnReadJson = (await postOnReadRes.json()) as {
    result: { isError?: boolean; content: Array<{ text: string }> };
  };
  assert.equal(postOnReadJson.result.isError, true);
  assert.match(postOnReadJson.result.content[0]!.text, /requires the "mcp:write" token scope/);

  // 6. mcp:write + mcp:toolset:crm exposes reversible CRM writes, hides irreversible tools, and blocks non-CRM raw calls
  const listWriteCrmRes = await app.fetch(
    new Request('https://mcp.staging.airys.chat/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_write_crm_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} }),
    }),
  );
  const listWriteCrmJson = (await listWriteCrmRes.json()) as {
    result: { tools: Array<{ name: string }> };
  };
  const crmNames = listWriteCrmJson.result.tools.map((tool) => tool.name);
  assert.ok(crmNames.includes('crm_deals_search'));
  assert.ok(crmNames.includes('crm_deal_create'));
  assert.equal(crmNames.includes('crm_deal_close'), false); // irreversible hidden on mcp:write
  assert.equal(crmNames.includes('wa_templates_list'), false); // whatsapp toolset not in token scope

  // Escape hatch refuses non-CRM endpoint when toolset is restricted to crm
  const wrongToolsetRawRes = await app.fetch(
    new Request('https://mcp.staging.airys.chat/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_write_crm_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'airyschat_api',
          arguments: { path: '/message_templates', method: 'GET' },
        },
      }),
    }),
  );
  const wrongToolsetRawJson = (await wrongToolsetRawRes.json()) as {
    result: { isError?: boolean; content: Array<{ text: string }> };
  };
  assert.equal(wrongToolsetRawJson.result.isError, true);
  assert.match(wrongToolsetRawJson.result.content[0]!.text, /requires the "mcp:toolset:whatsapp" token scope/);

  // Escape hatch refuses irreversible CRM endpoint on mcp:write
  const irrevOnWriteRes = await app.fetch(
    new Request('https://mcp.staging.airys.chat/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_write_crm_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'airyschat_api',
          arguments: { path: '/crm_deals/10/won', prefix: 'saas', method: 'POST', confirm: true },
        },
      }),
    }),
  );
  const irrevOnWriteJson = (await irrevOnWriteRes.json()) as {
    result: { isError?: boolean; content: Array<{ text: string }> };
  };
  assert.equal(irrevOnWriteJson.result.isError, true);
  assert.match(irrevOnWriteJson.result.content[0]!.text, /requires the "mcp:irreversible" token scope/);

  // 7. Logs never contain raw tokens or payloads
  assert.ok(logs.length >= 6);
  for (const line of logs) {
    assert.equal(line.includes('mcp_read_token'), false);
    assert.equal(line.includes('mcp_write_crm_token'), false);
    assert.equal(line.includes('Demo WhatsApp'), false);
  }
});

test('startHttpServer enforces maxBodyBytes (413) and rate limits (429) over node:http', async () => {
  const futureExp = Math.floor(Date.now() / 1000) + 600;
  const serverFetch = realFetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('http://127.0.0.1:')) {
      return serverFetch(input, init);
    }
    if (url.endsWith('/oauth/introspect')) {
      return Response.json(
        {
          active: true,
          token_type: 'mcp',
          account_id: 6,
          aud: 'https://mcp.staging.airys.chat/mcp',
          scope: 'mcp:read',
          exp: futureExp,
        },
        { status: 200 },
      );
    }
    return Response.json({}, { status: 200 });
  }) as typeof fetch;

  const running = await startHttpServer({
    port: 0,
    host: '127.0.0.1',
    maxBodyBytes: 128,
    publicOrigin: 'https://mcp.staging.airys.chat',
    env: {
      AIRYSCHAT_DEFAULT_INSTANCE: 'staging',
      AIRYSCHAT_RATE_LIMIT_PER_MIN: '1',
    },
    log: () => {},
  });

  try {
    const baseUrl = `http://127.0.0.1:${running.port}`;

    // Oversized body -> 413
    const largeRes = await serverFetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_tok_limit',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', padding: 'x'.repeat(300) }),
    });
    assert.equal(largeRes.status, 413);

    // First small request -> 200
    const okRes = await serverFetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_tok_limit',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(okRes.status, 200);

    // Second request in same minute -> 429 with Retry-After
    const rateRes = await serverFetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_tok_limit',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    assert.equal(rateRes.status, 429);
    assert.ok(Number(rateRes.headers.get('retry-after')) >= 1);
  } finally {
    await running.close();
  }
});
