import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { AirysChatClient, ApiError } from '../src/client.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({ AIRYSCHAT_BASE_URL: 'https://h.example', AIRYSCHAT_API_KEY: 'secret', AIRYSCHAT_ACCOUNT_ID: '6' });
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(status: number, body: string) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(body, { status });
  }) as typeof fetch;
  return calls;
}

test('core, core_v2, saas and raw prefixes build the right URLs', async () => {
  const calls = stubFetch(200, '{}');
  const client = new AirysChatClient(config);
  await client.request('/campaigns');
  await client.request('/reports/summary', { prefix: 'core_v2' });
  await client.request('ai_agents', { prefix: 'saas' });
  await client.request('/api/v1/profile', { prefix: 'raw' });
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      'https://h.example/api/v1/accounts/6/campaigns',
      'https://h.example/api/v2/accounts/6/reports/summary',
      'https://h.example/saas/api/v1/accounts/6/ai_agents',
      'https://h.example/api/v1/profile',
    ],
  );
});

test('arrays become repeated key[] params; null and undefined are dropped', async () => {
  const calls = stubFetch(200, '[]');
  await new AirysChatClient(config).request('/conversations', { query: { inbox_ids: [3, 9], status: 'open', page: undefined, q: null } });
  const url = new URL(calls[0]!.url);
  assert.deepEqual(url.searchParams.getAll('inbox_ids[]'), ['3', '9']);
  assert.equal(url.searchParams.get('status'), 'open');
  assert.equal(url.searchParams.has('page'), false);
  assert.equal(url.searchParams.has('q'), false);
});

test('sends the token header and a JSON body', async () => {
  const calls = stubFetch(200, '{"ok":true}');
  const result = await new AirysChatClient(config).request('/labels', { method: 'POST', body: { title: 'vip' } });
  assert.deepEqual(result, { ok: true });
  const init = calls[0]!.init;
  assert.equal(init.method, 'POST');
  assert.equal((init.headers as Record<string, string>).api_access_token, 'secret');
  assert.equal(init.body, '{"title":"vip"}');
});

test('empty bodies are null and non-JSON bodies are kept as text', async () => {
  stubFetch(200, '');
  assert.equal(await new AirysChatClient(config).request('/x'), null);
  stubFetch(200, '<html>ok</html>');
  assert.equal(await new AirysChatClient(config).request('/x'), '<html>ok</html>');
});

test('non-2xx responses throw ApiError with status, detail and plan-gate classification', async () => {
  stubFetch(403, '{"error":"Meta Business Agent is not enabled"}');
  await assert.rejects(new AirysChatClient(config).request('/ai_agents', { prefix: 'saas' }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 403);
    assert.equal(error.detail, 'Meta Business Agent is not enabled');
    assert.equal(error.isPlanGate, true);
    return true;
  });

  stubFetch(403, '{"error":"forbidden"}');
  await assert.rejects(new AirysChatClient(config).request('/inboxes'), (error: unknown) => error instanceof ApiError && !error.isPlanGate);
});

test('ApiError.detail reads error, message or errors, else undefined', () => {
  assert.equal(new ApiError(422, 'u', 'POST', { errors: 'bad' }).detail, 'bad');
  assert.equal(new ApiError(422, 'u', 'POST', { errors: ['bad'] }).detail, undefined);
  assert.equal(new ApiError(500, 'u', 'GET', '  ').detail, undefined);
});
