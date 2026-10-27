/**
 * Native CRM v2 toolset (`AIRYSCHAT_TOOLSETS=crm` or `core,whatsapp,crm`).
 *
 * All endpoints live under `/saas/api/v1/accounts/:account_id` (`prefix: 'saas'`).
 * Deal, note, timeline, and activity payloads carry customer- or seller-authored text
 * and therefore always return through `untrustedJson`.
 */

import { z } from 'zod';
import { defineTool } from '../toolsets.js';
import { json, untrustedJson } from '../result.js';

export const crmTools = [
  defineTool({
    name: 'crm_pipelines_list',
    stability: 'beta',
    title: 'List CRM sales pipelines',
    description:
      'List all sales pipelines configured on the account. Returns a bare array of pipelines (`id`, `name`, `description`). ' +
      'To inspect a pipeline together with its ordered stages, call `crm_pipeline_get`.',
    inputSchema: z.object({}),
    outputSchema: z.array(z.record(z.string(), z.unknown())),
    handler: async (_args, { client }) => json(await client.request('/pipelines', { prefix: 'saas' })),
  }),

  defineTool({
    name: 'crm_pipeline_get',
    stability: 'beta',
    title: 'Get a CRM pipeline and its stages',
    description:
      'Fetch one sales pipeline by ID along with its ordered stages (`id`, `name`, `color`, `position`, `stage_type`, ' +
      '`probability`, `stale_after_days`, `conversion_event_name`, `required_fields`).',
    inputSchema: z.object({
      pipeline_id: z.number().int().describe('Pipeline ID from crm_pipelines_list'),
    }),
    outputSchema: z
      .object({
        pipeline: z.record(z.string(), z.unknown()),
        stages: z.array(z.record(z.string(), z.unknown())),
      })
      .loose(),
    handler: async ({ pipeline_id }, { client }) => {
      const [pipeline, stages] = await Promise.all([
        client.request(`/pipelines/${pipeline_id}`, { prefix: 'saas' }),
        client.request(`/pipelines/${pipeline_id}/pipeline_stages`, { prefix: 'saas' }),
      ]);
      return json({
        pipeline: (pipeline ?? {}) as Record<string, unknown>,
        stages: Array.isArray(stages) ? stages : [],
      });
    },
  }),

  defineTool({
    name: 'crm_deals_search',
    stability: 'beta',
    title: 'List or search CRM deals',
    description:
      'List or search CRM deals. By default uses `view: "list"` for flat pagination across deals (`payload` + `meta` with ' +
      '`counts_by_stage`, `sums_by_stage`, `totals`, `won_this_month`). Pass `view: "board"` to fetch up to `per_page` cards ' +
      'per stage. Pass `without_activity: true` (or `quick_search: true`) to query `/crm_deals/search` for up to 20 open deals ' +
      'matching `q` or lacking a scheduled activity.',
    inputSchema: z.object({
      pipeline_id: z.number().int().optional().describe('Filter by sales pipeline ID'),
      stage_id: z.number().int().optional().describe('Filter by a single pipeline stage ID'),
      stage_ids: z.array(z.number().int()).optional().describe('Filter by multiple stage IDs'),
      owner_id: z.number().int().optional().describe('Filter by deal owner user ID'),
      status: z.enum(['open', 'won', 'lost']).optional().describe('Filter by deal status'),
      inbox_id: z.number().int().optional().describe('Filter by conversation inbox ID'),
      labels: z.array(z.string()).optional().describe('Filter by conversation labels'),
      q: z.string().optional().describe('Search deal title, product name, or contact name/phone/email'),
      view: z.enum(['list', 'board']).optional().describe('Defaults to "list" for flat pagination; "board" partitions per stage'),
      without_activity: z
        .boolean()
        .optional()
        .describe('When true, calls /crm_deals/search to return open deals with no pending activity'),
      quick_search: z
        .boolean()
        .optional()
        .describe('When true, calls /crm_deals/search (up to 20 open deals)'),
      per_page: z.number().int().min(1).max(100).optional().describe('Max 100, default 50'),
      offset: z.number().int().min(0).optional(),
      page: z.number().int().min(1).optional(),
      sort: z.string().optional(),
    }),
    handler: async (args, { client }) => {
      const { without_activity, quick_search, view, ...rest } = args;
      if (without_activity || quick_search) {
        return untrustedJson(
          await client.request('/crm_deals/search', {
            prefix: 'saas',
            query: {
              q: rest.q,
              owner_id: rest.owner_id,
              without_activity: without_activity ? 'true' : undefined,
            },
          }),
        );
      }
      return untrustedJson(
        await client.request('/crm_deals', {
          prefix: 'saas',
          query: { view: view ?? 'list', ...rest },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_deal_get',
    stability: 'beta',
    title: 'Get a CRM deal',
    description:
      'Fetch one CRM deal by ID, including its stage, pipeline, owner, contact summary, linked conversation, and next activity.',
    inputSchema: z.object({
      deal_id: z.number().int().describe('CRM deal ID'),
    }),
    handler: async ({ deal_id }, { client }) =>
      untrustedJson(await client.request(`/crm_deals/${deal_id}`, { prefix: 'saas' })),
  }),

  defineTool({
    name: 'crm_deal_timeline',
    stability: 'beta',
    title: 'Get a CRM deal timeline',
    description:
      'Fetch the chronological event timeline for a CRM deal (stage transitions, notes, activities, messages, CAPI events). ' +
      'Optionally filter by `types` or paginate backwards with `before`.',
    inputSchema: z.object({
      deal_id: z.number().int().describe('CRM deal ID'),
      types: z.array(z.string()).optional().describe('Optional event type filter'),
      before: z.string().optional().describe('Cursor timestamp/ID to page older events'),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    handler: async ({ deal_id, types, before, limit }, { client }) =>
      untrustedJson(
        await client.request(`/crm_deals/${deal_id}/timeline`, {
          prefix: 'saas',
          query: { types, before, limit },
        }),
      ),
  }),

  defineTool({
    name: 'crm_insights',
    stability: 'beta',
    title: 'Get CRM dashboard and origin results insights',
    description:
      'Fetch CRM analytics. With `report: "dashboard"` (default), calls `/crm_dashboard` (requires the ' +
      '`crm_management_dashboard` feature flag on the account; returns 403 plan gate if disabled). With `report: "results"`, ' +
      'calls `/crm_results` for win/loss and revenue breakdown by origin channel and pipeline.',
    inputSchema: z.object({
      report: z.enum(['dashboard', 'results']).optional().describe('Defaults to "dashboard"'),
      days: z.enum(['7', '30', '90']).optional().describe('Lookback window in days (7, 30, or 90; default 30)'),
      pipeline_id: z.number().int().optional().describe('Filter results report by pipeline ID'),
      owner_id: z.number().int().optional().describe('Filter by deal owner user ID'),
      source_channel: z.string().optional().describe('Filter results report by origin channel'),
      time_zone: z.string().optional().describe('IANA time zone name for dashboard aggregation'),
      business_hours: z.boolean().optional().describe('When true on dashboard, compute metrics within CRM business hours'),
    }),
    handler: async ({ report = 'dashboard', days, pipeline_id, owner_id, source_channel, time_zone, business_hours }, { client }) => {
      if (report === 'results') {
        return json(
          await client.request('/crm_results', {
            prefix: 'saas',
            query: { days: days ? Number(days) : undefined, pipeline_id, owner_id, source_channel },
          }),
        );
      }
      return json(
        await client.request('/crm_dashboard', {
          prefix: 'saas',
          query: {
            days: days ? Number(days) : undefined,
            owner_id,
            time_zone,
            business_hours: business_hours !== undefined ? String(business_hours) : undefined,
          },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_close_reasons_list',
    stability: 'beta',
    title: 'List CRM closure reasons',
    description:
      'List configured won/lost closure reasons on the account (`/closure_reasons`). Auto-seeds default reasons if the account ' +
      'has none yet. Use the returned `id` when closing a deal as lost (`lost_reason_id`).',
    inputSchema: z.object({
      reason_type: z.enum(['lost', 'won']).optional().describe('Optional client-side filter by reason_type'),
    }),
    handler: async ({ reason_type }, { client }) => {
      const reasons = await client.request('/closure_reasons', { prefix: 'saas' });
      if (reason_type && Array.isArray(reasons)) {
        return json(reasons.filter((item: Record<string, unknown>) => item?.reason_type === reason_type));
      }
      return json(reasons);
    },
  }),

  defineTool({
    name: 'crm_loss_reasons_list',
    stability: 'beta',
    title: 'List CRM loss reasons with 90-day usage breakdown',
    description:
      'Fetch loss reasons on the account along with 90-day usage counts and percentage share (`/crm_deals/loss_reasons`). ' +
      'Use the returned reason `id` as `lost_reason_id` when calling `crm_deal_close` with `outcome: "lost"`.',
    inputSchema: z.object({}),
    handler: async (_args, { client }) => json(await client.request('/crm_deals/loss_reasons', { prefix: 'saas' })),
  }),

  defineTool({
    name: 'crm_views_list',
    stability: 'beta',
    title: 'List CRM saved views',
    description:
      'List saved CRM board/list views visible to the authenticated user (personal views and views shared with the account).',
    inputSchema: z.object({}),
    handler: async (_args, { client }) => json(await client.request('/crm_saved_views', { prefix: 'saas' })),
  }),
];
