/**
 * Account administration toolset (`admin`, v0.8.0, Lane 008 — `ADM-02..ADM-06`).
 *
 * Covers inboxes & inbox members, agents, teams & team members, automation rules,
 * macros, webhooks (with anti-SSRF URL validation), integrations & hooks (with URL
 * validation), custom attribute definitions, SLA policies & applied SLAs, assignment
 * policies, labels CRUD, canned responses CRUD, custom filters CRUD, account settings,
 * and audit logs.
 */

import { isIP } from 'node:net';
import { z } from 'zod';
import { failure, json, requireConfirmation, untrustedJson } from '../result.js';
import { defineTool } from '../toolsets.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class WebhookUrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookUrlValidationError';
  }
}

/**
 * Validates an outbound webhook or integration callback URL against SSRF risks (`ADM-04`).
 *
 * Rejects:
 * - Non-HTTPS schemes (`http:`, `file:`, `ftp:`, `javascript:`, etc.)
 * - Embedded credentials (`user:pass@host`)
 * - `localhost`, `.localhost`, `.local`, `.internal`, cloud metadata hostnames, and single-label hosts
 * - IPv4 loopback (`127.0.0.0/8`), current-network (`0.0.0.0/8`), RFC1918 private (`10/8`, `172.16/12`, `192.168/16`),
 *   link-local / cloud metadata (`169.254.0.0/16`), CGNAT (`100.64.0.0/10`), benchmark (`198.18.0.0/15`), TEST-NETs,
 *   and multicast/reserved (`224.0.0.0/3`)
 * - IPv6 loopback (`::1`), unspecified (`::`), link-local (`fe80::/10`), unique-local (`fc00::/7`),
 *   multicast (`ff00::/8`), documentation (`2001:db8::/32`), and IPv4-mapped IPv6 (`::ffff:0:0/96`)
 */
export function validateWebhookUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new WebhookUrlValidationError('Webhook URL cannot be empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new WebhookUrlValidationError(`Invalid webhook URL "${rawUrl}"`);
  }

  if (parsed.protocol !== 'https:') {
    throw new WebhookUrlValidationError(
      `Webhook URL must use https:// (got "${parsed.protocol}//")`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new WebhookUrlValidationError('Webhook URL must not contain embedded credentials');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) {
    throw new WebhookUrlValidationError('Webhook URL must have a valid hostname');
  }

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata' ||
    host === 'metadata.google.internal' ||
    host === 'instance-data'
  ) {
    throw new WebhookUrlValidationError(`Webhook URL host "${host}" is an internal/local hostname`);
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const octets = host.split('.').map((part) => Number(part));
    const [a = 0, b = 0, c = 0] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    ) {
      throw new WebhookUrlValidationError(
        `Webhook URL IPv4 address "${host}" is in a private, loopback, link-local, or reserved range`,
      );
    }
  } else if (ipVersion === 6 || host.includes(':')) {
    const normalizedV6 = host.toLowerCase();
    if (
      normalizedV6 === '::1' ||
      normalizedV6 === '::' ||
      normalizedV6 === '0:0:0:0:0:0:0:1' ||
      normalizedV6 === '0:0:0:0:0:0:0:0' ||
      normalizedV6.startsWith('fe8') ||
      normalizedV6.startsWith('fe9') ||
      normalizedV6.startsWith('fea') ||
      normalizedV6.startsWith('feb') ||
      normalizedV6.startsWith('fc') ||
      normalizedV6.startsWith('fd') ||
      normalizedV6.startsWith('ff') ||
      normalizedV6.startsWith('2001:db8:') ||
      normalizedV6.startsWith('::ffff:') ||
      normalizedV6.startsWith('0:0:0:0:0:ffff:')
    ) {
      throw new WebhookUrlValidationError(
        `Webhook URL IPv6 address "${host}" is in a private, loopback, link-local, or reserved range`,
      );
    }
  } else if (!host.includes('.')) {
    throw new WebhookUrlValidationError(
      `Webhook URL host "${host}" must be a fully-qualified public domain name`,
    );
  }

  return parsed.toString();
}

/**
 * Validates any URL-like field inside an integration hook's `settings` object.
 */
export function validateHookSettingsUrls(settings: Record<string, unknown> | undefined): void {
  if (!settings || typeof settings !== 'object') return;
  for (const [key, value] of Object.entries(settings)) {
    const keyLooksLikeUrl = /(?:^|_)(?:url|uri|endpoint|webhook|callback)$/i.test(key);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (keyLooksLikeUrl || /^https?:\/\//i.test(trimmed)) {
        validateWebhookUrl(trimmed);
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      validateHookSettingsUrls(value as Record<string, unknown>);
    }
  }
}

