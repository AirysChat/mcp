/**
 * Native CRM v2 toolset (`AIRYSCHAT_TOOLSETS=crm` or `core,whatsapp,crm`).
 *
 * All endpoints live under `/saas/api/v1/accounts/:account_id` (`prefix: 'saas'`).
 * Deal, note, timeline, and activity payloads carry customer- or seller-authored text
 * and therefore always return through `untrustedJson`.
 */

import { z } from 'zod';
import { defineTool } from '../toolsets.js';
import { failure, json, requireConfirmation, untrustedJson } from '../result.js';

const ISO_TIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const BULK_CONFIRM_THRESHOLD = 5;

function validateIsoOffset(field: string, value: string | undefined) {
  if (!value) return null;
  if (!ISO_TIME_WITH_OFFSET.test(value)) {
    return failure(
      `${field} ("${value}") must be an ISO-8601 timestamp with an explicit UTC offset (e.g. "2026-11-01T14:00:00-03:00" or "2026-11-01T17:00:00Z").`,
    );
  }
  return null;
}

export const crmTools = [
  defineTool({
    name: 'crm_pipelines_list',
    stability: 'stable',
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
    stability: 'stable',
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
    stability: 'stable',
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
      owner_id: z.union([z.number().int(), z.literal('me'), z.literal('none')]).optional().describe('Filter by deal owner user ID, "me", or "none"'),
      status: z.enum(['active', 'open', 'won', 'lost']).optional().describe('Filter by deal status ("active"/"open", "won", or "lost")'),
      stale: z.boolean().optional().describe('When true, returns only open deals idle longer than their stage stale_after_days'),
      inbox_id: z.number().int().optional().describe('Filter by conversation inbox ID'),
      labels: z.array(z.string()).optional().describe('Filter by conversation labels'),
      q: z.string().optional().describe('Search deal title, product name, or contact name/phone/email'),
      view: z.enum(['list', 'board']).optional().describe('Defaults to "list" for flat pagination; "board" partitions per stage'),
      without_activity: z
        .boolean()
        .optional()
        .describe('When true, calls /crm_deals/search (no_activity=true) to return open deals with no pending activity'),
      quick_search: z
        .boolean()
        .optional()
        .describe('When true, calls /crm_deals/search (up to 20 open deals)'),
      per_page: z.number().int().min(1).max(100).optional().describe('Max 100, default 50'),
      offset: z.number().int().min(0).optional(),
      page: z.number().int().min(1).optional(),
      sort: z
        .string()
        .optional()
        .describe(
          'Sort key (prefix with "-" for descending): amount, created_at, title, expected_close_on, probability, last_interaction_at, days_in_stage, stage, next_activity',
        ),
    }),
    handler: async (args, { client }) => {
      const { without_activity, quick_search, view, status, stale, ...rest } = args;
      const normalizedStatus = status === 'open' ? 'active' : status;
      if (without_activity || quick_search) {
        return untrustedJson(
          await client.request('/crm_deals/search', {
            prefix: 'saas',
            query: {
              q: rest.q,
              pipeline_id: rest.pipeline_id,
              owner_id: rest.owner_id,
              no_activity: without_activity ? 'true' : undefined,
            },
          }),
        );
      }
      return untrustedJson(
        await client.request('/crm_deals', {
          prefix: 'saas',
          query: {
            view: view ?? 'list',
            ...rest,
            status: normalizedStatus,
            stale: stale ? 'true' : undefined,
          },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_deal_get',
    stability: 'stable',
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
    stability: 'stable',
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
    name: 'crm_deal_create',
    stability: 'beta',
    title: 'Create a CRM deal',
    description:
      'Create a new CRM deal in a pipeline stage. `amount_cents` is in integer minor units (e.g. 150000 = R$ 1.500,00). ' +
      'To link a conversation, prefer `conversation_display_id` (the number shown in the UI and returned by `conversations_list`).',
    write: true,
    inputSchema: z.object({
      title: z.string().min(1).describe('Deal title'),
      contact_id: z.number().int().describe('Contact ID'),
      saas_pipeline_id: z.number().int().describe('Sales pipeline ID'),
      saas_pipeline_stage_id: z.number().int().describe('Initial pipeline stage ID'),
      conversation_display_id: z.number().int().optional().describe('Account-scoped conversation display ID'),
      conversation_id: z.number().int().optional().describe('Conversation primary key or display ID'),
      owner_id: z.number().int().nullable().optional().describe('Assigned seller user ID'),
      amount_cents: z.number().int().min(0).optional().describe('Deal value in integer cents'),
      currency: z.string().optional().describe('ISO currency code, default BRL'),
      product_name: z.string().optional().describe('Product or service name'),
      probability: z.number().int().min(0).max(100).optional().describe('Win probability percentage (0-100)'),
      expected_close_on: z.string().optional().describe('Expected close date (YYYY-MM-DD)'),
      position: z.number().int().min(0).optional(),
    }),
    handler: async (args, { client }) =>
      untrustedJson(
        await client.request('/crm_deals', {
          prefix: 'saas',
          method: 'POST',
          body: { crm_deal: args },
        }),
      ),
  }),

  defineTool({
    name: 'crm_deal_update',
    stability: 'beta',
    title: 'Update a CRM deal',
    description:
      'Update fields on an existing CRM deal (`title`, `amount_cents`, `product_name`, `owner_id`, `expected_close_on`, `probability`). ' +
      'To move a deal between stages use `crm_deal_move`; to close as won/lost use `crm_deal_close`.',
    write: true,
    inputSchema: z.object({
      deal_id: z.number().int().describe('CRM deal ID'),
      title: z.string().min(1).optional(),
      contact_id: z.number().int().optional(),
      conversation_display_id: z.number().int().optional(),
      conversation_id: z.number().int().nullable().optional(),
      owner_id: z.number().int().nullable().optional().describe('null unassigns'),
      amount_cents: z.number().int().min(0).nullable().optional().describe('Deal value in integer cents'),
      currency: z.string().optional(),
      product_name: z.string().nullable().optional(),
      probability: z.number().int().min(0).max(100).nullable().optional(),
      expected_close_on: z.string().nullable().optional().describe('YYYY-MM-DD'),
      position: z.number().int().min(0).optional(),
    }),
    handler: async ({ deal_id, ...fields }, { client }) => {
      if (Object.keys(fields).length === 0) {
        return json({ changed: false, reason: 'No deal fields to update were provided.' });
      }
      return untrustedJson(
        await client.request(`/crm_deals/${deal_id}`, {
          prefix: 'saas',
          method: 'PATCH',
          body: { crm_deal: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_deal_move',
    stability: 'beta',
    title: 'Move a CRM deal to another open stage',
    description:
      'Move a CRM deal to an open pipeline stage `saas_pipeline_stage_id` (`/crm_deals/:id/move`). Enforces any `required_fields` ' +
      'configured on the target stage (returns 422 with `missing_fields` if unmet) and triggers stage entry automations. ' +
      'Refuses moving to a `won` or `lost` closing stage — use `crm_deal_close` instead so closing requirements and Meta CAPI ' +
      'confirmation are enforced.',
    write: true,
    inputSchema: z.object({
      deal_id: z.number().int().describe('CRM deal ID'),
      saas_pipeline_stage_id: z.number().int().describe('Destination open pipeline stage ID'),
      after_deal_id: z.number().int().optional().describe('Place card after this deal ID in the stage column'),
      position: z.number().int().min(0).optional(),
      amount_cents: z.number().int().min(0).optional().describe('Supply if required by the destination stage'),
    }),
    handler: async ({ deal_id, ...body }, { client }) => {
      const deal = (await client.request(`/crm_deals/${deal_id}`, { prefix: 'saas' })) as Record<string, unknown> | null;
      const stages = ((deal?.pipeline as Record<string, unknown> | undefined)?.stages ?? []) as Array<Record<string, unknown>>;
      const targetStage = stages.find((s) => s?.id === body.saas_pipeline_stage_id);
      if (targetStage && (targetStage.stage_type === 'won' || targetStage.stage_type === 'lost')) {
        return failure(
          `Stage #${body.saas_pipeline_stage_id} ("${String(targetStage.name ?? '')}") has stage_type "${String(targetStage.stage_type)}". ` +
            'Use `crm_deal_close` to mark a deal won or lost so closing requirements and Meta Conversions API confirmation are enforced.',
        );
      }
      return untrustedJson(
        await client.request(`/crm_deals/${deal_id}/move`, {
          prefix: 'saas',
          method: 'PATCH',
          body,
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_deal_close',
    stability: 'beta',
    title: 'Close a CRM deal as won or lost',
    description:
      'Close a CRM deal as `won` (`/crm_deals/:id/won`) or `lost` (`/crm_deals/:id/lost`). IRREVERSIBLE: marking a deal `won` ' +
      'records revenue and MAY SEND A META CONVERSIONS API (CAPI) `Purchase` EVENT to Meta when conversion tracking is configured ' +
      'or `send_conversion_event: true`. Marking `lost` requires `lost_reason_id` from `crm_loss_reasons_list` or ' +
      '`crm_close_reasons_list`. Always requires `confirm: true`; call without `confirm` first to inspect the server-derived preview.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      deal_id: z.number().int().describe('CRM deal ID'),
      outcome: z.enum(['won', 'lost']).describe('Close outcome: "won" or "lost"'),
      stage_id: z.number().int().optional().describe('Optional target won/lost stage ID'),
      amount_cents: z.number().int().min(0).optional().describe('Final deal value in integer cents (won)'),
      product_name: z.string().optional().describe('Final product name (won)'),
      won_on: z.string().optional().describe('Won date YYYY-MM-DD (won)'),
      send_conversion_event: z
        .boolean()
        .optional()
        .describe('When true on won, dispatches a Meta Conversions API Purchase event (or false to suppress)'),
      lost_reason_id: z
        .number()
        .int()
        .optional()
        .describe('Required when outcome is "lost" — ID from crm_loss_reasons_list / crm_close_reasons_list'),
      lost_comment: z.string().optional().describe('Optional explanation when outcome is "lost"'),
      reopen_on: z.string().optional().describe('Optional date (YYYY-MM-DD) to automatically reopen a lost deal'),
      reopen_owner_id: z.number().int().optional().describe('Owner user ID when reopening'),
      resolve_conversation: z.boolean().optional().describe('When true, also resolves the linked conversation'),
      confirm: z.boolean().optional().describe('Set true only after the user confirms the exact preview'),
    }),
    handler: async (args, { client }) => {
      const {
        deal_id,
        outcome,
        stage_id,
        amount_cents,
        product_name,
        won_on,
        send_conversion_event,
        lost_reason_id,
        lost_comment,
        reopen_on,
        reopen_owner_id,
        resolve_conversation,
        confirm,
      } = args;

      if (outcome === 'lost' && !lost_reason_id) {
        return failure(
          'Closing a deal as "lost" requires `lost_reason_id`. Call `crm_loss_reasons_list` or `crm_close_reasons_list` first to pick a valid reason ID.',
        );
      }

      if (!confirm) {
        const deal = (await client.request(`/crm_deals/${deal_id}`, { prefix: 'saas' })) as Record<string, unknown> | null;
        const title = String(deal?.title ?? `#${deal_id}`);
        const contact = (deal?.contact as Record<string, unknown> | undefined)?.name ?? 'unknown contact';
        const effectiveAmount = amount_cents ?? (deal?.amount_cents as number | undefined) ?? 0;
        const currency = String(deal?.currency ?? 'BRL');
        const effect =
          outcome === 'won'
            ? `Deal #${deal_id} ("${title}", contact: ${contact}, amount_cents: ${effectiveAmount} ${currency}) will be closed as WON` +
              `${resolve_conversation ? ', its linked conversation will be resolved,' : ''} and ` +
              `${send_conversion_event === false ? 'Meta CAPI dispatch is suppressed (send_conversion_event=false)' : 'a Meta Conversions API (CAPI) Purchase event MAY BE SENT TO META if configured on the stage/inbox'}.`
            : `Deal #${deal_id} ("${title}", contact: ${contact}) will be closed as LOST (lost_reason_id: ${lost_reason_id}` +
              `${lost_comment ? `, comment: "${lost_comment}"` : ''})` +
              `${resolve_conversation ? ' and its linked conversation will be resolved' : ''}.`;
        const refusal = requireConfirmation(confirm, effect);
        if (refusal) return refusal;
      }

      if (outcome === 'won') {
        return untrustedJson(
          await client.request(`/crm_deals/${deal_id}/won`, {
            prefix: 'saas',
            method: 'POST',
            body: { stage_id, amount_cents, product_name, won_on, resolve_conversation, send_conversion_event },
          }),
        );
      }
      return untrustedJson(
        await client.request(`/crm_deals/${deal_id}/lost`, {
          prefix: 'saas',
          method: 'POST',
          body: { stage_id, lost_reason_id, lost_comment, resolve_conversation, reopen_on, reopen_owner_id },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_deal_delete',
    stability: 'beta',
    title: 'Delete a CRM deal',
    description:
      'Permanently delete a CRM deal (`/crm_deals/:id`). Admin-only (`account:update?`). IRREVERSIBLE: deletes the deal, its ' +
      'notes, and its scheduled activities. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      deal_id: z.number().int().describe('CRM deal ID to delete'),
      confirm: z.boolean().optional().describe('Required to confirm permanent deletion'),
    }),
    handler: async ({ deal_id, confirm }, { client }) => {
      if (!confirm) {
        const deal = (await client.request(`/crm_deals/${deal_id}`, { prefix: 'saas' })) as Record<string, unknown> | null;
        const title = String(deal?.title ?? `#${deal_id}`);
        const contact = (deal?.contact as Record<string, unknown> | undefined)?.name ?? 'unknown contact';
        const refusal = requireConfirmation(
          confirm,
          `Deal #${deal_id} ("${title}", contact: ${contact}) and all of its notes and activities will be permanently deleted.`,
        );
        if (refusal) return refusal;
      }
      await client.request(`/crm_deals/${deal_id}`, { prefix: 'saas', method: 'DELETE' });
      return json({ deleted: true, deal_id });
    },
  }),

  defineTool({
    name: 'crm_deals_bulk_update',
    stability: 'beta',
    title: 'Bulk update CRM deals',
    description:
      'Run a bulk operation across up to 50 CRM deals (`/crm_deals/bulk`): `move_stage`, `assign_owner`, `add_labels`, ' +
      '`mark_lost`, or `delete` (admin-only). Requires `confirm: true` whenever modifying more than 5 deals at once, or for ' +
      '`mark_lost` / `delete` at any count.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      operation: z.enum(['move_stage', 'assign_owner', 'add_labels', 'mark_lost', 'delete']),
      ids: z.array(z.number().int()).min(1).max(50).describe('Deal IDs (1..50)'),
      stage_id: z.number().int().optional().describe('Required for move_stage'),
      owner_id: z.number().int().nullable().optional().describe('Required for assign_owner (null to unassign)'),
      labels: z.array(z.string()).optional().describe('Required for add_labels'),
      lost_reason_id: z.number().int().optional().describe('Required for mark_lost'),
      lost_comment: z.string().optional(),
      confirm: z
        .boolean()
        .optional()
        .describe(`Required when ids.length > ${BULK_CONFIRM_THRESHOLD} or operation is mark_lost / delete`),
    }),
    handler: async (args, { client }) => {
      const { operation, ids, stage_id, owner_id, labels, lost_reason_id, lost_comment, confirm } = args;

      if (operation === 'move_stage' && !stage_id) {
        return failure('Bulk `move_stage` requires `stage_id`.');
      }
      if (operation === 'assign_owner' && owner_id === undefined) {
        return failure('Bulk `assign_owner` requires `owner_id` (pass a user ID or null to unassign).');
      }
      if (operation === 'add_labels' && (!labels || labels.length === 0)) {
        return failure('Bulk `add_labels` requires a non-empty `labels` array.');
      }
      if (operation === 'mark_lost' && !lost_reason_id) {
        return failure('Bulk `mark_lost` requires `lost_reason_id`.');
      }

      const needsConfirm =
        ids.length > BULK_CONFIRM_THRESHOLD || operation === 'delete' || operation === 'mark_lost';
      if (needsConfirm) {
        const refusal = requireConfirmation(
          confirm,
          `Bulk operation "${operation}" will modify ${ids.length} deal(s) [${ids.join(', ')}].`,
        );
        if (refusal) return refusal;
      }

      return json(
        await client.request('/crm_deals/bulk', {
          prefix: 'saas',
          method: 'POST',
          body: { operation, ids, stage_id, owner_id, labels, lost_reason_id, lost_comment },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_deal_notes_list',
    stability: 'stable',
    title: 'List notes on a CRM deal',
    description: 'List notes on a CRM deal, newest first (`/crm_deals/:crm_deal_id/notes`).',
    inputSchema: z.object({
      deal_id: z.number().int().describe('CRM deal ID'),
    }),
    handler: async ({ deal_id }, { client }) =>
      untrustedJson(await client.request(`/crm_deals/${deal_id}/notes`, { prefix: 'saas' })),
  }),

  defineTool({
    name: 'crm_deal_note_create',
    stability: 'beta',
    title: 'Add a note to a CRM deal',
    description: 'Create a note on a CRM deal (`/crm_deals/:crm_deal_id/notes`).',
    write: true,
    inputSchema: z.object({
      deal_id: z.number().int().describe('CRM deal ID'),
      content: z.string().min(1).describe('Note text'),
    }),
    handler: async ({ deal_id, content }, { client }) =>
      untrustedJson(
        await client.request(`/crm_deals/${deal_id}/notes`, {
          prefix: 'saas',
          method: 'POST',
          body: { content },
        }),
      ),
  }),

  defineTool({
    name: 'crm_deal_note_update',
    stability: 'beta',
    title: 'Update a note on a CRM deal',
    description: 'Update an existing deal note (`/crm_deals/:crm_deal_id/notes/:id`). Only the note author or an admin may edit.',
    write: true,
    inputSchema: z.object({
      deal_id: z.number().int().describe('CRM deal ID'),
      note_id: z.number().int().describe('Note ID'),
      content: z.string().min(1).describe('Updated note text'),
    }),
    handler: async ({ deal_id, note_id, content }, { client }) =>
      untrustedJson(
        await client.request(`/crm_deals/${deal_id}/notes/${note_id}`, {
          prefix: 'saas',
          method: 'PATCH',
          body: { content },
        }),
      ),
  }),

  defineTool({
    name: 'crm_deal_note_delete',
    stability: 'beta',
    title: 'Delete a note on a CRM deal',
    description:
      'Permanently delete a deal note (`/crm_deals/:crm_deal_id/notes/:id`). Only the author or an admin may delete. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      deal_id: z.number().int().describe('CRM deal ID'),
      note_id: z.number().int().describe('Note ID'),
      confirm: z.boolean().optional().describe('Required to confirm deletion'),
    }),
    handler: async ({ deal_id, note_id, confirm }, { client }) => {
      const refusal = requireConfirmation(confirm, `Note #${note_id} on deal #${deal_id} will be permanently deleted.`);
      if (refusal) return refusal;
      await client.request(`/crm_deals/${deal_id}/notes/${note_id}`, { prefix: 'saas', method: 'DELETE' });
      return json({ deleted: true, deal_id, note_id });
    },
  }),

  defineTool({
    name: 'crm_activities_list',
    stability: 'stable',
    title: 'List or get CRM activities',
    description:
      'List the seller activity queue or fetch one activity by `activity_id` (`/crm_activities`). List responses include ' +
      '`meta.counts` (`overdue`, `today`, `upcoming`, `next_7_days`, `deals_without_activity`). When filtering by `from`/`to`, ' +
      'timestamps must include an explicit UTC offset (e.g. `2026-11-01T00:00:00-03:00`).',
    inputSchema: z.object({
      activity_id: z.number().int().optional().describe('When set, fetches a single activity (/crm_activities/:id)'),
      deal_id: z.number().int().optional().describe('Filter by CRM deal ID'),
      owner_id: z.union([z.number().int(), z.literal('me')]).optional().describe('User ID or "me"'),
      scope: z.enum(['overdue', 'today', 'upcoming', 'pending', 'completed']).optional().describe('Defaults to "pending"'),
      source: z.enum(['manual', 'automation', 'follow_up']).optional(),
      from: z.string().optional().describe('ISO-8601 start timestamp with explicit UTC offset'),
      to: z.string().optional().describe('ISO-8601 end timestamp with explicit UTC offset'),
      per_page: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    handler: async ({ activity_id, from, to, ...query }, { client }) => {
      if (activity_id !== undefined) {
        return untrustedJson(await client.request(`/crm_activities/${activity_id}`, { prefix: 'saas' }));
      }
      const fromErr = validateIsoOffset('from', from);
      if (fromErr) return fromErr;
      const toErr = validateIsoOffset('to', to);
      if (toErr) return toErr;
      return untrustedJson(
        await client.request('/crm_activities', {
          prefix: 'saas',
          query: { ...query, from, to },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_activity_create',
    stability: 'beta',
    title: 'Schedule a CRM activity',
    description:
      'Create a scheduled activity on a CRM deal (`/crm_activities`). `due_at` must be an ISO-8601 timestamp with an explicit ' +
      'UTC offset (e.g. `2026-11-01T14:00:00-03:00` or `2026-11-01T17:00:00Z`). Defaults `owner_id` to the deal owner when omitted.',
    write: true,
    inputSchema: z.object({
      crm_deal_id: z.number().int().describe('CRM deal ID'),
      title: z.string().min(1).describe('Activity title'),
      activity_type: z.string().min(1).describe('Activity type (e.g. call, whatsapp, email, meeting, task, follow_up)'),
      due_at: z.string().optional().describe('ISO-8601 due timestamp with explicit UTC offset'),
      notes: z.string().optional().describe('Optional activity notes'),
      owner_id: z.number().int().nullable().optional().describe('Assigned user ID (defaults to deal owner)'),
      reminder_minutes: z.number().int().min(0).nullable().optional(),
    }),
    handler: async (args, { client }) => {
      const dueErr = validateIsoOffset('due_at', args.due_at);
      if (dueErr) return dueErr;
      return untrustedJson(
        await client.request('/crm_activities', {
          prefix: 'saas',
          method: 'POST',
          body: { crm_activity: args },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_activity_update',
    stability: 'beta',
    title: 'Update a CRM activity',
    description:
      'Update fields on a CRM activity (`/crm_activities/:id`). `due_at`, when provided, must carry an explicit UTC offset.',
    write: true,
    inputSchema: z.object({
      activity_id: z.number().int().describe('Activity ID'),
      title: z.string().min(1).optional(),
      activity_type: z.string().min(1).optional(),
      due_at: z.string().optional().describe('ISO-8601 due timestamp with explicit UTC offset'),
      notes: z.string().nullable().optional(),
      owner_id: z.number().int().nullable().optional(),
      reminder_minutes: z.number().int().min(0).nullable().optional(),
    }),
    handler: async ({ activity_id, ...fields }, { client }) => {
      if (Object.keys(fields).length === 0) {
        return json({ changed: false, reason: 'No activity fields to update were provided.' });
      }
      const dueErr = validateIsoOffset('due_at', fields.due_at);
      if (dueErr) return dueErr;
      return untrustedJson(
        await client.request(`/crm_activities/${activity_id}`, {
          prefix: 'saas',
          method: 'PATCH',
          body: { crm_activity: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_activity_complete',
    stability: 'beta',
    title: 'Mark a CRM activity completed',
    description: 'Mark a CRM activity as completed (`/crm_activities/:id/complete`).',
    write: true,
    idempotent: true,
    inputSchema: z.object({
      activity_id: z.number().int().describe('Activity ID'),
    }),
    handler: async ({ activity_id }, { client }) =>
      untrustedJson(
        await client.request(`/crm_activities/${activity_id}/complete`, {
          prefix: 'saas',
          method: 'POST',
        }),
      ),
  }),

  defineTool({
    name: 'crm_activity_postpone',
    stability: 'beta',
    title: 'Postpone a CRM activity',
    description:
      'Postpone a pending CRM activity (`/crm_activities/:id/postpone`) by `days` (default 1, max 365, preserving time of day) ' +
      'or to an explicit future `due_at` (ISO-8601 with UTC offset). Completed activities cannot be postponed.',
    write: true,
    inputSchema: z.object({
      activity_id: z.number().int().describe('Activity ID'),
      days: z.number().int().min(1).max(365).optional().describe('Days to postpone (default 1 when due_at is omitted)'),
      due_at: z.string().optional().describe('Explicit future ISO-8601 timestamp with UTC offset'),
    }),
    handler: async ({ activity_id, days, due_at }, { client }) => {
      const dueErr = validateIsoOffset('due_at', due_at);
      if (dueErr) return dueErr;
      return untrustedJson(
        await client.request(`/crm_activities/${activity_id}/postpone`, {
          prefix: 'saas',
          method: 'POST',
          body: { days, due_at },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_activity_delete',
    stability: 'beta',
    title: 'Delete a CRM activity',
    description: 'Permanently delete a CRM activity (`/crm_activities/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      activity_id: z.number().int().describe('Activity ID'),
      confirm: z.boolean().optional().describe('Required to confirm deletion'),
    }),
    handler: async ({ activity_id, confirm }, { client }) => {
      const refusal = requireConfirmation(confirm, `CRM activity #${activity_id} will be permanently deleted.`);
      if (refusal) return refusal;
      await client.request(`/crm_activities/${activity_id}`, { prefix: 'saas', method: 'DELETE' });
      return json({ deleted: true, activity_id });
    },
  }),

  defineTool({
    name: 'conversation_deal_get',
    stability: 'stable',
    title: 'Get the CRM deal linked to a conversation',
    description:
      'Fetch the CRM deal card and pipeline stages for a conversation (`/conversations/:id/crm_deal`). ' +
      '`conversation_id` is the account-scoped conversation `display_id` (the same ID used by `conversation_get`).',
    inputSchema: z.object({
      conversation_id: z.number().int().describe('Account-scoped conversation display ID'),
    }),
    handler: async ({ conversation_id }, { client }) =>
      untrustedJson(await client.request(`/conversations/${conversation_id}/crm_deal`, { prefix: 'saas' })),
  }),

  defineTool({
    name: 'conversation_deal_update',
    stability: 'beta',
    title: 'Update or create the CRM deal for a conversation',
    description:
      'Update `product_name` and/or `amount_cents` on the CRM deal behind a conversation (`/conversations/:id/crm_deal`). ' +
      'If the conversation does not have a CRM deal yet, AirysChat creates one automatically in the default pipeline stage. ' +
      '`conversation_id` is the account-scoped conversation `display_id`.',
    write: true,
    inputSchema: z.object({
      conversation_id: z.number().int().describe('Account-scoped conversation display ID'),
      product_name: z.string().optional().describe('Product or service name'),
      amount_cents: z.number().int().min(0).nullable().optional().describe('Deal amount in integer cents'),
    }),
    handler: async ({ conversation_id, product_name, amount_cents }, { client }) => {
      if (product_name === undefined && amount_cents === undefined) {
        return failure('Provide at least one of `product_name` or `amount_cents`.');
      }
      return untrustedJson(
        await client.request(`/conversations/${conversation_id}/crm_deal`, {
          prefix: 'saas',
          method: 'PATCH',
          body: { product_name, amount_cents },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_insights',
    stability: 'stable',
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
    stability: 'stable',
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
    stability: 'stable',
    title: 'List CRM loss reasons with 90-day usage breakdown',
    description:
      'Fetch loss reasons on the account along with 90-day usage counts and percentage share (`/crm_deals/loss_reasons`). ' +
      'Use the returned reason `id` as `lost_reason_id` when calling `crm_deal_close` with `outcome: "lost"`.',
    inputSchema: z.object({}),
    handler: async (_args, { client }) => json(await client.request('/crm_deals/loss_reasons', { prefix: 'saas' })),
  }),

  defineTool({
    name: 'crm_views_list',
    stability: 'stable',
    title: 'List CRM saved views',
    description:
      'List saved CRM board/list views visible to the authenticated user (personal views and views shared with the account).',
    inputSchema: z.object({}),
    handler: async (_args, { client }) => json(await client.request('/crm_saved_views', { prefix: 'saas' })),
  }),

  // ---------------------------------------------------------------- Phase B: CRM configuration (experimental)
  defineTool({
    name: 'crm_pipeline_upsert',
    stability: 'experimental',
    title: 'Create or update a CRM pipeline',
    description:
      'Create a new CRM sales pipeline (`POST /pipelines`) or update an existing one when `pipeline_id` is passed ' +
      '(`PATCH /pipelines/:id`). Admin-only (`account:update?`).',
    write: true,
    inputSchema: z.object({
      pipeline_id: z.number().int().optional().describe('Omit to create a new pipeline; pass to update an existing pipeline'),
      name: z.string().min(1).optional().describe('Pipeline name (required when creating)'),
      description: z.string().nullable().optional(),
    }),
    handler: async ({ pipeline_id, name, description }, { client }) => {
      if (!pipeline_id && !name) {
        return failure('Creating a pipeline requires `name`.');
      }
      if (pipeline_id) {
        return json(
          await client.request(`/pipelines/${pipeline_id}`, {
            prefix: 'saas',
            method: 'PATCH',
            body: { pipeline: { name, description } },
          }),
        );
      }
      return json(
        await client.request('/pipelines', {
          prefix: 'saas',
          method: 'POST',
          body: { pipeline: { name, description } },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_stage_upsert',
    stability: 'experimental',
    title: 'Create, update, or reorder CRM pipeline stages',
    description:
      'Manage stages in a CRM pipeline (`/pipelines/:pipeline_id/pipeline_stages`). Admin-only (`account:update?`). ' +
      'Pass `reorder_stage_ids` (containing all stage IDs of the pipeline in their new order) to reorder stages; ' +
      'pass `stage_id` to update one stage; or omit both to create a new stage (`name` required).',
    write: true,
    inputSchema: z.object({
      pipeline_id: z.number().int().describe('Sales pipeline ID'),
      stage_id: z.number().int().optional().describe('Stage ID to update'),
      reorder_stage_ids: z
        .array(z.number().int())
        .min(1)
        .optional()
        .describe('When set, reorders all stages of the pipeline to this exact ID sequence'),
      name: z.string().min(1).optional().describe('Stage name (required when creating)'),
      color: z.string().optional().describe('Hex color code'),
      position: z.number().int().min(0).optional(),
      stage_type: z.enum(['active', 'won', 'lost']).optional().describe('Defaults to "active"'),
      probability: z.number().int().min(0).max(100).nullable().optional(),
      stale_after_days: z.number().int().min(1).nullable().optional(),
      conversion_event_name: z.string().nullable().optional().describe('Meta Conversions API event name mapped to this stage'),
      required_fields: z.array(z.string()).optional().describe('Deal fields required before entering this stage'),
    }),
    handler: async ({ pipeline_id, stage_id, reorder_stage_ids, ...stageFields }, { client }) => {
      if (reorder_stage_ids) {
        return json(
          await client.request(`/pipelines/${pipeline_id}/pipeline_stages/reorder`, {
            prefix: 'saas',
            method: 'PATCH',
            body: { ids: reorder_stage_ids },
          }),
        );
      }
      if (!stage_id && !stageFields.name) {
        return failure('Creating a pipeline stage requires `name` (or pass `reorder_stage_ids` to reorder).');
      }
      if (stage_id) {
        return json(
          await client.request(`/pipelines/${pipeline_id}/pipeline_stages/${stage_id}`, {
            prefix: 'saas',
            method: 'PATCH',
            body: { pipeline_stage: stageFields },
          }),
        );
      }
      return json(
        await client.request(`/pipelines/${pipeline_id}/pipeline_stages`, {
          prefix: 'saas',
          method: 'POST',
          body: { pipeline_stage: stageFields },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_close_reason_upsert',
    stability: 'experimental',
    title: 'Create or update a CRM closure reason',
    description:
      'Create (`POST /closure_reasons`) or update (`PATCH /closure_reasons/:id`) a won/lost closure reason. Admin-only.',
    write: true,
    inputSchema: z.object({
      reason_id: z.number().int().optional().describe('Omit to create; pass to update'),
      name: z.string().min(1).optional().describe('Reason label (required when creating)'),
      reason_type: z.enum(['lost', 'won']).optional().describe('Required when creating'),
    }),
    handler: async ({ reason_id, name, reason_type }, { client }) => {
      if (!reason_id && (!name || !reason_type)) {
        return failure('Creating a closure reason requires both `name` and `reason_type` ("lost" or "won").');
      }
      if (reason_id) {
        return json(
          await client.request(`/closure_reasons/${reason_id}`, {
            prefix: 'saas',
            method: 'PATCH',
            body: { closure_reason: { name, reason_type } },
          }),
        );
      }
      return json(
        await client.request('/closure_reasons', {
          prefix: 'saas',
          method: 'POST',
          body: { closure_reason: { name, reason_type } },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_view_upsert',
    stability: 'experimental',
    title: 'Create or update a CRM saved view',
    description:
      'Save a CRM board/list filter view (`POST /crm_saved_views`) or update an existing view (`PATCH /crm_saved_views/:id`). ' +
      'Only the view author or an admin may update an existing view.',
    write: true,
    inputSchema: z.object({
      view_id: z.number().int().optional().describe('Omit to create; pass to update'),
      name: z.string().min(1).optional().describe('View name (required when creating)'),
      sort: z.string().optional(),
      visibility: z.enum(['personal', 'account']).optional(),
      filters: z.record(z.string(), z.unknown()).optional(),
      columns: z.array(z.string()).optional(),
    }),
    handler: async ({ view_id, ...fields }, { client }) => {
      if (!view_id && !fields.name) {
        return failure('Creating a saved view requires `name`.');
      }
      if (view_id) {
        return json(
          await client.request(`/crm_saved_views/${view_id}`, {
            prefix: 'saas',
            method: 'PATCH',
            body: { crm_saved_view: fields },
          }),
        );
      }
      return json(
        await client.request('/crm_saved_views', {
          prefix: 'saas',
          method: 'POST',
          body: { crm_saved_view: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_settings_get',
    stability: 'experimental',
    title: 'Get CRM pipeline settings',
    description:
      'Read account-wide CRM pipeline settings (`/crm_pipeline_settings`): `card_creation_mode`, `default_pipeline_id`, ' +
      '`default_stage_id`, `eligible_inbox_ids`, and `lifecycle_settings`.',
    inputSchema: z.object({}),
    handler: async (_args, { client }) => json(await client.request('/crm_pipeline_settings', { prefix: 'saas' })),
  }),

  defineTool({
    name: 'crm_settings_update',
    stability: 'experimental',
    title: 'Update CRM pipeline settings',
    description:
      'Update account-wide CRM pipeline settings (`PATCH /crm_pipeline_settings`). Admin-only (`account:update?`).',
    write: true,
    inputSchema: z.object({
      card_creation_mode: z.string().optional(),
      default_pipeline_id: z.number().int().nullable().optional(),
      default_stage_id: z.number().int().nullable().optional(),
      eligible_inbox_ids: z.array(z.number().int()).optional(),
      lifecycle_settings: z.record(z.string(), z.unknown()).optional(),
    }),
    handler: async (args, { client }) =>
      json(
        await client.request('/crm_pipeline_settings', {
          prefix: 'saas',
          method: 'PATCH',
          body: { crm_pipeline_setting: args },
        }),
      ),
  }),

  defineTool({
    name: 'crm_business_hours_get',
    stability: 'experimental',
    title: 'Get CRM business hours schedule',
    description:
      'Read the account CRM business-hours schedule (`/crm_business_hours`). Requires the `crm_management_dashboard` feature flag.',
    inputSchema: z.object({}),
    handler: async (_args, { client }) => json(await client.request('/crm_business_hours', { prefix: 'saas' })),
  }),

  defineTool({
    name: 'crm_business_hours_update',
    stability: 'experimental',
    title: 'Update CRM business hours schedule',
    description:
      'Enable or disable the CRM business-hours schedule (`PATCH /crm_business_hours`). Admin-only and requires the ' +
      '`crm_management_dashboard` feature flag. When `enabled: true`, both `timezone` and `working_hours` are required.',
    write: true,
    inputSchema: z.object({
      enabled: z.boolean().describe('True to apply schedule to unmanaged inboxes; false to release'),
      timezone: z.string().optional().describe('IANA timezone (required when enabled is true)'),
      working_hours: z.array(z.record(z.string(), z.unknown())).optional().describe('Weekly schedule array (required when enabled is true)'),
    }),
    handler: async ({ enabled, timezone, working_hours }, { client }) => {
      if (enabled && (!timezone || !working_hours || working_hours.length === 0)) {
        return failure('Enabling CRM business hours requires both `timezone` and a non-empty `working_hours` array.');
      }
      return json(
        await client.request('/crm_business_hours', {
          prefix: 'saas',
          method: 'PATCH',
          body: { enabled, timezone, working_hours },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_follow_up_rules_list',
    stability: 'experimental',
    title: 'List CRM automatic follow-up rules',
    description: 'List automatic WhatsApp/message follow-up rules configured on CRM stages (`/crm_follow_up_rules`).',
    inputSchema: z.object({
      pipeline_id: z.number().int().optional().describe('Filter by sales pipeline ID'),
    }),
    handler: async ({ pipeline_id }, { client }) =>
      untrustedJson(await client.request('/crm_follow_up_rules', { prefix: 'saas', query: { pipeline_id } })),
  }),

  defineTool({
    name: 'crm_follow_up_rule_upsert',
    stability: 'experimental',
    title: 'Create or update a CRM automatic follow-up rule',
    description:
      'Create (`POST /crm_follow_up_rules`) or update (`PATCH /crm_follow_up_rules/:id`) a stage follow-up rule that messages ' +
      'customers after `delay_minutes`. Admin-only (`account:update?`).',
    write: true,
    inputSchema: z.object({
      rule_id: z.number().int().optional().describe('Omit to create; pass to update'),
      name: z.string().min(1).optional().describe('Rule name (required when creating)'),
      enabled: z.boolean().optional(),
      delay_minutes: z.number().int().min(1).optional().describe('Delay in minutes before sending (required when creating)'),
      message_mode: z.string().optional().describe('e.g. text or template (required when creating)'),
      message_body: z.string().nullable().optional(),
      message_template_id: z.number().int().nullable().optional(),
      template_params: z.record(z.string(), z.unknown()).optional(),
      saas_pipeline_id: z.number().int().optional().describe('Required when creating'),
      saas_pipeline_stage_id: z.number().int().optional().describe('Required when creating'),
    }),
    handler: async ({ rule_id, ...fields }, { client }) => {
      if (
        !rule_id &&
        (!fields.name || !fields.delay_minutes || !fields.message_mode || !fields.saas_pipeline_id || !fields.saas_pipeline_stage_id)
      ) {
        return failure(
          'Creating a follow-up rule requires `name`, `delay_minutes`, `message_mode`, `saas_pipeline_id`, and `saas_pipeline_stage_id`.',
        );
      }
      if (rule_id) {
        return untrustedJson(
          await client.request(`/crm_follow_up_rules/${rule_id}`, {
            prefix: 'saas',
            method: 'PATCH',
            body: { crm_follow_up_rule: fields },
          }),
        );
      }
      return untrustedJson(
        await client.request('/crm_follow_up_rules', {
          prefix: 'saas',
          method: 'POST',
          body: { crm_follow_up_rule: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_automations_list',
    stability: 'experimental',
    title: 'List CRM stage automations',
    description: 'List CRM stage automations (`/crm_stage_automations`), optionally filtered by `pipeline_id`.',
    inputSchema: z.object({
      pipeline_id: z.number().int().optional().describe('Filter by sales pipeline ID'),
    }),
    handler: async ({ pipeline_id }, { client }) =>
      json(await client.request('/crm_stage_automations', { prefix: 'saas', query: { pipeline_id } })),
  }),

  defineTool({
    name: 'crm_automation_upsert',
    stability: 'experimental',
    title: 'Create or update a CRM stage automation',
    description:
      'Create (`POST /crm_stage_automations`) or update (`PATCH /crm_stage_automations/:id`) a stage automation. Admin-only (`account:update?`).',
    write: true,
    inputSchema: z.object({
      automation_id: z.number().int().optional().describe('Omit to create; pass to update'),
      saas_pipeline_stage_id: z.number().int().optional().describe('Required when creating'),
      trigger: z.string().optional().describe('Trigger event (required when creating)'),
      action_type: z.string().optional().describe('Action type (required when creating)'),
      delay_minutes: z.number().int().min(0).optional(),
      enabled: z.boolean().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
    handler: async ({ automation_id, ...fields }, { client }) => {
      if (!automation_id && (!fields.saas_pipeline_stage_id || !fields.trigger || !fields.action_type)) {
        return failure('Creating a stage automation requires `saas_pipeline_stage_id`, `trigger`, and `action_type`.');
      }
      if (automation_id) {
        return json(
          await client.request(`/crm_stage_automations/${automation_id}`, {
            prefix: 'saas',
            method: 'PATCH',
            body: { crm_stage_automation: fields },
          }),
        );
      }
      return json(
        await client.request('/crm_stage_automations', {
          prefix: 'saas',
          method: 'POST',
          body: { crm_stage_automation: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'crm_conversion_settings_get',
    stability: 'experimental',
    title: 'Get WhatsApp Conversions API (CAPI) settings for a pipeline',
    description:
      'Read the Meta Conversions API dataset, supported events, stage mappings, and recent events for an `(inbox_id, pipeline_id)` ' +
      'pair (`/whatsapp_conversion_settings`). Requires the `whatsapp_conversions_api` feature flag.',
    inputSchema: z.object({
      inbox_id: z.number().int().describe('WhatsApp inbox ID'),
      pipeline_id: z.number().int().describe('Sales pipeline ID'),
    }),
    handler: async ({ inbox_id, pipeline_id }, { client }) =>
      json(await client.request('/whatsapp_conversion_settings', { prefix: 'saas', query: { inbox_id, pipeline_id } })),
  }),

  defineTool({
    name: 'crm_conversion_settings_update',
    stability: 'experimental',
    title: 'Update WhatsApp Conversions API (CAPI) stage mappings',
    description:
      'Update Meta Conversions API `test_event_code` and stage event mappings (`PATCH /whatsapp_conversion_settings`). ' +
      'Admin-only and IRREVERSIBLE: changes which conversion events are dispatched to Meta for this inbox and pipeline. ' +
      'Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int().describe('WhatsApp inbox ID'),
      pipeline_id: z.number().int().describe('Sales pipeline ID'),
      test_event_code: z.string().nullable().optional().describe('Meta test event code (or null for live production events)'),
      mappings: z
        .array(
          z.object({
            saas_pipeline_stage_id: z.number().int(),
            event_name: z.string(),
            enabled: z.boolean(),
          }),
        )
        .optional(),
      confirm: z.boolean().optional().describe('Required to confirm updating Meta CAPI stage mappings'),
    }),
    handler: async ({ inbox_id, pipeline_id, test_event_code, mappings, confirm }, { client }) => {
      const refusal = requireConfirmation(
        confirm,
        `Meta Conversions API settings for inbox #${inbox_id} and pipeline #${pipeline_id} will be updated ` +
          `(${mappings?.length ?? 0} stage mapping(s), test_event_code: ${test_event_code ?? '(unchanged/none)'}).`,
      );
      if (refusal) return refusal;
      return json(
        await client.request('/whatsapp_conversion_settings', {
          prefix: 'saas',
          method: 'PATCH',
          body: { inbox_id, pipeline_id, test_event_code, mappings },
        }),
      );
    },
  }),
];

