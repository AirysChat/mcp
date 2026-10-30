/**
 * Unit tests for Lane 009 (`PLT-01..PLT-06`):
 * - `AirysPlatformClient` (`PLT-02`): separate `AIRYS_PLATFORM_URL` and `AIRYS_API_TOKEN`,
 *   never leaks `AIRYSCHAT_API_KEY`, handles `GET /health` without auth, fails fast when
 *   `AIRYS_API_TOKEN` is missing on authenticated routes, surfaces FastAPI `detail` on 401/422.
 * - `platform` toolset (`PLT-03`, `PLT-04`):
 *   - `platform_health` (`stable`)
 *   - `platform_signals_attribution_list` (`beta`, `untrustedJson`)
 *   - `platform_signals_outcome_record` (`beta`, `write: true`, `idempotent: true`)
 *   - `platform_numbers_health`, `platform_alerts_list`, `platform_instances_list`, `platform_usage`
 *     (`beta`, 15 alert rules, 7 pricing categories, graceful `not_yet_deployed_on_platform` fallback on 404).
 */

import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { AirysChatClient } from '../src/client.js';
import { loadConfig, type Config } from '../src/config.js';
import { AirysPlatformClient } from '../src/platform-client.js';
import {
  PLATFORM_ALERT_RULES,
  PLATFORM_PRICING_CATEGORIES,
  platformTools,
} from '../src/tools/platform.js';
import type { AnyToolDefinition, ToolContext } from '../src/toolsets.js';

interface RecordedPlatformRequest {
  method: string;
  url: string;
  authorization?: string;
  apiAccessToken?: string;
  body: unknown;
}

