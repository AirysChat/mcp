/**
 * API & Tool Surface Stability Freeze Test (`GA-11`).
 *
 * Enforces `docs/stability-policy.md` and ADR 0003:
 * 1. Every frozen `stable` tool must remain registered (either as `stable` or as `deprecated`
 *    with a valid `replacedBy` pointing to another registered tool).
 * 2. No frozen `stable` tool may add a new required input parameter (existing required
 *    parameters must be a superset of current required parameters).
 * 3. Every `deprecated` tool must name a valid `replacedBy` tool that is registered.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { TOOLSET_NAMES } from '../src/config.js';
import { selectToolsForConfig } from '../src/server.js';

export const FROZEN_STABLE_TOOLS: Record<string, readonly string[]> = {
  account_settings_get: [],
  agents_list: [],
  airyschat_api: ['path'],
  airyschat_api_search: ['query'],
  article_delete: ['portal_slug'],
  article_get: ['article_id', 'portal_slug'],
  article_publish: ['portal_slug'],
  article_upsert: ['portal_slug'],
  articles_list: ['portal_slug'],
  assignment_policies_list: [],
  automation_rules_list: [],
  campaign_preflight_report: ['inbox_id'],
  canned_responses_list: [],
  categories_list: ['portal_slug'],
  category_delete: ['category_id', 'portal_slug'],
  category_upsert: ['portal_slug'],
  contact_conversations: ['contact_id'],
  contact_get: ['contact_id'],
  contacts_search: ['q'],
  conversation_ai_usage: ['conversation_id'],
  conversation_deal_get: ['conversation_id'],
  conversation_get: ['conversation_id'],
  conversation_messages: ['conversation_id'],
  conversation_view: ['conversation_id'],
  conversations_list: [],
  crm_activities_list: [],
  crm_board: [],
  crm_close_reasons_list: [],
  crm_deal_get: ['deal_id'],
  crm_deal_notes_list: ['deal_id'],
  crm_deal_timeline: ['deal_id'],
  crm_deals_search: [],
  crm_insights: [],
  crm_loss_reasons_list: [],
  crm_pipeline_get: ['pipeline_id'],
  crm_pipelines_list: [],
  crm_views_list: [],
  csat_responses: ['view'],
  custom_attributes_list: [],
  custom_filters_list: [],
  inbox_get: ['inbox_id'],
  inboxes_list: [],
  integrations_list: [],
  label_delete: ['label_id'],
  label_upsert: [],
  labels_list: [],
  llm_models_list: [],
  macros_list: [],
  me: [],
  platform_health: [],
  portal_get: ['portal_slug'],
  portal_upsert: [],
  portals_list: [],
  reports_by_dimension: ['dimension', 'since', 'until'],
  reports_csv_export: ['report'],
  reports_distribution: ['since', 'until'],
  reports_drilldown: ['bucket_timestamp', 'metric', 'since', 'type', 'until'],
  reports_inbox_label_matrix: ['since', 'until'],
  reports_live_metrics: [],
  reports_summary: ['type', 'view'],
  reports_timeseries: ['metric', 'since', 'type', 'until'],
  search: ['q'],
  team_get: ['team_id'],
  teams_list: [],
  wa_audience_estimate: [],
  wa_campaign_get: ['campaign_id'],
  wa_campaign_intelligence: ['view'],
  wa_campaign_metrics: ['campaign_id'],
  wa_campaign_preflight: ['inbox_id'],
  wa_campaign_results: ['campaign_id', 'view'],
  wa_campaigns_list: [],
  wa_contact_calls_list: [],
  wa_flows_list: [],
  wa_inbox_health: ['inbox_id'],
  wa_scheduled_messages_list: ['conversation_id'],
  wa_template_analytics: ['template_id'],
  wa_template_get: ['template_id'],
  wa_template_rejection_explain: ['template_id'],
  wa_templates_list: [],
  webhooks_list: [],
};

describe('GA-11 — API & Tool Surface Stability Freeze', () => {
  const allTools = selectToolsForConfig({ toolsets: new Set(TOOLSET_NAMES) });
  const byName = new Map(allTools.map((tool) => [tool.name, tool]));

  it('keeps every frozen stable tool registered and forbids adding new required input parameters', () => {
    for (const [name, frozenRequired] of Object.entries(FROZEN_STABLE_TOOLS)) {
      const tool = byName.get(name);
      assert.ok(
        tool,
        `Frozen stable tool "${name}" was removed! Per docs/stability-policy.md, keep it as stability: "deprecated" with replacedBy.`,
      );
      assert.ok(
        tool.stability === 'stable' || tool.stability === 'deprecated',
        `Frozen stable tool "${name}" was downgraded to "${tool.stability}".`,
      );

      const schema = z.toJSONSchema(tool.inputSchema) as { required?: string[] };
      const currentRequired = (schema.required ?? []).slice().sort();
      const addedRequired = currentRequired.filter((param) => !frozenRequired.includes(param));
      assert.deepEqual(
        addedRequired,
        [],
        `Frozen stable tool "${name}" added new required parameter(s): ${addedRequired.join(', ')}. New parameters on stable tools must be optional.`,
      );
    }
  });

  it('requires every stable tool in the codebase to be listed in FROZEN_STABLE_TOOLS', () => {
    const unlistedStable = allTools
      .filter((tool) => tool.stability === 'stable' && !(tool.name in FROZEN_STABLE_TOOLS))
      .map((tool) => tool.name);
    assert.deepEqual(
      unlistedStable,
      [],
      `New stable tool(s) must be added to FROZEN_STABLE_TOOLS in test/stability-freeze.test.ts: ${unlistedStable.join(', ')}`,
    );
  });

  it('requires every deprecated tool to declare a valid replacedBy tool', () => {
    for (const tool of allTools) {
      if (tool.stability !== 'deprecated') continue;
      assert.ok(tool.replacedBy, `Deprecated tool "${tool.name}" must specify replacedBy`);
      assert.ok(
        byName.has(tool.replacedBy),
        `Deprecated tool "${tool.name}" points to unknown replacedBy "${tool.replacedBy}"`,
      );
    }
  });
});
