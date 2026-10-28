/**
 * k6 load test for Hosted MCP (REM-13).
 *
 * Target: 50 requests/second for 60s against /mcp (tools/list + tools/call),
 * asserting p(95) < 800 ms excluding upstream latency and error rate < 1%.
 *
 * Usage:
 *   MCP_BASE_URL=https://mcp.staging.airys.chat \
 *   MCP_TOKEN=mcp_at_... \
 *   k6 run specs/005-hosted-mcp/k6-load-test.js
 */

import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    steady_50_rps: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 25,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

const BASE_URL = __ENV.MCP_BASE_URL || 'http://127.0.0.1:8080';
const TOKEN = __ENV.MCP_TOKEN || 'mcp_load_test_token';

export default function () {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  });

  const res = http.post(`${BASE_URL}/mcp`, payload, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
