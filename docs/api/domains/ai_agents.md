# Domain Brief — `ai_agents` (v0.4.0, Lane 004)

- **Source**: `AirysChat@090c8ae510` (`origin/develop`)
- **Date**: 2026-10-27
- **Lane task**: `CAT-04` (feeds `AIA-01..AIA-09` in lane 004)
- **Owner decision (#30)**: Curate **AI Agents** (`/saas/api/v1/accounts/:account_id/ai_agents*`, `ai_manager/mode_transition_preview`, `conversations/:id/ai_usage`) and **Meta Business Agent** (`meta_agent` toolset); keep legacy **Captain** (`/api/v1/accounts/:account_id/captain/*`) catalog-only via `airyschat_api`.

## Endpoint catalog & parameters (AI Agents — `saas` prefix)

| Method | Prefix | Path | Controller#action | Permission / Gate | Parameters (`*` required) | Effect | Untrusted | Proposed tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `saas` | `/ai_agents` | `ai_agents#index` | `require_plan_feature!(:ai_agents)` | — | read | no | `ai_agents_list` |
| `GET` | `saas` | `/ai_agents/channel_modes` | `ai_agents#channel_modes` | `require_plan_feature!(:ai_agents)` | `inbox_id` | read | no | `ai_agents_list` |
| `GET` | `saas` | `/ai_agents/:id` | `ai_agents#show` | `require_plan_feature!(:ai_agents)` | `id*` | read | no | `ai_agent_get` |
| `POST` | `saas` | `/ai_agents` | `ai_agents#create` | `:ai_agents` + `:ai_agents_limit` | `ai_agent*: { name*, description, agent_type, status, model, system_prompt, runtime, llm_config: {}, voice_config: {}, sdk_config: {}, config: {}, workflow: {}, draft_workflow: {} }` | write | no | `ai_agent_upsert` |
| `PATCH`/`PUT` | `saas` | `/ai_agents/:id` | `ai_agents#update` | `require_plan_feature!(:ai_agents)` | `id*`, `ai_agent*: { ... }` | write | no | `ai_agent_upsert` |
| `POST` | `saas` | `/ai_agents/:id/clone` | `ai_agents#clone` | `:ai_agents` + `:ai_agents_limit` | `id*` | write | no | `ai_agent_upsert` |
| `DELETE` | `saas` | `/ai_agents/:id` | `ai_agents#destroy` | `require_plan_feature!(:ai_agents)` | `id*` | **irreversible** | no | raw (`airyschat_api`) |
| `GET` | `saas` | `/ai_agents/:id/versions` | `ai_agents#versions` | `require_plan_feature!(:ai_agents)` | `id*` | read | no | `ai_agent_versions` |
| `POST` | `saas` | `/ai_agents/:id/create_version` | `ai_agents#create_version` | `require_plan_feature!(:ai_agents)` | `id*` | write | no | `ai_agent_publish` |
| `POST` | `saas` | `/ai_agents/:id/publish_workflow` | `ai_agents#publish_workflow` | `require_plan_feature!(:ai_agents)` | `id*` | **irreversible** (changes live customer answers) | no | `ai_agent_publish` |
| `POST` | `saas` | `/ai_agents/:id/discard_draft` | `ai_agents#discard_draft` | `require_plan_feature!(:ai_agents)` | `id*` | write | no | `ai_agent_publish` |
| `POST` | `saas` | `/ai_agents/:id/versions/:version_number/restore` | `ai_agents#restore_version` | `require_plan_feature!(:ai_agents)` | `id*`, `version_number*` | **irreversible** (changes live customer answers) | no | `ai_agent_publish` |
| `POST` | `saas` | `/ai_agents/:id/preview` | `ai_agents#preview` | `require_plan_feature!(:ai_agents)` | `id*`, `message`, `stream`, `prompt_override`, `messages: [{ role, content }]`, `variables: {}` | write (sandbox preview) | **yes** | `ai_agent_preview` |
| `POST` | `saas` | `/ai_agents/:id/voice_preview` | `ai_agents#voice_preview` | `:ai_agents` + `:voice_agents` | `id*`, `message`, `voice_config: {}` | write (sandbox preview) | **yes** | `ai_agent_preview` |
| `POST` | `saas` | `/ai_manager/mode_transition_preview` | `ai_manager/mode_transition_previews#create` | `require_plan_feature!(:ai_agents)` | `mode_transition*: { action*, inbox_id*, phone_number_id, display_phone_number, mode*, status, force, reason, owner: { kind, id }, readiness_state: {} }` | write (readiness preview) | no | `ai_mode_transition` |
| `POST` | `saas` | `/ai_agents/mode_transition` | `ai_agents#mode_transition` | `require_plan_feature!(:ai_agents)` | `mode_transition*: { action*, inbox_id*, phone_number_id, display_phone_number, mode*, status, force, reason, target_ai_channel_mode_id, owner: { kind, id }, readiness_state: {} }` | **irreversible** (switches live inbox AI mode) | no | `ai_mode_transition` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/ai_agent_inboxes` | `ai_agent_inboxes#index` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*` | read | no | `ai_agent_inboxes` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/ai_agent_inboxes` | `ai_agent_inboxes#create` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `ai_agent_inbox*: { inbox_id*, auto_reply (defaults false), status, channel_profile: {} }` | write | no | `ai_agent_inboxes` |
| `PATCH`/`PUT` | `saas` | `/ai_agents/:ai_agent_id/ai_agent_inboxes/:id` | `ai_agent_inboxes#update` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `id*`, `ai_agent_inbox*: { inbox_id, auto_reply, status, channel_profile: {} }` | write | no | `ai_agent_inboxes` |
| `DELETE` | `saas` | `/ai_agents/:ai_agent_id/ai_agent_inboxes/:id` | `ai_agent_inboxes#destroy` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `id*` | **irreversible** | no | `ai_agent_inboxes` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases` | `knowledge_bases#index` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*` | read | **yes** | `ai_knowledge_bases` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:id` | `knowledge_bases#show` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `id*` | read | **yes** | `ai_knowledge_bases` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases` | `knowledge_bases#create` | `:ai_agents` + `:knowledge_bases` limit | `ai_agent_id*`, `knowledge_base*: { name*, description }` | write | no | `ai_knowledge_bases` |
| `PATCH`/`PUT` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:id` | `knowledge_bases#update` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `id*`, `knowledge_base*: { name, description }` | write | no | `ai_knowledge_bases` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/search` | `knowledge_bases#search` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `query*`, `knowledge_base_id`, `limit` | write (vector search) | **yes** | `ai_knowledge_search` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:knowledge_base_id/knowledge_documents` | `knowledge_documents#index` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `knowledge_base_id*` | read | **yes** | `ai_knowledge_documents` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:knowledge_base_id/knowledge_documents` | `knowledge_documents#create` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `knowledge_base_id*`, `knowledge_document*: { title*, source_type*, source_url, content }` | write | **yes** | `ai_knowledge_documents` |
| `DELETE` | `saas` | `/ai_agents/:ai_agent_id/knowledge_bases/:knowledge_base_id/knowledge_documents/:id` | `knowledge_documents#destroy` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `knowledge_base_id*`, `id*` | **irreversible** | no | `ai_knowledge_documents` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/agent_tools` | `agent_tools#index` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*` | read | no | `ai_agent_tools` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/agent_tools` | `agent_tools#create` | `:ai_agents` + `:agent_tools` limit | `ai_agent_id*`, `agent_tool*: { name*, description, tool_type*, http_method, url_template, body_template, auth_type, auth_token, active, headers_template: {}, parameters_schema: {}, config: {} }` | write | no | `ai_agent_tools` |
| `POST` | `saas` | `/ai_agents/:ai_agent_id/agent_tools/import_openapi` | `agent_tools#import_openapi` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `spec*` | write | no | `ai_agent_tools` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/workflow_runs` | `workflow_runs#index` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `conversation_id`, `status`, `page` | read | **yes** | `ai_workflow_runs` |
| `GET` | `saas` | `/ai_agents/:ai_agent_id/workflow_runs/:id` | `workflow_runs#show` | `require_plan_feature!(:ai_agents)` | `ai_agent_id*`, `id*` | read | **yes** | `ai_workflow_runs` |
| `GET` | `saas` | `/conversations/:id/ai_usage` | `conversations#ai_usage` | `account:show?` | `id*` | read | no | `conversation_ai_usage` |

## Quirks & non-obvious behaviour

1. **Plan & limit gates return `403` with `{ error: "..." }`**:
   - Every controller in this domain runs `require_plan_feature!(:ai_agents)` (and `require_plan_limit!(:ai_agents_limit | :knowledge_bases | :agent_tools)` on `create`). `ApiError.isPlanGate` in `packages/server/src/client.ts` already maps `/saas/api/` 403s with an `error` message to an entitlement notice instead of an auth failure.
2. **Draft vs. published workflows**:
   - Updating `draft_workflow` via `PATCH /ai_agents/:id` does **not** change live customer conversations until `POST /ai_agents/:id/publish_workflow` (or `versions/:version_number/restore`) is called. Publishing and restoring versions are therefore `irreversible: true`.
3. **Safe inbox attachment default**:
   - `POST /ai_agents/:ai_agent_id/ai_agent_inboxes` defaults `auto_reply` to `false` when omitted (`guarded_inbox_params`), so attaching an agent to an inbox does not start answering customers until `auto_reply: true` or `POST /ai_agents/mode_transition` is called.
4. **Mode transitions have a preview endpoint**:
   - Always call `POST /ai_manager/mode_transition_preview` before `POST /ai_agents/mode_transition` to inspect readiness blockers and active-thread impact.
5. **Untrusted content in RAG & workflow runs**:
   - Knowledge document contents, search snippets (`POST /knowledge_bases/search`), and `workflow_runs` traces contain external or customer-submitted text and must return via `untrustedJson`.

## Open questions

None — owner decision #30 resolved Captain vs. AI Agents scope.
