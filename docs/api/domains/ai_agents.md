# Domain Brief — `ai_agents` (v0.4.0, Lane 004)

- **Source**: `AirysChat@090c8ae510` (`origin/develop`)
- **Date**: 2026-10-27
- **Lane task**: `AIA-01` (completes `CAT-04` brief; feeds `AIA-02..AIA-11` in lane 004)
- **Owner decision (#30)**: Curate **AI Agents** (`/saas/api/v1/accounts/:account_id/ai_agents*`, `ai_manager/mode_transition_preview`, `conversations/:id/ai_usage`, `llm/{models,health}`) and **Meta Business Agent** (`meta_agent` toolset); keep legacy **Captain** (`/api/v1/accounts/:account_id/captain/*`, `/saas/api/v1/accounts/:account_id/captain_*`) and raw `agent_bots` CRUD catalog-only via `airyschat_api`.

## 1. Endpoint catalog & parameters (`saas` prefix)

| Method | Prefix | Path | Controller#action | Pundit / Feature Gate | Parameters (`*` required) | Effect | Untrusted | Curated tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `saas` | `/ai_agents` | `ai_agents#index` | `AiAgentPolicy#index?` (admin\|agent) + `:ai_agents` | — | read | no | `ai_agents_list` |
| `GET` | `saas` | `/ai_agents/monitor` | `ai_agents#monitor` | `AiAgentPolicy#monitor?` (admin\|agent) + `:ai_agents` | `limit` | read | **yes** | `ai_agents_monitor` |
| `GET` | `saas` | `/ai_agents/ownership_overview` | `ai_agents#ownership_overview` | `AiAgentPolicy#ownership_overview?` (admin\|agent) + `:ai_agents` | — | read | no | `ai_agents_ownership_overview` |
| `GET` | `saas` | `/ai_agents/:id` | `ai_agents#show` | `AiAgentPolicy#show?` (admin\|agent) + `:ai_agents` | `id*` | read | **yes** | `ai_agent_get` |
| `GET` | `saas` | `/ai_agents/:id/analytics` | `ai_agents#analytics` | `AiAgentPolicy#analytics?` (admin\|agent) + `:ai_agents` | `id*`, `days` (default `30`) | read | no | `ai_agent_analytics` |
| `GET` | `saas` | `/ai_agents/:id/versions` | `ai_agents#versions` | `AiAgentPolicy#versions?` (admin\|agent) + `:ai_agents` | `id*` | read | no | `ai_agent_versions_list` |
| `GET` | `saas` | `/ai_agents/:id/voice_catalog` | `ai_agents#voice_catalog` | `AiAgentPolicy#voice_catalog?` (admin\|agent) + `:ai_agents` | `id*`, `provider` | read | no | `ai_agent_get` |
| `POST` | `saas` | `/ai_agents` | `ai_agents#create` | `AiAgentPolicy#create?` (**admin**) + `:ai_agents` + `:ai_agents_limit` | `ai_agent*: { name*, description, agent_type, status, model, system_prompt, runtime, llm_config: {}, voice_config: {}, sdk_config: {}, config: {}, workflow: {}, draft_workflow: {} }` | write | no | `ai_agent_upsert` |
| `PATCH`/`PUT` | `saas` | `/ai_agents/:id` | `ai_agents#update` | `AiAgentPolicy#update?` (**admin**) + `:ai_agents` | `id*`, `ai_agent*: { ... }` | write | no | `ai_agent_upsert` |
| `POST` | `saas` | `/ai_agents/:id/clone` | `ai_agents#clone` | `AiAgentPolicy#clone?` (**admin**) + `:ai_agents` + `:ai_agents_limit` | `id*` | write | no | `ai_agent_upsert` |
| `DELETE` | `saas` | `/ai_agents/:id` | `ai_agents#destroy` | `AiAgentPolicy#destroy?` (**admin**) + `:ai_agents` | `id*` | **irreversible** | no | `ai_agent_delete` |
| `POST` | `saas` | `/ai_agents/:id/create_version` | `ai_agents#create_version` | `AiAgentPolicy#create_version?` (**admin**) + `:ai_agents` | `id*`, `label` | write | no | `ai_agent_publish` |
| `POST` | `saas` | `/ai_agents/:id/publish_workflow` | `ai_agents#publish_workflow` | `AiAgentPolicy#publish_workflow?` (**admin**) + `:ai_agents` | `id*` | **irreversible** (changes live customer answers) | no | `ai_agent_publish` |
| `POST` | `saas` | `/ai_agents/:id/discard_draft` | `ai_agents#discard_draft` | `AiAgentPolicy#discard_draft?` (**admin**) + `:ai_agents` | `id*` | write | no | `ai_agent_publish` |
| `POST` | `saas` | `/ai_agents/:id/versions/:version_number/restore` | `ai_agents#restore_version` | `AiAgentPolicy#restore_version?` (**admin**) + `:ai_agents` | `id*`, `version_number*` | **irreversible** (changes live customer answers) | no | `ai_agent_version_restore` |
| `POST` | `saas` | `/ai_agents/:id/preview` | `ai_agents#preview` | `AiAgentPolicy#preview?` (admin\|agent) + `:ai_agents` | `id*`, `message`, `stream`, `prompt_override`, `messages: [{ role, content }]`, `variables: {}` | write (sandbox preview) | **yes** | `ai_agent_preview` |
| `POST` | `saas` | `/ai_agents/:id/voice_preview` | `ai_agents#voice_preview` | `AiAgentPolicy#voice_preview?` (**admin**) + `:ai_agents` | `id*`, `voice_id`, `text`, `model_id`, `language`, `provider` | write (sandbox preview) | **yes** | `ai_agent_preview` |
| `POST` | `saas` | `/ai_manager/mode_transition_preview` | `ai_manager/mode_transition_previews#create` | `AiAgentPolicy#mode_transition_preview?` (**admin**) + `:ai_agents` | `mode_transition*: { action, inbox_id*, phone_number_id, display_phone_number, mode*, status, force, reason, owner: { kind, id }, readiness_state: {} }` | write (readiness preflight) | no | `ai_mode_transition` |
| `POST` | `saas` | `/ai_agents/mode_transition` | `ai_agents#mode_transition` | `AiAgentPolicy#mode_transition?` (**admin**) + `:ai_agents` + `AI_MANAGER_MODE_TRANSITIONS_ENABLED` | `mode_transition*: { action, inbox_id*, phone_number_id, display_phone_number, mode*, status, force, reason, target_ai_channel_mode_id, owner: { kind, id }, readiness_state: {} }` | **irreversible** (switches live inbox responder owner) | no | `ai_mode_transition` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/ai_agent_inboxes` | `ai_agent_inboxes#create` | `AiAgentInboxPolicy#create?` (**admin**) | `ai_agent_id*`, `ai_agent_inbox*: { inbox_id*, auto_reply (defaults false), status, channel_profile: {} }` | write | no | `ai_agent_inbox_upsert` |
| `PATCH`/`PUT` | `saas` | `/ai_agents/:ai_agent_id/ai_agent_inboxes/:id` | `ai_agent_inboxes#update` | `AiAgentInboxPolicy#update?` (**admin**) | `ai_agent_id*`, `id*`, `ai_agent_inbox*: { inbox_id, auto_reply, status, channel_profile: {} }` | write | no | `ai_agent_inbox_upsert` |
| `DELETE` | `saas` | `/ai_agents/:ai_agent_id/ai_agent_inboxes/:id` | `ai_agent_inboxes#destroy` | `AiAgentInboxPolicy#destroy?` (**admin**) | `ai_agent_id*`, `id*` | **irreversible** | no | `ai_agent_inbox_upsert` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases` | `knowledge_bases#index` | `KnowledgeBasePolicy#index?` (admin\|agent) + `:ai_agents` | `ai_agent_id*` | read | **yes** | `ai_knowledge_bases_list` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:id` | `knowledge_bases#show` | `KnowledgeBasePolicy#show?` (admin\|agent) + `:ai_agents` | `ai_agent_id*`, `id*` | read | **yes** | `ai_knowledge_bases_list` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases` | `knowledge_bases#create` | `KnowledgeBasePolicy#create?` (**admin**) + `:ai_agents` + `:knowledge_bases` limit | `ai_agent_id*`, `knowledge_base*: { name*, description }` | write | no | `ai_knowledge_base_upsert` |
| `PATCH`/`PUT` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:id` | `knowledge_bases#update` | `KnowledgeBasePolicy#update?` (**admin**) + `:ai_agents` | `ai_agent_id*`, `id*`, `knowledge_base*: { name, description }` | write | no | `ai_knowledge_base_upsert` |
| `DELETE` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:id` | `knowledge_bases#destroy` | `KnowledgeBasePolicy#destroy?` (**admin**) + `:ai_agents` | `ai_agent_id*`, `id*` | **irreversible** | no | `ai_knowledge_base_upsert` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/search` | `knowledge_bases#search` | `:ai_agents` (skips Pundit `authorize_knowledge_base`) | `ai_agent_id*`, `query*`, `limit` (`1..20`, default `5`) | read-only vector search (POST) | **yes** | `ai_knowledge_search` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:knowledge_base_id/knowledge_documents` | `knowledge_documents#index` | `KnowledgeDocumentPolicy#index?` (admin\|agent) | `ai_agent_id*`, `knowledge_base_id*` | read | **yes** | `ai_knowledge_documents_list` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:knowledge_base_id/knowledge_documents` | `knowledge_documents#create` | `KnowledgeDocumentPolicy#create?` (**admin**) | `ai_agent_id*`, `knowledge_base_id*`, `knowledge_document*: { title*, source_type*, source_url, content }` | write | **yes** | `ai_knowledge_document_create` |
| `DELETE` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:knowledge_base_id/knowledge_documents/:id` | `knowledge_documents#destroy` | `KnowledgeDocumentPolicy#destroy?` (**admin**) | `ai_agent_id*`, `knowledge_base_id*`, `id*` | **irreversible** | no | `ai_knowledge_document_delete` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/agent_tools` | `agent_tools#index` | `AgentToolPolicy#index?` (admin\|agent) + `:ai_agents` | `ai_agent_id*` | read | no | `ai_agent_tools_list` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/agent_tools` | `agent_tools#create` | `AgentToolPolicy#create?` (**admin**) + `:ai_agents` + `:agent_tools` limit | `ai_agent_id*`, `agent_tool*: { name*, description, tool_type*, http_method, url_template, body_template, auth_type, auth_token, active, headers_template: {}, parameters_schema: {}, config: {} }` | write | no | `ai_agent_tool_upsert` |
| `PATCH`/`PUT` | `saas` | `/ai_agents/:ai_agent_id/agent_tools/:id` | `agent_tools#update` | `AgentToolPolicy#update?` (**admin**) + `:ai_agents` | `ai_agent_id*`, `id*`, `agent_tool*: { ... }` | write | no | `ai_agent_tool_upsert` |
| `DELETE` | `saas` | `/ai_agents/:ai_agent_id/agent_tools/:id` | `agent_tools#destroy` | `AgentToolPolicy#destroy?` (**admin**) + `:ai_agents` | `ai_agent_id*`, `id*` | **irreversible** | no | `ai_agent_tool_upsert` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/agent_tools/import_openapi` | `agent_tools#import_openapi` | `AgentToolPolicy#import_openapi?` (**admin**) + `:ai_agents` | `ai_agent_id*`, `spec*` | write | no | `ai_agent_tool_upsert` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/workflow_runs` | `workflow_runs#index` | `AiAgentPolicy#show?` (admin\|agent) | `ai_agent_id*`, `page`, `per_page` (default `20`) | read | **yes** | `ai_workflow_runs_list` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/workflow_runs/:id` | `workflow_runs#show` | `AiAgentPolicy#show?` (admin\|agent) | `ai_agent_id*`, `id*` | read | **yes** | `ai_workflow_runs_list` |
| `GET` | `saas` | `/conversations/:id/ai_usage` | `conversations#ai_usage` | `Accounts::BaseController` | `id*` (conversation internal `id` or `display_id`) | read | no | `conversation_ai_usage` |
| `GET` | `saas` | `/llm/models` | `llm#models` | `LlmPolicy#models?` (admin\|agent) | — | read | no | `llm_models_list` |
| `GET` | `saas` | `/llm/health` | `llm#health` | `LlmPolicy#health?` (admin\|agent) | — | read | no | `llm_models_list` |

## 2. The One-Responder Ownership Rule (`AiManager::OwnershipOverview` & `AiManager::ModeTransition`)

AirysChat enforces a strict **single automated responder owner per WhatsApp inbox / phone number**:

1. **Modes (`AiManager::OwnershipOverview::MODES`)**:
   - `human_only`: no automated responder owns the inbox.
   - `airyschat_native`: an AirysChat `Saas::AiAgent` (`owner: { kind: "ai_agent", id }`) owns the inbox.
   - `meta_native`: Meta Business Agent (`owner: { kind: "meta_business_agent_config", id }`) owns the inbox.
   - `external_runtime`: an external runtime config (`owner: { kind: "external_runtime_config", id }`) or webhook `AgentBot` (`owner: { kind: "agent_bot", id }`) owns the inbox.
2. **Server-side guards**:
   - `AiManager::ModeTransition` locks the target `Inbox` and `Saas::AiChannelMode` scope in a transaction, verifies readiness blockers (`whatsapp_inbox_required`, `phone_number_id_required`, `phone_number_id_mismatch`, `ai_agent_inactive`, `meta_business_agent_readiness_incomplete`, `meta_business_agent_owner_fenced`, `native_ai_auto_reply_enabled`), and automatically archives (`status: :archived`) any previously active `Saas::AiChannelMode` on that `(account_id, inbox_id, phone_number_id)` when activating a new mode.
   - `Saas::Api::V1::AiAgentInboxesController#auto_reply_activation_blocked?` rejects `POST/PATCH /ai_agents/:ai_agent_id/ai_agent_inboxes` with `422 { error: "auto_reply_requires_ai_manager_owner" }` whenever `auto_reply: true` and `status: "active"` are requested for an inbox whose canonical `Saas::AiChannelMode` is not already `mode: "airyschat_native"` owned by `@ai_agent`.
3. **MCP tool preflight (`ai_mode_transition` and `ai_agent_inbox_upsert`)**:
   - `ai_mode_transition` supports `action: "preview" | "activate" | "rollback"`. When `action` is `"activate"` or `"rollback"`, it **always** fetches `GET /ai_agents/ownership_overview` and runs `POST /ai_manager/mode_transition_preview` first. If preflight reports any readiness blocker, or if another responder currently owns the inbox and `confirm !== true`, the tool refuses and returns a server-derived summary of the current owner, target owner, deactivated channel modes, and readiness blockers.
   - `ai_agent_inbox_upsert` inspects `GET /ai_agents/ownership_overview` before enabling `auto_reply: true` and refuses with a clear actionable error if the inbox is currently owned by another responder (`meta_native`, `external_runtime`, or a different `ai_agent`), instructing the operator to run `ai_mode_transition` first.

## 3. Quirks & non-obvious behaviour

1. **Plan & limit gates return `403` with `{ error: "..." }`**:
   - Every controller in this domain runs `require_plan_feature!(:ai_agents)` (and `require_plan_limit!(:ai_agents_limit | :knowledge_bases | :agent_tools)` on `create`). `ApiError.isPlanGate` in `packages/server/src/client.ts` maps `/saas/api/` 403s with an `error` message to an entitlement notice instead of an auth failure.
2. **Upstream `before_action :set_ai_agent` omission on `versions`, `create_version`, `restore_version`**:
   - In `Saas::Api::V1::AiAgentsController` (`saas/app/controllers/saas/api/v1/ai_agents_controller.rb:9-10`), `before_action :set_ai_agent` lists `only: [:show, :update, :destroy, :preview, :voice_catalog, :voice_preview, :publish_workflow, :discard_draft, :analytics, :clone]` and omits `:versions`, `:create_version`, and `:restore_version`. Until fixed upstream, `@ai_agent` is `nil` in those three actions and `GET /ai_agents/:id/versions` returns HTTP 500. `ai_agent_versions_list`, `ai_agent_publish`, and `ai_agent_version_restore` document this upstream quirk and remain `beta` until upstream adds `:versions, :create_version, :restore_version` to `set_ai_agent`.
3. **`GET /conversations/:id/ai_usage` looks up `Conversation.find(params[:id])` by primary key**:
   - Unlike core `/api/v1/accounts/:account_id/conversations/:id` (which looks up by `display_id`), `Saas::Api::V1::ConversationsController#set_conversation` calls `Current.account.conversations.find(params[:id])` (primary key `id`). `conversation_ai_usage` accepts `conversation_id` (`display_id` or internal `id`) and resolves `GET /api/v1/accounts/:account_id/conversations/:display_id` first if needed so operators can pass the standard `display_id`.
4. **Untrusted content in agent prompts, RAG & workflow runs**:
   - `GET /ai_agents/:id` (`system_prompt`, `prompt_sections`), `GET /ai_agents/monitor`, `POST /ai_agents/:id/preview`, knowledge base documents, search snippets (`POST /knowledge_bases/search`), and `workflow_runs` traces can carry customer-submitted or externally ingested text and must return via `untrustedJson`.