describe('AirysPlatformClient and platform toolset (PLT-02..PLT-04)', () => {
  let baseUrl = '';
  let lastReq: RecordedPlatformRequest | undefined;
  let nextStatus = 200;
  let nextResponse: unknown = { ok: true };

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    let parsedBody: unknown = undefined;
    if (raw) {
      try {
        parsedBody = JSON.parse(raw);
      } catch {
        parsedBody = raw;
      }
    }
    lastReq = {
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      authorization: typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
      apiAccessToken: typeof req.headers.api_access_token === 'string' ? req.headers.api_access_token : undefined,
      body: parsedBody,
    };
    res.writeHead(nextStatus, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(nextResponse));
  });

  before(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function makeContext(overrides: Partial<Config> = {}): ToolContext {
    const config: Config = {
      baseUrl: 'https://chat.example.com',
      apiKey: 'airyschat-secret-token',
      accountId: 6,
      toolsets: new Set(['core', 'whatsapp', 'platform']),
      features: 'beta',
      readOnly: false,
      timeoutMs: 5_000,
      platformBaseUrl: baseUrl,
      platformApiToken: 'airys_inst_staging_token',
      ...overrides,
    };
    return {
      client: new AirysChatClient(config),
      platformClient: new AirysPlatformClient(config),
      config,
    };
  }

  function getTool(name: string): AnyToolDefinition {
    const found = platformTools.find((t) => t.name === name);
    assert.ok(found, `Expected tool ${name} in platformTools`);
    return found;
  }

  it('parses AIRYS_PLATFORM_URL, AIRYS_API_TOKEN, and toolset platform in loadConfig', () => {
    const cfg = loadConfig({
      AIRYSCHAT_BASE_URL: 'https://staging.airys.app',
      AIRYSCHAT_API_KEY: 'chat-token',
      AIRYSCHAT_ACCOUNT_ID: '6',
      AIRYSCHAT_TOOLSETS: 'core,platform',
      AIRYS_PLATFORM_URL: 'https://api-tdtyqbghua-rj.a.run.app/',
      AIRYS_API_TOKEN: 'platform-secret-token',
    });
    assert.equal(cfg.platformBaseUrl, 'https://api-tdtyqbghua-rj.a.run.app');
    assert.equal(cfg.platformApiToken, 'platform-secret-token');
    assert.equal(cfg.toolsets.has('platform'), true);

    assert.throws(
      () =>
        loadConfig({
          AIRYSCHAT_BASE_URL: 'https://staging.airys.app',
          AIRYSCHAT_API_KEY: 'chat-token',
          AIRYSCHAT_ACCOUNT_ID: '6',
          AIRYS_API_TOKEN: '${AIRYS_API_TOKEN}',
        }),
      /AIRYS_API_TOKEN was passed unexpanded/,
    );
  });

  it('calls GET /health without Authorization and never sends AIRYSCHAT_API_KEY', async () => {
    nextStatus = 200;
    nextResponse = {
      status: 'ok',
      service: 'airys-platform',
      version: '0.1.0',
      environment: 'staging',
      commit: '06ae993a114ad4271d48be464f641a814f40d1a8',
      revision: 'api-00022-wrv',
    };

    const ctx = makeContext({ platformApiToken: undefined });
    const res = await getTool('platform_health').handler({}, ctx);
    assert.equal(res.isError, undefined);
    assert.equal(lastReq?.method, 'GET');
    assert.equal(lastReq?.url, '/health');
    assert.equal(lastReq?.authorization, undefined);
    assert.equal(lastReq?.apiAccessToken, undefined);
    assert.equal((res.structuredContent as Record<string, unknown>)?.status, 'ok');
  });

  it('fails fast with PlatformAuthConfigError when AIRYS_API_TOKEN is missing on authenticated tools', async () => {
    const ctx = makeContext({ platformApiToken: undefined });
    await assert.rejects(
      () => getTool('platform_signals_attribution_list').handler({ contact_key: '5511999999999' }, ctx),
      /AIRYS_API_TOKEN is not configured/,
    );
  });

  it('calls GET /v1/signals/attribution with Bearer AIRYS_API_TOKEN and fences untrusted ad data', async () => {
    nextStatus = 200;
    nextResponse = {
      touches: [
        {
          touch_id: 42,
          channel: 'whatsapp',
          click_id: 'ctwa_abc123',
          ad_id: '1200001',
          source_type: 'ad',
          source_url: 'https://fb.me/123',
          headline: 'Promo Oferta',
          asset_id: 'waba_99',
          contact_key: '5511999999999',
          occurred_at: '2026-10-28T12:00:00Z',
          referral: { headline: 'Promo Oferta' },
        },
      ],
    };

    const ctx = makeContext();
    const res = await getTool('platform_signals_attribution_list').handler(
      { contact_key: '5511999999999', channel: 'whatsapp' },
      ctx,
    );
    assert.equal(res.isError, undefined);
    assert.equal(lastReq?.url, '/v1/signals/attribution?contact_key=5511999999999&channel=whatsapp');
    assert.equal(lastReq?.authorization, 'Bearer airys_inst_staging_token');
    assert.equal(lastReq?.apiAccessToken, undefined);
    assert.ok((res.structuredContent as Record<string, unknown>)?._untrusted);
  });

  it('validates currency requirement and posts outcomes to POST /v1/signals/outcomes', async () => {
    const ctx = makeContext();
    const invalid = await getTool('platform_signals_outcome_record').handler(
      {
        event_id: 'deal-won-10',
        event_name: 'Purchase',
        event_time: '2026-10-28T12:00:00Z',
        value: 250,
      },
      ctx,
    );
    assert.equal(invalid.isError, true);

    nextStatus = 202;
    nextResponse = {
      outcome_id: 99,
      event_id: 'deal-won-10',
      event_name: 'Purchase',
      status: 'recorded',
      touch_id: 42,
      channel: 'whatsapp',
      click_id: 'ctwa_abc123',
    };

    const valid = await getTool('platform_signals_outcome_record').handler(
      {
        event_id: 'deal-won-10',
        event_name: 'Purchase',
        event_time: '2026-10-28T12:00:00Z',
        channel: 'whatsapp',
        click: { ctwa_clid: 'ctwa_abc123', wa_id: '5511999999999' },
        value: 250,
        currency: 'BRL',
      },
      ctx,
    );
    assert.equal(valid.isError, undefined);
    assert.equal(lastReq?.method, 'POST');
    assert.equal(lastReq?.url, '/v1/signals/outcomes');
    assert.equal((lastReq?.body as Record<string, unknown>)?.currency, 'BRL');
  });

  it('handles management endpoints (numbers, alerts, instances, usage) at beta stability with full rule and category enums', async () => {
    assert.equal(PLATFORM_ALERT_RULES.length, 15);
    assert.ok(PLATFORM_ALERT_RULES.includes('delivery_rejected'));
    assert.ok(PLATFORM_ALERT_RULES.includes('webhook_unrouted'));
    assert.equal(PLATFORM_PRICING_CATEGORIES.length, 7);
    assert.ok(PLATFORM_PRICING_CATEGORIES.includes('MARKETING_LITE'));
    assert.ok(PLATFORM_PRICING_CATEGORIES.includes('AUTHENTICATION_INTERNATIONAL'));
    assert.ok(PLATFORM_PRICING_CATEGORIES.includes('REFERRAL_CONVERSION'));

    for (const toolName of [
      'platform_numbers_health',
      'platform_alerts_list',
      'platform_instances_list',
      'platform_usage',
    ]) {
      assert.equal(getTool(toolName).stability, 'beta');
    }

    const ctx = makeContext();

    // 200 OK path
    nextStatus = 200;
    nextResponse = { numbers: [{ phone_number_id: '123', quality_rating: 'GREEN', health_can_send: 'AVAILABLE' }] };
    const numbersOk = await getTool('platform_numbers_health').handler({ quality_rating: 'GREEN' }, ctx);
    assert.equal(numbersOk.isError, undefined);
    assert.ok((numbersOk.structuredContent as Record<string, unknown>)?._untrusted);

    nextResponse = { alerts: [{ alert_id: 1, rule: 'delivery_rejected', severity: 'critical', status: 'open' }] };
    const alertsOk = await getTool('platform_alerts_list').handler(
      { status: 'open', rule: 'delivery_rejected' },
      ctx,
    );
    assert.equal(alertsOk.isError, undefined);
    assert.equal(lastReq?.url, '/v1/alerts?status=open&rule=delivery_rejected');
    assert.ok((alertsOk.structuredContent as Record<string, unknown>)?._untrusted);

    nextResponse = { instances: [{ tenant_id: 'airys-staging', active: true }] };
    const instancesOk = await getTool('platform_instances_list').handler({ environment: 'staging' }, ctx);
    assert.equal(instancesOk.isError, undefined);
    assert.ok((instancesOk.structuredContent as Record<string, unknown>)?._untrusted);

    nextResponse = {
      since: '2026-10-01',
      until: '2026-10-30',
      usage: [{ phone_number_id: '123', pricing_category: 'MARKETING_LITE', volume: 100 }],
      totals: { volume: 100, by_category: { MARKETING_LITE: 100 }, cost_by_currency: { BRL: '31.250000' } },
    };
    const usageOk = await getTool('platform_usage').handler({ category: 'MARKETING_LITE' }, ctx);
    assert.equal(usageOk.isError, undefined);
    assert.equal(lastReq?.url, '/v1/usage?category=MARKETING_LITE');

    // 404 Not Found fallback on unpromoted platform environments
    nextStatus = 404;
    nextResponse = { detail: 'Not Found' };
    for (const toolName of [
      'platform_numbers_health',
      'platform_alerts_list',
      'platform_instances_list',
      'platform_usage',
    ]) {
      const res = await getTool(toolName).handler({}, ctx);
      assert.equal(res.isError, true);
      const text = (res.content[0] as { text: string }).text;
      assert.match(text, /not_yet_deployed_on_platform/);
    }
  });
});
