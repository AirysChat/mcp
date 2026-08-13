/**
 * WhatsApp templates and campaigns — the AirysChat-specific surface.
 *
 * Every description here is derived from swagger/airyschat/ in the AirysChat repo,
 * which was written against the controllers rather than guessed. The behaviours worth
 * repeating in tool descriptions are the ones a caller cannot infer from the shape:
 * a blocked preflight returns 200, test_send really sends, campaign IDs are display
 * IDs, and a failed template create rolls back while a failed update does not.
 */

import { z } from 'zod';
import { defineTool } from '../toolsets.js';
import { json, requireConfirmation, untrustedJson } from '../result.js';

const TEMPLATE_STATUS = z.enum(['draft', 'pending', 'approved', 'rejected', 'paused', 'disabled', 'in_appeal']);
const TEMPLATE_CATEGORY = z.enum(['marketing', 'utility', 'authentication']);

const audienceSelector = z
  .array(
    z.object({
      type: z.enum(['Label', 'Segment', 'Contact']),
      id: z.number().int(),
      exclude: z.boolean().optional().describe('Subtracts this selector from the audience'),
    }),
  )
  .describe('Selectors are unioned, then entries with exclude:true are subtracted');

export const whatsappTools = [
  defineTool({
    name: 'wa_templates_list',
    title: 'List WhatsApp message templates',
    description:
      'List message templates, most recently updated first. Returns a bare array with no pagination — this is the complete ' +
      'set for the given filters. Only templates with status `approved` can be sent by a campaign.',
    inputSchema: z.object({
      inbox_id: z.number().int().optional(),
      channel_type: z.string().optional(),
      status: TEMPLATE_STATUS.optional(),
    }),
    handler: async (args, { client }) => untrustedJson(await client.request('/message_templates', { query: args })),
  }),

  defineTool({
    name: 'wa_template_get',
    title: 'Get a WhatsApp message template',
    description: 'Fetch one template, including its Meta approval status and the rejection reason in `metadata` when there is one.',
    inputSchema: z.object({ template_id: z.number().int() }),
    handler: async ({ template_id }, { client }) => untrustedJson(await client.request(`/message_templates/${template_id}`)),
  }),

  defineTool({
    name: 'wa_template_analytics',
    title: 'Get template analytics',
    description:
      'Delivery and engagement figures for one template, fetched live from Meta. Returns `{"analytics": {}}` with a 200 — ' +
      'success, not failure — when the template was never submitted to Meta (`platform_template_id` is null) or its inbox ' +
      'is not a WhatsApp channel. Check that field before reporting "no data".',
    inputSchema: z.object({
      template_id: z.number().int(),
      days: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional().describe('Defaults to 30; other values fall back to 30'),
    }),
    handler: async ({ template_id, days }, { client }) =>
      json(await client.request(`/message_templates/${template_id}/analytics`, { query: { days } })),
  }),

  defineTool({
    name: 'wa_templates_sync',
    title: 'Sync templates from Meta',
    description:
      'Pull template definitions and approval statuses from Meta into AirysChat. With `inbox_id`, syncs that inbox only; ' +
      'without it, syncs every eligible WhatsApp Cloud inbox. If any inbox fails, the whole call returns an error naming ' +
      'the failures even though the others were still synced. Changes local records only — nothing is sent to customers.',
    write: true,
    idempotent: true,
    inputSchema: z.object({ inbox_id: z.number().int().optional() }),
    handler: async ({ inbox_id }, { client }) =>
      json(await client.request('/message_templates/sync', { method: 'POST', body: { inbox_id } })),
  }),

  defineTool({
    name: 'wa_campaigns_list',
    title: 'List campaigns',
    description:
      'List campaigns, newest first, 15 per page. Both live-chat (`ongoing`) and WhatsApp broadcast (`one_off`) campaigns ' +
      'are returned — pass `channel: "whatsapp"` for broadcasts only. The `id` in each entry is the account-scoped display ' +
      'ID, which is what every other campaign tool expects.',
    inputSchema: z.object({
      channel: z.literal('whatsapp').optional(),
      inbox_ids: z.array(z.number().int()).optional(),
      status: z.enum(['active', 'completed', 'draft', 'scheduled', 'sending', 'cancelled', 'failed', 'processing', 'all']).optional(),
      whatsapp_template_category: z.enum(['utility', 'marketing', 'authentication', 'all']).optional(),
      q: z.string().optional().describe('Case-insensitive substring match on the title'),
      sort_by: z.enum(['date_desc', 'date_asc', 'name_asc', 'name_desc']).optional(),
      page: z.number().int().min(1).optional(),
    }),
    handler: async (args, { client }) => untrustedJson(await client.request('/campaigns', { query: args })),
  }),

  defineTool({
    name: 'wa_campaign_get',
    title: 'Get a campaign',
    description:
      'Fetch one campaign by its display ID. Prefer `lifecycle_permissions` (editable / launchable / cancellable) over ' +
      'inferring what is allowed from `campaign_status`.',
    inputSchema: z.object({ campaign_id: z.number().int().describe('Account-scoped display ID, not the primary key') }),
    handler: async ({ campaign_id }, { client }) => untrustedJson(await client.request(`/campaigns/${campaign_id}`)),
  }),

  defineTool({
    name: 'wa_campaign_metrics',
    title: 'Get campaign delivery metrics',
    description:
      'Aggregate counters plus the per-contact delivery log, newest first. The log is NOT paginated — for a large ' +
      'broadcast this response can be very large, so prefer wa_campaign_get when you only need status.',
    inputSchema: z.object({ campaign_id: z.number().int() }),
    handler: async ({ campaign_id }, { client }) => untrustedJson(await client.request(`/campaigns/${campaign_id}/metrics`)),
  }),

  defineTool({
    name: 'wa_audience_estimate',
    title: 'Estimate a campaign audience',
    description:
      'Resolve audience selectors and count the matching contacts, before any campaign exists. Read-only. ' +
      'Use `with_identifier`, not `total`, as the realistic delivery ceiling: contacts without a phone number or ' +
      'business-scoped user ID cannot receive a WhatsApp message.',
    inputSchema: z.object({
      audience: audienceSelector.optional(),
      label_ids: z.array(z.number().int()).optional().describe('Shorthand for Label selectors; ignored when audience is given'),
    }),
    handler: async (args, { client }) => json(await client.request('/campaigns/audience_estimate', { method: 'POST', body: args })),
  }),

  defineTool({
    name: 'wa_campaign_preflight',
    title: 'Run a campaign preflight risk check',
    description:
      'Evaluate an audience, template, and send window against suppression rules, WABA health, template approval, and ' +
      'recent complaint signals — without sending anything. Safe to call repeatedly. ' +
      'IMPORTANT: a blocked check still returns HTTP 200, so read `allowed` and `blocking_issues` rather than trusting ' +
      'the absence of an error. Always run this before wa_campaign_launch and show the operator what it says.',
    inputSchema: z.object({
      campaign_id: z.number().int().optional().describe('Preflight a saved campaign by display ID'),
      inbox_id: z.number().int().optional(),
      message: z.string().optional().describe('Template name to be sent'),
      whatsapp_template_category: TEMPLATE_CATEGORY.optional(),
      audience: audienceSelector.optional(),
      recipient_count: z.number().int().optional(),
      starts_at: z.string().optional(),
      ends_at: z.string().optional(),
    }),
    handler: async (args, { client }) => json(await client.request('/campaigns/preflight', { method: 'POST', body: args })),
  }),

  defineTool({
    name: 'wa_campaign_create',
    title: 'Create a campaign',
    description:
      'Create a campaign. Creating does NOT send anything — use wa_campaign_launch for that. ' +
      'For WhatsApp inboxes, anything other than `save_mode: "draft"` must pass a preflight check, and a blocked preflight ' +
      'fails the create with the full preflight result. `message` is the name of an approved template, not message text.',
    write: true,
    inputSchema: z.object({
      title: z.string().min(1),
      message: z.string().min(1).describe('Name of an approved WhatsApp template'),
      inbox_id: z.number().int(),
      save_mode: z.enum(['draft', 'schedule']).optional(),
      scheduled_at: z.string().optional().describe('Required when save_mode is "schedule"'),
      whatsapp_template_category: TEMPLATE_CATEGORY.optional(),
      description: z.string().optional(),
      sender_id: z.number().int().optional(),
      audience: audienceSelector.optional(),
      template_params: z.record(z.string(), z.unknown()).optional(),
    }),
    handler: async (args, { client }) => json(await client.request('/campaigns', { method: 'POST', body: { campaign: args } })),
  }),

  defineTool({
    name: 'wa_campaign_launch',
    title: 'Launch a campaign',
    description:
      'ONE-WAY DOOR. Schedules the campaign for delivery to its entire audience; once sending starts, messages cannot be ' +
      'recalled and Meta bills for them. Requires `confirm: true`. ' +
      'Run wa_campaign_preflight first — launch re-checks and can refuse even when creation succeeded, because template ' +
      'approval and WABA health change over time.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      campaign_id: z.number().int(),
      scheduled_at: z.string().optional().describe('Overrides the campaign’s stored schedule'),
      confirm: z.boolean().optional(),
    }),
    handler: async ({ campaign_id, scheduled_at, confirm }, { client }) => {
      const campaign = (await client.request(`/campaigns/${campaign_id}`)) as { title?: string };
      const refusal = requireConfirmation(
        confirm,
        `Campaign ${campaign_id} ("${campaign.title ?? 'untitled'}") will be sent to its full audience. Messages cannot be recalled and Meta will bill for them.`,
      );
      if (refusal) return refusal;

      return json(await client.request(`/campaigns/${campaign_id}/launch`, { method: 'POST', body: { scheduled_at } }));
    },
  }),

  defineTool({
    name: 'wa_campaign_cancel',
    title: 'Cancel a scheduled campaign',
    description:
      'Move a scheduled campaign to cancelled. Only works while `lifecycle_permissions.cancellable` is true — a campaign ' +
      'that has already started sending cannot be cancelled, and messages already delivered are unaffected.',
    write: true,
    inputSchema: z.object({ campaign_id: z.number().int(), confirm: z.boolean().optional() }),
    handler: async ({ campaign_id, confirm }, { client }) => {
      const refusal = requireConfirmation(confirm, `Campaign ${campaign_id} will be cancelled and disabled.`);
      if (refusal) return refusal;

      return json(await client.request(`/campaigns/${campaign_id}/cancel`, { method: 'POST' }));
    },
  }),

  defineTool({
    name: 'wa_campaign_test_send',
    title: 'Send a campaign to one contact as a test',
    description:
      'NOT A DRY RUN. Delivers a real, billed WhatsApp message to the given contact. Point it at an internal test contact, ' +
      'never a customer. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      campaign_id: z.number().int(),
      contact_id: z.number().int(),
      confirm: z.boolean().optional(),
    }),
    handler: async ({ campaign_id, contact_id, confirm }, { client }) => {
      const refusal = requireConfirmation(
        confirm,
        `Contact ${contact_id} will receive a real WhatsApp message from campaign ${campaign_id}.`,
      );
      if (refusal) return refusal;

      return json(await client.request(`/campaigns/${campaign_id}/test_send`, { method: 'POST', body: { contact_id } }));
    },
  }),

  defineTool({
    name: 'wa_inbox_health',
    title: 'Check WhatsApp campaign health for an inbox',
    description:
      'WABA health and campaign-sending readiness for one inbox. Check this when a preflight blocks or sends start failing — ' +
      'quality-rating drops and messaging limits show up here before they show up as delivery errors.',
    inputSchema: z.object({ inbox_id: z.number().int() }),
    handler: async ({ inbox_id }, { client }) => json(await client.request(`/inboxes/${inbox_id}/whatsapp_campaign_health`)),
  }),
];
