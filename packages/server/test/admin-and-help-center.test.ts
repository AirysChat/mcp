import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AirysChatClient, RequestOptions } from '../src/client.js';
import type { Config } from '../src/config.js';
import {
  WebhookUrlValidationError,
  adminTools,
  validateHookSettingsUrls,
  validateWebhookUrl,
} from '../src/tools/admin.js';
import { helpCenterTools } from '../src/tools/help_center.js';
import type { AnyToolDefinition, ToolContext } from '../src/toolsets.js';

interface RecordedCall {
  path: string;
  options?: RequestOptions;
}

function createMockContext(
  responder: (path: string, options?: RequestOptions) => unknown = () => ({ id: 1, ok: true }),
): { context: ToolContext; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const client = {
    request: async (path: string, options?: RequestOptions) => {
      calls.push({ path, options });
      return responder(path, options);
    },
  } as unknown as AirysChatClient;

  const config: Config = {
    baseUrl: 'https://staging.airys.app',
    apiKey: 'test-token',
    accountId: 6,
    toolsets: new Set(['core', 'whatsapp', 'admin', 'help_center']),
    features: 'beta',
    readOnly: false,
    timeoutMs: 5_000,
    maxAccess: 'irreversible',
  };

  return { context: { client, config }, calls };
}

function findTool(list: AnyToolDefinition[], name: string): AnyToolDefinition {
  const tool = list.find((entry) => entry.name === name);
  assert.ok(tool, `Expected tool "${name}" to exist`);
  return tool;
}

