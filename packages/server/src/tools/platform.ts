/**
 * `platform` toolset — Airys Platform API (`api.airys.chat` / `AirysBR/airys-platform`, lane 009).
 *
 * Uses `AirysPlatformClient` (`AIRYS_PLATFORM_URL` + `AIRYS_API_TOKEN`), completely separate
 * from the per-instance AirysChat client (`AIRYSCHAT_BASE_URL` + `AIRYSCHAT_API_KEY`).
 *
 * Source of truth:
 * - `AirysBR/airys-platform` `openapi/openapi.json` (`GET /health`, `GET /v1/signals/attribution`,
 *   `POST /v1/signals/outcomes`)
 * - `AirysBR/Airys-AI` `specs/20260930-131823-airys-whatsapp-platform/tasks.md` (`PLAT-8.1..8.5`)
 *   and `specs/20260930-125720-meta-control-plane/contracts/event-catalog.md`
 * - `docs/api/domains/platform.md`
 */

import { z } from 'zod';
import { ApiError } from '../client.js';
import { AirysPlatformClient } from '../platform-client.js';
import { failure, trustedJson, untrustedJson } from '../result.js';
import { defineTool, type AnyToolDefinition, type ToolContext } from '../toolsets.js';

export const BUSINESS_MESSAGING_EVENTS = [
  'Purchase',
  'LeadSubmitted',
  'InitiateCheckout',
  'AddToCart',
  'ViewContent',
  'OrderCreated',
  'OrderShipped',
  'OrderDelivered',
  'OrderCanceled',
  'OrderReturned',
  'CartAbandoned',
  'QualifiedLead',
  'RatingProvided',
  'ReviewProvided',
] as const;

export const PLATFORM_ALERT_RULES = [
  'instance_silent',
  'channel_token_invalid',
  'channel_ids_stale',
  'channel_phone_mismatch',
  'number_banned',
  'number_cannot_send',
  'number_quality_red',
  'number_unowned',
  'number_claimed_twice',
  'token_expiring',
  'webhook_jobs_dying',
  'dead_set_full',
  'callback_dead',
] as const;

function getPlatformClient(context: ToolContext): AirysPlatformClient {
  return context.platformClient ?? new AirysPlatformClient(context.config);
}

const platformHealthOutputSchema = z
  .object({
    status: z.string(),
    service: z.string(),
    version: z.string(),
    environment: z.string(),
    commit: z.string(),
    revision: z.string().nullable().optional(),
  })
  .passthrough();

