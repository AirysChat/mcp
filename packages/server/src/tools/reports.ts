/**
 * Reports v2 (`core_v2`) and CSAT survey analytics (`core`) — read-only analytics toolset.
 *
 * Source of truth: `docs/api/domains/reports.md` (`Api::V2::Accounts::ReportsController`,
 * `SummaryReportsController`, `LiveReportsController`, `YearInReviewsController`, and
 * `Api::V1::Accounts::CsatSurveyResponsesController`).
 *
 * Non-obvious controller behaviours:
 * 1. `since` and `until` are Unix epoch second strings (e.g. `"1730000000"`).
 * 2. `/reports`, `/reports/summary`, and `/reports/bot_summary` call `params[:type].to_sym`,
 *    which raises if `type` is omitted — these tools default `type` to `"account"`.
 * 3. `/reports/outgoing_messages_count` only accepts `group_by` in `agent | team | inbox | label`.
 * 4. `/summary_reports/channel` rejects windows longer than 6 months with HTTP 422.
 * 5. `/live_reports/grouped_conversation_metrics` only accepts `group_by` in `assignee_id | team_id`.
 * 6. `/reports/drilldown` and `/csat_survey_responses` can carry customer messages or contact
 *    previews and therefore return `untrustedJson`.
 */

import { z } from 'zod';
import { defineTool } from '../toolsets.js';
import { json, untrustedJson } from '../result.js';

const REPORT_TYPE = z.enum(['account', 'agent', 'inbox', 'label', 'team']);
const GROUP_BY_PERIOD = z.enum(['hour', 'day', 'week', 'month', 'year']);
const REPORT_METRIC = z.enum([
  'conversations_count',
  'incoming_messages_count',
  'outgoing_messages_count',
  'first_response_time',
  'resolution_time',
  'resolutions_count',
  'bot_resolutions_count',
  'bot_handoffs_count',
  'reply_time',
]);