describe('Lane 008 — Admin & Help Center (`ADM-01..ADM-09`)', () => {
  it('ADM-04: validateWebhookUrl and validateHookSettingsUrls reject non-HTTPS, credentials, localhost, RFC1918, metadata, CGNAT, and IPv6 internal hosts', () => {
    assert.equal(
      validateWebhookUrl('https://hooks.example.com/airys/events?source=mcp'),
      'https://hooks.example.com/airys/events?source=mcp',
    );

    const rejectedUrls = [
      '',
      'not-a-url',
      'http://hooks.example.com/webhook',
      'ftp://hooks.example.com/webhook',
      'javascript:alert(1)',
      'https://user:pass@hooks.example.com/webhook',
      'https://localhost/webhook',
      'https://api.localhost/webhook',
      'https://service.local/webhook',
      'https://db.internal/webhook',
      'https://metadata/computeMetadata/v1/',
      'https://metadata.google.internal/computeMetadata/v1/',
      'https://instance-data/latest/meta-data/',
      'https://intranet/webhook',
      'https://0.0.0.0/webhook',
      'https://127.0.0.1/webhook',
      'https://127.255.255.254/webhook',
      'https://2130706433/webhook', // 127.0.0.1 decimal
      'https://0x7f000001/webhook', // 127.0.0.1 hex
      'https://10.0.0.1/webhook',
      'https://172.16.0.1/webhook',
      'https://172.31.255.255/webhook',
      'https://192.168.1.10/webhook',
      'https://169.254.169.254/latest/meta-data/',
      'https://100.64.0.1/webhook',
      'https://192.0.0.1/webhook',
      'https://192.0.2.1/webhook',
      'https://198.18.0.1/webhook',
      'https://198.51.100.1/webhook',
      'https://203.0.113.1/webhook',
      'https://224.0.0.1/webhook',
      'https://255.255.255.255/webhook',
      'https://[::1]/webhook',
      'https://[::]/webhook',
      'https://[fe80::1]/webhook',
      'https://[fc00::1]/webhook',
      'https://[fd12:3456:789a::1]/webhook',
      'https://[ff02::1]/webhook',
      'https://[2001:db8::1]/webhook',
      'https://[::ffff:127.0.0.1]/webhook',
      'https://[::ffff:10.0.0.1]/webhook',
    ];

    for (const bad of rejectedUrls) {
      assert.throws(
        () => validateWebhookUrl(bad),
        WebhookUrlValidationError,
        `Expected "${bad}" to be rejected by validateWebhookUrl`,
      );
    }

    assert.doesNotThrow(() =>
      validateHookSettingsUrls({
        endpoint_url: 'https://api.partner.example.com/hooks',
        nested: { callback_url: 'https://events.partner.example.com/cb' },
      }),
    );

    assert.throws(
      () => validateHookSettingsUrls({ endpoint_url: 'http://169.254.169.254/latest' }),
      WebhookUrlValidationError,
    );
    assert.throws(
      () => validateHookSettingsUrls({ nested: { custom: 'https://10.0.0.8/internal' } }),
      WebhookUrlValidationError,
    );
  });

  it('ADM-02..ADM-06: exercises admin toolset handlers, confirmation gates, and untrusted fencing', async () => {
    const { context, calls } = createMockContext((path) => {
      if (path === '/inboxes/9') return { id: 9, name: 'WhatsApp Sales', channel_type: 'Channel::Whatsapp' };
      if (path === '/teams/2') return { id: 2, name: 'Support Tier 2', description: 'Escalations' };
      if (path === '/automation_rules/4') return { payload: { id: 4, name: 'Auto-assign VIP', event_name: 'conversation_created' } };
      if (path === '/macros/7') return { payload: { id: 7, name: 'Escalate', visibility: 'global', actions: [{ action_name: 'assign_team' }] } };
      if (path === '/custom_attribute_definitions/11') return { id: 11, attribute_key: 'plan_tier', attribute_display_name: 'Plan Tier', attribute_model: 'contact_attribute' };
      if (path === '/labels/15') return { id: 15, title: 'vip-client', color: '#1f93ff' };
      if (path === '/custom_filters/19') return { id: 19, name: 'Unassigned Open', filter_type: 'conversation' };
      return { ok: true, path };
    });

    // 1. Inboxes & members
    const inboxGet = await findTool(adminTools, 'inbox_get').handler(
      { inbox_id: 9, include_members: true, include_assignable_agents: true, include_agent_bot: true },
      context,
    );
    assert.equal((inboxGet.structuredContent as Record<string, unknown>).inbox !== undefined, true);

    const inboxCreateErr = await findTool(adminTools, 'inbox_upsert').handler({ name: 'Missing channel' }, context);
    assert.equal(inboxCreateErr.isError, true);

    await findTool(adminTools, 'inbox_upsert').handler(
      { name: 'API Inbox', channel: { type: 'api' } },
      context,
    );
    await findTool(adminTools, 'inbox_upsert').handler(
      { inbox_id: 9, greeting_enabled: true, greeting_message: 'Olá!' },
      context,
    );
    await findTool(adminTools, 'inbox_upsert').handler(
      { action: 'set_agent_bot', inbox_id: 9, agent_bot_id: 3 },
      context,
    );

    const inboxDelRefused = await findTool(adminTools, 'inbox_delete').handler({ inbox_id: 9 }, context);
    assert.equal(inboxDelRefused.isError, true);
    const inboxDelOk = await findTool(adminTools, 'inbox_delete').handler({ inbox_id: 9, confirm: true }, context);
    assert.equal((inboxDelOk.structuredContent as Record<string, unknown>).deleted, true);

    await findTool(adminTools, 'inbox_members_sync').handler(
      { inbox_id: 9, action: 'add', user_ids: [1, 2] },
      context,
    );
    const membersSetRefused = await findTool(adminTools, 'inbox_members_sync').handler(
      { inbox_id: 9, action: 'set', user_ids: [1] },
      context,
    );
    assert.equal(membersSetRefused.isError, true);
    await findTool(adminTools, 'inbox_members_sync').handler(
      { inbox_id: 9, action: 'set', user_ids: [1], confirm: true },
      context,
    );
    await findTool(adminTools, 'inbox_members_sync').handler(
      { inbox_id: 9, action: 'remove', user_ids: [2], confirm: true },
      context,
    );

    // 2. Agents & Teams
    const inviteRefused = await findTool(adminTools, 'agent_invite').handler(
      { email: 'agent@example.com', name: 'New Agent', role: 'agent' },
      context,
    );
    assert.equal(inviteRefused.isError, true);
    await findTool(adminTools, 'agent_invite').handler(
      { email: 'agent@example.com', name: 'New Agent', role: 'agent', confirm: true },
      context,
    );
    await findTool(adminTools, 'agent_invite').handler(
      { emails: ['a@example.com', 'b@example.com'], confirm: true },
      context,
    );
    await findTool(adminTools, 'agent_update').handler(
      { agent_id: 5, name: 'Updated Agent', role: 'administrator' },
      context,
    );
    const agentDelRefused = await findTool(adminTools, 'agent_delete').handler({ agent_id: 5 }, context);
    assert.equal(agentDelRefused.isError, true);
    await findTool(adminTools, 'agent_delete').handler({ agent_id: 5, confirm: true }, context);

    await findTool(adminTools, 'team_get').handler({ team_id: 2 }, context);
    await findTool(adminTools, 'team_upsert').handler({ name: 'New Team', allow_auto_assign: true }, context);
    await findTool(adminTools, 'team_upsert').handler({ team_id: 2, description: 'Updated' }, context);
    const teamDelRefused = await findTool(adminTools, 'team_delete').handler({ team_id: 2 }, context);
    assert.equal(teamDelRefused.isError, true);
    await findTool(adminTools, 'team_delete').handler({ team_id: 2, confirm: true }, context);

    await findTool(adminTools, 'team_members_sync').handler({ team_id: 2, action: 'add', user_ids: [1] }, context);
    await findTool(adminTools, 'team_members_sync').handler(
      { team_id: 2, action: 'set', user_ids: [1, 2], confirm: true },
      context,
    );
    await findTool(adminTools, 'team_members_sync').handler(
      { team_id: 2, action: 'remove', user_ids: [2], confirm: true },
      context,
    );

    // 3. Automation rules & Macros (fenced with untrustedJson)
    const rulesList = await findTool(adminTools, 'automation_rules_list').handler({}, context);
    assert.equal(typeof (rulesList.structuredContent as Record<string, unknown>)._untrusted, 'string');
    await findTool(adminTools, 'automation_rules_list').handler({ rule_id: 4 }, context);
    await findTool(adminTools, 'automation_rule_upsert').handler(
      {
        name: 'Tag VIP',
        event_name: 'conversation_created',
        conditions: [{ attribute_key: 'status', filter_operator: 'equal_to', values: ['open'] }],
        actions: [{ action_name: 'add_label', action_params: ['vip'] }],
      },
      context,
    );
    await findTool(adminTools, 'automation_rule_upsert').handler({ rule_id: 4, active: false }, context);
    await findTool(adminTools, 'automation_rule_upsert').handler({ action: 'clone', rule_id: 4 }, context);
    const ruleDelRefused = await findTool(adminTools, 'automation_rule_delete').handler({ rule_id: 4 }, context);
    assert.equal(ruleDelRefused.isError, true);
    await findTool(adminTools, 'automation_rule_delete').handler({ rule_id: 4, confirm: true }, context);

    const macrosList = await findTool(adminTools, 'macros_list').handler({}, context);
    assert.equal(typeof (macrosList.structuredContent as Record<string, unknown>)._untrusted, 'string');
    await findTool(adminTools, 'macro_upsert').handler(
      { name: 'Resolve & Tag', visibility: 'personal', actions: [{ action_name: 'resolve_conversation' }] },
      context,
    );
    await findTool(adminTools, 'macro_upsert').handler({ macro_id: 7, name: 'Renamed Macro' }, context);
    const macroExecRefused = await findTool(adminTools, 'macro_execute').handler(
      { macro_id: 7, conversation_ids: [101, 102] },
      context,
    );
    assert.equal(macroExecRefused.isError, true);
    await findTool(adminTools, 'macro_execute').handler(
      { macro_id: 7, conversation_ids: [101, 102], confirm: true },
      context,
    );
    await findTool(adminTools, 'macro_delete').handler({ macro_id: 7, confirm: true }, context);

    // 4. Webhooks & Integration hooks (SSRF rejection + valid HTTPS execution)
    await findTool(adminTools, 'webhooks_list').handler({}, context);
    const countBeforeBadWebhook = calls.length;
    const badWebhook = await findTool(adminTools, 'webhook_upsert').handler(
      { url: 'http://169.254.169.254/latest/meta-data/', subscriptions: ['message_created'] },
      context,
    );
    assert.equal(badWebhook.isError, true);
    assert.equal(calls.length, countBeforeBadWebhook, 'Must not call upstream when webhook URL fails SSRF validation');

    await findTool(adminTools, 'webhook_upsert').handler(
      { url: 'https://hooks.example.com/events', name: 'Prod Hook', subscriptions: ['message_created'] },
      context,
    );
    await findTool(adminTools, 'webhook_upsert').handler(
      { webhook_id: 8, url: 'https://hooks.example.com/v2/events' },
      context,
    );
    await findTool(adminTools, 'webhook_delete').handler({ webhook_id: 8, confirm: true }, context);

    await findTool(adminTools, 'integrations_list').handler({}, context);
    await findTool(adminTools, 'integrations_list').handler({ app_id: 'openai' }, context);
    await findTool(adminTools, 'integrations_list').handler({ hook_id: 3 }, context);

    const badHook = await findTool(adminTools, 'integration_hook_upsert').handler(
      { app_id: 'dialogflow', settings: { endpoint_url: 'https://localhost:8443/hook' } },
      context,
    );
    assert.equal(badHook.isError, true);

    await findTool(adminTools, 'integration_hook_upsert').handler(
      { app_id: 'openai', settings: { endpoint_url: 'https://api.example.com/v1' } },
      context,
    );
    await findTool(adminTools, 'integration_hook_upsert').handler(
      { hook_id: 3, status: 'enabled' },
      context,
    );
    await findTool(adminTools, 'integration_hook_delete').handler({ hook_id: 3, confirm: true }, context);

    // 5. Custom attributes, SLA policies, Assignment policies, Labels, Canned responses, Custom filters
    await findTool(adminTools, 'custom_attributes_list').handler({ attribute_model: 'contact_attribute' }, context);
    await findTool(adminTools, 'custom_attributes_list').handler({ attribute_id: 11 }, context);
    await findTool(adminTools, 'custom_attribute_upsert').handler(
      { attribute_display_name: 'Tier', attribute_key: 'tier', attribute_display_type: 'text', attribute_model: 'contact_attribute' },
      context,
    );
    await findTool(adminTools, 'custom_attribute_upsert').handler(
      { attribute_id: 11, attribute_description: 'Customer tier' },
      context,
    );
    await findTool(adminTools, 'custom_attribute_delete').handler({ attribute_id: 11, confirm: true }, context);

    await findTool(adminTools, 'sla_policies_list').handler({}, context);
    await findTool(adminTools, 'sla_policies_list').handler({ view: 'applied_metrics' }, context);
    await findTool(adminTools, 'sla_policy_upsert').handler(
      { name: 'Enterprise SLA', first_response_time_threshold: 900 },
      context,
    );
    await findTool(adminTools, 'sla_policy_upsert').handler(
      { policy_id: 1, resolution_time_threshold: 3600 },
      context,
    );
    await findTool(adminTools, 'sla_policy_delete').handler({ policy_id: 1, confirm: true }, context);

    await findTool(adminTools, 'assignment_policies_list').handler({}, context);
    await findTool(adminTools, 'assignment_policies_list').handler({ policy_id: 2 }, context);
    await findTool(adminTools, 'assignment_policies_list').handler({ inbox_id: 9 }, context);
    await findTool(adminTools, 'assignment_policy_upsert').handler(
      { name: 'Round Robin', enabled: true },
      context,
    );
    await findTool(adminTools, 'assignment_policy_upsert').handler(
      { action: 'link_inbox', policy_id: 2, inbox_id: 9 },
      context,
    );
    await findTool(adminTools, 'assignment_policy_upsert').handler(
      { action: 'unlink_inbox', policy_id: 2, inbox_id: 9 },
      context,
    );
    await findTool(adminTools, 'assignment_policy_upsert').handler(
      { action: 'delete', policy_id: 2, confirm: true },
      context,
    );

    await findTool(adminTools, 'label_upsert').handler({ title: 'vip-support', color: '#ff0000' }, context);
    await findTool(adminTools, 'label_upsert').handler({ label_id: 15 }, context);
    await findTool(adminTools, 'label_upsert').handler({ label_id: 15, description: 'VIP' }, context);
    await findTool(adminTools, 'label_delete').handler({ label_id: 15, confirm: true }, context);

    const cannedRes = await findTool(adminTools, 'canned_response_upsert').handler(
      { short_code: 'welcome', content: 'Hello from Airys!' },
      context,
    );
    assert.equal(typeof (cannedRes.structuredContent as Record<string, unknown>)._untrusted, 'string');
    await findTool(adminTools, 'canned_response_upsert').handler(
      { canned_response_id: 12, content: 'Updated greeting' },
      context,
    );
    await findTool(adminTools, 'canned_response_delete').handler({ canned_response_id: 12, confirm: true }, context);

    await findTool(adminTools, 'custom_filter_upsert').handler(
      { name: 'Open VIP', filter_type: 'conversation', query: { payload: [] } },
      context,
    );
    await findTool(adminTools, 'custom_filter_upsert').handler({ filter_id: 19, name: 'Renamed' }, context);
    await findTool(adminTools, 'custom_filter_delete').handler({ filter_id: 19, confirm: true }, context);

    // 6. Account settings & Audit logs
    await findTool(adminTools, 'account_settings_get').handler(
      { include_notification_settings: true, include_branded_email_layout: true },
      context,
    );
    await findTool(adminTools, 'account_settings_update').handler(
      {
        auto_resolve_after: 43200,
        notification_settings: { selected_email_flags: ['email_conversation_creation'] },
        branded_email_layout: { footer_text: 'Airys' },
      },
      context,
    );
    const auditRes = await findTool(adminTools, 'audit_logs_list').handler({ page: 1 }, context);
    assert.equal(typeof (auditRes.structuredContent as Record<string, unknown>)._untrusted, 'string');
  });

  it('ADM-07: exercises help_center portals, categories, and articles CRUD + publish + delete cycle', async () => {
    const { context, calls } = createMockContext((path) => {
      if (path === '/api/v1/profile') return { id: 42, name: 'Admin User' };
      if (path === '/portals/help-center/categories/10') return { payload: { id: 10, name: 'Getting Started', slug: 'getting-started' } };
      if (path === '/portals/help-center/articles/99') return { payload: { id: 99, title: 'How to connect WhatsApp', slug: 'connect-whatsapp', status: 'draft' } };
      return { payload: [], meta: { count: 0 } };
    });

    const portalsList = await findTool(helpCenterTools, 'portals_list').handler({ page: 1 }, context);
    assert.equal(typeof (portalsList.structuredContent as Record<string, unknown>)._untrusted, 'string');

    await findTool(helpCenterTools, 'portal_get').handler(
      { portal_slug: 'help-center', include_ssl_status: true },
      context,
    );
    assert.equal(calls.some((c) => c.path === '/portals/help-center'), true);
    assert.equal(calls.some((c) => c.path === '/portals/help-center/ssl_status'), true);

    await findTool(helpCenterTools, 'portal_upsert').handler(
      { action: 'create', name: 'Help Center', slug: 'help-center', color: '#1f93ff' },
      context,
    );
    await findTool(helpCenterTools, 'portal_upsert').handler(
      { action: 'update', portal_slug: 'help-center', header_text: 'Welcome' },
      context,
    );
    await findTool(helpCenterTools, 'portal_upsert').handler(
      { action: 'delete_logo', portal_slug: 'help-center' },
      context,
    );
    const archiveRefused = await findTool(helpCenterTools, 'portal_upsert').handler(
      { action: 'archive', portal_slug: 'help-center' },
      context,
    );
    assert.equal(archiveRefused.isError, true);
    await findTool(helpCenterTools, 'portal_upsert').handler(
      { action: 'archive', portal_slug: 'help-center', confirm: true },
      context,
    );
    await findTool(helpCenterTools, 'portal_upsert').handler(
      { action: 'send_instructions', portal_slug: 'help-center', email: 'ops@example.com', confirm: true },
      context,
    );
    await findTool(helpCenterTools, 'portal_upsert').handler(
      { action: 'delete', portal_slug: 'help-center', confirm: true },
      context,
    );

    // Categories
    await findTool(helpCenterTools, 'categories_list').handler({ portal_slug: 'help-center', locale: 'en' }, context);
    await findTool(helpCenterTools, 'categories_list').handler({ portal_slug: 'help-center', category_id: 10 }, context);
    await findTool(helpCenterTools, 'category_upsert').handler(
      { portal_slug: 'help-center', name: 'Getting Started', slug: 'getting-started', locale: 'en' },
      context,
    );
    await findTool(helpCenterTools, 'category_upsert').handler(
      { portal_slug: 'help-center', category_id: 10, description: 'Onboarding guides' },
      context,
    );
    await findTool(helpCenterTools, 'category_upsert').handler(
      { action: 'reorder', portal_slug: 'help-center', positions_hash: { '10': 1 } },
      context,
    );
    const catDelRefused = await findTool(helpCenterTools, 'category_delete').handler(
      { portal_slug: 'help-center', category_id: 10 },
      context,
    );
    assert.equal(catDelRefused.isError, true);
    await findTool(helpCenterTools, 'category_delete').handler(
      { portal_slug: 'help-center', category_id: 10, confirm: true },
      context,
    );

    // Articles
    await findTool(helpCenterTools, 'articles_list').handler(
      { portal_slug: 'help-center', query: 'whatsapp', status: 'published' },
      context,
    );
    await findTool(helpCenterTools, 'article_get').handler(
      { portal_slug: 'help-center', article_id: 99 },
      context,
    );

    // Create article without author_id -> resolves author_id=42 from /api/v1/profile
    await findTool(helpCenterTools, 'article_upsert').handler(
      {
        portal_slug: 'help-center',
        title: 'How to connect WhatsApp',
        slug: 'connect-whatsapp',
        content: 'Step 1: Open settings.',
        category_id: 10,
      },
      context,
    );
    const createArticleCall = calls.find((c) => c.path === '/portals/help-center/articles' && c.options?.method === 'POST');
    assert.ok(createArticleCall);
    assert.equal(
      ((createArticleCall.options?.body as Record<string, unknown>).article as Record<string, unknown>).author_id,
      42,
    );

    await findTool(helpCenterTools, 'article_upsert').handler(
      { portal_slug: 'help-center', article_id: 99, content: 'Updated content' },
      context,
    );
    await findTool(helpCenterTools, 'article_upsert').handler(
      { action: 'reorder', portal_slug: 'help-center', positions_hash: { '99': 1 } },
      context,
    );
    await findTool(helpCenterTools, 'article_upsert').handler(
      { action: 'bulk_update_category', portal_slug: 'help-center', article_ids: [99], category_id: 10 },
      context,
    );
    await findTool(helpCenterTools, 'article_upsert').handler(
      { action: 'bulk_translate', portal_slug: 'help-center', article_ids: [99], locale: 'pt_BR' },
      context,
    );

    const pubRefused = await findTool(helpCenterTools, 'article_publish').handler(
      { portal_slug: 'help-center', article_id: 99, status: 'published' },
      context,
    );
    assert.equal(pubRefused.isError, true);
    await findTool(helpCenterTools, 'article_publish').handler(
      { portal_slug: 'help-center', article_id: 99, status: 'published', confirm: true },
      context,
    );
    await findTool(helpCenterTools, 'article_publish').handler(
      { portal_slug: 'help-center', article_ids: [99], status: 'archived', confirm: true },
      context,
    );

    const artDelRefused = await findTool(helpCenterTools, 'article_delete').handler(
      { portal_slug: 'help-center', article_id: 99 },
      context,
    );
    assert.equal(artDelRefused.isError, true);
    await findTool(helpCenterTools, 'article_delete').handler(
      { portal_slug: 'help-center', article_id: 99, confirm: true },
      context,
    );
    await findTool(helpCenterTools, 'article_delete').handler(
      { portal_slug: 'help-center', article_ids: [99], confirm: true },
      context,
    );
  });
});
