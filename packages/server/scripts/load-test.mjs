/**
 * Local HTTP load benchmark for `dist/http.js` (REM-13).
 *
 * Drives 200 requests at >50 rps against the stateless Streamable HTTP server
 * (`tools/list` and `tools/call`) backed by an in-process mock AirysChat server,
 * measuring p50, p95, and p99 HTTP handler latency.
 */

import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { startHttpServer } from '../dist/http.js';

const mock = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/oauth/introspect' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        active: true,
        token_type: 'mcp',
        account_id: 6,
        aud: 'http://127.0.0.1/mcp',
        scope: 'mcp:read mcp:write mcp:toolset:core mcp:toolset:crm mcp:toolset:reports',
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    );
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ payload: [{ id: 1, name: 'Inbox' }] }));
});

mock.listen(0, '127.0.0.1');
await once(mock, 'listening');
const mockUrl = `http://127.0.0.1:${mock.address().port}`;

const running = await startHttpServer({
  port: 0,
  host: '127.0.0.1',
  publicOrigin: 'http://127.0.0.1',
  env: {
    AIRYSCHAT_ALLOWED_INSTANCES: `staging=${mockUrl}`,
    AIRYSCHAT_DEFAULT_INSTANCE: 'staging',
    AIRYSCHAT_RATE_LIMIT_PER_MIN: '10000',
  },
  log: () => {},
});

const targetUrl = `http://127.0.0.1:${running.port}/mcp`;
const totalRequests = 200;
const concurrency = 20;
const latenciesMs = [];

const startWall = performance.now();
let dispatched = 0;

async function worker() {
  while (dispatched < totalRequests) {
    const idx = dispatched++;
    const reqStart = performance.now();
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mcp_bench_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        idx % 2 === 0
          ? { jsonrpc: '2.0', id: idx + 1, method: 'tools/list', params: {} }
          : {
              jsonrpc: '2.0',
              id: idx + 1,
              method: 'tools/call',
              params: { name: 'inboxes_list', arguments: {} },
            },
      ),
    });
    assert.equal(res.status, 200);
    await res.json();
    latenciesMs.push(performance.now() - reqStart);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
const totalWallMs = performance.now() - startWall;

await running.close();
mock.close();

latenciesMs.sort((a, b) => a - b);
const pct = (p) => latenciesMs[Math.min(latenciesMs.length - 1, Math.floor(latenciesMs.length * p))];
const rps = (totalRequests / (totalWallMs / 1000)).toFixed(1);
const p50 = pct(0.5).toFixed(2);
const p95 = pct(0.95).toFixed(2);
const p99 = pct(0.99).toFixed(2);

console.log(`Load benchmark: ${totalRequests} reqs @ ${rps} rps | p50=${p50}ms | p95=${p95}ms | p99=${p99}ms`);
assert.ok(Number(p95) < 800, `Expected p95 < 800ms, got ${p95}ms`);
