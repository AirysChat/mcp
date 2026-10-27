/**
 * Meta Business Agent toolset (`meta_agent` — opt-in via `AIRYSCHAT_TOOLSETS`).
 *
 * Exposes both the canonical AI Manager Meta Business Agent Workspace surface
 * (`/saas/api/v1/accounts/:account_id/ai_manager/inboxes/:inbox_id/meta_business_agent/*`
 * and `/conversations/:conversation_id/meta_business_agent_control`, `surface: "workspace"`)
 * and the direct Meta Business Agent inbox endpoints (`/api/v1/accounts/:account_id/meta_agent/*`,
 * `surface: "direct"`), including human handoff rotation (`handoff_assignment`) and
 * Meta Business Manager WABA budgets (`budget`).
 *
 * Non-negotiables enforced here:
 * - Knowledge/FAQ/skill/website/file/eval/test payloads return through `untrustedJson`.
 * - Every Meta-side write (`mba_onboarding`, `mba_settings_update`, `mba_business_info_update`,
 *   `mba_resource_upsert`, `mba_resource_delete`, `mba_connectors` writes, `mba_release`,
 *   `mba_thread_control_release`, `mba_handoff_update`, `mba_budget_update`, and
 *   `mba_evals` `send_event`) sets `write: true`, `irreversible: true`, and goes through
 *   `requireConfirmation` with a server-derived summary.
 * - Workspace commands automatically supply `idempotency_key` when omitted, and
 *   full-replacement writes (`mba_settings_update`, `mba_business_info_update`)
 *   automatically fetch the current `observed_hash` snapshot before confirmation.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../client.js';
import { failure, json, readOnlyRefusal, requireConfirmation, untrustedJson } from '../result.js';
import { defineTool, type AnyToolDefinition } from '../toolsets.js';

const SURFACE_SCHEMA = z
  .enum(['workspace', 'direct'])
  .default('workspace')
  .describe(
    '"workspace" (default) uses /saas/api/v1/.../ai_manager/inboxes/:inbox_id/meta_business_agent; "direct" uses /api/v1/.../meta_agent/inboxes/:inbox_id',
  );

const RESOURCE_KIND_SCHEMA = z.enum([
  'allowlist',
  'faqs',
  'files',
  'websites',
  'skills',
  'ui_skills',
  'connectors',
]);

function directResourceSegment(kind: z.infer<typeof RESOURCE_KIND_SCHEMA>): string {
  return kind === 'allowlist' ? 'allowlist_entries' : kind;
}

function makeIdempotencyKey(provided?: string): string {
  const trimmed = provided?.trim();
  if (trimmed && !trimmed.includes(',') && !/\s/.test(trimmed)) return trimmed.slice(0, 255);
  return `mcp-${randomUUID()}`;
}

function formatMbaError(error: unknown): never {
  if (error instanceof ApiError && error.payload && typeof error.payload === 'object') {
    const rec = error.payload as Record<string, unknown>;
    if (rec.error === 'meta_business_agent_live_operations_disabled') {
      throw new ApiError(
        error.status,
        error.url,
        error.method,
        {
          error: `meta_business_agent_live_operations_disabled: ${String(rec.message ?? 'Live Meta Business Agent operations are disabled for this account/phone.')}`,
        },
      );
    }
    if (rec.error === 'readiness_blocked' && Array.isArray(rec.blockers)) {
      throw new ApiError(
        error.status,
        error.url,
        error.method,
        {
          error: `readiness_blocked: ${JSON.stringify(rec.blockers)}`,
        },
      );
    }
  }
  throw error;
}

export const metaAgentTools: AnyToolDefinition[] = [
  // ---------------------------------------------------------------------------
  // Read tools (AIA-06)
  // ---------------------------------------------------------------------------

  defineTool({
    name: 'mba_inboxes_list',
    stability: 'beta',
    title: 'List Meta Business Agent Inboxes & Agent Status',
    description:
      'List eligible WhatsApp/Instagram inboxes and their Meta Business Agent status (`GET /meta_agent/inboxes`), or inspect a specific inbox’s direct Meta Agent (`GET /meta_agent/inboxes/:inbox_id/agent`), remote discovery (`include_discovery: true`), and recent conversation turns (`include_turns: true`).',
    inputSchema: z.object({
      inbox_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional inbox ID to inspect its Meta Business Agent record'),
      include_discovery: z
        .boolean()
        .optional()
        .describe('When true (requires inbox_id), also fetches GET /meta_agent/inboxes/:inbox_id/agent/discovery'),
      include_turns: z
        .boolean()
        .optional()
        .describe('When true (requires inbox_id), also fetches GET /meta_agent/inboxes/:inbox_id/conversation_turns'),
    }),
    handler: async ({ inbox_id, include_discovery, include_turns }, { client }) => {
      if (inbox_id === undefined) {
        const data = await client.request('/meta_agent/inboxes');
        return json(data);
      }
      const agent = await client.request<Record<string, unknown>>(
        `/meta_agent/inboxes/${inbox_id}/agent`,
      );
      const result: Record<string, unknown> = { agent };
      if (include_discovery) {
        result.discovery = await client.request(`/meta_agent/inboxes/${inbox_id}/agent/discovery`);
      }
      if (include_turns) {
        result.conversation_turns = await client.request(
          `/meta_agent/inboxes/${inbox_id}/conversation_turns`,
        );
      }
      return include_turns ? untrustedJson(result) : json(result);
    },
  }),

  defineTool({
    name: 'mba_workspace_get',
    stability: 'beta',
    title: 'Get Meta Business Agent Workspace & Panels',
    description:
      'Fetch the AI Manager Meta Business Agent Workspace state for an inbox (`GET /ai_manager/inboxes/:inbox_id/meta_business_agent`), including readiness summary, deployment state, training revision, and safety gates. Optionally fetch an AI Manager panel (`panel: "mba" | "runtime" | "deployment"` with `phone_number_id`).',
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      panel: z
        .enum(['mba', 'runtime', 'deployment'])
        .optional()
        .describe('Optional AI Manager panel to include alongside the workspace'),
      phone_number_id: z
        .string()
        .optional()
        .describe('Required when panel is "mba", "runtime", or "deployment"'),
    }),
    handler: async ({ inbox_id, panel, phone_number_id }, { client }) => {
      const workspace = await client.request<Record<string, unknown>>(
        `/ai_manager/inboxes/${inbox_id}/meta_business_agent`,
        { prefix: 'saas' },
      );
      if (!panel) return untrustedJson(workspace);
      if (!phone_number_id) {
        return failure('phone_number_id is required when requesting an AI Manager panel.');
      }

      const panelPath =
        panel === 'mba'
          ? `/ai_manager/meta_business_agent/${encodeURIComponent(phone_number_id)}/panels`
          : panel === 'runtime'
            ? `/ai_manager/runtimes/${inbox_id}/panels`
            : `/ai_manager/deployments/${inbox_id}/panels`;
      const panelQuery = panel === 'mba' ? { inbox_id } : { phone_number_id };
      const panelData = await client.request(panelPath, { prefix: 'saas', query: panelQuery });
      return untrustedJson({ workspace, panel: panelData });
    },
  }),

  defineTool({
    name: 'mba_settings_get',
    stability: 'beta',
    title: 'Get Meta Business Agent Settings',
    description:
      'Fetch the observed Meta Business Agent settings (`rollout`, `handoff`, `followup`, `ai_audience`) and `observed_hash` for an inbox.',
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      surface: SURFACE_SCHEMA,
    }),
    handler: async ({ inbox_id, surface }, { client }) => {
      try {
        if (surface === 'direct') {
          return untrustedJson(await client.request(`/meta_agent/inboxes/${inbox_id}/settings`));
        }
        return untrustedJson(
          await client.request(`/ai_manager/inboxes/${inbox_id}/meta_business_agent/settings`, {
            prefix: 'saas',
          }),
        );
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_business_info_get',
    stability: 'beta',
    title: 'Get Meta Business Agent Business Info',
    description:
      'Fetch the observed Meta Business Agent business profile/knowledge info and `observed_hash` for an inbox.',
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      surface: SURFACE_SCHEMA,
    }),
    handler: async ({ inbox_id, surface }, { client }) => {
      try {
        if (surface === 'direct') {
          return untrustedJson(
            await client.request(`/meta_agent/inboxes/${inbox_id}/business_info`),
          );
        }
        return untrustedJson(
          await client.request(
            `/ai_manager/inboxes/${inbox_id}/meta_business_agent/business_info`,
            { prefix: 'saas' },
          ),
        );
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_resources_list',
    stability: 'beta',
    title: 'List or Get Meta Business Agent Resources (FAQs, Skills, Allowlist, Websites, Files, Connectors)',
    description:
      'List resources of `resource_kind` (`"allowlist"`, `"faqs"`, `"files"`, `"websites"`, `"skills"`, `"ui_skills"`, `"connectors"`) for a Meta Business Agent inbox, or fetch a single item by `remote_id`.',
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      resource_kind: RESOURCE_KIND_SCHEMA,
      remote_id: z
        .string()
        .optional()
        .describe('Optional remote resource ID for item read (workspace surface supports faqs, files, websites, skills, connectors)'),
      surface: SURFACE_SCHEMA,
    }),
    handler: async ({ inbox_id, resource_kind, remote_id, surface }, { client }) => {
      try {
        if (surface === 'direct' || resource_kind === 'ui_skills') {
          if (resource_kind === 'connectors') {
            return failure('resource_kind="connectors" is only available on surface="workspace".');
          }
          const segment = directResourceSegment(resource_kind);
          const data = await client.request(`/meta_agent/inboxes/${inbox_id}/${segment}`);
          return untrustedJson(data);
        }

        const path = remote_id
          ? `/ai_manager/inboxes/${inbox_id}/meta_business_agent/resources/${resource_kind}/${encodeURIComponent(remote_id)}`
          : `/ai_manager/inboxes/${inbox_id}/meta_business_agent/resources/${resource_kind}`;
        const data = await client.request(path, { prefix: 'saas' });
        return untrustedJson(data);
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_thread_control_get',
    stability: 'beta',
    title: 'Get Conversation Meta Business Agent Thread Control State',
    description:
      'Fetch the Meta Business Agent thread control projection for a conversation (`GET /conversations/:conversation_id/meta_business_agent_control`), showing whether Meta AI or a human operator currently owns the thread and whether release is allowed.',
    inputSchema: z.object({
      conversation_id: z
        .number()
        .int()
        .positive()
        .describe('Account-scoped conversation display_id'),
    }),
    handler: async ({ conversation_id }, { client }) => {
      const data = await client.request(
        `/conversations/${conversation_id}/meta_business_agent_control`,
        { prefix: 'saas' },
      );
      return json(data);
    },
  }),

  defineTool({
    name: 'mba_handoff_get',
    stability: 'beta',
    title: 'Get Meta Business Agent Human Handoff Rotation',
    description:
      'Fetch the AirysChat human agent weighted rotation (`enabled`, `position`, `next_user_id`, `members`, `available_agents`) that assigns conversations handed off by Meta Business Agent (`GET /meta_agent/inboxes/:inbox_id/handoff_assignment`).',
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
    }),
    handler: async ({ inbox_id }, { client }) => {
      const data = await client.request(`/meta_agent/inboxes/${inbox_id}/handoff_assignment`);
      return json(data);
    },
  }),

  defineTool({
    name: 'mba_budget_get',
    stability: 'beta',
    title: 'Get Meta Business Agent WABA Budgets',
    description:
      'Fetch the Meta Business Manager WABA agent budgets (`budget_id`, `unit_type`, `time_window`, `max_budget`) for an onboarded Meta Business Agent inbox (`GET /meta_agent/inboxes/:inbox_id/budget`).',
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
    }),
    handler: async ({ inbox_id }, { client }) => {
      const data = await client.request(`/meta_agent/inboxes/${inbox_id}/budget`);
      return json(data);
    },
  }),

  // ---------------------------------------------------------------------------
  // Write tools (AIA-07)
  // ---------------------------------------------------------------------------

  defineTool({
    name: 'mba_preflight',
    stability: 'beta',
    title: 'Run Meta Business Agent Preflight or Eligibility Check',
    description:
      'Run a Graph API connection preflight (`check: "preflight"`) or WABA eligibility check (`check: "eligibility"`) for a Meta Business Agent inbox and persist the readiness facts.',
    write: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      check: z.enum(['preflight', 'eligibility']).default('preflight'),
      webhook_fields_confirmed: z.boolean().optional(),
      idempotency_key: z.string().optional(),
      surface: SURFACE_SCHEMA,
    }),
    handler: async ({ inbox_id, check, webhook_fields_confirmed, idempotency_key, surface }, { client }) => {
      try {
        if (surface === 'direct') {
          if (check !== 'eligibility') {
            return failure('surface="direct" only supports check="eligibility".');
          }
          const res = await client.request(`/meta_agent/inboxes/${inbox_id}/agent/eligibility`, {
            method: 'POST',
          });
          return json(res);
        }

        const path =
          check === 'eligibility'
            ? `/ai_manager/inboxes/${inbox_id}/meta_business_agent/eligibility/check`
            : `/ai_manager/inboxes/${inbox_id}/meta_business_agent/preflight`;
        const res = await client.request(path, {
          method: 'POST',
          prefix: 'saas',
          body: {
            idempotency_key: makeIdempotencyKey(idempotency_key),
            ...(webhook_fields_confirmed !== undefined ? { webhook_fields_confirmed } : {}),
          },
        });
        return json(res);
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_onboarding',
    stability: 'beta',
    title: 'Bootstrap, Attest Terms, Onboard, Select Agent, or Reconcile Meta Business Agent',
    description:
      'Perform Meta Business Agent workspace lifecycle actions (`action: "bootstrap" | "confirm_terms" | "onboarding" | "agent_selection" | "reconcile_training_fence" | "delete_agent"`). All actions are irreversible and require `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      action: z.enum([
        'bootstrap',
        'confirm_terms',
        'onboarding',
        'agent_selection',
        'reconcile_training_fence',
        'delete_agent',
      ]),
      business_portfolio_id: z.string().optional().describe('Optional Business Portfolio ID for bootstrap'),
      confirmed_in_whatsapp_manager: z
        .boolean()
        .optional()
        .describe('Must be true when action is "confirm_terms"'),
      agent_id: z.string().optional().describe('Remote Meta agent ID when action is "agent_selection"'),
      idempotency_key: z.string().optional(),
      surface: SURFACE_SCHEMA,
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after the user approves this Meta Business Agent onboarding action'),
    }),
    handler: async (args, { client }) => {
      if (args.action === 'confirm_terms' && args.confirmed_in_whatsapp_manager !== true) {
        return failure(
          'confirmed_in_whatsapp_manager must be explicitly set to true when action is "confirm_terms".',
        );
      }
      if (args.action === 'agent_selection' && !args.agent_id) {
        return failure('agent_id is required when action is "agent_selection".');
      }

      const gate = requireConfirmation(
        args.confirm,
        `Execute Meta Business Agent onboarding action "${args.action}" on Inbox #${args.inbox_id} (surface: ${args.surface}${args.agent_id ? `, agent_id: ${args.agent_id}` : ''}).`,
      );
      if (gate) return gate;

      try {
        if (args.surface === 'direct') {
          switch (args.action) {
            case 'confirm_terms':
              return json(
                await client.request(`/meta_agent/inboxes/${args.inbox_id}/agent/attest_terms`, {
                  method: 'POST',
                  body: { confirmed_in_whatsapp_manager: true },
                }),
              );
            case 'onboarding':
              return json(
                await client.request(`/meta_agent/inboxes/${args.inbox_id}/agent`, {
                  method: 'POST',
                }),
              );
            case 'agent_selection':
              return json(
                await client.request(`/meta_agent/inboxes/${args.inbox_id}/agent/adopt`, {
                  method: 'POST',
                  body: { agent_id: args.agent_id },
                }),
              );
            case 'delete_agent':
              return json(
                await client.request(`/meta_agent/inboxes/${args.inbox_id}/agent`, {
                  method: 'DELETE',
                }),
              );
            default:
              return failure(`Action "${args.action}" is only supported on surface="workspace".`);
          }
        }

        const base = `/ai_manager/inboxes/${args.inbox_id}/meta_business_agent`;
        const idempotencyKey = makeIdempotencyKey(args.idempotency_key);
        switch (args.action) {
          case 'bootstrap':
            return json(
              await client.request(`${base}/bootstrap`, {
                method: 'POST',
                prefix: 'saas',
                body: { business_portfolio_id: args.business_portfolio_id },
              }),
            );
          case 'confirm_terms':
            return json(
              await client.request(`${base}/terms/confirm`, {
                method: 'POST',
                prefix: 'saas',
                body: { confirmed_in_whatsapp_manager: true },
              }),
            );
          case 'onboarding':
            return json(
              await client.request(`${base}/onboarding`, {
                method: 'POST',
                prefix: 'saas',
                body: { idempotency_key: idempotencyKey },
              }),
            );
          case 'agent_selection':
            return json(
              await client.request(`${base}/agent_selection`, {
                method: 'PUT',
                prefix: 'saas',
                body: { idempotency_key: idempotencyKey, agent_id: args.agent_id },
              }),
            );
          case 'reconcile_training_fence':
            return json(
              await client.request(`${base}/reconcile_training_fence`, {
                method: 'POST',
                prefix: 'saas',
                body: { idempotency_key: idempotencyKey },
              }),
            );
          default:
            return failure(`Action "${args.action}" is only supported on surface="direct".`);
        }
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_settings_update',
    stability: 'beta',
    title: 'Update Meta Business Agent Settings',
    description:
      'Replace Meta Business Agent settings (`handoff`, `followup`, `ai_audience`, `rollout`) at Meta with optimistic concurrency (`observed_hash`) and readback verification. Note: `rollout.enabled: true` is rejected here — use `mba_release` to enable rollout. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      settings: z
        .record(z.string(), z.unknown())
        .describe('Full settings replacement object (rollout, handoff, followup, ai_audience)'),
      observed_hash: z
        .string()
        .optional()
        .describe('Optional observed_hash from mba_settings_get; fetched automatically when omitted'),
      idempotency_key: z.string().optional(),
      surface: SURFACE_SCHEMA,
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after the user approves replacing the Meta Business Agent settings'),
    }),
    handler: async ({ inbox_id, settings, observed_hash, idempotency_key, surface, confirm }, { client }) => {
      try {
        let currentHash = observed_hash;
        if (!currentHash && surface === 'workspace') {
          const current = await client.request<{ observed_hash?: string; observed?: unknown }>(
            `/ai_manager/inboxes/${inbox_id}/meta_business_agent/settings`,
            { prefix: 'saas' },
          );
          currentHash = current?.observed_hash;
        }

        const gate = requireConfirmation(
          confirm,
          `Replace Meta Business Agent settings at Meta for Inbox #${inbox_id} (observed_hash: ${currentHash ?? 'direct'}, new settings: ${JSON.stringify(settings)}). This invalidates training test/eval evidence.`,
        );
        if (gate) return gate;

        if (surface === 'direct') {
          return json(
            await client.request(`/meta_agent/inboxes/${inbox_id}/settings`, {
              method: 'PUT',
              body: { settings },
            }),
          );
        }

        return json(
          await client.request(`/ai_manager/inboxes/${inbox_id}/meta_business_agent/settings`, {
            method: 'PUT',
            prefix: 'saas',
            body: {
              idempotency_key: makeIdempotencyKey(idempotency_key),
              observed_hash: currentHash,
              settings,
            },
          }),
        );
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_business_info_update',
    stability: 'beta',
    title: 'Update or Reset Meta Business Agent Business Info',
    description:
      'Replace (`action: "update"`) or clear (`action: "reset"`) the Meta Business Agent business profile/knowledge info at Meta with optimistic concurrency (`observed_hash`) and readback verification. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      action: z.enum(['update', 'reset']).default('update'),
      business_info: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Required when action is "update"'),
      observed_hash: z
        .string()
        .optional()
        .describe('Optional observed_hash from mba_business_info_get; fetched automatically when omitted'),
      idempotency_key: z.string().optional(),
      surface: SURFACE_SCHEMA,
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after the user approves updating or resetting Meta business info'),
    }),
    handler: async (
      { inbox_id, action, business_info, observed_hash, idempotency_key, surface, confirm },
      { client },
    ) => {
      if (action === 'update' && !business_info) {
        return failure('business_info is required when action is "update".');
      }

      try {
        let currentHash = observed_hash;
        if (!currentHash && surface === 'workspace') {
          const current = await client.request<{ observed_hash?: string }>(
            `/ai_manager/inboxes/${inbox_id}/meta_business_agent/business_info`,
            { prefix: 'saas' },
          );
          currentHash = current?.observed_hash;
        }

        const gate = requireConfirmation(
          confirm,
          `${action === 'reset' ? 'Reset (clear)' : 'Replace'} Meta Business Agent business_info at Meta for Inbox #${inbox_id} (observed_hash: ${currentHash ?? 'direct'}). This invalidates training test/eval evidence.`,
        );
        if (gate) return gate;

        if (surface === 'direct') {
          if (action === 'reset') {
            return json(
              await client.request(`/meta_agent/inboxes/${inbox_id}/business_info`, {
                method: 'DELETE',
              }),
            );
          }
          return untrustedJson(
            await client.request(`/meta_agent/inboxes/${inbox_id}/business_info`, {
              method: 'PUT',
              body: { business_info },
            }),
          );
        }

        if (action === 'reset') {
          return json(
            await client.request(
              `/ai_manager/inboxes/${inbox_id}/meta_business_agent/business_info`,
              {
                method: 'DELETE',
                prefix: 'saas',
                body: {
                  idempotency_key: makeIdempotencyKey(idempotency_key),
                  observed_hash: currentHash,
                },
              },
            ),
          );
        }

        return untrustedJson(
          await client.request(
            `/ai_manager/inboxes/${inbox_id}/meta_business_agent/business_info`,
            {
              method: 'PUT',
              prefix: 'saas',
              body: {
                idempotency_key: makeIdempotencyKey(idempotency_key),
                observed_hash: currentHash,
                business_info,
              },
            },
          ),
        );
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_resource_upsert',
    stability: 'beta',
    title: 'Create or Update Meta Business Agent Resource (FAQ, Skill, Allowlist, Website, File, Connector)',
    description:
      'Create (`action: "create"`) or update (`action: "update"`) a Meta Business Agent resource at Meta (`allowlist`, `faqs`, `files`, `websites`, `skills`, `ui_skills`, `connectors`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      resource_kind: RESOURCE_KIND_SCHEMA,
      action: z.enum(['create', 'update']).default('create'),
      remote_id: z
        .string()
        .optional()
        .describe('Remote resource ID (required when action is "update")'),
      resource: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Resource payload: e.g. { question, answer } for faqs; { title, description, skill } for skills; { url } for websites; { name, description, base_url, auth_type } for connectors',
        ),
      consumer_phone_number: z
        .string()
        .optional()
        .describe('E.164 phone number when resource_kind is "allowlist"'),
      file_name: z.string().optional().describe('File name when resource_kind is "files"'),
      file: z.string().optional().describe('File payload when resource_kind is "files"'),
      idempotency_key: z.string().optional(),
      surface: SURFACE_SCHEMA,
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after the user approves publishing this resource to Meta'),
    }),
    handler: async (args, { client }) => {
      if (args.action === 'update' && !args.remote_id) {
        return failure('remote_id is required when action is "update".');
      }

      const summary =
        args.resource_kind === 'allowlist'
          ? `consumer_phone_number: ${args.consumer_phone_number ?? String(args.resource?.consumer_phone_number ?? '?')}`
          : JSON.stringify(args.resource ?? { file_name: args.file_name });

      const gate = requireConfirmation(
        args.confirm,
        `${args.action === 'create' ? 'Create' : `Update (${args.remote_id})`} Meta Business Agent ${args.resource_kind} resource at Meta on Inbox #${args.inbox_id} (${summary}).`,
      );
      if (gate) return gate;

      try {
        if (args.surface === 'direct' || args.resource_kind === 'ui_skills') {
          if (args.resource_kind === 'connectors') {
            return failure('resource_kind="connectors" is only available on surface="workspace".');
          }
          const segment = directResourceSegment(args.resource_kind);
          const path =
            args.action === 'update'
              ? `/meta_agent/inboxes/${args.inbox_id}/${segment}/${encodeURIComponent(args.remote_id!)}`
              : `/meta_agent/inboxes/${args.inbox_id}/${segment}`;
          const method = args.action === 'update' ? 'PUT' : 'POST';
          const body =
            args.resource_kind === 'allowlist'
              ? { consumer_phone_number: args.consumer_phone_number ?? args.resource?.consumer_phone_number }
              : args.resource;
          return untrustedJson(await client.request(path, { method, body }));
        }

        const base = `/ai_manager/inboxes/${args.inbox_id}/meta_business_agent/resources/${args.resource_kind}`;
        const path =
          args.action === 'update'
            ? `${base}/${encodeURIComponent(args.remote_id!)}`
            : base;
        const method = args.action === 'update' ? 'PUT' : 'POST';
        const body: Record<string, unknown> = {
          idempotency_key: makeIdempotencyKey(args.idempotency_key),
        };
        if (args.resource_kind === 'allowlist') {
          body.consumer_phone_number =
            args.consumer_phone_number ?? args.resource?.consumer_phone_number;
        } else if (args.resource_kind === 'files') {
          body.file_name = args.file_name ?? args.resource?.file_name;
          body.file = args.file ?? args.resource?.file;
        } else if (args.resource) {
          body.resource = args.resource;
        }

        const res = await client.request(path, { method, prefix: 'saas', body });
        return untrustedJson(res);
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_resource_delete',
    stability: 'beta',
    title: 'Delete Meta Business Agent Resource',
    description:
      'Delete a Meta Business Agent resource (`allowlist`, `faqs`, `files`, `websites`, `skills`, `ui_skills`, `connectors`) by `remote_id` at Meta. Irreversible; requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      resource_kind: RESOURCE_KIND_SCHEMA,
      remote_id: z.string().min(1).describe('Remote resource ID to delete'),
      idempotency_key: z.string().optional(),
      surface: SURFACE_SCHEMA,
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after the user approves deleting this resource from Meta'),
    }),
    handler: async ({ inbox_id, resource_kind, remote_id, idempotency_key, surface, confirm }, { client }) => {
      const gate = requireConfirmation(
        confirm,
        `Permanently delete Meta Business Agent ${resource_kind} resource "${remote_id}" at Meta on Inbox #${inbox_id}.`,
      );
      if (gate) return gate;

      try {
        if (surface === 'direct' || resource_kind === 'ui_skills') {
          if (resource_kind === 'connectors') {
            return failure('resource_kind="connectors" is only available on surface="workspace".');
          }
          const segment = directResourceSegment(resource_kind);
          const res = await client.request(
            `/meta_agent/inboxes/${inbox_id}/${segment}/${encodeURIComponent(remote_id)}`,
            { method: 'DELETE' },
          );
          return json(res ?? { deleted: true, remote_id });
        }

        const res = await client.request(
          `/ai_manager/inboxes/${inbox_id}/meta_business_agent/resources/${resource_kind}/${encodeURIComponent(remote_id)}`,
          {
            method: 'DELETE',
            prefix: 'saas',
            body: { idempotency_key: makeIdempotencyKey(idempotency_key) },
          },
        );
        return json(res ?? { deleted: true, remote_id });
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_connectors',
    stability: 'beta',
    title: 'Manage Meta Business Agent Connector Tools, Logs & Credentials',
    description:
      'List/inspect connector tools and logs (`action: "list_tools" | "get_tool" | "logs"`), or create/update/delete/run connector tools and upsert credentials (`action: "create_tool" | "update_tool" | "delete_tool" | "run_tool" | "upsert_credentials"`, irreversible + requires `confirm: true`).',
    write: true,
    irreversible: true,
    readOnlyCapable: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      connector_id: z.string().min(1).describe('Connector ID'),
      action: z.enum([
        'list_tools',
        'get_tool',
        'logs',
        'create_tool',
        'update_tool',
        'delete_tool',
        'run_tool',
        'upsert_credentials',
      ]),
      tool_id: z.string().optional().describe('Required for get_tool, update_tool, delete_tool, run_tool'),
      tool: z.record(z.string(), z.unknown()).optional().describe('Connector tool definition for create_tool / update_tool'),
      input: z.record(z.string(), z.unknown()).optional().describe('Tool input payload for run_tool'),
      filters: z.record(z.string(), z.unknown()).optional().describe('Optional filter object for logs'),
      credential_type: z
        .enum(['api_key', 'oauth2_client_credentials', 'certificate'])
        .optional()
        .describe('Required for upsert_credentials'),
      credential: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Credential payload for upsert_credentials'),
      idempotency_key: z.string().optional(),
      confirm: z.boolean().optional().describe('Required (true) for write/run actions'),
    }),
    handler: async (args, { client, config }) => {
      const isRead = ['list_tools', 'get_tool', 'logs'].includes(args.action);
      if (config.readOnly && !isRead) return readOnlyRefusal('mba_connectors');

      const base = `/ai_manager/inboxes/${args.inbox_id}/meta_business_agent/connectors/${encodeURIComponent(args.connector_id)}`;

      try {
        if (args.action === 'list_tools') {
          return json(await client.request(`${base}/tools`, { prefix: 'saas' }));
        }
        if (args.action === 'get_tool') {
          if (!args.tool_id) return failure('tool_id is required when action is "get_tool".');
          return json(
            await client.request(`${base}/tools/${encodeURIComponent(args.tool_id)}`, {
              prefix: 'saas',
            }),
          );
        }
        if (args.action === 'logs') {
          return untrustedJson(
            await client.request(`${base}/logs`, {
              prefix: 'saas',
              query: args.filters ? { filters: JSON.stringify(args.filters) } : undefined,
            }),
          );
        }

        const gate = requireConfirmation(
          args.confirm,
          `Execute Meta Business Agent connector action "${args.action}" on Connector "${args.connector_id}" (Inbox #${args.inbox_id}${args.tool_id ? `, tool_id: ${args.tool_id}` : ''}).`,
        );
        if (gate) return gate;

        const idempotencyKey = makeIdempotencyKey(args.idempotency_key);

        if (args.action === 'create_tool') {
          if (!args.tool) return failure('tool is required when action is "create_tool".');
          return json(
            await client.request(`${base}/tools`, {
              method: 'POST',
              prefix: 'saas',
              body: { idempotency_key: idempotencyKey, tool: args.tool },
            }),
          );
        }
        if (args.action === 'update_tool') {
          if (!args.tool_id || !args.tool) {
            return failure('tool_id and tool are required when action is "update_tool".');
          }
          return json(
            await client.request(`${base}/tools/${encodeURIComponent(args.tool_id)}`, {
              method: 'PUT',
              prefix: 'saas',
              body: { idempotency_key: idempotencyKey, tool: args.tool },
            }),
          );
        }
        if (args.action === 'delete_tool') {
          if (!args.tool_id) return failure('tool_id is required when action is "delete_tool".');
          return json(
            await client.request(`${base}/tools/${encodeURIComponent(args.tool_id)}`, {
              method: 'DELETE',
              prefix: 'saas',
              body: { idempotency_key: idempotencyKey },
            }),
          );
        }
        if (args.action === 'run_tool') {
          if (!args.tool_id) return failure('tool_id is required when action is "run_tool".');
          return json(
            await client.request(`${base}/tools/${encodeURIComponent(args.tool_id)}/run`, {
              method: 'POST',
              prefix: 'saas',
              body: {
                idempotency_key: idempotencyKey,
                confirm_side_effects: true,
                input: args.input ?? {},
              },
            }),
          );
        }
        if (!args.credential_type || !args.credential) {
          return failure(
            'credential_type and credential are required when action is "upsert_credentials".',
          );
        }
        return json(
          await client.request(`${base}/credentials`, {
            method: 'POST',
            prefix: 'saas',
            body: {
              idempotency_key: idempotencyKey,
              credential_type: args.credential_type,
              credential: args.credential,
            },
          }),
        );
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_release',
    stability: 'beta',
    title: 'Check Release Readiness or Execute Meta Business Agent Release Action',
    description:
      'Run the Meta Business Agent release confirmation check (`action: "confirm_check"`), or execute a release saga transition (`action: "canary" | "promote" | "pause" | "rollback"`). Release transitions always run `release_confirmation` first and require `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      action: z
        .enum(['confirm_check', 'canary', 'promote', 'pause', 'rollback'])
        .default('confirm_check'),
      consumer_phone_number: z
        .string()
        .optional()
        .describe('Canary tester E.164 phone number (for confirm_check or canary)'),
      observed_hash: z.string().optional(),
      confirmation: z.record(z.string(), z.unknown()).optional(),
      promotion_override: z.boolean().optional(),
      idempotency_key: z.string().optional(),
      confirm: z
        .boolean()
        .optional()
        .describe('Required (true) when action is canary, promote, pause, or rollback'),
    }),
    handler: async (args, { client }) => {
      const base = `/ai_manager/inboxes/${args.inbox_id}/meta_business_agent`;
      try {
        const checkData = await client.request<Record<string, unknown>>(
          `${base}/release_confirmation`,
          {
            method: 'POST',
            prefix: 'saas',
            body: { consumer_phone_number: args.consumer_phone_number },
          },
        );
        if (args.action === 'confirm_check') return json(checkData);

        const gate = requireConfirmation(
          args.confirm,
          `Execute Meta Business Agent release action "${args.action}" on Inbox #${args.inbox_id} (deployment_state: ${String(checkData?.deployment_state ?? 'unknown')}).`,
        );
        if (gate) return gate;

        const res = await client.request(`${base}/release/${args.action}`, {
          method: 'POST',
          prefix: 'saas',
          body: {
            idempotency_key: makeIdempotencyKey(args.idempotency_key),
            observed_hash: args.observed_hash ?? checkData?.observed_settings_hash,
            consumer_phone_number: args.consumer_phone_number,
            confirmation: args.confirmation,
            promotion_override: args.promotion_override,
          },
        });
        return json(res);
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_thread_control_release',
    stability: 'beta',
    title: 'Release Conversation Thread Control Back to Meta Business Agent',
    description:
      'Release thread control of a handed-off conversation back to Meta Business Agent (`POST /conversations/:conversation_id/meta_business_agent_control`, or workspace `POST /ai_manager/inboxes/:inbox_id/meta_business_agent/thread_control`, or direct `POST /meta_agent/conversations/:id/release`). Note: takeover has no API endpoint — sending a human reply takes control automatically. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      conversation_id: z
        .number()
        .int()
        .positive()
        .describe('Conversation display_id (or internal ID when inbox_id is provided on workspace surface)'),
      inbox_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('When provided on workspace surface, routes through /ai_manager/inboxes/:inbox_id/meta_business_agent/thread_control'),
      idempotency_key: z.string().optional(),
      surface: SURFACE_SCHEMA,
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after the user approves handing the conversation back to Meta Business Agent'),
    }),
    handler: async ({ conversation_id, inbox_id, idempotency_key, surface, confirm }, { client }) => {
      try {
        let currentState: Record<string, unknown> | undefined;
        if (surface === 'workspace' && !inbox_id) {
          try {
            currentState = await client.request<Record<string, unknown>>(
              `/conversations/${conversation_id}/meta_business_agent_control`,
              { prefix: 'saas' },
            );
          } catch {
            // Proceed to confirmation even if control projection lookup fails.
          }
        }

        const gate = requireConfirmation(
          confirm,
          `Release thread control of Conversation #${conversation_id} back to Meta Business Agent so Meta AI resumes answering the customer${
            currentState?.status ? ` (current status: ${String(currentState.status)})` : ''
          }.`,
        );
        if (gate) return gate;

        if (surface === 'direct') {
          return json(
            await client.request(`/meta_agent/conversations/${conversation_id}/release`, {
              method: 'POST',
            }),
          );
        }

        const key = makeIdempotencyKey(idempotency_key);
        if (inbox_id !== undefined) {
          return json(
            await client.request(
              `/ai_manager/inboxes/${inbox_id}/meta_business_agent/thread_control`,
              {
                method: 'POST',
                prefix: 'saas',
                body: {
                  conversation_id,
                  thread_control_action: 'release',
                  idempotency_key: key,
                },
              },
            ),
          );
        }

        return json(
          await client.request(
            `/conversations/${conversation_id}/meta_business_agent_control`,
            {
              method: 'POST',
              prefix: 'saas',
              body: {
                thread_control_action: 'release',
                idempotency_key: key,
              },
            },
          ),
        );
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),

  defineTool({
    name: 'mba_handoff_update',
    stability: 'beta',
    title: 'Update Meta Business Agent Human Handoff Rotation',
    description:
      'Update the weighted rotation of human inbox agents (`enabled`, `members: [{ user_id, weight (1..10) }]`) who receive conversations handed off by Meta Business Agent (`PUT /meta_agent/inboxes/:inbox_id/handoff_assignment`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      enabled: z.boolean().describe('Whether automatic human assignment on handoff is enabled'),
      members: z
        .array(
          z.object({
            user_id: z.number().int().positive().describe('Agent user ID (must belong to the inbox)'),
            weight: z.number().int().min(1).max(10).describe('Rotation weight (1..10)'),
          }),
        )
        .describe('Weighted list of inbox members in the handoff rotation'),
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after the user approves updating the handoff rotation'),
    }),
    handler: async ({ inbox_id, enabled, members, confirm }, { client }) => {
      const current = await client.request<{
        enabled?: boolean;
        members?: Array<{ user_id?: number; name?: string; weight?: number }>;
      }>(`/meta_agent/inboxes/${inbox_id}/handoff_assignment`);

      const gate = requireConfirmation(
        confirm,
        `Update Meta Business Agent human handoff rotation on Inbox #${inbox_id} (currently enabled: ${Boolean(current?.enabled)}, members: ${current?.members?.length ?? 0} → new enabled: ${enabled}, members: ${JSON.stringify(members)}).`,
      );
      if (gate) return gate;

      const updated = await client.request(`/meta_agent/inboxes/${inbox_id}/handoff_assignment`, {
        method: 'PUT',
        body: { handoff_assignment: { enabled, members } },
      });
      return json(updated);
    },
  }),

  defineTool({
    name: 'mba_budget_update',
    stability: 'beta',
    title: 'Update Meta Business Agent WABA Budgets',
    description:
      'Replace the Meta Business Manager WABA agent budgets (`PUT /meta_agent/inboxes/:inbox_id/budget`). Warning: passing an empty `budgets: []` array clears all budgets at Meta. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      budgets: z
        .array(
          z.object({
            budget_id: z.string().optional(),
            unit_type: z.string().describe('Budget unit type'),
            time_window: z.string().describe('Budget time window'),
            max_budget: z.number().describe('Maximum budget limit'),
          }),
        )
        .describe('Full replacement array of budgets (empty array clears all budgets at Meta)'),
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after the user approves replacing the Meta WABA agent budgets'),
    }),
    handler: async ({ inbox_id, budgets, confirm }, { client }) => {
      const current = await client.request<{ payload?: unknown[] }>(
        `/meta_agent/inboxes/${inbox_id}/budget`,
      );
      const currentCount = Array.isArray(current?.payload) ? current.payload.length : 0;

      const gate = requireConfirmation(
        confirm,
        `Replace Meta WABA Business Manager agent budgets on Inbox #${inbox_id} (current budgets: ${currentCount} → new budgets: ${budgets.length === 0 ? '0 (CLEARS ALL BUDGETS)' : JSON.stringify(budgets)}).`,
      );
      if (gate) return gate;

      const updated = await client.request(`/meta_agent/inboxes/${inbox_id}/budget`, {
        method: 'PUT',
        body: { budgets },
      });
      return json(updated);
    },
  }),

  // ---------------------------------------------------------------------------
  // Experimental evals & events tool (AIA-08)
  // ---------------------------------------------------------------------------

  defineTool({
    name: 'mba_evals',
    stability: 'experimental',
    title: 'Run or Inspect Meta Business Agent Tests, Evals & Agent Events',
    description:
      'Inspect or run Meta Business Agent evaluation cases, scorecard runs, sandbox tests, and agent events (`action: "list_cases" | "get_summary" | "get_details" | "get_run" | "run_eval" | "run_test" | "send_event" | "get_event"`).',
    write: true,
    irreversible: true,
    readOnlyCapable: true,
    inputSchema: z.object({
      inbox_id: z.number().int().positive().describe('Inbox ID'),
      action: z.enum([
        'list_cases',
        'get_summary',
        'get_details',
        'get_run',
        'run_eval',
        'run_test',
        'send_event',
        'get_event',
      ]),
      summary_ids: z.array(z.string()).optional().describe('Required for get_summary'),
      eval_ids: z.array(z.string()).optional().describe('Required for get_details'),
      eval_case_ids: z.array(z.string()).optional().describe('Required for run_eval'),
      job_id: z.string().optional().describe('Required for get_run'),
      user_msg: z.string().optional().describe('Test user prompt for run_test'),
      execution_mode: z
        .enum(['direct', 'temporary_activation'])
        .optional()
        .describe('Execution mode for run_test (default "direct")'),
      confirm_temporary_activation: z.boolean().optional(),
      conversation_id: z.number().int().positive().optional().describe('Conversation ID for run_test or send_event'),
      event: z.record(z.string(), z.unknown()).optional().describe('Event payload for send_event'),
      event_id: z.string().optional().describe('Agent event ID for get_event'),
      idempotency_key: z.string().optional(),
      surface: SURFACE_SCHEMA,
      confirm: z
        .boolean()
        .optional()
        .describe('Required (true) for send_event or temporary_activation test'),
    }),
    handler: async (args, { client, config }) => {
      const isRead = ['list_cases', 'get_summary', 'get_details', 'get_run', 'get_event'].includes(
        args.action,
      );
      if (config.readOnly && !isRead) return readOnlyRefusal('mba_evals');

      const base = `/ai_manager/inboxes/${args.inbox_id}/meta_business_agent`;
      const idempotencyKey = makeIdempotencyKey(args.idempotency_key);

      try {
        if (args.surface === 'direct') {
          if (args.action === 'run_test') {
            if (!args.user_msg) return failure('user_msg is required when action is "run_test".');
            return untrustedJson(
              await client.request(`/meta_agent/inboxes/${args.inbox_id}/playground`, {
                method: 'POST',
                body: { message: args.user_msg },
              }),
            );
          }
          if (args.action === 'send_event') {
            if (!args.event) return failure('event is required when action is "send_event".');
            const gate = requireConfirmation(
              args.confirm,
              `Send Meta Business Agent event on Inbox #${args.inbox_id} (${JSON.stringify(args.event)}).`,
            );
            if (gate) return gate;
            return json(
              await client.request(`/meta_agent/inboxes/${args.inbox_id}/agent_events`, {
                method: 'POST',
                body: { event: args.event, conversation_id: args.conversation_id },
              }),
            );
          }
          if (args.action === 'get_event') {
            if (!args.event_id) return failure('event_id is required when action is "get_event".');
            return json(
              await client.request(
                `/meta_agent/inboxes/${args.inbox_id}/agent_events/${encodeURIComponent(args.event_id)}`,
              ),
            );
          }
          return failure(`Action "${args.action}" is only supported on surface="workspace".`);
        }

        switch (args.action) {
          case 'list_cases':
            return untrustedJson(await client.request(`${base}/evals/cases`, { prefix: 'saas' }));
          case 'get_summary':
            if (!args.summary_ids?.length) {
              return failure('summary_ids is required when action is "get_summary".');
            }
            return untrustedJson(
              await client.request(`${base}/evals/summary`, {
                prefix: 'saas',
                query: { summary_ids: args.summary_ids.join(',') },
              }),
            );
          case 'get_details':
            if (!args.eval_ids?.length) {
              return failure('eval_ids is required when action is "get_details".');
            }
            return untrustedJson(
              await client.request(`${base}/evals/details`, {
                prefix: 'saas',
                query: { eval_ids: args.eval_ids.join(',') },
              }),
            );
          case 'get_run':
            if (!args.job_id) return failure('job_id is required when action is "get_run".');
            return untrustedJson(
              await client.request(
                `${base}/evals/runs/${encodeURIComponent(args.job_id)}`,
                { prefix: 'saas' },
              ),
            );
          case 'run_eval':
            if (!args.eval_case_ids?.length) {
              return failure('eval_case_ids is required when action is "run_eval".');
            }
            return untrustedJson(
              await client.request(`${base}/evals/runs`, {
                method: 'POST',
                prefix: 'saas',
                body: {
                  idempotency_key: idempotencyKey,
                  eval_case_ids: args.eval_case_ids,
                },
              }),
            );
          case 'run_test':
            if (!args.user_msg) return failure('user_msg is required when action is "run_test".');
            if (args.execution_mode === 'temporary_activation') {
              const gate = requireConfirmation(
                args.confirm,
                `Run bounded temporary-activation Agent Test on Inbox #${args.inbox_id}.`,
              );
              if (gate) return gate;
            }
            return untrustedJson(
              await client.request(`${base}/tests`, {
                method: 'POST',
                prefix: 'saas',
                body: {
                  idempotency_key: idempotencyKey,
                  user_msg: args.user_msg,
                  execution_mode: args.execution_mode ?? 'direct',
                  confirm_temporary_activation: args.confirm_temporary_activation,
                  conversation_id: args.conversation_id,
                },
              }),
            );
          case 'send_event': {
            if (!args.conversation_id || !args.event) {
              return failure('conversation_id and event are required when action is "send_event".');
            }
            const gate = requireConfirmation(
              args.confirm,
              `Send Meta Business Agent event to Conversation #${args.conversation_id} on Inbox #${args.inbox_id}.`,
            );
            if (gate) return gate;
            return json(
              await client.request(`${base}/events`, {
                method: 'POST',
                prefix: 'saas',
                body: {
                  idempotency_key: idempotencyKey,
                  confirm_side_effects: true,
                  conversation_id: args.conversation_id,
                  event: args.event,
                },
              }),
            );
          }
          case 'get_event':
            if (!args.event_id) return failure('event_id is required when action is "get_event".');
            return json(
              await client.request(
                `${base}/events/${encodeURIComponent(args.event_id)}`,
                { prefix: 'saas' },
              ),
            );
        }
      } catch (error) {
        return formatMbaError(error);
      }
    },
  }),
];
