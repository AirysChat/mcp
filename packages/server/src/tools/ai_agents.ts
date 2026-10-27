/**
 * AirysChat AI Agents toolset (`ai_agents` — opt-in via `AIRYSCHAT_TOOLSETS`).
 *
 * Covers the `/saas/api/v1/accounts/:account_id/ai_agents*` surface, inbox responder
 * ownership (`GET /ai_agents/ownership_overview`, `POST /ai_manager/mode_transition_preview`,
 * `POST /ai_agents/mode_transition`), RAG knowledge bases and documents, agent tools,
 * workflow runs, per-conversation AI token/cost usage, and available LLM models.
 *
 * Non-negotiables enforced here:
 * - Customer and external RAG/prompt content (`ai_agent_get`, `ai_agents_monitor`,
 *   `ai_workflow_runs_list`, `ai_knowledge_*`, `ai_agent_preview`, `ai_agent_upsert`)
 *   is returned through `untrustedJson`.
 * - The **one responder owner per inbox** rule is enforced both by AirysChat and by
 *   preflight in `ai_mode_transition` and `ai_agent_inbox_upsert`.
 * - Publishing or restoring a live workflow, switching inbox responder mode, or
 *   deleting agents/knowledge bases/documents/tools is `irreversible: true` and
 *   goes through `requireConfirmation` with a server-derived summary.
 */

import { z } from 'zod';
import { ApiError } from '../client.js';
import { failure, json, readOnlyRefusal, requireConfirmation, untrustedJson } from '../result.js';
import { defineTool, type AnyToolDefinition } from '../toolsets.js';

interface OwnershipInboxEntry {
  inbox_id?: number;
  inbox_name?: string;
  channel_type?: string;
  phone_number?: string | null;
  phone_number_id?: string | null;
  mode?: string;
  automated_owner?: string | null;
  ownership_source?: string;
  canonical_owner?: boolean;
  ai_channel_mode?: {
    id?: number;
    mode?: string;
    status?: string;
    owner_kind?: string | null;
    owner_id?: number | null;
  } | null;
  ai_agent?: {
    id?: number;
    name?: string;
    status?: string;
    link_id?: number;
  } | null;
  active_ai_agent_links?: Array<{
    id?: number;
    ai_agent_id?: number;
    ai_agent_name?: string;
    auto_reply?: boolean;
    status?: string;
  }>;
  risks?: Array<{
    code?: string;
    severity?: string;
    message?: string;
  }>;
}

interface OwnershipOverviewResponse {
  modes?: string[];
  ownership?: OwnershipInboxEntry[];
  mode_transitions_enabled?: boolean;
  safety?: Record<string, unknown>;
}

function formatApiValidationErrors(error: ApiError): string | undefined {
  if (error.payload && typeof error.payload === 'object') {
    const rec = error.payload as Record<string, unknown>;
    if (Array.isArray(rec.errors) && rec.errors.length > 0) {
      return rec.errors.map((entry) => String(entry)).join('; ');
    }
    if (typeof rec.message === 'string' && typeof rec.error === 'string' && rec.message !== rec.error) {
      return `${rec.error}: ${rec.message}`;
    }
  }
  return error.detail;
}