export const platformTools: AnyToolDefinition[] = [
  // --- Live OpenAPI 3.1 endpoints (`openapi/openapi.json` on AirysBR/airys-platform) ---

  defineTool({
    name: 'platform_health',
    stability: 'stable',
    title: 'Get Airys Platform API health and revision',
    description:
      'Checks liveness and build metadata (`status`, `service`, `version`, `environment`, `commit`, `revision`) on the Airys Platform API (`GET /health` on `AIRYS_PLATFORM_URL`, default `https://api.airys.chat`). Requires no token.',
    inputSchema: z.object({}),
    outputSchema: platformHealthOutputSchema,
    async handler(_args, context) {
      const client = getPlatformClient(context);
      const data = await client.request<Record<string, unknown>>('/health', { auth: false });
      return trustedJson(data);
    },
  }),

  defineTool({
    name: 'platform_signals_attribution_list',
    stability: 'beta',
    title: 'List ad touches attributed to a contact on Airys Platform',
    description:
      'Lists Meta ad touches (Click-to-WhatsApp `ctwa_clid`, Click-to-Messenger, Click-to-Instagram) attributed to a contact (`GET /v1/signals/attribution` on `api.airys.chat`, max 100 newest first). Requires `AIRYS_API_TOKEN`. Ad headlines, URLs, and referral payloads are fenced as untrusted.',
    inputSchema: z.object({
      contact_key: z
        .string()
        .min(1)
        .max(128)
        .describe('Contact identifier (`wa_id` digits/E.164 on WhatsApp, `psid` on Messenger, or `igsid` on Instagram)'),
      channel: z
        .enum(['whatsapp', 'messenger', 'instagram'])
        .optional()
        .describe('Optional channel filter (`whatsapp`, `messenger`, or `instagram`)'),
    }),
    async handler(args, context) {
      const client = getPlatformClient(context);
      const data = await client.request('/v1/signals/attribution', {
        query: {
          contact_key: args.contact_key,
          channel: args.channel,
        },
      });
      return untrustedJson(data);
    },
  }),

  defineTool({
    name: 'platform_signals_outcome_record',
    stability: 'beta',
    title: 'Record a Business Messaging conversion outcome on Airys Platform',
    description:
      'Records an idempotent conversion outcome (`POST /v1/signals/outcomes` on `api.airys.chat`) for Meta Business Messaging Conversions API attribution. Repeating the same `(source, event_id)` is safe and returns the existing `outcome_id`. Requires `AIRYS_API_TOKEN`.',
    write: true,
    idempotent: true,
    inputSchema: z.object({
      event_id: z
        .string()
        .min(1)
        .max(255)
        .describe('Idempotency key for this conversion event (e.g. CRM deal stage transition ID or order ID)'),
      source: z
        .enum(['crm', 'api'])
        .optional()
        .describe('Origin of the conversion report (`crm` or `api`, default `api`)'),
      event_name: z
        .enum(BUSINESS_MESSAGING_EVENTS)
        .describe('Meta Business Messaging standard event name (`Purchase`, `LeadSubmitted`, `QualifiedLead`, etc.)'),
      event_time: z
        .string()
        .min(1)
        .describe('ISO-8601 timestamp when the conversion occurred (e.g. `2026-10-28T12:00:00Z`)'),
      channel: z
        .enum(['whatsapp', 'messenger', 'instagram'])
        .optional()
        .describe('Optional messaging channel (`whatsapp`, `messenger`, or `instagram`)'),
      click: z
        .object({
          ctwa_clid: z.string().min(1).max(512).optional(),
          ad_id: z.string().min(1).max(64).optional(),
          ref: z.string().min(1).max(255).optional(),
          page_id: z.string().min(1).max(64).optional(),
          psid: z.string().min(1).max(64).optional(),
          ig_id: z.string().min(1).max(64).optional(),
          igsid: z.string().min(1).max(64).optional(),
          waba_id: z.string().min(1).max(64).optional(),
          wa_id: z.string().min(1).max(64).optional(),
        })
        .optional()
        .describe('Ad click or thread identifiers used to match the originating touch'),
      value: z
        .number()
        .nonnegative()
        .optional()
        .describe('Monetary conversion value (requires `currency` when provided)'),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter uppercase ISO-4217 code such as BRL or USD')
        .optional()
        .describe('3-letter uppercase ISO-4217 currency code (required when `value` is present, e.g. `BRL`)'),
      deal: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Optional CRM deal context (`{ id, stage, status, ... }`)'),
    }),
    async handler(args, context) {
      if (args.value !== undefined && !args.currency) {
        return failure('validation_error', 'currency is required when value is provided (e.g. "BRL" or "USD").');
      }
      const client = getPlatformClient(context);
      const data = await client.request('/v1/signals/outcomes', {
        method: 'POST',
        body: {
          event_id: args.event_id,
          source: args.source ?? 'api',
          event_name: args.event_name,
          event_time: args.event_time,
          ...(args.channel ? { channel: args.channel } : {}),
          ...(args.click ? { click: args.click } : {}),
          ...(args.value !== undefined ? { value: args.value } : {}),
          ...(args.currency ? { currency: args.currency } : {}),
          ...(args.deal ? { deal: args.deal } : {}),
        },
      });
      return trustedJson(data);
    },
  }),

  // --- Control-plane Management API endpoints (`PLAT-8.1..PLAT-8.5` in AirysBR/Airys-AI) ---

  defineTool({
    name: 'platform_numbers_health',
    stability: 'experimental',
    title: 'List cross-instance WhatsApp number health on Airys Platform',
    description:
      'Queries cross-instance WhatsApp number state from the Airys control plane (`GET /v1/numbers` on `api.airys.chat`, `PLAT-8.1`): `status`, `quality_rating` (`GREEN`|`YELLOW`|`RED`), `messaging_limit`, `health_can_send` (`AVAILABLE`|`LIMITED`|`BLOCKED`), `health_errors`, and serving channels. Requires `AIRYS_API_TOKEN`.',
    inputSchema: z.object({
      tenant_id: z.string().optional().describe('Optional instance tenant ID filter (e.g. `airys-chat`, `airys-staging`)'),
      waba_id: z.string().optional().describe('Optional WhatsApp Business Account ID filter'),
      phone_number_id: z.string().optional().describe('Optional Meta phone_number_id filter'),
      quality_rating: z.enum(['GREEN', 'YELLOW', 'RED', 'UNKNOWN']).optional().describe('Optional quality rating filter'),
      health_can_send: z.enum(['AVAILABLE', 'LIMITED', 'BLOCKED']).optional().describe('Optional sending health filter'),
    }),
    async handler(args, context) {
      const client = getPlatformClient(context);
      try {
        const data = await client.request('/v1/numbers', {
          query: {
            tenant_id: args.tenant_id,
            waba_id: args.waba_id,
            phone_number_id: args.phone_number_id,
            quality_rating: args.quality_rating,
            health_can_send: args.health_can_send,
          },
        });
        return untrustedJson(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return failure(
            'not_yet_deployed_on_platform',
            'GET /v1/numbers is tracked in airys-platform milestone M2 (PLAT-8.1). Until it ships on api.airys.chat, use `wa_health` and `inboxes_list` for per-instance WhatsApp health.',
          );
        }
        throw err;
      }
    },
  }),

  defineTool({
    name: 'platform_alerts_list',
    stability: 'experimental',
    title: 'List control-plane alerts on Airys Platform',
    description:
      'Lists open or resolved alerts from the Airys control plane (`GET /v1/alerts` on `api.airys.chat`, `PLAT-4.3` / `PLAT-8.1`) across the 13 health rules (`instance_silent`, `channel_token_invalid`, `channel_ids_stale`, `channel_phone_mismatch`, `number_banned`, `number_cannot_send`, `number_quality_red`, `number_unowned`, `number_claimed_twice`, `token_expiring`, `webhook_jobs_dying`, `dead_set_full`, `callback_dead`). Requires `AIRYS_API_TOKEN`.',
    inputSchema: z.object({
      status: z.enum(['open', 'resolved', 'all']).optional().describe('Filter by alert status (default `open`)'),
      severity: z.enum(['critical', 'warning', 'info']).optional().describe('Filter by alert severity'),
      rule: z.enum(PLATFORM_ALERT_RULES).optional().describe('Filter by alert rule name'),
      entity_type: z
        .enum(['tenant', 'channel', 'phone_number', 'token', 'tenant_number', 'callback_host'])
        .optional()
        .describe('Filter by entity type'),
      entity_id: z.string().optional().describe('Filter by entity ID (e.g. tenant_id or phone_number_id)'),
    }),
    async handler(args, context) {
      const client = getPlatformClient(context);
      try {
        const data = await client.request('/v1/alerts', {
          query: {
            status: args.status,
            severity: args.severity,
            rule: args.rule,
            entity_type: args.entity_type,
            entity_id: args.entity_id,
          },
        });
        return untrustedJson(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return failure(
            'not_yet_deployed_on_platform',
            'GET /v1/alerts is tracked in airys-platform milestone M2 (PLAT-8.1). Until it ships on api.airys.chat, use `wa_health` and `wa_template_quality` on each instance.',
          );
        }
        throw err;
      }
    },
  }),

  defineTool({
    name: 'platform_instances_list',
    stability: 'experimental',
    title: 'List registered AirysChat instances on Airys Platform',
    description:
      'Lists AirysChat instances (`meta.tenants`) registered with the Airys control plane (`GET /v1/instances` on `api.airys.chat`, `PLAT-8.1`), including `last_inventory_at`, reported channel counts, and webhook dead/retry job counts. Requires `AIRYS_API_TOKEN`.',
    inputSchema: z.object({
      environment: z.enum(['staging', 'prod']).optional().describe('Optional environment filter'),
      active_only: z.boolean().optional().describe('When true, only return active tenants'),
    }),
    async handler(args, context) {
      const client = getPlatformClient(context);
      try {
        const data = await client.request('/v1/instances', {
          query: {
            environment: args.environment,
            active_only: args.active_only,
          },
        });
        return untrustedJson(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return failure(
            'not_yet_deployed_on_platform',
            'GET /v1/instances is tracked in airys-platform milestone M2 (PLAT-8.1).',
          );
        }
        throw err;
      }
    },
  }),

  defineTool({
    name: 'platform_usage',
    stability: 'experimental',
    title: 'Get cross-instance WhatsApp usage and cost on Airys Platform',
    description:
      'Queries metered WhatsApp message volume and Meta cost per number and pricing category (`GET /v1/usage` on `api.airys.chat`, `PLAT-8.5` / `PLAT-11.1`). Requires `AIRYS_API_TOKEN`.',
    inputSchema: z.object({
      tenant_id: z.string().optional().describe('Optional tenant ID filter'),
      waba_id: z.string().optional().describe('Optional WABA ID filter'),
      phone_number_id: z.string().optional().describe('Optional phone_number_id filter'),
      since: z.string().optional().describe('Start date (ISO-8601 `YYYY-MM-DD`)'),
      until: z.string().optional().describe('End date (ISO-8601 `YYYY-MM-DD`)'),
      category: z
        .enum(['MARKETING', 'UTILITY', 'AUTHENTICATION', 'SERVICE'])
        .optional()
        .describe('Optional Meta conversation/pricing category filter'),
    }),
    async handler(args, context) {
      const client = getPlatformClient(context);
      try {
        const data = await client.request('/v1/usage', {
          query: {
            tenant_id: args.tenant_id,
            waba_id: args.waba_id,
            phone_number_id: args.phone_number_id,
            since: args.since,
            until: args.until,
            category: args.category,
          },
        });
        return trustedJson(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return failure(
            'not_yet_deployed_on_platform',
            'GET /v1/usage is tracked in airys-platform milestone M2/M4 (PLAT-8.5 / PLAT-11.1).',
          );
        }
        throw err;
      }
    },
  }),
];
