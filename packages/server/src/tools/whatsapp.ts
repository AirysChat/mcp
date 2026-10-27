/**
 * WhatsApp templates, scheduled messages, calls, Flows, contact consent, and campaigns —
 * the AirysChat-specific WhatsApp surface.
 *
 * Every description here is derived from swagger/airyschat/ and the upstream controllers
 * in the AirysChat repo (`docs/api/domains/whatsapp.md`). The behaviours worth repeating
 * in tool descriptions are the ones a caller cannot infer from the shape:
 * a blocked preflight returns 200, test_send really sends, campaign IDs and conversation
 * IDs for scheduled messages are display IDs, and a failed template create rolls back
 * while a failed update does not.
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

const REJECTION_GUIDANCE: Record<string, { explanation: string; fixes: string[] }> = {
  INVALID_FORMAT: {
    explanation:
      'Meta rejected the template formatting: variables (`{{1}}`, `{{2}}`) may be non-sequential, placed at the very start or end of the body, adjacent without separating words, or missing sample values.',
    fixes: [
      'Number variables sequentially starting from {{1}} with no gaps.',
      'Add fixed words before a leading variable and punctuation/words after a trailing variable.',
      'Provide realistic sample values in `content.example` / `metadata` for every variable.',
    ],
  },
  VARIABLE_AT_START_OR_END: {
    explanation: 'Meta does not allow a template body to begin or end directly with a `{{n}}` placeholder.',
    fixes: [
      'Prefix a leading variable with a greeting or label (e.g. "Olá {{1}},").',
      'Follow a trailing variable with fixed closing text (e.g. "... código {{1}} para continuar.").',
    ],
  },
  PROMOTIONAL_CONTENT_IN_UTILITY: {
    explanation:
      'The template was submitted as `utility` but Meta classified its wording as promotional, upsell, or re-engagement.',
    fixes: [
      'Remove discounts, coupons, urgency cues, or broad calls to action and anchor the copy to a specific customer-initiated transaction or order.',
      'Or duplicate the template with `category: "marketing"` if the message is promotional.',
    ],
  },
  TAG_CONTENT_MISMATCH: {
    explanation: 'The selected `category` (`utility`, `marketing`, or `authentication`) does not match the template content.',
    fixes: [
      'Use `utility` only for post-purchase/account updates triggered by a user action.',
      'Use `authentication` only for one-time passcodes using Meta’s preset OTP structure.',
      'Use `marketing` for offers, announcements, cart recovery, or re-engagement.',
    ],
  },
  INCORRECT_CATEGORY: {
    explanation: 'Meta determined the template belongs to a different category than the one submitted.',
    fixes: [
      'Resubmit or duplicate under the matching category (`marketing` vs. `utility`), or strip promotional phrasing before appealing.',
    ],
  },
  ABUSIVE_CONTENT: {
    explanation: 'Meta flagged the template for threatening, coercive, or policy-violating language.',
    fixes: [
      'Rewrite collection or warning notices in neutral, factual terms without threats.',
      'Never request full payment card numbers, passwords, or sensitive identifiers over WhatsApp.',
    ],
  },
  SCAM: {
    explanation: 'Meta flagged the template for phishing/scam signals such as shortened links or unverified payment requests.',
    fixes: [
      'Replace URL shorteners (bit.ly, tinyurl.com, etc.) with full brand domain URLs.',
      'Clarify the business name and transaction context in the body.',
    ],
  },
};

function explainTemplateRejection(template: Record<string, unknown>) {
  const metadata = (template.metadata as Record<string, unknown> | undefined) ?? {};
  const content = (template.content as Record<string, unknown> | undefined) ?? {};
  const rawReason =
    (typeof metadata.rejection_reason === 'string' && metadata.rejection_reason) ||
    (typeof metadata.rejected_reason === 'string' && metadata.rejected_reason) ||
    (typeof template.rejection_reason === 'string' && template.rejection_reason) ||
    'NONE';
  const code = rawReason.trim().toUpperCase();
  const status = String(template.status ?? 'unknown');
  const category = String(template.category ?? 'unknown').toLowerCase();
  const bodyText =
    typeof content.body === 'string'
      ? content.body
      : typeof (content.body as Record<string, unknown> | undefined)?.text === 'string'
        ? String((content.body as Record<string, unknown>).text)
        : typeof content.text === 'string'
          ? content.text
          : '';

  const detectedIssues: string[] = [];
  const suggestedFixes: string[] = [];

  const known = REJECTION_GUIDANCE[code];
  if (known) {
    suggestedFixes.push(...known.fixes);
  }

  const trimmedBody = bodyText.trim();
  if (/^\{\{\d+\}\}/.test(trimmedBody) || /\{\{\d+\}\}[.!?]?$/.test(trimmedBody)) {
    detectedIssues.push('variable_at_boundary: Body starts or ends with a {{n}} variable placeholder.');
    suggestedFixes.push('Surround leading and trailing {{n}} placeholders with fixed text.');
  }

  const vars = [...trimmedBody.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  if (vars.length > 0) {
    const uniqueSorted = [...new Set(vars)].sort((a, b) => a - b);
    const expected = Array.from({ length: uniqueSorted.length }, (_, idx) => idx + 1);
    if (uniqueSorted.some((val, idx) => val !== expected[idx])) {
      detectedIssues.push(
        `non_sequential_variables: Placeholders [${uniqueSorted.join(', ')}] are not sequential starting at {{1}}.`,
      );
      suggestedFixes.push('Renumber placeholders sequentially ({{1}}, {{2}}, ...) without gaps.');
    }
  }

  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(trimmedBody)) {
    detectedIssues.push('adjacent_variables: Two {{n}} placeholders appear back-to-back without separating words.');
    suggestedFixes.push('Insert fixed words between adjacent variables.');
  }

  if (
    category === 'utility' &&
    /\b(desconto|oferta|promo(?:ção|cao)?|cupom|imperd[ií]vel|compre\s+agora|black\s+friday|\d+%\s*off)\b/i.test(trimmedBody)
  ) {
    detectedIssues.push('promotional_terms_in_utility: Promotional keywords detected in a `utility` template.');
    suggestedFixes.push('Strip promotional phrasing to keep `utility`, or recreate the template with `category: "marketing"`.');
  }

  if (/\b(bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly|shorturl\.at)\//i.test(trimmedBody)) {
    detectedIssues.push('url_shortener_in_body: Generic URL shortener detected in template body.');
    suggestedFixes.push('Use full URLs on your verified business domain instead of public URL shorteners.');
  }

  const explanation =
    known?.explanation ??
    (status === 'rejected'
      ? `Template is rejected with Meta reason "${rawReason}". Review the detected content issues and suggested fixes.`
      : `Template status is "${status}" (rejection reason: "${rawReason}").`);

  return {
    template_id: template.id,
    name: template.name,
    status,
    category,
    language: template.language,
    rejection_code: code,
    quality_rating: metadata.quality_rating ?? template.quality_rating ?? null,
    can_appeal: status === 'rejected' && Boolean(template.platform_template_id),
    explanation,
    detected_issues: detectedIssues,
    suggested_fixes: [...new Set(suggestedFixes)],
    template,
  };
}

export const whatsappTools = [
  defineTool({
    name: 'wa_templates_list',
    stability: 'stable',
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
    stability: 'stable',
    title: 'Get a WhatsApp message template',
    description: 'Fetch one template, including its Meta approval status and the rejection reason in `metadata` when there is one.',
    inputSchema: z.object({ template_id: z.number().int() }),
    handler: async ({ template_id }, { client }) => untrustedJson(await client.request(`/message_templates/${template_id}`)),
  }),

  defineTool({
    name: 'wa_template_analytics',
    stability: 'stable',
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
    stability: 'beta',
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
    name: 'wa_template_upsert',
    stability: 'beta',
    title: 'Create, update, appeal, or duplicate a WhatsApp template',
    description:
      'Create, edit, appeal, or duplicate a WhatsApp message template (`action: "create" | "update" | "appeal" | "duplicate"`). ' +
      'Requires `confirm: true` because template mutations submit to Meta WABA for review and affect template quality/approval:\n' +
      '- `create`: when `inbox_id` is provided, AirysChat immediately submits the template to Meta; if Meta rejects submission, the local draft is rolled back (`422`). Without `inbox_id`, saves a local draft.\n' +
      '- `update`: once submitted to Meta (`platform_template_id` present), `name`, `language`, `inbox_id`, and `channel_type` are locked (`LOCKED_AFTER_SUBMISSION`); Meta validates the edit first so a failed edit leaves the existing template untouched.\n' +
      '- `appeal`: submits a rejection appeal (`appeal_reason`, optional `components`) to Meta.\n' +
      '- `duplicate`: clones an existing template under a new `name` (optional `bid_amount`).',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      action: z.enum(['create', 'update', 'appeal', 'duplicate']).default('create'),
      template_id: z.number().int().optional().describe('Required for update, appeal, and duplicate'),
      name: z
        .string()
        .regex(/^[a-z0-9_]+$/)
        .optional()
        .describe('Lowercase alphanumeric and underscores only; required for create, optional for duplicate'),
      language: z.string().optional().describe('BCP-47 / Meta language code, e.g. "pt_BR" or "en_US" (required for create)'),
      category: TEMPLATE_CATEGORY.optional().describe('Required for create; editable on update'),
      inbox_id: z.number().int().optional().describe('WhatsApp inbox ID; when set on create, submits directly to Meta'),
      channel_type: z.string().optional().describe('Defaults to "Channel::Whatsapp"'),
      content: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Template structure (header, body, footer, buttons, example)'),
      metadata: z.record(z.string(), z.unknown()).optional(),
      appeal_reason: z.string().optional().describe('Explanation for Meta review when action is "appeal"'),
      components: z.array(z.record(z.string(), z.unknown())).optional().describe('Optional updated components for appeal'),
      bid_amount: z.number().optional().describe('Optional bid amount when duplicating a template'),
      confirm: z.boolean().optional(),
    }),
    handler: async (args, { client }) => {
      if (args.action === 'create') {
        const refusal = requireConfirmation(
          args.confirm,
          `Create WhatsApp template "${args.name ?? 'unnamed'}" (${args.language ?? 'unknown'}, category: ${args.category ?? 'unknown'})${args.inbox_id ? ` and submit to Meta on inbox ${args.inbox_id}` : ' as local draft'}.`,
        );
        if (refusal) return refusal;
        const body = {
          message_template: {
            name: args.name,
            language: args.language,
            category: args.category,
            inbox_id: args.inbox_id,
            channel_type: args.channel_type ?? 'Channel::Whatsapp',
            content: args.content,
            metadata: args.metadata,
          },
        };
        return untrustedJson(await client.request('/message_templates', { method: 'POST', body }));
      }

      if (!args.template_id) {
        throw new Error(`template_id is required when action is "${args.action}"`);
      }

      const existing = (await client.request(`/message_templates/${args.template_id}`)) as Record<string, unknown>;
      const label = `template ${args.template_id} ("${String(existing.name ?? 'unknown')}", ${String(existing.language ?? '')}, status: ${String(existing.status ?? 'unknown')})`;

      if (args.action === 'update') {
        const refusal = requireConfirmation(
          args.confirm,
          `Update ${label}${existing.platform_template_id ? ' and resubmit to Meta' : ''}. Note: name, language, inbox_id, and channel_type are locked after initial Meta submission.`,
        );
        if (refusal) return refusal;
        const body = {
          message_template: {
            category: args.category,
            content: args.content,
            metadata: args.metadata,
          },
        };
        return untrustedJson(await client.request(`/message_templates/${args.template_id}`, { method: 'PATCH', body }));
      }

      if (args.action === 'appeal') {
        const refusal = requireConfirmation(args.confirm, `Submit Meta rejection appeal for ${label}.`);
        if (refusal) return refusal;
        return untrustedJson(
          await client.request(`/message_templates/${args.template_id}/appeal`, {
            method: 'POST',
            body: { appeal_reason: args.appeal_reason, components: args.components },
          }),
        );
      }

      const refusal = requireConfirmation(
        args.confirm,
        `Duplicate ${label} as "${args.name ?? `${String(existing.name ?? 'template')}_copy`}" and submit to Meta if linked to an inbox.`,
      );
      if (refusal) return refusal;
      return untrustedJson(
        await client.request(`/message_templates/${args.template_id}/duplicate`, {
          method: 'POST',
          body: { name: args.name, bid_amount: args.bid_amount },
        }),
      );
    },
  }),

  defineTool({
    name: 'wa_template_delete',
    stability: 'beta',
    title: 'Delete a WhatsApp message template',
    description:
      'Permanently delete a WhatsApp message template locally and on Meta WABA (by `name` + `hsm_id: platform_template_id`). ' +
      'Fetches the template first to preview its name, language, category, and approval status. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      template_id: z.number().int(),
      confirm: z.boolean().optional(),
    }),
    handler: async ({ template_id, confirm }, { client }) => {
      const existing = (await client.request(`/message_templates/${template_id}`)) as Record<string, unknown>;
      const refusal = requireConfirmation(
        confirm,
        `Delete WhatsApp template ${template_id} ("${String(existing.name ?? 'unknown')}", ${String(existing.language ?? '')}, status: ${String(existing.status ?? 'unknown')})${existing.platform_template_id ? ` from Meta WABA (platform_template_id: ${String(existing.platform_template_id)})` : ''}. This cannot be undone.`,
      );
      if (refusal) return refusal;
      await client.request(`/message_templates/${template_id}`, { method: 'DELETE' });
      return json({ deleted: true, template_id, name: existing.name });
    },
  }),

  defineTool({
    name: 'wa_template_rejection_explain',
    stability: 'stable',
    title: 'Explain a WhatsApp template rejection and suggest fixes',
    description:
      'Fetch a WhatsApp template (`GET /message_templates/:id`), inspect its Meta `rejection_reason`, `category`, `status`, ' +
      'and `content`, and return a structured root-cause diagnosis plus concrete, actionable fix suggestions (variable ' +
      'placement/numbering, promotional wording in utility templates, category mismatches, URL shorteners, and whether the ' +
      'template is eligible for `wa_template_upsert` with `action: "appeal"` or `"update"`). Read-only.',
    inputSchema: z.object({
      template_id: z.number().int(),
    }),
    handler: async ({ template_id }, { client }) => {
      const template = (await client.request(`/message_templates/${template_id}`)) as Record<string, unknown>;
      return untrustedJson(explainTemplateRejection(template));
    },
  }),

  defineTool({
    name: 'wa_scheduled_messages_list',
    stability: 'stable',
    title: 'List scheduled WhatsApp messages for a conversation',
    description:
      'List scheduled WhatsApp messages (`pending`, `processing`, `sent`, `failed`, `cancelled`) for a conversation, ordered ' +
      'by `scheduled_at` ascending. `conversation_id` is the account-scoped `display_id` (not the internal primary key).',
    inputSchema: z.object({
      conversation_id: z.number().int().describe('Account-scoped conversation display_id'),
    }),
    handler: async ({ conversation_id }, { client }) =>
      untrustedJson(
        await client.request(`/conversations/${conversation_id}/scheduled_whatsapp_messages`, { prefix: 'saas' }),
      ),
  }),

  defineTool({
    name: 'wa_scheduled_message_upsert',
    stability: 'beta',
    title: 'Schedule or reschedule a WhatsApp message',
    description:
      'Create a new scheduled WhatsApp message (`action: "create"`) or reschedule a `pending` one (`action: "update"`). ' +
      'Requires `confirm: true` because the message will be delivered to the customer at `scheduled_at`.\n' +
      '- `conversation_id` is the account-scoped `display_id`.\n' +
      '- `scheduled_at` is an ISO-8601 timestamp or Unix epoch seconds in the future.\n' +
      '- Provide either free-form `content` (when the conversation will be inside the 24-hour customer service window) or `template_params` for an approved WhatsApp template.\n' +
      '- `update` only works while `status == "pending"`; otherwise AirysChat returns `422 { error: "not_pending" }`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      action: z.enum(['create', 'update']).default('create'),
      conversation_id: z.number().int().describe('Account-scoped conversation display_id'),
      scheduled_message_id: z.number().int().optional().describe('Required when action is "update"'),
      scheduled_at: z.union([z.string(), z.number()]).describe('Future delivery timestamp (ISO-8601 or Unix epoch seconds)'),
      content: z.string().optional().describe('Message body (used on create)'),
      template_params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Approved WhatsApp template payload `{ name, category, language, namespace, processed_params }` (used on create)'),
      confirm: z.boolean().optional(),
    }),
    handler: async (args, { client }) => {
      if (args.action === 'update') {
        if (!args.scheduled_message_id) {
          throw new Error('scheduled_message_id is required when action is "update"');
        }
        const refusal = requireConfirmation(
          args.confirm,
          `Reschedule pending WhatsApp message ${args.scheduled_message_id} in conversation ${args.conversation_id} to ${String(args.scheduled_at)}.`,
        );
        if (refusal) return refusal;
        return untrustedJson(
          await client.request(
            `/conversations/${args.conversation_id}/scheduled_whatsapp_messages/${args.scheduled_message_id}`,
            {
              method: 'PATCH',
              prefix: 'saas',
              body: { scheduled_whatsapp_message: { scheduled_at: args.scheduled_at } },
            },
          ),
        );
      }

      const refusal = requireConfirmation(
        args.confirm,
        `Schedule a customer-visible WhatsApp message in conversation ${args.conversation_id} for ${String(args.scheduled_at)}.`,
      );
      if (refusal) return refusal;
      return untrustedJson(
        await client.request(`/conversations/${args.conversation_id}/scheduled_whatsapp_messages`, {
          method: 'POST',
          prefix: 'saas',
          body: {
            scheduled_whatsapp_message: {
              content: args.content,
              scheduled_at: args.scheduled_at,
              template_params: args.template_params,
            },
          },
        }),
      );
    },
  }),

  defineTool({
    name: 'wa_scheduled_message_cancel',
    stability: 'beta',
    title: 'Cancel a scheduled WhatsApp message',
    description:
      'Cancel (`DELETE`) a pending scheduled WhatsApp message in a conversation (`display_id`). Only succeeds while ' +
      '`status == "pending"`; returns `422 { error: "not_pending" }` if already sent or processing. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      conversation_id: z.number().int().describe('Account-scoped conversation display_id'),
      scheduled_message_id: z.number().int(),
      confirm: z.boolean().optional(),
    }),
    handler: async ({ conversation_id, scheduled_message_id, confirm }, { client }) => {
      const refusal = requireConfirmation(
        confirm,
        `Cancel scheduled WhatsApp message ${scheduled_message_id} in conversation ${conversation_id}.`,
      );
      if (refusal) return refusal;
      await client.request(`/conversations/${conversation_id}/scheduled_whatsapp_messages/${scheduled_message_id}`, {
        method: 'DELETE',
        prefix: 'saas',
      });
      return json({ cancelled: true, conversation_id, scheduled_message_id });
    },
  }),

  defineTool({
    name: 'wa_contact_calls_list',
    stability: 'stable',
    title: 'List WhatsApp & voice call history or get a call',
    description:
      'Read WhatsApp/voice call history:\n' +
      '- With `contact_id`: returns up to 25 most recent calls for that contact (`GET /contacts/:contact_id/calls` on `saas`).\n' +
      '- With `call_id`: fetches a single WhatsApp call record (`GET /whatsapp_calls/:id` on `core`).\n' +
      '- With neither: lists account-wide calls (`GET /calls` on `core`), filterable by `inbox_id`, `status`, `direction`, and `page`.',
    inputSchema: z.object({
      contact_id: z.number().int().optional().describe('Fetch the 25 most recent calls for this contact'),
      call_id: z.number().int().optional().describe('Fetch a single WhatsApp call by ID'),
      inbox_id: z.number().int().optional().describe('Filter account call log by inbox ID'),
      status: z.string().optional().describe('Filter account call log by status (e.g. ringing, in_progress, completed, missed, rejected)'),
      direction: z.enum(['inbound', 'outbound']).optional().describe('Filter account call log by direction'),
      page: z.number().int().min(1).optional(),
    }),
    handler: async ({ contact_id, call_id, ...query }, { client }) => {
      if (call_id !== undefined) {
        return untrustedJson(await client.request(`/whatsapp_calls/${call_id}`));
      }
      if (contact_id !== undefined) {
        return untrustedJson(await client.request(`/contacts/${contact_id}/calls`, { prefix: 'saas' }));
      }
      return untrustedJson(await client.request('/calls', { query }));
    },
  }),

  defineTool({
    name: 'wa_call_transcribe',
    stability: 'beta',
    title: 'Transcribe a recorded call or voicemail',
    description:
      'Generate or retrieve the cached Whisper transcript (`POST /calls/:call_id/transcription` on `saas`) for a recorded ' +
      'call. Safe to call repeatedly: if `content_attributes.call.transcript` is already cached on the call message, it ' +
      'is returned immediately without re-billing OpenAI.',
    write: true,
    idempotent: true,
    inputSchema: z.object({
      call_id: z.number().int(),
    }),
    handler: async ({ call_id }, { client }) =>
      untrustedJson(await client.request(`/calls/${call_id}/transcription`, { method: 'POST', prefix: 'saas' })),
  }),

  defineTool({
    name: 'wa_campaigns_list',
    stability: 'stable',
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
    stability: 'stable',
    title: 'Get a campaign',
    description:
      'Fetch one campaign by its display ID. Prefer `lifecycle_permissions` (editable / launchable / cancellable) over ' +
      'inferring what is allowed from `campaign_status`.',
    inputSchema: z.object({ campaign_id: z.number().int().describe('Account-scoped display ID, not the primary key') }),
    handler: async ({ campaign_id }, { client }) => untrustedJson(await client.request(`/campaigns/${campaign_id}`)),
  }),

  defineTool({
    name: 'wa_campaign_metrics',
    stability: 'stable',
    title: 'Get campaign delivery metrics',
    description:
      'Aggregate counters plus the per-contact delivery log, newest first. The log is NOT paginated — for a large ' +
      'broadcast this response can be very large, so prefer wa_campaign_get or wa_campaign_results when you only need summary figures.',
    inputSchema: z.object({ campaign_id: z.number().int() }),
    handler: async ({ campaign_id }, { client }) => untrustedJson(await client.request(`/campaigns/${campaign_id}/metrics`)),
  }),

  defineTool({
    name: 'wa_campaign_results',
    stability: 'stable',
    title: 'Get campaign results, Marketing Messages metrics, suppressions, or A/B test results',
    description:
      'Read post-send campaign performance and diagnostics by display ID (`campaign_id`):\n' +
      '- `summary` (`GET /campaigns/:id/summary`): compact delivery/read/reply/failure counters without the full recipient log.\n' +
      '- `mm_metrics` (`GET /campaigns/:id/mm_metrics`): Meta Marketing Messages Lite / Cloud API performance counters.\n' +
      '- `suppressions` (`GET /campaigns/:id/suppressions`): contacts excluded before send and the reason each was suppressed (requires `whatsapp_campaign_intelligence`).\n' +
      '- `ab_comparison` (`GET /campaigns/:id/ab_comparison`): side-by-side variant metrics for an A/B test campaign.\n' +
      '- `ab_winner` (`GET /campaigns/:id/ab_winner`): winning variant determination for an A/B test campaign.',
    inputSchema: z.object({
      campaign_id: z.number().int().describe('Account-scoped campaign display ID'),
      view: z.enum(['summary', 'mm_metrics', 'suppressions', 'ab_comparison', 'ab_winner']).default('summary'),
    }),
    handler: async ({ campaign_id, view }, { client }) =>
      untrustedJson(await client.request(`/campaigns/${campaign_id}/${view}`)),
  }),

  defineTool({
    name: 'wa_campaign_intelligence',
    stability: 'stable',
    title: 'Get WhatsApp campaign intelligence, inbox summaries, or optimal send time',
    description:
      'Read account/inbox campaign intelligence (`view: "intelligence" | "inbox_summaries" | "optimal_send_time"`):\n' +
      '- `intelligence` (`GET /campaigns/intelligence`): delivery, read, reply, block, and suppression trends for an inbox (`inbox_id` required, optional `since`/`until` YYYY-MM-DD).\n' +
      '- `inbox_summaries` (`GET /campaigns/whatsapp_inbox_summaries`): campaign readiness and health across all WhatsApp inboxes.\n' +
      '- `optimal_send_time` (`GET /campaigns/optimal_send_time`): best hour-of-day / day-of-week send windows derived from historical engagement.',
    inputSchema: z.object({
      view: z.enum(['intelligence', 'inbox_summaries', 'optimal_send_time']).default('inbox_summaries'),
      inbox_id: z.number().int().optional().describe('Required when view is "intelligence"'),
      since: z.string().optional().describe('Start date (YYYY-MM-DD) when view is "intelligence"'),
      until: z.string().optional().describe('End date (YYYY-MM-DD) when view is "intelligence"'),
    }),
    handler: async ({ view, inbox_id, since, until }, { client }) => {
      if (view === 'intelligence') {
        if (!inbox_id) throw new Error('inbox_id is required when view is "intelligence"');
        return json(await client.request('/campaigns/intelligence', { query: { inbox_id, since, until } }));
      }
      if (view === 'optimal_send_time') {
        return json(await client.request('/campaigns/optimal_send_time'));
      }
      return json(await client.request('/campaigns/whatsapp_inbox_summaries'));
    },
  }),

  defineTool({
    name: 'wa_campaign_send_plan',
    stability: 'beta',
    title: 'Plan multi-wave sends, qualified audiences, A/B tests, or campaign copy',
    description:
      'Execute campaign planning and preparation actions (`action: "send_plan" | "qualified_audience_preview" | "qualified_audience_apply" | "create_ab_test" | "batch_draft_campaigns" | "audience_suggest" | "generate_copy" | "create_intelligence_report"`). ' +
      'Requires `confirm: true` because several actions persist campaign drafts, apply audience mutations, or generate billed AI suggestions.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      action: z.enum([
        'send_plan',
        'qualified_audience_preview',
        'qualified_audience_apply',
        'create_ab_test',
        'batch_draft_campaigns',
        'audience_suggest',
        'generate_copy',
        'create_intelligence_report',
      ]),
      payload: z
        .record(z.string(), z.unknown())
        .describe('Action-specific request payload (e.g. inbox_ids, recipient_count, whatsapp_template_category, campaign_id, prompt)'),
      confirm: z.boolean().optional(),
    }),
    handler: async ({ action, payload, confirm }, { client }) => {
      const refusal = requireConfirmation(confirm, `Execute WhatsApp campaign planning action "${action}".`);
      if (refusal) return refusal;
      const path =
        action === 'create_intelligence_report' ? '/campaign_intelligence_reports' : `/campaigns/${action}`;
      return untrustedJson(await client.request(path, { method: 'POST', body: payload }));
    },
  }),

  defineTool({
    name: 'wa_audience_estimate',
    stability: 'stable',
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
    stability: 'stable',
    title: 'Run a campaign preflight risk check',
    description:
      'Evaluate an audience, template, and send window against suppression rules, WABA health, template approval, and ' +
      'recent complaint signals — without sending anything. Safe to call repeatedly. ' +
      'IMPORTANT: a blocked check still returns HTTP 200, so read `allowed` and `blocking_issues` rather than trusting ' +
      'the absence of an error. Always run this before wa_campaign_launch and show the operator what it says. ' +
      '`inbox_id` is always required — AirysChat resolves the inbox first, even when `campaign_id` is given.',
    inputSchema: z.object({
      inbox_id: z.number().int().describe('WhatsApp inbox that will send. Required even for a saved campaign'),
      campaign_id: z.number().int().optional().describe('Also evaluate a saved campaign (display ID) on that inbox'),
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
    stability: 'beta',
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
    name: 'wa_campaign_update',
    stability: 'beta',
    title: 'Update a draft or scheduled campaign',
    description:
      'Update a campaign by its display ID (`PATCH /campaigns/:id`). Only editable while `lifecycle_permissions.editable` is true. ' +
      'Requires `confirm: true` because updating `save_mode: "schedule"` or changing the audience/template alters what customers receive.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      campaign_id: z.number().int().describe('Account-scoped campaign display ID'),
      title: z.string().min(1).optional(),
      message: z.string().min(1).optional().describe('Name of an approved WhatsApp template'),
      inbox_id: z.number().int().optional(),
      save_mode: z.enum(['draft', 'schedule']).optional(),
      scheduled_at: z.string().optional(),
      whatsapp_template_category: TEMPLATE_CATEGORY.optional(),
      description: z.string().optional(),
      audience: audienceSelector.optional(),
      template_params: z.record(z.string(), z.unknown()).optional(),
      confirm: z.boolean().optional(),
    }),
    handler: async ({ campaign_id, confirm, ...campaign }, { client }) => {
      const existing = (await client.request(`/campaigns/${campaign_id}`)) as { title?: string; campaign_status?: string };
      const refusal = requireConfirmation(
        confirm,
        `Update campaign ${campaign_id} ("${existing.title ?? 'untitled'}", status: ${existing.campaign_status ?? 'unknown'}).`,
      );
      if (refusal) return refusal;
      return untrustedJson(await client.request(`/campaigns/${campaign_id}`, { method: 'PATCH', body: { campaign } }));
    },
  }),

  defineTool({
    name: 'wa_campaign_delete',
    stability: 'beta',
    title: 'Delete a campaign',
    description:
      'Permanently delete a campaign by its display ID (`DELETE /campaigns/:id`). Fetches the campaign first to preview ' +
      'its title and status. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      campaign_id: z.number().int().describe('Account-scoped campaign display ID'),
      confirm: z.boolean().optional(),
    }),
    handler: async ({ campaign_id, confirm }, { client }) => {
      const existing = (await client.request(`/campaigns/${campaign_id}`)) as { title?: string; campaign_status?: string };
      const refusal = requireConfirmation(
        confirm,
        `Delete campaign ${campaign_id} ("${existing.title ?? 'untitled'}", status: ${existing.campaign_status ?? 'unknown'}). This cannot be undone.`,
      );
      if (refusal) return refusal;
      await client.request(`/campaigns/${campaign_id}`, { method: 'DELETE' });
      return json({ deleted: true, campaign_id, title: existing.title });
    },
  }),

  defineTool({
    name: 'wa_campaign_launch',
    stability: 'beta',
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
    stability: 'beta',
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
    stability: 'beta',
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
    stability: 'stable',
    title: 'Check WhatsApp campaign health for an inbox',
    description:
      'Quality rating, messaging limits, and recent send volume for an inbox’s WhatsApp number, plus plain-language `alerts`. ' +
      'Check this when a preflight blocks or sends start failing — a quality drop or lowered limit shows up here before it ' +
      'shows up as delivery errors.\n\n' +
      'Report `alerts` verbatim rather than re-deriving them from `quality_rating`; Meta returns that field with different ' +
      'vocabularies (GREEN/YELLOW/RED or high/medium/low) depending on API version. ' +
      '`latest` can be stale — an alert is raised when the snapshot is over 24 hours old. Pass `refresh: true` to capture a ' +
      'live snapshot from Meta, which is slower and consumes Graph API quota.',
    inputSchema: z.object({
      inbox_id: z.number().int(),
      refresh: z.boolean().optional().describe('Capture a live snapshot from Meta before responding'),
      since: z.string().optional().describe('Start of the snapshot window (YYYY-MM-DD). Defaults to 30 days ago.'),
      until: z.string().optional().describe('End of the snapshot window (YYYY-MM-DD). Defaults to today.'),
    }),
    handler: async ({ inbox_id, ...query }, { client }) =>
      json(await client.request(`/inboxes/${inbox_id}/whatsapp_campaign_health`, { query })),
  }),

  defineTool({
    name: 'wa_contact_preferences',
    stability: 'beta',
    title: 'List or inspect WhatsApp contact opt-in/opt-out preferences',
    description:
      'Read WhatsApp marketing consent preferences (`whatsapp_contact_preferences`, requires `whatsapp_campaign_intelligence`):\n' +
      '- With `contact_id`: fetches that contact’s preference record (`GET /whatsapp_contact_preferences/:contact_id`, optional `include_events: true`).\n' +
      '- With `backfill_preview: true`: previews historical opt-in/opt-out backfill candidates (`POST /whatsapp_contact_preferences/backfill_preview`).\n' +
      '- Otherwise: lists contact preferences for `inbox_id` (`GET /whatsapp_contact_preferences`).',
    inputSchema: z.object({
      inbox_id: z.number().int(),
      contact_id: z.number().int().optional(),
      include_events: z.boolean().optional(),
      backfill_preview: z.boolean().optional(),
      status: z.enum(['opted_in', 'opted_out', 'unknown', 'all']).optional(),
      source: z.string().optional(),
      subscription_scope: z.string().optional(),
      confidence: z.string().optional(),
      q: z.string().optional(),
      page: z.number().int().min(1).optional(),
    }),
    handler: async ({ contact_id, include_events, backfill_preview, ...query }, { client }) => {
      if (backfill_preview) {
        return untrustedJson(
          await client.request('/whatsapp_contact_preferences/backfill_preview', {
            method: 'POST',
            body: { inbox_id: query.inbox_id },
          }),
        );
      }
      if (contact_id !== undefined) {
        return untrustedJson(
          await client.request(`/whatsapp_contact_preferences/${contact_id}`, {
            query: { inbox_id: query.inbox_id, include_events },
          }),
        );
      }
      return untrustedJson(await client.request('/whatsapp_contact_preferences', { query }));
    },
  }),

  defineTool({
    name: 'wa_contact_preference_update',
    stability: 'beta',
    title: 'Update WhatsApp contact opt-in/opt-out status or review consent events',
    description:
      'Update WhatsApp marketing consent (`action: "update" | "review_candidate" | "backfill_apply"`). ' +
      'Requires `confirm: true` because changing opt-in/opt-out state controls whether a contact can receive marketing broadcasts.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      action: z.enum(['update', 'review_candidate', 'backfill_apply']).default('update'),
      inbox_id: z.number().int(),
      contact_id: z.number().int().optional().describe('Required when action is "update"'),
      status: z.enum(['opted_in', 'opted_out']).optional().describe('Required when action is "update"'),
      subscription_scope: z.string().optional(),
      event_id: z.number().int().optional().describe('Required when action is "review_candidate"'),
      review_action: z.enum(['accept', 'dismiss']).optional().describe('Required when action is "review_candidate"'),
      reason: z.string().optional().describe('Audit reason for the consent change'),
      confirm: z.boolean().optional(),
    }),
    handler: async (args, { client }) => {
      const refusal = requireConfirmation(
        args.confirm,
        `Execute WhatsApp contact consent "${args.action}" on inbox ${args.inbox_id}${args.contact_id ? ` for contact ${args.contact_id} → ${args.status ?? ''}` : ''}.`,
      );
      if (refusal) return refusal;

      if (args.action === 'review_candidate') {
        return untrustedJson(
          await client.request('/whatsapp_contact_preferences/review_candidate', {
            method: 'POST',
            body: {
              inbox_id: args.inbox_id,
              event_id: args.event_id,
              review_action: args.review_action,
              reason: args.reason,
            },
          }),
        );
      }

      if (args.action === 'backfill_apply') {
        return untrustedJson(
          await client.request('/whatsapp_contact_preferences/backfill_apply', {
            method: 'POST',
            body: { inbox_id: args.inbox_id, reason: args.reason },
          }),
        );
      }

      if (!args.contact_id) throw new Error('contact_id is required when action is "update"');
      return untrustedJson(
        await client.request(`/whatsapp_contact_preferences/${args.contact_id}`, {
          method: 'PATCH',
          body: {
            inbox_id: args.inbox_id,
            status: args.status,
            reason: args.reason,
            subscription_scope: args.subscription_scope,
          },
        }),
      );
    },
  }),

  defineTool({
    name: 'wa_flows_list',
    stability: 'stable',
    title: 'List or inspect WhatsApp Flows',
    description:
      'List WhatsApp Flows (`GET /whatsapp_flows`), fetch one Flow (`GET /whatsapp_flows/:id`), or fetch its interactive ' +
      'preview URL from Meta (`GET /whatsapp_flows/:id/preview` when `preview: true`).',
    inputSchema: z.object({
      flow_id: z.number().int().optional(),
      inbox_id: z.number().int().optional(),
      preview: z.boolean().optional().describe('When true with flow_id, fetches the Meta preview URL'),
    }),
    handler: async ({ flow_id, inbox_id, preview }, { client }) => {
      if (flow_id !== undefined && preview) {
        return json(await client.request(`/whatsapp_flows/${flow_id}/preview`));
      }
      if (flow_id !== undefined) {
        return untrustedJson(await client.request(`/whatsapp_flows/${flow_id}`));
      }
      return untrustedJson(await client.request('/whatsapp_flows', { query: { inbox_id } }));
    },
  }),

  defineTool({
    name: 'wa_flow_upsert',
    stability: 'beta',
    title: 'Create, update, publish, deprecate, sync, or delete a WhatsApp Flow',
    description:
      'Manage a WhatsApp Flow (`action: "create" | "update" | "publish" | "deprecate" | "sync" | "delete"`). ' +
      'Requires `confirm: true` because publishing and deprecating at Meta are one-way doors: published Flows cannot be ' +
      'edited or deleted (only deprecated), and draft Flows with `inbox_id` are synced to Meta WABA.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      action: z.enum(['create', 'update', 'publish', 'deprecate', 'sync', 'delete']).default('create'),
      flow_id: z.number().int().optional().describe('Required for update, publish, deprecate, sync, and delete'),
      name: z.string().optional().describe('Required for create'),
      inbox_id: z.number().int().optional(),
      categories: z.array(z.string()).optional(),
      flow_json: z.record(z.string(), z.unknown()).optional(),
      endpoint_uri: z.record(z.string(), z.unknown()).optional(),
      confirm: z.boolean().optional(),
    }),
    handler: async (args, { client }) => {
      if (args.action === 'create') {
        const refusal = requireConfirmation(
          args.confirm,
          `Create WhatsApp Flow "${args.name ?? 'unnamed'}"${args.inbox_id ? ` on inbox ${args.inbox_id}` : ''}.`,
        );
        if (refusal) return refusal;
        return untrustedJson(
          await client.request('/whatsapp_flows', {
            method: 'POST',
            body: {
              whatsapp_flow: {
                name: args.name,
                inbox_id: args.inbox_id,
                categories: args.categories,
                flow_json: args.flow_json,
                endpoint_uri: args.endpoint_uri,
              },
            },
          }),
        );
      }

      if (!args.flow_id) throw new Error(`flow_id is required when action is "${args.action}"`);
      const existing = (await client.request(`/whatsapp_flows/${args.flow_id}`)) as Record<string, unknown>;
      const label = `WhatsApp Flow ${args.flow_id} ("${String(existing.name ?? 'unnamed')}", status: ${String(existing.status ?? 'unknown')})`;

      const refusal = requireConfirmation(args.confirm, `Execute "${args.action}" on ${label}.`);
      if (refusal) return refusal;

      if (args.action === 'update') {
        return untrustedJson(
          await client.request(`/whatsapp_flows/${args.flow_id}`, {
            method: 'PATCH',
            body: {
              whatsapp_flow: {
                name: args.name,
                categories: args.categories,
                flow_json: args.flow_json,
                endpoint_uri: args.endpoint_uri,
              },
            },
          }),
        );
      }

      if (args.action === 'delete') {
        await client.request(`/whatsapp_flows/${args.flow_id}`, { method: 'DELETE' });
        return json({ deleted: true, flow_id: args.flow_id, name: existing.name });
      }

      return untrustedJson(await client.request(`/whatsapp_flows/${args.flow_id}/${args.action}`, { method: 'POST' }));
    },
  }),
];