export const adminTools = [
  // =========================================================================
  // ADM-02 — Inboxes, Agents, Teams (CRUD + members)
  // =========================================================================

  defineTool({
    name: 'inbox_get',
    stability: 'stable',
    title: 'Get an inbox with members, assignable agents, and agent bot',
    description:
      'Fetch full details for one inbox (`GET /inboxes/:id`), optionally enriched with inbox members (`GET /inbox_members/:inbox_id`), ' +
      'assignable human & AI agents (`GET /inboxes/:id/assignable_agents`), and the attached legacy agent bot (`GET /inboxes/:id/agent_bot`).',
    inputSchema: z.object({
      inbox_id: z.number().int(),
      include_members: z.boolean().optional().describe('When true, also fetches GET /inbox_members/:inbox_id'),
      include_assignable_agents: z
        .boolean()
        .optional()
        .describe('When true, also fetches GET /inboxes/:id/assignable_agents'),
      include_agent_bot: z.boolean().optional().describe('When true, also fetches GET /inboxes/:id/agent_bot'),
    }),
    handler: async (
      { inbox_id, include_members, include_assignable_agents, include_agent_bot },
      { client },
    ) => {
      const [inbox, members, assignable_agents, agent_bot] = await Promise.all([
        client.request(`/inboxes/${inbox_id}`),
        include_members ? client.request(`/inbox_members/${inbox_id}`) : Promise.resolve(undefined),
        include_assignable_agents
          ? client.request(`/inboxes/${inbox_id}/assignable_agents`)
          : Promise.resolve(undefined),
        include_agent_bot
          ? client.request(`/inboxes/${inbox_id}/agent_bot`)
          : Promise.resolve(undefined),
      ]);
      return json({
        inbox,
        ...(members !== undefined ? { members } : {}),
        ...(assignable_agents !== undefined ? { assignable_agents } : {}),
        ...(agent_bot !== undefined ? { agent_bot } : {}),
      });
    },
  }),

  defineTool({
    name: 'inbox_upsert',
    stability: 'beta',
    title: 'Create or update an inbox or set its agent bot',
    description:
      'Create a new inbox (`POST /inboxes`, `action: "create"`), update an existing inbox (`PATCH /inboxes/:id`, `action: "update"`), ' +
      'or attach/detach an agent bot on the inbox (`POST /inboxes/:id/set_agent_bot`, `action: "set_agent_bot"`). Requires admin role.',
    write: true,
    inputSchema: z.object({
      action: z.enum(['create', 'update', 'set_agent_bot']).optional().describe('Defaults to update when inbox_id is given, create otherwise'),
      inbox_id: z.number().int().optional().describe('Required for update and set_agent_bot'),
      name: z.string().min(1).optional(),
      greeting_enabled: z.boolean().optional(),
      greeting_message: z.string().optional(),
      enable_email_collect: z.boolean().optional(),
      csat_survey_enabled: z.boolean().optional(),
      csat_config: z.record(z.string(), z.unknown()).optional(),
      enable_auto_assignment: z.boolean().optional(),
      working_hours_enabled: z.boolean().optional(),
      working_hours: z.array(z.record(z.string(), z.unknown())).optional(),
      out_of_office_message: z.string().optional(),
      timezone: z.string().optional(),
      allow_messages_after_resolved: z.boolean().optional(),
      lock_to_single_conversation: z.boolean().optional(),
      portal_id: z.number().int().nullable().optional(),
      sender_name_type: z.enum(['friendly', 'professional']).optional(),
      business_name: z.string().optional(),
      disabled: z.boolean().optional(),
      channel: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Channel attributes, e.g. `{ type: "api" | "web_widget" | "email", ... }` on create'),
      agent_bot_id: z
        .number()
        .int()
        .nullable()
        .optional()
        .describe('Used when action="set_agent_bot" (`null` detaches the current agent bot)'),
    }),
    handler: async (args, { client }) => {
      const mode = args.action ?? (args.inbox_id !== undefined ? 'update' : 'create');
      if (mode === 'set_agent_bot') {
        if (args.inbox_id === undefined) {
          return failure('validation_error', '`inbox_id` is required when `action` is `"set_agent_bot"`');
        }
        await client.request(`/inboxes/${args.inbox_id}/set_agent_bot`, {
          method: 'POST',
          body: { agent_bot: args.agent_bot_id ?? null },
        });
        return json({ updated: true, inbox_id: args.inbox_id, agent_bot_id: args.agent_bot_id ?? null });
      }

      const { action: _action, inbox_id, agent_bot_id: _bot, ...body } = args;
      if (mode === 'create') {
        if (!body.name || !body.channel) {
          return failure('validation_error', '`name` and `channel` (`{ type, ... }`) are required when creating an inbox');
        }
        return json(await client.request('/inboxes', { method: 'POST', body }));
      }

      if (inbox_id === undefined) {
        return failure('validation_error', '`inbox_id` is required when updating an inbox');
      }
      return json(await client.request(`/inboxes/${inbox_id}`, { method: 'PATCH', body }));
    },
  }),

  defineTool({
    name: 'inbox_delete',
    stability: 'beta',
    title: 'Delete an inbox',
    description:
      'Permanently delete an inbox and enqueue background deletion of all its conversations (`DELETE /inboxes/:id`). ' +
      'Irreversible — call once without `confirm` to preview the inbox, then again with `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the inbox'),
    }),
    handler: async ({ inbox_id, confirm }, { client }) => {
      const inbox = asRecord(await client.request(`/inboxes/${inbox_id}`));
      const gate = requireConfirmation(confirm, {
        action: `Permanently delete inbox #${inbox_id} (${typeof inbox.name === 'string' ? `"${inbox.name}"` : 'unnamed'}) and all its conversations`,
        target: {
          inbox_id,
          name: inbox.name ?? null,
          channel_type: inbox.channel_type ?? null,
        },
      });
      if (gate) return gate;

      const res = await client.request(`/inboxes/${inbox_id}`, { method: 'DELETE' });
      return json({ deleted: true, inbox_id, response: res });
    },
  }),

  defineTool({
    name: 'inbox_members_sync',
    stability: 'beta',
    title: 'Add, replace, or remove inbox members',
    description:
      'Manage agent membership on an inbox: `action: "add"` (`POST /inbox_members`), `action: "set"` (`PATCH /inbox_members`, replaces the full member list), ' +
      'or `action: "remove"` (`DELETE /inbox_members`). Note: upstream takes `inbox_id` and `user_ids` in the JSON body for all three write verbs. ' +
      'Replacing (`"set"`) or removing (`"remove"`) members requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int(),
      action: z.enum(['add', 'set', 'remove']),
      user_ids: z.array(z.number().int()).describe('Agent user IDs to add, set, or remove'),
      confirm: z
        .boolean()
        .optional()
        .describe('Required when action is "set" or "remove"'),
    }),
    handler: async ({ inbox_id, action, user_ids, confirm }, { client }) => {
      if (action === 'set' || action === 'remove') {
        const gate = requireConfirmation(confirm, {
          action:
            action === 'remove'
              ? `Remove ${user_ids.length} agent(s) from inbox #${inbox_id}`
              : `Replace inbox #${inbox_id} member list with ${user_ids.length} agent(s)`,
          target: { inbox_id, action, user_ids },
        });
        if (gate) return gate;
      }

      if (action === 'add') {
        return json(
          await client.request('/inbox_members', {
            method: 'POST',
            body: { inbox_id, user_ids },
          }),
        );
      }
      if (action === 'set') {
        return json(
          await client.request('/inbox_members', {
            method: 'PATCH',
            body: { inbox_id, user_ids },
          }),
        );
      }
      await client.request('/inbox_members', {
        method: 'DELETE',
        body: { inbox_id, user_ids },
      });
      return json({ removed: true, inbox_id, user_ids });
    },
  }),

  defineTool({
    name: 'agent_invite',
    stability: 'beta',
    title: 'Invite one or more agents to the account',
    description:
      'Invite a single agent (`POST /agents`) or a batch of email addresses (`POST /agents/bulk_create`). ' +
      'Because this sends external invitation emails and consumes agent seats, it is marked irreversible and requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      email: z.string().email().optional().describe('Single agent email (`POST /agents`)'),
      name: z.string().min(1).optional().describe('Single agent display name (`POST /agents`)'),
      role: z.enum(['agent', 'administrator']).optional().describe('Defaults to "agent"'),
      availability: z.enum(['online', 'offline', 'busy']).optional(),
      auto_offline: z.boolean().optional(),
      emails: z
        .array(z.string().email())
        .min(1)
        .optional()
        .describe('Bulk invite email list (`POST /agents/bulk_create`)'),
      confirm: z.boolean().optional().describe('Set true only after a human approves sending invitation email(s)'),
    }),
    handler: async ({ email, name, role = 'agent', availability, auto_offline, emails, confirm }, { client }) => {
      if (emails && emails.length > 0) {
        const gate = requireConfirmation(confirm, {
          action: `Send bulk agent invitations to ${emails.length} email address(es)`,
          target: { mode: 'bulk_create', emails },
        });
        if (gate) return gate;

        await client.request('/agents/bulk_create', {
          method: 'POST',
          body: { emails },
        });
        return json({ invited: true, count: emails.length, emails });
      }

      if (!email || !name) {
        return failure('validation_error', 'Provide either (`email` and `name`) for a single invite or `emails` for bulk_create');
      }

      const gate = requireConfirmation(confirm, {
        action: `Invite ${name} <${email}> to the account as ${role}`,
        target: { email, name, role, availability: availability ?? null, auto_offline: auto_offline ?? null },
      });
      if (gate) return gate;

      const agentPayload = {
        email,
        name,
        role,
        ...(availability !== undefined ? { availability } : {}),
        ...(auto_offline !== undefined ? { auto_offline } : {}),
      };
      return json(
        await client.request('/agents', {
          method: 'POST',
          body: { ...agentPayload, agent: agentPayload },
        }),
      );
    },
  }),

  defineTool({
    name: 'agent_update',
    stability: 'beta',
    title: 'Update an agent name, role, or availability',
    description:
      'Update an existing agent on the account (`PATCH /agents/:id`). Requires administrator permissions.',
    write: true,
    inputSchema: z.object({
      agent_id: z.number().int(),
      name: z.string().min(1).optional(),
      role: z.enum(['agent', 'administrator']).optional(),
      availability: z.enum(['online', 'offline', 'busy']).optional(),
      auto_offline: z.boolean().optional(),
    }),
    handler: async ({ agent_id, ...fields }, { client }) => {
      return json(
        await client.request(`/agents/${agent_id}`, {
          method: 'PATCH',
          body: { ...fields, agent: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'agent_delete',
    stability: 'beta',
    title: 'Remove an agent from the account',
    description:
      'Remove an agent from the account (`DELETE /agents/:id`). If the user belongs to no other accounts, ' +
      'upstream enqueues `DeleteObjectJob` on the user record. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      agent_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves removing the agent'),
    }),
    handler: async ({ agent_id, confirm }, { client }) => {
      const gate = requireConfirmation(confirm, {
        action: `Remove agent #${agent_id} from the account`,
        target: { agent_id },
      });
      if (gate) return gate;

      await client.request(`/agents/${agent_id}`, { method: 'DELETE' });
      return json({ deleted: true, agent_id });
    },
  }),

  defineTool({
    name: 'team_get',
    stability: 'stable',
    title: 'Get a team and its members',
    description:
      'Fetch a team (`GET /teams/:id`) together with its current member list (`GET /teams/:team_id/team_members`).',
    inputSchema: z.object({
      team_id: z.number().int(),
    }),
    handler: async ({ team_id }, { client }) => {
      const [team, members] = await Promise.all([
        client.request(`/teams/${team_id}`),
        client.request(`/teams/${team_id}/team_members`),
      ]);
      return json({ team, members });
    },
  }),

  defineTool({
    name: 'team_upsert',
    stability: 'beta',
    title: 'Create or update a team',
    description:
      'Create a new team (`POST /teams`) when `team_id` is omitted, or update an existing team (`PATCH /teams/:id`) when `team_id` is provided.',
    write: true,
    inputSchema: z.object({
      team_id: z.number().int().optional().describe('Omit to create; provide to update'),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      allow_auto_assign: z.boolean().optional(),
      icon: z.string().optional(),
      icon_color: z.string().optional(),
    }),
    handler: async ({ team_id, ...fields }, { client }) => {
      if (team_id === undefined) {
        if (!fields.name) {
          return failure('validation_error', '`name` is required when creating a team');
        }
        return json(
          await client.request('/teams', {
            method: 'POST',
            body: { ...fields, team: fields },
          }),
        );
      }
      return json(
        await client.request(`/teams/${team_id}`, {
          method: 'PATCH',
          body: { ...fields, team: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'team_delete',
    stability: 'beta',
    title: 'Delete a team',
    description:
      'Permanently delete a team (`DELETE /teams/:id`). Call once without `confirm` to preview the team, then again with `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      team_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the team'),
    }),
    handler: async ({ team_id, confirm }, { client }) => {
      const team = asRecord(await client.request(`/teams/${team_id}`));
      const gate = requireConfirmation(confirm, {
        action: `Delete team #${team_id} (${typeof team.name === 'string' ? `"${team.name}"` : 'unnamed'})`,
        target: { team_id, name: team.name ?? null, description: team.description ?? null },
      });
      if (gate) return gate;

      await client.request(`/teams/${team_id}`, { method: 'DELETE' });
      return json({ deleted: true, team_id });
    },
  }),

  defineTool({
    name: 'team_members_sync',
    stability: 'beta',
    title: 'Add, replace, or remove team members',
    description:
      'Manage agent membership on a team: `action: "add"` (`POST /teams/:team_id/team_members`), `action: "set"` (`PATCH /teams/:team_id/team_members`, replaces full set), ' +
      'or `action: "remove"` (`DELETE /teams/:team_id/team_members`). Replacing (`"set"`) or removing (`"remove"`) members requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      team_id: z.number().int(),
      action: z.enum(['add', 'set', 'remove']),
      user_ids: z.array(z.number().int()).describe('Agent user IDs to add, set, or remove'),
      confirm: z.boolean().optional().describe('Required when action is "set" or "remove"'),
    }),
    handler: async ({ team_id, action, user_ids, confirm }, { client }) => {
      if (action === 'set' || action === 'remove') {
        const gate = requireConfirmation(confirm, {
          action:
            action === 'remove'
              ? `Remove ${user_ids.length} agent(s) from team #${team_id}`
              : `Replace team #${team_id} member list with ${user_ids.length} agent(s)`,
          target: { team_id, action, user_ids },
        });
        if (gate) return gate;
      }

      if (action === 'add') {
        return json(
          await client.request(`/teams/${team_id}/team_members`, {
            method: 'POST',
            body: { user_ids },
          }),
        );
      }
      if (action === 'set') {
        return json(
          await client.request(`/teams/${team_id}/team_members`, {
            method: 'PATCH',
            body: { user_ids },
          }),
        );
      }
      await client.request(`/teams/${team_id}/team_members`, {
        method: 'DELETE',
        body: { user_ids },
      });
      return json({ removed: true, team_id, user_ids });
    },
  }),

  // =========================================================================
  // ADM-03 — Automation Rules & Macros
  // =========================================================================

  defineTool({
    name: 'automation_rules_list',
    stability: 'stable',
    title: 'List or get automation rules',
    description:
      'List all automation rules (`GET /automation_rules`) or fetch one automation rule by ID (`GET /automation_rules/:id`).',
    inputSchema: z.object({
      rule_id: z.number().int().optional().describe('When set, fetches GET /automation_rules/:id'),
    }),
    handler: async ({ rule_id }, { client }) => {
      if (rule_id !== undefined) {
        return untrustedJson(await client.request(`/automation_rules/${rule_id}`));
      }
      return untrustedJson(await client.request('/automation_rules'));
    },
  }),

  defineTool({
    name: 'automation_rule_upsert',
    stability: 'beta',
    title: 'Create, update, or clone an automation rule',
    description:
      'Create (`POST /automation_rules`), update (`PATCH /automation_rules/:id`), or clone (`POST /automation_rules/:automation_rule_id/clone`) ' +
      'an automation rule on the account.',
    write: true,
    inputSchema: z.object({
      action: z.enum(['create', 'update', 'clone']).optional().describe('Defaults to update when rule_id is given, create otherwise'),
      rule_id: z.number().int().optional().describe('Required for update and clone'),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      event_name: z
        .enum([
          'conversation_created',
          'conversation_updated',
          'message_created',
          'conversation_opened',
          'conversation_resolved',
        ])
        .optional(),
      active: z.boolean().optional(),
      conditions: z.array(z.record(z.string(), z.unknown())).optional(),
      actions: z.array(z.record(z.string(), z.unknown())).optional(),
    }),
    handler: async (args, { client }) => {
      const mode = args.action ?? (args.rule_id !== undefined ? 'update' : 'create');
      if (mode === 'clone') {
        if (args.rule_id === undefined) {
          return failure('validation_error', '`rule_id` is required when `action` is `"clone"`');
        }
        return untrustedJson(
          await client.request(`/automation_rules/${args.rule_id}/clone`, { method: 'POST' }),
        );
      }

      const { action: _action, rule_id, ...body } = args;
      if (mode === 'create') {
        if (!body.name || !body.event_name || !body.conditions || !body.actions) {
          return failure(
            'validation_error',
            '`name`, `event_name`, `conditions`, and `actions` are required when creating an automation rule',
          );
        }
        return untrustedJson(await client.request('/automation_rules', { method: 'POST', body }));
      }

      if (rule_id === undefined) {
        return failure('validation_error', '`rule_id` is required when updating an automation rule');
      }
      return untrustedJson(
        await client.request(`/automation_rules/${rule_id}`, { method: 'PATCH', body }),
      );
    },
  }),

  defineTool({
    name: 'automation_rule_delete',
    stability: 'beta',
    title: 'Delete an automation rule',
    description:
      'Permanently delete an automation rule (`DELETE /automation_rules/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      rule_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the automation rule'),
    }),
    handler: async ({ rule_id, confirm }, { client }) => {
      const raw = asRecord(await client.request(`/automation_rules/${rule_id}`));
      const rule = raw.payload && typeof raw.payload === 'object' ? asRecord(raw.payload) : raw;
      const gate = requireConfirmation(confirm, {
        action: `Delete automation rule #${rule_id} (${typeof rule.name === 'string' ? `"${rule.name}"` : 'unnamed'})`,
        target: { rule_id, name: rule.name ?? null, event_name: rule.event_name ?? null },
      });
      if (gate) return gate;

      await client.request(`/automation_rules/${rule_id}`, { method: 'DELETE' });
      return json({ deleted: true, rule_id });
    },
  }),

  defineTool({
    name: 'macros_list',
    stability: 'stable',
    title: 'List or get macros',
    description:
      'List visible macros on the account (`GET /macros`) or fetch one macro (`GET /macros/:id`).',
    inputSchema: z.object({
      macro_id: z.number().int().optional().describe('When set, fetches GET /macros/:id'),
    }),
    handler: async ({ macro_id }, { client }) => {
      if (macro_id !== undefined) {
        return untrustedJson(await client.request(`/macros/${macro_id}`));
      }
      return untrustedJson(await client.request('/macros'));
    },
  }),

  defineTool({
    name: 'macro_upsert',
    stability: 'beta',
    title: 'Create or update a macro',
    description:
      'Create (`POST /macros`) or update (`PATCH /macros/:id`) a conversation macro.',
    write: true,
    inputSchema: z.object({
      macro_id: z.number().int().optional().describe('Omit to create; provide to update'),
      name: z.string().min(1).optional(),
      visibility: z.enum(['global', 'personal']).optional(),
      actions: z.array(z.record(z.string(), z.unknown())).optional(),
    }),
    handler: async ({ macro_id, ...body }, { client }) => {
      if (macro_id === undefined) {
        if (!body.name || !body.actions) {
          return failure('validation_error', '`name` and `actions` are required when creating a macro');
        }
        return untrustedJson(
          await client.request('/macros', {
            method: 'POST',
            body: { visibility: 'personal', ...body },
          }),
        );
      }
      return untrustedJson(await client.request(`/macros/${macro_id}`, { method: 'PATCH', body }));
    },
  }),

  defineTool({
    name: 'macro_execute',
    stability: 'beta',
    title: 'Execute a macro on conversations',
    description:
      'Enqueue execution of a macro across one or more conversations (`POST /macros/:id/execute`). ' +
      'Because macro actions can send messages, resolve conversations, or reassign teams, this requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      macro_id: z.number().int(),
      conversation_ids: z.array(z.number().int()).min(1).describe('Conversation display IDs to run the macro on'),
      confirm: z.boolean().optional().describe('Set true only after a human approves executing the macro'),
    }),
    handler: async ({ macro_id, conversation_ids, confirm }, { client }) => {
      const raw = asRecord(await client.request(`/macros/${macro_id}`));
      const macro = raw.payload && typeof raw.payload === 'object' ? asRecord(raw.payload) : raw;
      const gate = requireConfirmation(confirm, {
        action: `Execute macro #${macro_id} (${typeof macro.name === 'string' ? `"${macro.name}"` : 'unnamed'}) on ${conversation_ids.length} conversation(s)`,
        target: {
          macro_id,
          name: macro.name ?? null,
          actions: macro.actions ?? [],
          conversation_ids,
        },
      });
      if (gate) return gate;

      await client.request(`/macros/${macro_id}/execute`, {
        method: 'POST',
        body: { conversation_ids },
      });
      return json({ executed: true, macro_id, conversation_ids });
    },
  }),

  defineTool({
    name: 'macro_delete',
    stability: 'beta',
    title: 'Delete a macro',
    description:
      'Permanently delete a macro (`DELETE /macros/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      macro_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the macro'),
    }),
    handler: async ({ macro_id, confirm }, { client }) => {
      const raw = asRecord(await client.request(`/macros/${macro_id}`));
      const macro = raw.payload && typeof raw.payload === 'object' ? asRecord(raw.payload) : raw;
      const gate = requireConfirmation(confirm, {
        action: `Delete macro #${macro_id} (${typeof macro.name === 'string' ? `"${macro.name}"` : 'unnamed'})`,
        target: { macro_id, name: macro.name ?? null, visibility: macro.visibility ?? null },
      });
      if (gate) return gate;

      await client.request(`/macros/${macro_id}`, { method: 'DELETE' });
      return json({ deleted: true, macro_id });
    },
  }),

  // =========================================================================
  // ADM-04 — Webhooks & Integrations Hooks (with anti-SSRF URL validation)
  // =========================================================================

  defineTool({
    name: 'webhooks_list',
    stability: 'stable',
    title: 'List account webhooks',
    description: 'List all configured outgoing webhooks on the account (`GET /webhooks`).',
    inputSchema: z.object({}),
    handler: async (_args, { client }) => json(await client.request('/webhooks')),
  }),

  defineTool({
    name: 'webhook_upsert',
    stability: 'beta',
    title: 'Create or update an outgoing webhook (with SSRF validation)',
    description:
      'Create (`POST /webhooks`) or update (`PATCH /webhooks/:id`) an outgoing webhook. ' +
      'The target `url` is strictly validated (`validateWebhookUrl`) to require `https://` and reject localhost, RFC1918 private IPs, link-local/cloud metadata hosts, CGNAT, and IPv6 internal ranges (`ADM-04`).',
    write: true,
    inputSchema: z.object({
      webhook_id: z.number().int().optional().describe('Omit to create; provide to update'),
      url: z.string().optional().describe('HTTPS destination URL (required on create; validated against internal/private hosts)'),
      name: z.string().optional(),
      inbox_id: z.number().int().nullable().optional(),
      subscriptions: z
        .array(
          z.enum([
            'conversation_created',
            'conversation_status_changed',
            'conversation_updated',
            'message_created',
            'message_updated',
            'webwidget_triggered',
            'contact_created',
            'contact_updated',
            'conversation_typing_on',
            'conversation_typing_off',
          ]),
        )
        .optional()
        .describe('Webhook event subscriptions'),
    }),
    handler: async ({ webhook_id, url, name, inbox_id, subscriptions }, { client }) => {
      let validatedUrl: string | undefined;
      if (url !== undefined) {
        try {
          validatedUrl = validateWebhookUrl(url);
        } catch (err) {
          if (err instanceof WebhookUrlValidationError) {
            return failure('validation_error', err.message);
          }
          throw err;
        }
      }

      if (webhook_id === undefined) {
        if (!validatedUrl || !subscriptions || subscriptions.length === 0) {
          return failure(
            'validation_error',
            '`url` and a non-empty `subscriptions` array are required when creating a webhook',
          );
        }
        const webhookPayload = {
          url: validatedUrl,
          subscriptions,
          ...(name !== undefined ? { name } : {}),
          ...(inbox_id !== undefined ? { inbox_id } : {}),
        };
        return json(
          await client.request('/webhooks', {
            method: 'POST',
            body: { webhook: webhookPayload },
          }),
        );
      }

      const webhookPayload = {
        ...(validatedUrl !== undefined ? { url: validatedUrl } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(inbox_id !== undefined ? { inbox_id } : {}),
        ...(subscriptions !== undefined ? { subscriptions } : {}),
      };
      return json(
        await client.request(`/webhooks/${webhook_id}`, {
          method: 'PATCH',
          body: { webhook: webhookPayload },
        }),
      );
    },
  }),

  defineTool({
    name: 'webhook_delete',
    stability: 'beta',
    title: 'Delete an outgoing webhook',
    description:
      'Permanently delete an outgoing webhook (`DELETE /webhooks/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      webhook_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the webhook'),
    }),
    handler: async ({ webhook_id, confirm }, { client }) => {
      const gate = requireConfirmation(confirm, {
        action: `Delete outgoing webhook #${webhook_id}`,
        target: { webhook_id },
      });
      if (gate) return gate;

      await client.request(`/webhooks/${webhook_id}`, { method: 'DELETE' });
      return json({ deleted: true, webhook_id });
    },
  }),

  defineTool({
    name: 'integrations_list',
    stability: 'stable',
    title: 'List integration apps or get an integration app/hook',
    description:
      'List active integration apps and their configured hooks (`GET /integrations/apps`), fetch one app by slug (`GET /integrations/apps/:id`), ' +
      'or fetch one integration hook by ID (`GET /integrations/hooks/:id`).',
    inputSchema: z.object({
      app_id: z.string().optional().describe('Optional integration app slug (e.g. "webhooks", "openai", "slack", "dialogflow")'),
      hook_id: z.number().int().optional().describe('Optional integration hook ID (`GET /integrations/hooks/:id`)'),
    }),
    handler: async ({ app_id, hook_id }, { client }) => {
      if (hook_id !== undefined) {
        return json(await client.request(`/integrations/hooks/${hook_id}`));
      }
      if (app_id !== undefined) {
        return json(await client.request(`/integrations/apps/${encodeURIComponent(app_id)}`));
      }
      return json(await client.request('/integrations/apps'));
    },
  }),

  defineTool({
    name: 'integration_hook_upsert',
    stability: 'beta',
    title: 'Create or update an integration hook (with SSRF URL validation)',
    description:
      'Create (`POST /integrations/hooks`) or update (`PATCH /integrations/hooks/:id`) an integration hook. ' +
      'Any URL field inside `settings` is validated with `validateWebhookUrl` (`ADM-04`) to reject non-HTTPS and internal/private addresses.',
    write: true,
    inputSchema: z.object({
      hook_id: z.number().int().optional().describe('Omit to create; provide to update'),
      app_id: z.string().optional().describe('Integration app ID/slug (required on create)'),
      inbox_id: z.number().int().optional(),
      status: z.union([z.string(), z.number().int()]).optional(),
      settings: z.record(z.string(), z.unknown()).optional(),
    }),
    handler: async ({ hook_id, app_id, inbox_id, status, settings }, { client }) => {
      try {
        validateHookSettingsUrls(settings);
      } catch (err) {
        if (err instanceof WebhookUrlValidationError) {
          return failure('validation_error', err.message);
        }
        throw err;
      }

      if (hook_id === undefined) {
        if (!app_id) {
          return failure('validation_error', '`app_id` is required when creating an integration hook');
        }
        const hookPayload = {
          app_id,
          ...(inbox_id !== undefined ? { inbox_id } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(settings !== undefined ? { settings } : {}),
        };
        return json(
          await client.request('/integrations/hooks', {
            method: 'POST',
            body: { hook: hookPayload },
          }),
        );
      }

      const hookPayload = {
        ...(status !== undefined ? { status } : {}),
        ...(settings !== undefined ? { settings } : {}),
      };
      return json(
        await client.request(`/integrations/hooks/${hook_id}`, {
          method: 'PATCH',
          body: { hook: hookPayload },
        }),
      );
    },
  }),

  defineTool({
    name: 'integration_hook_delete',
    stability: 'beta',
    title: 'Delete an integration hook',
    description:
      'Permanently delete an integration hook (`DELETE /integrations/hooks/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      hook_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the integration hook'),
    }),
    handler: async ({ hook_id, confirm }, { client }) => {
      const gate = requireConfirmation(confirm, {
        action: `Delete integration hook #${hook_id}`,
        target: { hook_id },
      });
      if (gate) return gate;

      await client.request(`/integrations/hooks/${hook_id}`, { method: 'DELETE' });
      return json({ deleted: true, hook_id });
    },
  }),

  // =========================================================================
  // ADM-05 — Custom Attributes, SLA Policies, Assignment Policies, Labels,
  //          Canned Responses, Custom Filters
  // =========================================================================

  defineTool({
    name: 'custom_attributes_list',
    stability: 'stable',
    title: 'List or get custom attribute definitions',
    description:
      'List custom attribute definitions (`GET /custom_attribute_definitions`) or fetch one by ID (`GET /custom_attribute_definitions/:id`). ' +
      '`attribute_model` can be `"conversation_attribute"` (`0`) or `"contact_attribute"` (`1`).',
    inputSchema: z.object({
      attribute_id: z.number().int().optional().describe('When set, fetches GET /custom_attribute_definitions/:id'),
      attribute_model: z
        .enum(['conversation_attribute', 'contact_attribute'])
        .optional()
        .describe('Filter definitions by model'),
    }),
    handler: async ({ attribute_id, attribute_model }, { client }) => {
      if (attribute_id !== undefined) {
        return json(await client.request(`/custom_attribute_definitions/${attribute_id}`));
      }
      return json(
        await client.request('/custom_attribute_definitions', {
          query: { attribute_model },
        }),
      );
    },
  }),

  defineTool({
    name: 'custom_attribute_upsert',
    stability: 'beta',
    title: 'Create or update a custom attribute definition',
    description:
      'Create (`POST /custom_attribute_definitions`) or update (`PATCH /custom_attribute_definitions/:id`) a custom attribute definition.',
    write: true,
    inputSchema: z.object({
      attribute_id: z.number().int().optional().describe('Omit to create; provide to update'),
      attribute_display_name: z.string().min(1).optional(),
      attribute_key: z.string().min(1).optional(),
      attribute_description: z.string().optional(),
      attribute_display_type: z
        .enum(['text', 'number', 'currency', 'percent', 'link', 'date', 'list', 'checkbox'])
        .optional(),
      attribute_model: z.enum(['conversation_attribute', 'contact_attribute']).optional(),
      regex_pattern: z.string().optional(),
      regex_cue: z.string().optional(),
      attribute_values: z.array(z.string()).optional(),
    }),
    handler: async ({ attribute_id, ...fields }, { client }) => {
      if (attribute_id === undefined) {
        if (!fields.attribute_display_name || !fields.attribute_key) {
          return failure(
            'validation_error',
            '`attribute_display_name` and `attribute_key` are required when creating a custom attribute definition',
          );
        }
        const payload = {
          attribute_display_type: 'text',
          attribute_model: 'conversation_attribute',
          ...fields,
        };
        return json(
          await client.request('/custom_attribute_definitions', {
            method: 'POST',
            body: { custom_attribute_definition: payload },
          }),
        );
      }

      return json(
        await client.request(`/custom_attribute_definitions/${attribute_id}`, {
          method: 'PATCH',
          body: { custom_attribute_definition: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'custom_attribute_delete',
    stability: 'beta',
    title: 'Delete a custom attribute definition',
    description:
      'Delete a custom attribute definition (`DELETE /custom_attribute_definitions/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      attribute_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the custom attribute definition'),
    }),
    handler: async ({ attribute_id, confirm }, { client }) => {
      const attr = asRecord(await client.request(`/custom_attribute_definitions/${attribute_id}`));
      const gate = requireConfirmation(confirm, {
        action: `Delete custom attribute definition #${attribute_id} (${typeof attr.attribute_key === 'string' ? `"${attr.attribute_key}"` : 'unnamed'})`,
        target: {
          attribute_id,
          attribute_key: attr.attribute_key ?? null,
          attribute_display_name: attr.attribute_display_name ?? null,
          attribute_model: attr.attribute_model ?? null,
        },
      });
      if (gate) return gate;

      await client.request(`/custom_attribute_definitions/${attribute_id}`, { method: 'DELETE' });
      return json({ deleted: true, attribute_id });
    },
  }),

  defineTool({
    name: 'sla_policies_list',
    stability: 'beta',
    title: 'List SLA policies or applied SLA reports',
    description:
      'List SLA policies (`GET /sla_policies`), fetch one policy (`GET /sla_policies/:id`), or query applied SLAs (`GET /applied_slas`, `GET /applied_slas/metrics`, `GET /applied_slas/download`). ' +
      'Note: on AirysChat deployments where the Enterprise SLA controller is not mounted, upstream returns HTTP 404.',
    inputSchema: z.object({
      policy_id: z.number().int().optional().describe('When set, fetches GET /sla_policies/:id'),
      view: z
        .enum(['policies', 'applied', 'applied_metrics', 'applied_csv'])
        .optional()
        .describe('Defaults to "policies"'),
      since: z.string().optional(),
      until: z.string().optional(),
      inbox_id: z.number().int().optional(),
      team_id: z.number().int().optional(),
      sla_policy_id: z.number().int().optional(),
      assigned_agent_id: z.number().int().optional(),
      label_list: z.string().optional(),
      page: z.number().int().min(1).optional(),
    }),
    handler: async ({ policy_id, view = 'policies', ...query }, { client }) => {
      if (policy_id !== undefined) {
        return json(await client.request(`/sla_policies/${policy_id}`));
      }
      if (view === 'applied') {
        return json(await client.request('/applied_slas', { query }));
      }
      if (view === 'applied_metrics') {
        return json(await client.request('/applied_slas/metrics', { query }));
      }
      if (view === 'applied_csv') {
        return json(await client.request('/applied_slas/download', { query }));
      }
      return json(await client.request('/sla_policies'));
    },
  }),

  defineTool({
    name: 'sla_policy_upsert',
    stability: 'beta',
    title: 'Create or update an SLA policy',
    description:
      'Create (`POST /sla_policies`) or update (`PATCH /sla_policies/:id`) an SLA policy. Thresholds are in seconds.',
    write: true,
    inputSchema: z.object({
      policy_id: z.number().int().optional().describe('Omit to create; provide to update'),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      first_response_time_threshold: z.number().nullable().optional().describe('Seconds'),
      next_response_time_threshold: z.number().nullable().optional().describe('Seconds'),
      resolution_time_threshold: z.number().nullable().optional().describe('Seconds'),
      only_during_business_hours: z.boolean().optional(),
    }),
    handler: async ({ policy_id, ...fields }, { client }) => {
      if (policy_id === undefined) {
        if (!fields.name) {
          return failure('validation_error', '`name` is required when creating an SLA policy');
        }
        return json(
          await client.request('/sla_policies', {
            method: 'POST',
            body: { sla_policy: fields },
          }),
        );
      }
      return json(
        await client.request(`/sla_policies/${policy_id}`, {
          method: 'PATCH',
          body: { sla_policy: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'sla_policy_delete',
    stability: 'beta',
    title: 'Delete an SLA policy',
    description:
      'Delete an SLA policy (`DELETE /sla_policies/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      policy_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the SLA policy'),
    }),
    handler: async ({ policy_id, confirm }, { client }) => {
      const gate = requireConfirmation(confirm, {
        action: `Delete SLA policy #${policy_id}`,
        target: { policy_id },
      });
      if (gate) return gate;

      await client.request(`/sla_policies/${policy_id}`, { method: 'DELETE' });
      return json({ deleted: true, policy_id });
    },
  }),

  defineTool({
    name: 'assignment_policies_list',
    stability: 'stable',
    title: 'List or get assignment policies',
    description:
      'List assignment policies (`GET /assignment_policies`), fetch one policy and its linked inboxes (`GET /assignment_policies/:id` + `GET /assignment_policies/:assignment_policy_id/inboxes`), ' +
      'or fetch the assignment policy attached to an inbox (`GET /inboxes/:inbox_id/assignment_policy`).',
    inputSchema: z.object({
      policy_id: z.number().int().optional(),
      inbox_id: z.number().int().optional(),
    }),
    handler: async ({ policy_id, inbox_id }, { client }) => {
      if (inbox_id !== undefined) {
        return json(await client.request(`/inboxes/${inbox_id}/assignment_policy`));
      }
      if (policy_id !== undefined) {
        const [policy, inboxes] = await Promise.all([
          client.request(`/assignment_policies/${policy_id}`),
          client.request(`/assignment_policies/${policy_id}/inboxes`),
        ]);
        return json({ policy, inboxes });
      }
      return json(await client.request('/assignment_policies'));
    },
  }),

  defineTool({
    name: 'assignment_policy_upsert',
    stability: 'beta',
    title: 'Create, update, link, unlink, or delete an assignment policy',
    description:
      'Manage assignment policies: `action: "create"` (`POST /assignment_policies`), `action: "update"` (`PATCH /assignment_policies/:id`), ' +
      '`action: "link_inbox"` (`POST /inboxes/:inbox_id/assignment_policy` or `POST /assignment_policies/:assignment_policy_id/inboxes`), ' +
      '`action: "unlink_inbox"` (`DELETE /inboxes/:inbox_id/assignment_policy` or `DELETE /assignment_policies/:assignment_policy_id/inboxes/:id`), ' +
      'or `action: "delete"` (`DELETE /assignment_policies/:id`, requires `confirm: true`).',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      action: z
        .enum(['create', 'update', 'link_inbox', 'unlink_inbox', 'delete'])
        .optional()
        .describe('Defaults to update when policy_id is given, create otherwise'),
      policy_id: z.number().int().optional(),
      inbox_id: z.number().int().optional(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      assignment_order: z.string().optional(),
      conversation_priority: z.string().optional(),
      fair_distribution_limit: z.number().int().optional(),
      fair_distribution_window: z.number().int().optional(),
      enabled: z.boolean().optional(),
      exclude_older_than_hours: z.number().int().optional(),
      confirm: z.boolean().optional().describe('Required when action is "delete"'),
    }),
    handler: async (args, { client }) => {
      const mode = args.action ?? (args.policy_id !== undefined ? 'update' : 'create');
      if (mode === 'delete') {
        if (args.policy_id === undefined) {
          return failure('validation_error', '`policy_id` is required when `action` is `"delete"`');
        }
        const gate = requireConfirmation(args.confirm, {
          action: `Delete assignment policy #${args.policy_id}`,
          target: { policy_id: args.policy_id },
        });
        if (gate) return gate;

        await client.request(`/assignment_policies/${args.policy_id}`, { method: 'DELETE' });
        return json({ deleted: true, policy_id: args.policy_id });
      }

      if (mode === 'link_inbox') {
        if (args.inbox_id === undefined || args.policy_id === undefined) {
          return failure('validation_error', '`inbox_id` and `policy_id` are required for `link_inbox`');
        }
        return json(
          await client.request(`/inboxes/${args.inbox_id}/assignment_policy`, {
            method: 'POST',
            body: { assignment_policy_id: args.policy_id },
          }),
        );
      }

      if (mode === 'unlink_inbox') {
        if (args.inbox_id === undefined) {
          return failure('validation_error', '`inbox_id` is required for `unlink_inbox`');
        }
        if (args.policy_id !== undefined) {
          await client.request(`/assignment_policies/${args.policy_id}/inboxes/${args.inbox_id}`, {
            method: 'DELETE',
          });
        } else {
          await client.request(`/inboxes/${args.inbox_id}/assignment_policy`, { method: 'DELETE' });
        }
        return json({ unlinked: true, inbox_id: args.inbox_id, policy_id: args.policy_id ?? null });
      }

      const { action: _action, policy_id, inbox_id: _inbox, confirm: _confirm, ...fields } = args;
      if (mode === 'create') {
        if (!fields.name) {
          return failure('validation_error', '`name` is required when creating an assignment policy');
        }
        return json(
          await client.request('/assignment_policies', {
            method: 'POST',
            body: { assignment_policy: fields },
          }),
        );
      }

      if (policy_id === undefined) {
        return failure('validation_error', '`policy_id` is required when updating an assignment policy');
      }
      return json(
        await client.request(`/assignment_policies/${policy_id}`, {
          method: 'PATCH',
          body: { assignment_policy: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'label_upsert',
    stability: 'stable',
    title: 'Create, update, or get an account label',
    description:
      'Create (`POST /labels`), update (`PATCH /labels/:id`), or get (`GET /labels/:id`) an account label.',
    write: true,
    inputSchema: z.object({
      label_id: z.number().int().optional().describe('Omit to create; provide to update or get'),
      title: z.string().min(1).optional().describe('Lowercase slug/title for the label (required on create)'),
      description: z.string().optional(),
      color: z.string().optional().describe('Hex color, e.g. "#1f93ff"'),
      show_on_sidebar: z.boolean().optional(),
    }),
    handler: async ({ label_id, ...fields }, { client }) => {
      if (label_id === undefined) {
        if (!fields.title) {
          return failure('validation_error', '`title` is required when creating a label');
        }
        return json(
          await client.request('/labels', {
            method: 'POST',
            body: { label: fields },
          }),
        );
      }
      if (Object.keys(fields).length === 0) {
        return json(await client.request(`/labels/${label_id}`));
      }
      return json(
        await client.request(`/labels/${label_id}`, {
          method: 'PATCH',
          body: { label: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'label_delete',
    stability: 'stable',
    title: 'Delete an account label',
    description:
      'Delete an account label (`DELETE /labels/:id`) and enqueue removal of the label from all conversations and contacts. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      label_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the label'),
    }),
    handler: async ({ label_id, confirm }, { client }) => {
      const label = asRecord(await client.request(`/labels/${label_id}`));
      const gate = requireConfirmation(confirm, {
        action: `Delete label #${label_id} (${typeof label.title === 'string' ? `"${label.title}"` : 'unnamed'}) and remove it from all conversations and contacts`,
        target: { label_id, title: label.title ?? null, color: label.color ?? null },
      });
      if (gate) return gate;

      await client.request(`/labels/${label_id}`, { method: 'DELETE' });
      return json({ deleted: true, label_id });
    },
  }),

  defineTool({
    name: 'canned_response_upsert',
    stability: 'beta',
    title: 'Create or update a canned response',
    description:
      'Create (`POST /canned_responses`) or update (`PATCH /canned_responses/:id`) a saved canned response template.',
    write: true,
    inputSchema: z.object({
      canned_response_id: z.number().int().optional().describe('Omit to create; provide to update'),
      short_code: z.string().min(1).optional(),
      content: z.string().min(1).optional(),
    }),
    handler: async ({ canned_response_id, ...fields }, { client }) => {
      if (canned_response_id === undefined) {
        if (!fields.short_code || !fields.content) {
          return failure(
            'validation_error',
            '`short_code` and `content` are required when creating a canned response',
          );
        }
        return untrustedJson(
          await client.request('/canned_responses', {
            method: 'POST',
            body: { canned_response: fields },
          }),
        );
      }
      return untrustedJson(
        await client.request(`/canned_responses/${canned_response_id}`, {
          method: 'PATCH',
          body: { canned_response: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'canned_response_delete',
    stability: 'beta',
    title: 'Delete a canned response',
    description:
      'Delete a canned response (`DELETE /canned_responses/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      canned_response_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the canned response'),
    }),
    handler: async ({ canned_response_id, confirm }, { client }) => {
      const gate = requireConfirmation(confirm, {
        action: `Delete canned response #${canned_response_id}`,
        target: { canned_response_id },
      });
      if (gate) return gate;

      await client.request(`/canned_responses/${canned_response_id}`, { method: 'DELETE' });
      return json({ deleted: true, canned_response_id });
    },
  }),

  defineTool({
    name: 'custom_filter_upsert',
    stability: 'beta',
    title: 'Create or update a saved custom filter',
    description:
      'Create (`POST /custom_filters`) or update (`PATCH /custom_filters/:id`) a saved custom filter for the authenticated user.',
    write: true,
    inputSchema: z.object({
      filter_id: z.number().int().optional().describe('Omit to create; provide to update'),
      name: z.string().min(1).optional(),
      filter_type: z.enum(['conversation', 'contact', 'report']).optional(),
      query: z.record(z.string(), z.unknown()).optional(),
    }),
    handler: async ({ filter_id, ...fields }, { client }) => {
      if (filter_id === undefined) {
        if (!fields.name || !fields.query) {
          return failure('validation_error', '`name` and `query` are required when creating a custom filter');
        }
        return json(
          await client.request('/custom_filters', {
            method: 'POST',
            body: { custom_filter: { filter_type: 'conversation', ...fields } },
          }),
        );
      }
      return json(
        await client.request(`/custom_filters/${filter_id}`, {
          method: 'PATCH',
          body: { custom_filter: fields },
        }),
      );
    },
  }),

  defineTool({
    name: 'custom_filter_delete',
    stability: 'beta',
    title: 'Delete a saved custom filter',
    description:
      'Delete a saved custom filter (`DELETE /custom_filters/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      filter_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the custom filter'),
    }),
    handler: async ({ filter_id, confirm }, { client }) => {
      const filter = asRecord(await client.request(`/custom_filters/${filter_id}`));
      const gate = requireConfirmation(confirm, {
        action: `Delete custom filter #${filter_id} (${typeof filter.name === 'string' ? `"${filter.name}"` : 'unnamed'})`,
        target: { filter_id, name: filter.name ?? null, filter_type: filter.filter_type ?? null },
      });
      if (gate) return gate;

      await client.request(`/custom_filters/${filter_id}`, { method: 'DELETE' });
      return json({ deleted: true, filter_id });
    },
  }),

  // =========================================================================
  // ADM-06 — Account Settings & Audit Logs
  // =========================================================================

  defineTool({
    name: 'account_settings_get',
    stability: 'stable',
    title: 'Get account settings, notification settings, and branded email layout',
    description:
      'Read account details and settings (`GET /api/v1/accounts/:id`), the authenticated user notification settings (`GET /notification_settings`), ' +
      'and optionally the branded email layout (`GET /branded_email_layout`).',
    inputSchema: z.object({
      include_notification_settings: z
        .boolean()
        .optional()
        .describe('Defaults to true'),
      include_branded_email_layout: z
        .boolean()
        .optional()
        .describe('When true, also fetches GET /branded_email_layout'),
    }),
    handler: async (
      { include_notification_settings = true, include_branded_email_layout = false },
      { client, config },
    ) => {
      const [account, notification_settings, branded_email_layout] = await Promise.all([
        client.request(`/api/v1/accounts/${config.accountId}`, { prefix: 'raw' }),
        include_notification_settings
          ? client.request('/notification_settings')
          : Promise.resolve(undefined),
        include_branded_email_layout
          ? client.request('/branded_email_layout')
          : Promise.resolve(undefined),
      ]);
      return json({
        account,
        ...(notification_settings !== undefined ? { notification_settings } : {}),
        ...(branded_email_layout !== undefined ? { branded_email_layout } : {}),
      });
    },
  }),

  defineTool({
    name: 'account_settings_update',
    stability: 'beta',
    title: 'Update account settings, notification settings, or branded email layout',
    description:
      'Update account settings (`PATCH /api/v1/accounts/:id`), user notification settings (`PATCH /notification_settings`), ' +
      'and/or branded email layout (`PATCH /branded_email_layout`).',
    write: true,
    inputSchema: z.object({
      name: z.string().min(1).optional(),
      locale: z.string().optional(),
      domain: z.string().nullable().optional(),
      support_email: z.string().email().nullable().optional(),
      auto_resolve_after: z.number().int().nullable().optional(),
      auto_resolve_message: z.string().nullable().optional(),
      auto_resolve_ignore_waiting: z.boolean().optional(),
      audio_transcriptions: z.boolean().optional(),
      auto_resolve_label: z.string().nullable().optional(),
      notification_settings: z
        .object({
          selected_email_flags: z.array(z.string()).optional(),
          selected_push_flags: z.array(z.string()).optional(),
        })
        .optional(),
      branded_email_layout: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
    handler: async ({ notification_settings, branded_email_layout, ...accountFields }, { client, config }) => {
      const results: Record<string, unknown> = {};
      if (Object.keys(accountFields).length > 0) {
        results.account = await client.request(`/api/v1/accounts/${config.accountId}`, {
          prefix: 'raw',
          method: 'PATCH',
          body: accountFields,
        });
      }
      if (notification_settings !== undefined) {
        results.notification_settings = await client.request('/notification_settings', {
          method: 'PATCH',
          body: { notification_settings },
        });
      }
      if (branded_email_layout !== undefined) {
        results.branded_email_layout = await client.request('/branded_email_layout', {
          method: 'PATCH',
          body: { branded_email_layout },
        });
      }
      if (Object.keys(results).length === 0) {
        return failure('validation_error', 'Provide at least one account setting, `notification_settings`, or `branded_email_layout` to update');
      }
      return json(results);
    },
  }),

  defineTool({
    name: 'audit_logs_list',
    stability: 'beta',
    title: 'List account audit logs',
    description:
      'List account audit log entries (`GET /audit_logs`, 25 per page). ' +
      'Note: on AirysChat deployments where the Enterprise audit logs controller is not mounted, upstream returns HTTP 404.',
    inputSchema: z.object({
      page: z.number().int().min(1).optional(),
    }),
    handler: async ({ page }, { client }) =>
      untrustedJson(await client.request('/audit_logs', { query: { page } })),
  }),
];