export const aiAgentsTools: AnyToolDefinition[] = [
  // ---------------------------------------------------------------------------
  // Read tools (AIA-02, AIA-03)
  // ---------------------------------------------------------------------------

  defineTool({
    name: 'ai_agents_list',
    stability: 'beta',
    title: 'List AI Agents',
    description:
      'List all AirysChat AI Agents in the account with their configuration summary, counts (inboxes, knowledge bases, tools, versions), and today/total run stats.',
    inputSchema: z.object({}),
    handler: async (_args, { client }) => {
      const data = await client.request('/ai_agents', { prefix: 'saas' });
      return json(data);
    },
  }),

  defineTool({
    name: 'ai_agent_get',
    stability: 'beta',
    title: 'Get AI Agent',
    description:
      'Fetch full details of an AirysChat AI Agent (system prompt, prompt sections, guardrails, workflow, draft workflow, attached inboxes, knowledge bases, and tools). Optionally include the voice provider catalog (`include_voice_catalog: true`).',
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      include_voice_catalog: z
        .boolean()
        .optional()
        .describe('When true, also fetches GET /ai_agents/:id/voice_catalog'),
      voice_provider: z
        .string()
        .optional()
        .describe('Optional voice provider override when include_voice_catalog is true'),
    }),
    handler: async ({ agent_id, include_voice_catalog, voice_provider }, { client }) => {
      const agent = await client.request<Record<string, unknown>>(`/ai_agents/${agent_id}`, {
        prefix: 'saas',
      });
      if (!include_voice_catalog) return untrustedJson(agent);

      const voiceCatalog = await client.request(`/ai_agents/${agent_id}/voice_catalog`, {
        prefix: 'saas',
        query: { provider: voice_provider },
      });
      return untrustedJson({ ...agent, voice_catalog: voiceCatalog });
    },
  }),

  defineTool({
    name: 'ai_agent_analytics',
    stability: 'beta',
    title: 'Get AI Agent Analytics',
    description:
      'Fetch aggregated execution statistics for an AirysChat AI Agent (`total_runs`, `completed`, `failed`, `handed_off`, `success_rate`, `avg_duration_ms`, `total_tokens`, `daily_runs`, `conversations_count`).',
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe('Lookback window in days for daily_runs (default 30)'),
    }),
    handler: async ({ agent_id, days }, { client }) => {
      const data = await client.request(`/ai_agents/${agent_id}/analytics`, {
        prefix: 'saas',
        query: { days },
      });
      return json(data);
    },
  }),

  defineTool({
    name: 'ai_agent_versions_list',
    stability: 'beta',
    title: 'List AI Agent Versions',
    description:
      'List up to 50 saved workflow/configuration version snapshots (`version_number`, `label`, `event`, `model`, `created_by`, `created_at`) for an AI Agent. Note: upstream `Saas::Api::V1::AiAgentsController` omits `:versions` from `before_action :set_ai_agent` on older builds and may return 500 until that upstream fix is deployed.',
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
    }),
    handler: async ({ agent_id }, { client }) => {
      const data = await client.request(`/ai_agents/${agent_id}/versions`, { prefix: 'saas' });
      return json(data);
    },
  }),

  defineTool({
    name: 'ai_agents_monitor',
    stability: 'beta',
    title: 'Monitor AI Agent Conversations',
    description:
      'Fetch the live monitoring view of conversations currently or recently handled by AirysChat AI Agents across the account.',
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Maximum number of conversations to return'),
    }),
    handler: async ({ limit }, { client }) => {
      const data = await client.request('/ai_agents/monitor', {
        prefix: 'saas',
        query: { limit },
      });
      return untrustedJson(data);
    },
  }),

  defineTool({
    name: 'ai_agents_ownership_overview',
    stability: 'beta',
    title: 'Get Inbox AI Responder Ownership Overview',
    description:
      'Fetch the AI Manager v2 responder ownership matrix across all inboxes in the account (`human_only`, `meta_native`, `airyschat_native`, `external_runtime`), including canonical channel mode, active links, readiness status, preflight matrix, and duplicate-responder risks.',
    inputSchema: z.object({
      inbox_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional inbox ID to filter the ownership list'),
    }),
    handler: async ({ inbox_id }, { client }) => {
      const data = await client.request<OwnershipOverviewResponse>('/ai_agents/ownership_overview', {
        prefix: 'saas',
      });
      if (inbox_id !== undefined && Array.isArray(data?.ownership)) {
        return json({
          ...data,
          ownership: data.ownership.filter((entry) => entry.inbox_id === inbox_id),
        });
      }
      return json(data);
    },
  }),

  defineTool({
    name: 'ai_workflow_runs_list',
    stability: 'beta',
    title: 'List or Get AI Agent Workflow Runs',
    description:
      'List workflow execution runs for an AI Agent (`GET /ai_agents/:ai_agent_id/workflow_runs`), or fetch a single run with detailed execution log when `run_id` is provided.',
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      run_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional workflow run ID for detailed execution trace'),
      page: z.number().int().positive().optional().describe('Page number (default 1)'),
      per_page: z.number().int().min(1).max(100).optional().describe('Runs per page (default 20)'),
    }),
    handler: async ({ agent_id, run_id, page, per_page }, { client }) => {
      if (run_id !== undefined) {
        const run = await client.request(`/ai_agents/${agent_id}/workflow_runs/${run_id}`, {
          prefix: 'saas',
        });
        return untrustedJson(run);
      }
      const data = await client.request(`/ai_agents/${agent_id}/workflow_runs`, {
        prefix: 'saas',
        query: { page, per_page },
      });
      return untrustedJson(data);
    },
  }),

  defineTool({
    name: 'ai_knowledge_bases_list',
    stability: 'beta',
    title: 'List or Get AI Agent Knowledge Bases',
    description:
      'List knowledge bases attached to an AI Agent (`GET /ai_agents/:ai_agent_id/knowledge_bases`), or fetch a single knowledge base with its document list when `knowledge_base_id` is provided.',
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      knowledge_base_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional knowledge base ID to include its documents summary'),
    }),
    handler: async ({ agent_id, knowledge_base_id }, { client }) => {
      const path =
        knowledge_base_id !== undefined
          ? `/ai_agents/${agent_id}/knowledge_bases/${knowledge_base_id}`
          : `/ai_agents/${agent_id}/knowledge_bases`;
      const data = await client.request(path, { prefix: 'saas' });
      return untrustedJson(data);
    },
  }),

  defineTool({
    name: 'ai_knowledge_search',
    stability: 'beta',
    title: 'Search AI Agent Knowledge Base (RAG)',
    description:
      'Run a read-only semantic vector search across an AI Agent’s knowledge bases (`POST /ai_agents/:ai_agent_id/knowledge_bases/search`). Returns matching chunks and similarity scores.',
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      query: z.string().min(1).describe('Search query text'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Number of chunks to return (1..20, default 5)'),
    }),
    handler: async ({ agent_id, query, limit }, { client }) => {
      const data = await client.request(`/ai_agents/${agent_id}/knowledge_bases/search`, {
        method: 'POST',
        prefix: 'saas',
        body: { query, limit },
      });
      return untrustedJson(data);
    },
  }),

  defineTool({
    name: 'ai_knowledge_documents_list',
    stability: 'beta',
    title: 'List Knowledge Base Documents',
    description:
      'List documents inside an AI Agent knowledge base (`GET /ai_agents/:ai_agent_id/knowledge_bases/:knowledge_base_id/knowledge_documents`), including ingestion status, chunk count, and truncated content preview.',
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      knowledge_base_id: z.number().int().positive().describe('Knowledge Base ID'),
    }),
    handler: async ({ agent_id, knowledge_base_id }, { client }) => {
      const data = await client.request(
        `/ai_agents/${agent_id}/knowledge_bases/${knowledge_base_id}/knowledge_documents`,
        { prefix: 'saas' },
      );
      return untrustedJson(data);
    },
  }),

  defineTool({
    name: 'ai_agent_tools_list',
    stability: 'beta',
    title: 'List AI Agent Tools',
    description:
      'List custom HTTP/webhook tools configured on an AI Agent (`GET /ai_agents/:ai_agent_id/agent_tools`).',
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
    }),
    handler: async ({ agent_id }, { client }) => {
      const data = await client.request(`/ai_agents/${agent_id}/agent_tools`, { prefix: 'saas' });
      return json(data);
    },
  }),

  defineTool({
    name: 'conversation_ai_usage',
    stability: 'beta',
    title: 'Get Conversation AI Token & Cost Usage',
    description:
      'Fetch aggregated AI token usage (`total_input`, `total_output`, `total_tokens`, `request_count`, `total_cost_microcents`) and up to 50 recent `AiUsageRecord` entries for a conversation.',
    inputSchema: z.object({
      conversation_id: z
        .number()
        .int()
        .positive()
        .describe('Conversation display_id (or internal primary key ID when is_internal_id is true)'),
      is_internal_id: z
        .boolean()
        .optional()
        .describe('Set true when conversation_id is already the internal database primary key'),
    }),
    handler: async ({ conversation_id, is_internal_id }, { client }) => {
      let targetId = conversation_id;
      if (!is_internal_id) {
        try {
          const conv = await client.request<{ id?: number }>(`/conversations/${conversation_id}`);
          if (typeof conv?.id === 'number') targetId = conv.id;
        } catch {
          // Fall back to passing conversation_id directly if display_id lookup fails.
        }
      }
      const data = await client.request(`/conversations/${targetId}/ai_usage`, { prefix: 'saas' });
      return json(data);
    },
  }),

  defineTool({
    name: 'llm_models_list',
    stability: 'beta',
    title: 'List Available LLM Models & Health',
    description:
      'List LLM models configured in AirysChat (`GET /llm/models` — id, provider, display_name, credit_multiplier) and optionally check LLM/pgvector/Redis subsystem health (`include_health: true`).',
    inputSchema: z.object({
      include_health: z
        .boolean()
        .optional()
        .describe('When true, also calls GET /llm/health and includes the subsystem health check'),
    }),
    handler: async ({ include_health }, { client }) => {
      const models = await client.request<Record<string, unknown>>('/llm/models', { prefix: 'saas' });
      if (!include_health) return json(models);

      try {
        const health = await client.request('/llm/health', { prefix: 'saas' });
        return json({ ...models, health });
      } catch (error) {
        if (error instanceof ApiError && error.status === 503) {
          return json({ ...models, health: error.payload });
        }
        throw error;
      }
    },
  }),

  // ---------------------------------------------------------------------------
  // Write tools (AIA-04, AIA-05)
  // ---------------------------------------------------------------------------

  defineTool({
    name: 'ai_agent_upsert',
    stability: 'beta',
    title: 'Create, Update, or Clone AI Agent',
    description:
      'Create a new AirysChat AI Agent (`action: "create"`), update an existing agent’s configuration or draft workflow (`action: "update"`), or clone an existing agent (`action: "clone"`). Note: updating `draft_workflow` does not affect live customer conversations until `ai_agent_publish` (`publish_workflow`) is called.',
    write: true,
    inputSchema: z.object({
      action: z.enum(['create', 'update', 'clone']).default('create'),
      agent_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Required when action is "update" or "clone"'),
      name: z.string().min(1).optional().describe('Agent name (required for create)'),
      description: z.string().optional(),
      agent_type: z.string().optional(),
      status: z.enum(['active', 'inactive', 'draft']).optional(),
      model: z.string().optional().describe('LLM model identifier (see llm_models_list)'),
      system_prompt: z.string().optional(),
      runtime: z.enum(['openai_agents_sdk', 'legacy']).optional(),
      llm_config: z.record(z.string(), z.unknown()).optional(),
      voice_config: z.record(z.string(), z.unknown()).optional(),
      sdk_config: z.record(z.string(), z.unknown()).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      workflow: z.record(z.string(), z.unknown()).optional(),
      draft_workflow: z.record(z.string(), z.unknown()).optional(),
    }),
    handler: async (args, { client }) => {
      if (args.action === 'clone') {
        if (!args.agent_id) return failure('agent_id is required when action is "clone".');
        const cloned = await client.request(`/ai_agents/${args.agent_id}/clone`, {
          method: 'POST',
          prefix: 'saas',
        });
        return untrustedJson(cloned);
      }

      const ai_agent: Record<string, unknown> = {};
      for (const key of [
        'name',
        'description',
        'agent_type',
        'status',
        'model',
        'system_prompt',
        'runtime',
        'llm_config',
        'voice_config',
        'sdk_config',
        'config',
        'workflow',
        'draft_workflow',
      ] as const) {
        if (args[key] !== undefined) ai_agent[key] = args[key];
      }

      if (args.action === 'create') {
        if (!args.name) return failure('name is required when action is "create".');
        try {
          const created = await client.request('/ai_agents', {
            method: 'POST',
            prefix: 'saas',
            body: { ai_agent },
          });
          return untrustedJson(created);
        } catch (error) {
          if (error instanceof ApiError && error.status === 422) {
            return failure(`Rejected — ${formatApiValidationErrors(error) ?? 'validation failed'}.`);
          }
          throw error;
        }
      }

      if (!args.agent_id) return failure('agent_id is required when action is "update".');
      try {
        const updated = await client.request(`/ai_agents/${args.agent_id}`, {
          method: 'PATCH',
          prefix: 'saas',
          body: { ai_agent },
        });
        return untrustedJson(updated);
      } catch (error) {
        if (error instanceof ApiError && error.status === 422) {
          return failure(`Rejected — ${formatApiValidationErrors(error) ?? 'validation failed'}.`);
        }
        throw error;
      }
    },
  }),

  defineTool({
    name: 'ai_agent_delete',
    stability: 'beta',
    title: 'Delete AI Agent',
    description:
      'Permanently delete an AirysChat AI Agent and its attached knowledge bases, tools, and inbox links (`DELETE /ai_agents/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID to delete'),
      confirm: z.boolean().optional().describe('Set to true only after the user approves deleting the agent'),
    }),
    handler: async ({ agent_id, confirm }, { client }) => {
      const agent = await client.request<{
        id?: number;
        name?: string;
        status?: string;
        inboxes_count?: number;
        knowledge_bases_count?: number;
      }>(`/ai_agents/${agent_id}`, { prefix: 'saas' });

      const gate = requireConfirmation(
        confirm,
        `Permanently delete AI Agent #${agent_id} ("${agent?.name ?? 'unknown'}", status: ${agent?.status ?? 'unknown'}, attached inboxes: ${agent?.inboxes_count ?? 0}, knowledge bases: ${agent?.knowledge_bases_count ?? 0}).`,
      );
      if (gate) return gate;

      await client.request(`/ai_agents/${agent_id}`, { method: 'DELETE', prefix: 'saas' });
      return json({ deleted: true, agent_id, name: agent?.name ?? null });
    },
  }),

  defineTool({
    name: 'ai_agent_preview',
    stability: 'beta',
    title: 'Preview AI Agent Chat or Voice Reply',
    description:
      'Test an AI Agent in sandbox mode without creating a customer conversation (`mode: "chat"` calls `POST /ai_agents/:id/preview`; `mode: "voice"` calls `POST /ai_agents/:id/voice_preview`).',
    write: true,
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      mode: z.enum(['chat', 'voice']).default('chat'),
      message: z.string().optional().describe('Test user message (for mode="chat")'),
      prompt_override: z.string().optional().describe('Optional temporary system prompt override'),
      messages: z
        .array(z.object({ role: z.string(), content: z.string() }))
        .optional()
        .describe('Optional prior conversation history'),
      variables: z
        .record(z.string(), z.string())
        .optional()
        .describe('Optional context variables (contact_name, contact_email, contact_phone)'),
      voice_id: z.string().optional().describe('Voice ID for mode="voice"'),
      text: z.string().optional().describe('Sample text to synthesize for mode="voice"'),
      model_id: z.string().optional().describe('Voice model ID for mode="voice"'),
      language: z.string().optional().describe('Language code for mode="voice"'),
      provider: z.string().optional().describe('Voice provider override for mode="voice"'),
    }),
    handler: async (args, { client }) => {
      if (args.mode === 'voice') {
        const res = await client.request(`/ai_agents/${args.agent_id}/voice_preview`, {
          method: 'POST',
          prefix: 'saas',
          body: {
            voice_id: args.voice_id,
            text: args.text,
            model_id: args.model_id,
            language: args.language,
            provider: args.provider,
          },
        });
        return untrustedJson(res);
      }

      const res = await client.request(`/ai_agents/${args.agent_id}/preview`, {
        method: 'POST',
        prefix: 'saas',
        body: {
          message: args.message ?? '',
          prompt_override: args.prompt_override,
          messages: args.messages,
          variables: args.variables,
        },
      });
      return untrustedJson(res);
    },
  }),

  defineTool({
    name: 'ai_agent_publish',
    stability: 'beta',
    title: 'Snapshot, Publish, or Discard AI Agent Workflow',
    description:
      'Create a manual version snapshot (`action: "create_version"`), promote `draft_workflow` to the live published `workflow` (`action: "publish_workflow"`, irreversible + requires `confirm: true`), or discard `draft_workflow` (`action: "discard_draft"`, requires `confirm: true`).',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      action: z.enum(['create_version', 'publish_workflow', 'discard_draft']),
      label: z.string().optional().describe('Optional snapshot label when action is "create_version"'),
      confirm: z
        .boolean()
        .optional()
        .describe('Required (true) when action is "publish_workflow" or "discard_draft"'),
    }),
    handler: async ({ agent_id, action, label, confirm }, { client }) => {
      if (action === 'create_version') {
        const version = await client.request(`/ai_agents/${agent_id}/create_version`, {
          method: 'POST',
          prefix: 'saas',
          body: { label },
        });
        return json(version);
      }

      const agent = await client.request<{
        id?: number;
        name?: string;
        status?: string;
        has_draft?: boolean;
        inboxes_count?: number;
      }>(`/ai_agents/${agent_id}`, { prefix: 'saas' });

      if (action === 'publish_workflow') {
        const gate = requireConfirmation(
          confirm,
          `Publish draft workflow to live on AI Agent #${agent_id} ("${agent?.name ?? 'unknown'}", status: ${agent?.status ?? 'unknown'}, has_draft: ${Boolean(agent?.has_draft)}, attached inboxes: ${agent?.inboxes_count ?? 0}). This immediately changes how live customer conversations are answered.`,
        );
        if (gate) return gate;

        try {
          const published = await client.request(`/ai_agents/${agent_id}/publish_workflow`, {
            method: 'POST',
            prefix: 'saas',
          });
          return untrustedJson(published);
        } catch (error) {
          if (error instanceof ApiError && error.status === 422) {
            return failure(`Rejected — ${formatApiValidationErrors(error) ?? 'workflow validation failed'}.`);
          }
          throw error;
        }
      }

      const gate = requireConfirmation(
        confirm,
        `Discard unpublished draft workflow on AI Agent #${agent_id} ("${agent?.name ?? 'unknown'}", has_draft: ${Boolean(agent?.has_draft)}).`,
      );
      if (gate) return gate;

      const discarded = await client.request(`/ai_agents/${agent_id}/discard_draft`, {
        method: 'POST',
        prefix: 'saas',
      });
      return untrustedJson(discarded);
    },
  }),

  defineTool({
    name: 'ai_agent_version_restore',
    stability: 'beta',
    title: 'Restore AI Agent Version',
    description:
      'Rollback an AirysChat AI Agent to a previous saved `version_number` (`POST /ai_agents/:id/versions/:version_number/restore`). Creates an automatic pre-restore snapshot and immediately updates the live agent configuration. Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      version_number: z.number().int().positive().describe('Version number to restore'),
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after the user approves restoring this version on the agent'),
    }),
    handler: async ({ agent_id, version_number, confirm }, { client }) => {
      const agent = await client.request<{
        id?: number;
        name?: string;
        status?: string;
        inboxes_count?: number;
      }>(`/ai_agents/${agent_id}`, { prefix: 'saas' });

      const gate = requireConfirmation(
        confirm,
        `Restore AI Agent #${agent_id} ("${agent?.name ?? 'unknown'}", status: ${agent?.status ?? 'unknown'}, attached inboxes: ${agent?.inboxes_count ?? 0}) to version v${version_number}. This replaces the active prompt, model, and workflow configuration.`,
      );
      if (gate) return gate;

      const restored = await client.request(
        `/ai_agents/${agent_id}/versions/${version_number}/restore`,
        { method: 'POST', prefix: 'saas' },
      );
      return untrustedJson(restored);
    },
  }),

  defineTool({
    name: 'ai_mode_transition',
    stability: 'beta',
    title: 'Preview or Transition Inbox AI Responder Mode',
    description:
      'Preview (`action: "preview"`), activate (`action: "activate"`), or rollback (`action: "rollback"`) the canonical AI responder owner for a WhatsApp inbox (`human_only`, `meta_native`, `airyschat_native`, `external_runtime`). Enforces the **one responder owner per inbox** rule: `activate` and `rollback` always run server preflight first, refuse if readiness blockers are present, warn when another automated responder currently owns the inbox, and require `confirm: true`.',
    write: true,
    irreversible: true,
    readOnlyCapable: true,
    inputSchema: z.object({
      action: z
        .enum(['preview', 'activate', 'rollback'])
        .default('preview')
        .describe('"preview" runs a non-mutating preflight; "activate" and "rollback" mutate live inbox ownership and require confirm: true'),
      inbox_id: z.number().int().positive().describe('Target WhatsApp inbox ID'),
      mode: z
        .enum(['human_only', 'meta_native', 'airyschat_native', 'external_runtime'])
        .describe('Target responder mode for the inbox'),
      status: z.enum(['active', 'draft', 'paused', 'archived']).optional().describe('Target channel mode status (default "active")'),
      phone_number_id: z.string().optional().describe('Optional WhatsApp Cloud API phone_number_id (resolved from inbox when omitted)'),
      display_phone_number: z.string().optional(),
      owner_kind: z
        .enum(['ai_agent', 'meta_business_agent_config', 'external_runtime_config', 'agent_bot'])
        .optional()
        .describe('Required for automated modes (e.g. "ai_agent" for airyschat_native, "meta_business_agent_config" for meta_native)'),
      owner_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('ID of the owner record matching owner_kind'),
      target_ai_channel_mode_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Required when action is "rollback"'),
      reason: z.string().optional().describe('Audit reason for the transition'),
      force: z.boolean().optional().describe('Force transition past payload blockers when permitted by server policy'),
      readiness_state: z.record(z.string(), z.unknown()).optional(),
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after reviewing the preflight preview and getting user approval'),
    }),
    handler: async (args, { client, config }) => {
      if (config.readOnly && args.action !== 'preview') {
        return readOnlyRefusal('ai_mode_transition');
      }

      if (args.action !== 'rollback' && args.mode !== 'human_only' && (!args.owner_kind || !args.owner_id)) {
        return failure(
          `Refused: automated mode "${args.mode}" requires both owner_kind and owner_id so the single-responder owner is explicit.`,
        );
      }

      const overview = await client.request<OwnershipOverviewResponse>('/ai_agents/ownership_overview', {
        prefix: 'saas',
      });
      const inboxEntry = Array.isArray(overview?.ownership)
        ? overview.ownership.find((entry) => entry.inbox_id === args.inbox_id)
        : undefined;

      const modeTransitionBody: Record<string, unknown> = {
        action: args.action === 'preview' ? 'activate' : args.action,
        inbox_id: args.inbox_id,
        mode: args.mode,
        status: args.status ?? 'active',
        phone_number_id: args.phone_number_id ?? inboxEntry?.phone_number_id ?? undefined,
        display_phone_number: args.display_phone_number ?? inboxEntry?.phone_number ?? undefined,
        reason: args.reason,
        force: args.force,
        target_ai_channel_mode_id: args.target_ai_channel_mode_id,
        ...(args.owner_kind && args.owner_id
          ? { owner: { kind: args.owner_kind, id: args.owner_id } }
          : {}),
        ...(args.readiness_state ? { readiness_state: args.readiness_state } : {}),
      };

      let previewPayload: Record<string, unknown> | undefined;
      try {
        previewPayload = await client.request<Record<string, unknown>>(
          '/ai_manager/mode_transition_preview',
          {
            method: 'POST',
            prefix: 'saas',
            body: { mode_transition: modeTransitionBody },
          },
        );
      } catch (error) {
        if (error instanceof ApiError && error.payload && typeof error.payload === 'object') {
          previewPayload = error.payload as Record<string, unknown>;
        } else {
          throw error;
        }
      }

      if (args.action === 'preview') {
        return json({
          inbox_ownership: inboxEntry ?? null,
          preflight: previewPayload ?? null,
        });
      }

      // Enforce preflight readiness check before allowing activation or rollback.
      const preflightSuccess = previewPayload?.success !== false;
      const preflightCode = typeof previewPayload?.code === 'string' ? previewPayload.code : undefined;
      const preflightMessage =
        typeof previewPayload?.message === 'string'
          ? previewPayload.message
          : typeof previewPayload?.error === 'string'
            ? previewPayload.error
            : undefined;
      const readinessBlockers =
        (previewPayload?.errors as Record<string, unknown> | undefined)?.readiness_state ??
        previewPayload?.blockers;

      if (!preflightSuccess && preflightCode !== 'mode_transitions_disabled') {
        return failure(
          `Refused by mode transition preflight (${preflightCode ?? 'blocked'}): ${preflightMessage ?? 'readiness check failed'}${
            readinessBlockers ? ` — blockers: ${JSON.stringify(readinessBlockers)}` : ''
          }`,
        );
      }

      const currentMode = inboxEntry?.mode ?? 'unconfigured';
      const currentOwnerDesc = inboxEntry?.ai_channel_mode?.owner_kind
        ? `${inboxEntry.ai_channel_mode.owner_kind}#${inboxEntry.ai_channel_mode.owner_id ?? '?'}`
        : inboxEntry?.ai_agent?.id
          ? `ai_agent#${inboxEntry.ai_agent.id} ("${inboxEntry.ai_agent.name ?? ''}")`
          : 'none';
      const targetOwnerDesc =
        args.owner_kind && args.owner_id ? `${args.owner_kind}#${args.owner_id}` : 'human_only';
      const deactivated = Array.isArray(previewPayload?.deactivated_ai_channel_modes)
        ? previewPayload.deactivated_ai_channel_modes.length
        : 0;
      const overlapWarning =
        inboxEntry?.automated_owner && inboxEntry.automated_owner !== 'human_only'
          ? ` ONE-RESPONDER GUARD: Inbox #${args.inbox_id} currently has an active automated responder (${currentMode}, owner: ${currentOwnerDesc}); this transition will archive ${deactivated} active channel mode(s) so two responders never answer the same inbox.`
          : '';

      const gate = requireConfirmation(
        args.confirm,
        ` execute "${args.action}" mode transition on Inbox #${args.inbox_id} ("${inboxEntry?.inbox_name ?? 'unknown'}") from mode "${currentMode}" (owner: ${currentOwnerDesc}) to mode "${args.mode}" (owner: ${targetOwnerDesc}, status: ${args.status ?? 'active'}).${overlapWarning}`,
      );
      if (gate) return gate;

      const result = await client.request('/ai_agents/mode_transition', {
        method: 'POST',
        prefix: 'saas',
        body: { mode_transition: modeTransitionBody },
      });
      return json(result);
    },
  }),

  defineTool({
    name: 'ai_agent_inbox_upsert',
    stability: 'beta',
    title: 'Attach, Update, or Detach AI Agent Inbox Link',
    description:
      'Attach an AI Agent to an inbox (`action: "attach"`, `auto_reply` defaults to `false`), update an existing inbox link (`action: "update"`), or detach it (`action: "detach"`). Enforces the **one responder owner** rule: enabling `auto_reply: true` is refused unless `GET /ai_agents/ownership_overview` shows this AI Agent is the canonical `airyschat_native` owner of the inbox and no other AI Agent has active auto-reply on that inbox.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      action: z.enum(['attach', 'update', 'detach']).default('attach'),
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      agent_inbox_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('AI Agent Inbox link ID (required for "update" and "detach")'),
      inbox_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Inbox ID (required for "attach", optional for "update")'),
      auto_reply: z
        .boolean()
        .optional()
        .describe('When true, the AI Agent answers incoming customer messages automatically (requires canonical airyschat_native ownership and confirm: true)'),
      status: z.enum(['active', 'inactive', 'paused']).optional(),
      channel_profile: z.record(z.string(), z.unknown()).optional(),
      confirm: z
        .boolean()
        .optional()
        .describe('Required (true) when detaching an inbox link or enabling auto_reply: true'),
    }),
    handler: async (args, { client }) => {
      if (args.action === 'detach') {
        if (!args.agent_inbox_id) {
          return failure('agent_inbox_id is required when action is "detach".');
        }
        const gate = requireConfirmation(
          args.confirm,
          `Detach AI Agent #${args.agent_id} inbox link #${args.agent_inbox_id}.`,
        );
        if (gate) return gate;

        await client.request(
          `/ai_agents/${args.agent_id}/ai_agent_inboxes/${args.agent_inbox_id}`,
          { method: 'DELETE', prefix: 'saas' },
        );
        return json({ deleted: true, agent_id: args.agent_id, agent_inbox_id: args.agent_inbox_id });
      }

      const willActivateAutoReply =
        args.auto_reply === true && (args.status === undefined || args.status === 'active');

      if (willActivateAutoReply) {
        const overview = await client.request<OwnershipOverviewResponse>(
          '/ai_agents/ownership_overview',
          { prefix: 'saas' },
        );
        let targetInboxId = args.inbox_id;
        if (!targetInboxId && args.agent_inbox_id && Array.isArray(overview?.ownership)) {
          const found = overview.ownership.find((entry) =>
            entry.active_ai_agent_links?.some((link) => link.id === args.agent_inbox_id),
          );
          targetInboxId = found?.inbox_id;
        }
        const inboxEntry = Array.isArray(overview?.ownership)
          ? overview.ownership.find((entry) => entry.inbox_id === targetInboxId)
          : undefined;

        const conflictingAutoReply = inboxEntry?.active_ai_agent_links?.find(
          (link) => link.auto_reply === true && link.ai_agent_id !== args.agent_id,
        );
        if (conflictingAutoReply) {
          return failure(
            `Refused (one-responder ownership guard): Inbox #${targetInboxId ?? '?'} ("${inboxEntry?.inbox_name ?? 'unknown'}") already has active auto_reply enabled on AI Agent #${conflictingAutoReply.ai_agent_id} ("${conflictingAutoReply.ai_agent_name ?? ''}"). Never enable two automated responders on the same inbox.`,
          );
        }

        const canonicalMode = inboxEntry?.ai_channel_mode;
        const isCanonicalOwner =
          canonicalMode?.mode === 'airyschat_native' &&
          canonicalMode?.status === 'active' &&
          canonicalMode?.owner_id === args.agent_id;

        if (!isCanonicalOwner) {
          return failure(
            `Refused (one-responder ownership guard): Enabling auto_reply on Inbox #${targetInboxId ?? '?'} ("${inboxEntry?.inbox_name ?? 'unknown'}") requires AI Agent #${args.agent_id} to be the active canonical "airyschat_native" owner first (current inbox mode: "${inboxEntry?.mode ?? 'unconfigured'}", canonical owner: ${canonicalMode ? `${canonicalMode.mode}/${canonicalMode.owner_kind ?? 'none'}#${canonicalMode.owner_id ?? '?'}` : 'none'}). Use ai_mode_transition first.`,
          );
        }

        const gate = requireConfirmation(
          args.confirm,
          `Enable live customer auto_reply for AI Agent #${args.agent_id} on Inbox #${targetInboxId} ("${inboxEntry?.inbox_name ?? 'unknown'}").`,
        );
        if (gate) return gate;
      }

      const ai_agent_inbox: Record<string, unknown> = {};
      if (args.inbox_id !== undefined) ai_agent_inbox.inbox_id = args.inbox_id;
      if (args.auto_reply !== undefined) ai_agent_inbox.auto_reply = args.auto_reply;
      if (args.status !== undefined) ai_agent_inbox.status = args.status;
      if (args.channel_profile !== undefined) ai_agent_inbox.channel_profile = args.channel_profile;

      if (args.action === 'attach') {
        if (!args.inbox_id) return failure('inbox_id is required when action is "attach".');
        try {
          const created = await client.request(`/ai_agents/${args.agent_id}/ai_agent_inboxes`, {
            method: 'POST',
            prefix: 'saas',
            body: { ai_agent_inbox },
          });
          return json(created);
        } catch (error) {
          if (error instanceof ApiError && error.status === 422) {
            return failure(`Rejected — ${formatApiValidationErrors(error) ?? 'validation failed'}.`);
          }
          throw error;
        }
      }

      if (!args.agent_inbox_id) {
        return failure('agent_inbox_id is required when action is "update".');
      }
      try {
        const updated = await client.request(
          `/ai_agents/${args.agent_id}/ai_agent_inboxes/${args.agent_inbox_id}`,
          {
            method: 'PATCH',
            prefix: 'saas',
            body: { ai_agent_inbox },
          },
        );
        return json(updated);
      } catch (error) {
        if (error instanceof ApiError && error.status === 422) {
          return failure(`Rejected — ${formatApiValidationErrors(error) ?? 'validation failed'}.`);
        }
        throw error;
      }
    },
  }),

  defineTool({
    name: 'ai_knowledge_base_upsert',
    stability: 'beta',
    title: 'Create, Update, or Delete AI Knowledge Base',
    description:
      'Create (`action: "create"`), update (`action: "update"`), or delete (`action: "delete"`, irreversible + requires `confirm: true`) a knowledge base on an AI Agent.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      action: z.enum(['create', 'update', 'delete']).default('create'),
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      knowledge_base_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Required when action is "update" or "delete"'),
      name: z.string().min(1).optional().describe('Knowledge base name (required for create)'),
      description: z.string().optional(),
      confirm: z
        .boolean()
        .optional()
        .describe('Required (true) when action is "delete"'),
    }),
    handler: async ({ action, agent_id, knowledge_base_id, name, description, confirm }, { client }) => {
      if (action === 'delete') {
        if (!knowledge_base_id) return failure('knowledge_base_id is required when action is "delete".');
        const kb = await client.request<{
          id?: number;
          name?: string;
          documents_count?: number;
        }>(`/ai_agents/${agent_id}/knowledge_bases/${knowledge_base_id}`, { prefix: 'saas' });

        const gate = requireConfirmation(
          confirm,
          `Permanently delete Knowledge Base #${knowledge_base_id} ("${kb?.name ?? 'unknown'}", documents: ${kb?.documents_count ?? 0}) on AI Agent #${agent_id}.`,
        );
        if (gate) return gate;

        await client.request(`/ai_agents/${agent_id}/knowledge_bases/${knowledge_base_id}`, {
          method: 'DELETE',
          prefix: 'saas',
        });
        return json({ deleted: true, agent_id, knowledge_base_id, name: kb?.name ?? null });
      }

      if (action === 'create') {
        if (!name) return failure('name is required when action is "create".');
        const created = await client.request(`/ai_agents/${agent_id}/knowledge_bases`, {
          method: 'POST',
          prefix: 'saas',
          body: { knowledge_base: { name, description } },
        });
        return json(created);
      }

      if (!knowledge_base_id) return failure('knowledge_base_id is required when action is "update".');
      const updated = await client.request(
        `/ai_agents/${agent_id}/knowledge_bases/${knowledge_base_id}`,
        {
          method: 'PATCH',
          prefix: 'saas',
          body: { knowledge_base: { name, description } },
        },
      );
      return json(updated);
    },
  }),

  defineTool({
    name: 'ai_knowledge_document_create',
    stability: 'beta',
    title: 'Create Knowledge Base Document',
    description:
      'Add a text, FAQ, or URL document to an AI Agent knowledge base (`POST /ai_agents/:ai_agent_id/knowledge_bases/:knowledge_base_id/knowledge_documents`) and enqueue RAG chunking/embedding ingestion.',
    write: true,
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      knowledge_base_id: z.number().int().positive().describe('Knowledge Base ID'),
      title: z.string().min(1).describe('Document title'),
      source_type: z
        .enum(['text', 'url', 'faq'])
        .default('text')
        .describe('Document source type ("text", "url", or "faq")'),
      content: z.string().optional().describe('Document text content (for source_type="text" or "faq")'),
      source_url: z.string().url().optional().describe('Source URL (for source_type="url")'),
    }),
    handler: async ({ agent_id, knowledge_base_id, title, source_type, content, source_url }, { client }) => {
      try {
        const created = await client.request(
          `/ai_agents/${agent_id}/knowledge_bases/${knowledge_base_id}/knowledge_documents`,
          {
            method: 'POST',
            prefix: 'saas',
            body: {
              knowledge_document: {
                title,
                source_type,
                content,
                source_url,
              },
            },
          },
        );
        return untrustedJson(created);
      } catch (error) {
        if (error instanceof ApiError && error.status === 422) {
          return failure(`Rejected — ${formatApiValidationErrors(error) ?? 'validation failed'}.`);
        }
        throw error;
      }
    },
  }),

  defineTool({
    name: 'ai_knowledge_document_delete',
    stability: 'beta',
    title: 'Delete Knowledge Base Document',
    description:
      'Permanently delete a document and its vector chunks from an AI Agent knowledge base (`DELETE /ai_agents/:ai_agent_id/knowledge_bases/:knowledge_base_id/knowledge_documents/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      knowledge_base_id: z.number().int().positive().describe('Knowledge Base ID'),
      document_id: z.number().int().positive().describe('Knowledge Document ID to delete'),
      confirm: z
        .boolean()
        .optional()
        .describe('Set to true only after the user approves deleting the document'),
    }),
    handler: async ({ agent_id, knowledge_base_id, document_id, confirm }, { client }) => {
      const docs = await client.request<
        Array<{ id?: number; title?: string; source_type?: string; chunk_count?: number }>
      >(`/ai_agents/${agent_id}/knowledge_bases/${knowledge_base_id}/knowledge_documents`, {
        prefix: 'saas',
      });
      const target = Array.isArray(docs) ? docs.find((doc) => doc.id === document_id) : undefined;

      const gate = requireConfirmation(
        confirm,
        `Permanently delete Knowledge Document #${document_id} ("${target?.title ?? 'unknown'}", source_type: ${target?.source_type ?? 'unknown'}, chunks: ${target?.chunk_count ?? 0}) from Knowledge Base #${knowledge_base_id} on AI Agent #${agent_id}.`,
      );
      if (gate) return gate;

      await client.request(
        `/ai_agents/${agent_id}/knowledge_bases/${knowledge_base_id}/knowledge_documents/${document_id}`,
        { method: 'DELETE', prefix: 'saas' },
      );
      return json({
        deleted: true,
        agent_id,
        knowledge_base_id,
        document_id,
        title: target?.title ?? null,
      });
    },
  }),

  defineTool({
    name: 'ai_agent_tool_upsert',
    stability: 'beta',
    title: 'Create, Update, Delete, or Import AI Agent Tools',
    description:
      'Manage custom HTTP tools on an AI Agent (`action: "create" | "update" | "delete" | "import_openapi"`). Deleting a tool requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      action: z.enum(['create', 'update', 'delete', 'import_openapi']).default('create'),
      agent_id: z.number().int().positive().describe('AI Agent ID'),
      tool_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Required when action is "update" or "delete"'),
      name: z.string().optional(),
      description: z.string().optional(),
      tool_type: z.string().optional().describe('e.g. "http_request"'),
      http_method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
      url_template: z.string().optional(),
      body_template: z.string().optional(),
      auth_type: z.string().optional(),
      auth_token: z.string().optional(),
      active: z.boolean().optional(),
      headers_template: z.record(z.string(), z.string()).optional(),
      parameters_schema: z.record(z.string(), z.unknown()).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      openapi_spec: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .optional()
        .describe('OpenAPI JSON/YAML spec when action is "import_openapi"'),
      confirm: z.boolean().optional().describe('Required (true) when action is "delete"'),
    }),
    handler: async (args, { client }) => {
      if (args.action === 'import_openapi') {
        if (!args.openapi_spec) return failure('openapi_spec is required when action is "import_openapi".');
        const imported = await client.request(
          `/ai_agents/${args.agent_id}/agent_tools/import_openapi`,
          {
            method: 'POST',
            prefix: 'saas',
            body: { spec: args.openapi_spec },
          },
        );
        return json(imported);
      }

      if (args.action === 'delete') {
        if (!args.tool_id) return failure('tool_id is required when action is "delete".');
        const gate = requireConfirmation(
          args.confirm,
          `Permanently delete AI Agent Tool #${args.tool_id} on AI Agent #${args.agent_id}.`,
        );
        if (gate) return gate;

        await client.request(`/ai_agents/${args.agent_id}/agent_tools/${args.tool_id}`, {
          method: 'DELETE',
          prefix: 'saas',
        });
        return json({ deleted: true, agent_id: args.agent_id, tool_id: args.tool_id });
      }

      const agent_tool: Record<string, unknown> = {};
      for (const key of [
        'name',
        'description',
        'tool_type',
        'http_method',
        'url_template',
        'body_template',
        'auth_type',
        'auth_token',
        'active',
        'headers_template',
        'parameters_schema',
        'config',
      ] as const) {
        if (args[key] !== undefined) agent_tool[key] = args[key];
      }

      if (args.action === 'create') {
        if (!args.name || !args.tool_type) {
          return failure('name and tool_type are required when action is "create".');
        }
        const created = await client.request(`/ai_agents/${args.agent_id}/agent_tools`, {
          method: 'POST',
          prefix: 'saas',
          body: { agent_tool },
        });
        return json(created);
      }

      if (!args.tool_id) return failure('tool_id is required when action is "update".');
      const updated = await client.request(
        `/ai_agents/${args.agent_id}/agent_tools/${args.tool_id}`,
        {
          method: 'PATCH',
          prefix: 'saas',
          body: { agent_tool },
        },
      );
      return json(updated);
    },
  }),
];