export const reportsTools = [
  defineTool({
    name: 'reports_summary',
    stability: 'stable',
    title: 'Get account or dimension report summary, bot metrics, or year in review',
    description:
      'Fetch headline analytics counters (`view: "summary" | "bot_summary" | "bot_metrics" | "open_conversations" | "outgoing_messages" | "year_in_review"`):\n' +
      '- `summary` (`GET /reports/summary` on `core_v2`): conversations, incoming/outgoing messages, avg first response time, avg resolution time, reply time, and resolution count for the current window plus the preceding equal-length window (`previous`). `since` and `until` are Unix epoch seconds.\n' +
      '- `bot_summary` (`GET /reports/bot_summary` on `core_v2`): bot resolution and handoff summary with `previous` period comparison.\n' +
      '- `bot_metrics` (`GET /reports/bot_metrics` on `core_v2`): conversation count, message count, resolution rate, and handoff rate for bots.\n' +
      '- `open_conversations` (`GET /reports/conversations` on `core_v2`): live open/unattended/unassigned counts for the account or per agent.\n' +
      '- `outgoing_messages` (`GET /reports/outgoing_messages_count` on `core_v2`): outgoing message counts grouped by `agent | team | inbox | label` (`outgoing_group_by`).\n' +
      '- `year_in_review` (`GET /year_in_review` on `core_v2`): annual summary for `year`.',
    inputSchema: z.object({
      view: z
        .enum(['summary', 'bot_summary', 'bot_metrics', 'open_conversations', 'outgoing_messages', 'year_in_review'])
        .default('summary'),
      type: REPORT_TYPE.default('account').describe('Dimension scope for summary, bot_summary, or open_conversations'),
      id: z.number().int().optional().describe('Dimension entity ID when type is agent, inbox, label, or team'),
      since: z.string().optional().describe('Window start as Unix epoch seconds string (e.g. "1730000000")'),
      until: z.string().optional().describe('Window end as Unix epoch seconds string (e.g. "1732592000")'),
      group_by: GROUP_BY_PERIOD.optional(),
      business_hours: z.boolean().optional(),
      timezone_offset: z.number().optional().describe('Hours offset from UTC, e.g. -3'),
      outgoing_group_by: z
        .enum(['agent', 'team', 'inbox', 'label'])
        .optional()
        .describe('Required when view is "outgoing_messages"'),
      user_id: z.number().int().optional().describe('Optional agent user_id filter when view is "open_conversations"'),
      page: z.number().int().min(1).optional(),
      year: z.number().int().optional().describe('Year (e.g. 2026) when view is "year_in_review"'),
    }),
    handler: async (args, { client }) => {
      if (args.view === 'year_in_review') {
        return json(await client.request('/year_in_review', { prefix: 'core_v2', query: { year: args.year } }));
      }
      if (args.view === 'open_conversations') {
        const type = args.type === 'agent' ? 'agent' : 'account';
        return json(
          await client.request('/reports/conversations', {
            prefix: 'core_v2',
            query: { type, user_id: args.user_id, page: args.page },
          }),
        );
      }
      if (args.view === 'outgoing_messages') {
        return json(
          await client.request('/reports/outgoing_messages_count', {
            prefix: 'core_v2',
            query: {
              group_by: args.outgoing_group_by ?? 'agent',
              since: args.since,
              until: args.until,
            },
          }),
        );
      }
      if (args.view === 'bot_metrics') {
        return json(
          await client.request('/reports/bot_metrics', {
            prefix: 'core_v2',
            query: { since: args.since, until: args.until },
          }),
        );
      }
      const path = args.view === 'bot_summary' ? '/reports/bot_summary' : '/reports/summary';
      return json(
        await client.request(path, {
          prefix: 'core_v2',
          query: {
            type: args.type,
            id: args.id,
            since: args.since,
            until: args.until,
            group_by: args.group_by,
            business_hours: args.business_hours,
            timezone_offset: args.timezone_offset,
          },
        }),
      );
    },
  }),

  defineTool({
    name: 'reports_timeseries',
    stability: 'stable',
    title: 'Get report metric timeseries or hourly traffic heatmap data',
    description:
      'Fetch bucketed timeseries points (`[{ value, timestamp, count }]`) from `GET /reports` (`core_v2`). ' +
      '`since` and `until` are Unix epoch seconds strings. Pass `metric: "conversations_count"` and `group_by: "hour"` ' +
      'to retrieve the hourly conversation traffic heatmap.',
    inputSchema: z.object({
      metric: REPORT_METRIC,
      type: REPORT_TYPE.default('account'),
      id: z.number().int().optional().describe('Dimension ID when type is agent, inbox, label, or team'),
      since: z.string().describe('Start timestamp in Unix epoch seconds (e.g. "1730000000")'),
      until: z.string().describe('End timestamp in Unix epoch seconds (e.g. "1732592000")'),
      group_by: GROUP_BY_PERIOD.optional().describe('Bucket size: hour (for traffic heatmap), day, week, month, or year'),
      business_hours: z.boolean().optional(),
      timezone_offset: z.number().optional().describe('Hours offset from UTC, e.g. -3'),
    }),
    handler: async (args, { client }) =>
      json(await client.request('/reports', { prefix: 'core_v2', query: args })),
  }),

  defineTool({
    name: 'reports_by_dimension',
    stability: 'stable',
    title: 'Get summary reports broken down by agent, team, inbox, label, or channel',
    description:
      'Fetch per-entity performance tables (`GET /summary_reports/:dimension` on `core_v2`) across `agent`, `team`, ' +
      '`inbox`, `label`, or `channel`. `since` and `until` are Unix epoch seconds strings. Note: `dimension: "channel"` ' +
      'rejects date ranges longer than 6 months (`422`).',
    inputSchema: z.object({
      dimension: z.enum(['agent', 'team', 'inbox', 'label', 'channel']),
      since: z.string().describe('Start timestamp in Unix epoch seconds'),
      until: z.string().describe('End timestamp in Unix epoch seconds'),
      business_hours: z.boolean().optional(),
    }),
    handler: async ({ dimension, ...query }, { client }) =>
      untrustedJson(await client.request(`/summary_reports/${dimension}`, { prefix: 'core_v2', query })),
  }),

  defineTool({
    name: 'reports_live_metrics',
    stability: 'stable',
    title: 'Get real-time open/unattended conversation metrics',
    description:
      'Real-time queue counters (`open`, `unattended`, `unassigned`, `pending`) across the account (`group_by` omitted → ' +
      '`GET /live_reports/conversation_metrics`) or grouped by `assignee_id` or `team_id` (`GET /live_reports/grouped_conversation_metrics`).',
    inputSchema: z.object({
      group_by: z.enum(['assignee_id', 'team_id']).optional().describe('Group live metrics by assignee or team'),
      team_id: z.number().int().optional().describe('Filter live metrics to a specific team'),
    }),
    handler: async ({ group_by, team_id }, { client }) => {
      if (group_by) {
        return json(
          await client.request('/live_reports/grouped_conversation_metrics', {
            prefix: 'core_v2',
            query: { group_by, team_id },
          }),
        );
      }
      return json(
        await client.request('/live_reports/conversation_metrics', {
          prefix: 'core_v2',
          query: { team_id },
        }),
      );
    },
  }),

  defineTool({
    name: 'reports_inbox_label_matrix',
    stability: 'stable',
    title: 'Get conversation counts across the inbox × label matrix',
    description:
      'Cross-tabulate conversation counts by inbox and label (`GET /reports/inbox_label_matrix` on `core_v2`). ' +
      'Optionally filter by `inbox_ids` and `label_ids`.',
    inputSchema: z.object({
      since: z.string().describe('Start timestamp in Unix epoch seconds'),
      until: z.string().describe('End timestamp in Unix epoch seconds'),
      inbox_ids: z.array(z.number().int()).optional(),
      label_ids: z.array(z.number().int()).optional(),
    }),
    handler: async (args, { client }) =>
      untrustedJson(await client.request('/reports/inbox_label_matrix', { prefix: 'core_v2', query: args })),
  }),

  defineTool({
    name: 'reports_distribution',
    stability: 'stable',
    title: 'Get first response time distribution by channel',
    description:
      'Histogram buckets (`0-1h`, `1-4h`, `4-8h`, `8-24h`, `24h+`) of first response times per channel type ' +
      '(`GET /reports/first_response_time_distribution` on `core_v2`).',
    inputSchema: z.object({
      since: z.string().describe('Start timestamp in Unix epoch seconds'),
      until: z.string().describe('End timestamp in Unix epoch seconds'),
    }),
    handler: async (args, { client }) =>
      json(await client.request('/reports/first_response_time_distribution', { prefix: 'core_v2', query: args })),
  }),

  defineTool({
    name: 'reports_drilldown',
    stability: 'stable',
    title: 'Drill down into conversations inside a report timeseries bucket',
    description:
      'List the individual conversations that contributed to a specific timeseries bucket (`GET /reports/drilldown` on `core_v2`). ' +
      'Requires an administrator API key (`401` for non-admin agents). Returns conversation and contact previews wrapped in `untrustedJson`.',
    inputSchema: z.object({
      metric: z.enum(['conversations_count', 'incoming_messages_count', 'outgoing_messages_count', 'resolutions_count']),
      bucket_timestamp: z.union([z.string(), z.number()]).describe('Unix timestamp of the timeseries bucket'),
      since: z.string().describe('Overall report window start (Unix epoch seconds)'),
      until: z.string().describe('Overall report window end (Unix epoch seconds)'),
      type: REPORT_TYPE.default('account'),
      id: z.number().int().optional(),
      group_by: GROUP_BY_PERIOD.optional(),
      timezone_offset: z.number().optional(),
      business_hours: z.boolean().optional(),
      page: z.number().int().min(1).optional(),
      per_page: z.number().int().min(1).max(100).optional(),
    }),
    handler: async (args, { client }) =>
      untrustedJson(await client.request('/reports/drilldown', { prefix: 'core_v2', query: args })),
  }),

  defineTool({
    name: 'csat_responses',
    stability: 'stable',
    title: 'Get CSAT survey metrics or list individual customer responses',
    description:
      'Read Customer Satisfaction (CSAT) survey data (`core` prefix):\n' +
      '- `metrics` (`GET /csat_survey_responses/metrics`): total responses, satisfaction score, response rate, and rating breakdown (1..5).\n' +
      '- `list` (`GET /csat_survey_responses`): paginated survey responses including customer `feedback_message`, contact details, and assigned agent (25 per page).',
    inputSchema: z.object({
      view: z.enum(['metrics', 'list']).default('metrics'),
      since: z.string().optional().describe('Start timestamp in Unix epoch seconds'),
      until: z.string().optional().describe('End timestamp in Unix epoch seconds'),
      user_ids: z.array(z.number().int()).optional().describe('Filter by assigned agent IDs'),
      inbox_id: z.number().int().optional(),
      team_id: z.number().int().optional(),
      rating: z.number().int().min(1).max(5).optional(),
      sort: z.enum(['created_at', '-created_at', 'rating', '-rating']).optional(),
      page: z.number().int().min(1).optional(),
    }),
    handler: async ({ view, ...query }, { client }) => {
      const path = view === 'metrics' ? '/csat_survey_responses/metrics' : '/csat_survey_responses';
      return untrustedJson(await client.request(path, { query }));
    },
  }),

  defineTool({
    name: 'reports_csv_export',
    stability: 'stable',
    title: 'Download CSV exports for agent, inbox, label, team, traffic heatmap, or CSAT reports',
    description:
      'Download the formatted CSV report generated by AirysChat (`report: "agents" | "inboxes" | "labels" | "teams" | "conversations_summary" | "conversation_traffic" | "csat"`). ' +
      'Returns the CSV text wrapped in `untrustedJson`.',
    inputSchema: z.object({
      report: z.enum([
        'agents',
        'inboxes',
        'labels',
        'teams',
        'conversations_summary',
        'conversation_traffic',
        'csat',
      ]),
      since: z.string().optional().describe('Start timestamp in Unix epoch seconds'),
      until: z.string().optional().describe('End timestamp in Unix epoch seconds'),
      business_hours: z.boolean().optional(),
      timezone_offset: z.number().optional().describe('Used by conversation_traffic'),
      days_before: z.number().int().optional().describe('Days before today for conversation_traffic (defaults to 6)'),
      user_ids: z.array(z.number().int()).optional().describe('Agent filter for csat export'),
      inbox_id: z.number().int().optional().describe('Inbox filter for csat export'),
      team_id: z.number().int().optional().describe('Team filter for csat export'),
      rating: z.number().int().min(1).max(5).optional().describe('Rating filter for csat export'),
    }),
    handler: async ({ report, ...query }, { client }) => {
      if (report === 'csat') {
        const csv = await client.request('/csat_survey_responses/download', { query });
        return untrustedJson({ report, csv });
      }
      const csv = await client.request(`/reports/${report}`, { prefix: 'core_v2', query });
      return untrustedJson({ report, csv });
    },
  }),
];
