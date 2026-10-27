# Domain Brief — `meta_agent` (v0.4.0, Lane 004)

- **Source**: `AirysChat@090c8ae510` (`origin/develop`)
- **Date**: 2026-10-27
- **Lane task**: `CAT-04` (feeds `AIA-06..AIA-08` in lane 004)
- **Prefixes**:
  - `saas` (`/saas/api/v1/accounts/:account_id/ai_manager/...` and `/conversations/:conversation_id/meta_business_agent_control`) — the **AI Manager Meta Business Agent Workspace** surface (36 endpoints).
  - `core` (`/api/v1/accounts/:account_id/meta_agent/...`) — the direct **Meta Business Agent** inbox surface (59 endpoints).

## Endpoint catalog & parameters (AI Manager Workspace — `saas` prefix)

| Method | Prefix | Path | Controller#action | Permission / Gate | Parameters (`*` required) | Effect | Untrusted | Proposed tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent` | `ai_manager/meta_business_agent_workspaces#show` | `require_plan_feature!(:ai_agents)` + `:show?` | `inbox_id*` | read | no | `mba_workspace_get` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/preflight` | `...#preflight` | `:ai_agents` + `require_live_operations!` | `inbox_id*` | write (readiness check) | no | `mba_preflight` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/eligibility/check` | `...#eligibility_check` | `:ai_agents` + `require_live_operations!` | `inbox_id*` | write (eligibility check) | no | `mba_preflight` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/bootstrap` | `...#bootstrap` | `:ai_agents` + `:create?/:update?` | `inbox_id*`, `business_portfolio_id` | **irreversible** (provisions workspace at Meta) | no | `mba_bootstrap` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/terms/confirm` | `...#confirm_terms` | `:ai_agents` + `:update?` | `inbox_id*`, `confirmed_in_whatsapp_manager*` (`true`) | **irreversible** (records legal attestation) | no | `mba_onboarding` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/onboarding` | `...#onboarding` | `:ai_agents` + `require_live_operations!` | `inbox_id*` | **irreversible** (starts Meta onboarding) | no | `mba_onboarding` |
| `GET` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/settings` | `...#show_settings` | `:ai_agents` + `require_live_operations!` | `inbox_id*` | read | no | `mba_settings` |
| `PUT` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/settings` | `...#update_settings` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `settings*: {}` | **irreversible** (changes live MBA settings at Meta) | no | `mba_settings` |
| `GET` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/business_info` | `...#show_business_info` | `:ai_agents` + `require_live_operations!` | `inbox_id*` | read | no | `mba_business_info` |
| `PUT` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/business_info` | `...#update_business_info` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `business_info*: {}` | **irreversible** (updates business info at Meta) | no | `mba_business_info` |
| `DELETE` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/business_info` | `...#reset_business_info` | `:ai_agents` + `require_live_operations!` | `inbox_id*` | **irreversible** | no | `mba_business_info` |
| `GET` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/resources/:resource_kind` | `...#index_resources` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `resource_kind*` (`faqs`\|`websites`\|`files`\|`skills`\|`ui_skills`\|`allowlist_entries`) | read | **yes** | `mba_resources` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/resources/:resource_kind` | `...#create_resource` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `resource_kind*`, resource body | **irreversible** (publishes knowledge/skill to Meta) | **yes** | `mba_resources` |
| `PUT` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/resources/:resource_kind/:remote_id` | `...#update_resource` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `resource_kind*`, `remote_id*`, resource body | **irreversible** | **yes** | `mba_resources` |
| `DELETE` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/resources/:resource_kind/:remote_id` | `...#destroy_resource` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `resource_kind*`, `remote_id*` | **irreversible** | no | `mba_resources` |
| `GET` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/connectors/:connector_id/tools` | `...#index_connector_tools` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `connector_id*` | read | no | `mba_connectors` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/connectors/:connector_id/credentials` | `...#upsert_connector_credentials` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `connector_id*`, credentials payload | **irreversible** | no | `mba_connectors` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/tests` | `...#run_test` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `message*` | write (sandbox test) | **yes** | `mba_evals` |
| `GET` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/evals/cases` | `...#eval_cases` | `:ai_agents` + `require_live_operations!` | `inbox_id*` | read | **yes** | `mba_evals` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/evals/runs` | `...#run_eval` | `:ai_agents` + `require_live_operations!` | `inbox_id*` | write (eval run) | **yes** | `mba_evals` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/release_confirmation` | `...#release_confirmation` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `consumer_phone_number` | write (canary check) | no | `mba_release` |
| `POST` | `saas` | `/ai_manager/inboxes/:inbox_id/meta_business_agent/release/:release_action` | `...#release` | `:ai_agents` + `require_live_operations!` | `inbox_id*`, `release_action*` | **irreversible** (releases or pauses MBA at Meta) | no | `mba_release` |
| `GET` | `saas` | `/conversations/:conversation_id/meta_business_agent_control` | `meta_business_agent_controls#show` | `require_plan_feature!(:ai_agents)` | `conversation_id*` | read | no | `mba_thread_control` |
| `POST` | `saas` | `/conversations/:conversation_id/meta_business_agent_control` | `meta_business_agent_controls#create` | `require_plan_feature!(:ai_agents)` | `conversation_id*`, `action*` (`takeover`\|`handback`\|`release`) | **irreversible** (changes whether Meta AI or human agent answers customer) | no | `mba_thread_control` |

## Endpoint catalog & parameters (Direct Meta Agent — `core` prefix)

All `/api/v1/accounts/:account_id/meta_agent/*` controllers inherit from `Api::V1::Accounts::MetaAgent::BaseController`, which enforces `ensure_meta_agent_enabled` and `require_plan_feature!(:meta_business_agent)`.

- **Read/sandbox checks**: `GET /meta_agent/inboxes/:inbox_id/{agent,budget,business_info,faqs,files,handoff_assignment,settings,skills,ui_skills,websites,allowlist_entries}`, `POST /meta_agent/inboxes/:inbox_id/agent/eligibility`, `POST /meta_agent/inboxes/:inbox_id/playground`.
- **Irreversible Meta writes** (require admin + `ensure_onboarded`): `POST/PUT/PATCH/DELETE` on `agent`, `agent/adopt`, `agent/attest_terms`, `budget` (`budgets: [{ budget_id, unit_type, time_window, max_budget }]`), `business_info`, `faqs` (`faq: { question, answer }`), `files`, `handoff_assignment` (`handoff_assignment: { enabled, members: [{ user_id, weight }] }`), `settings`, `skills` (`skill: { title, description, skill }`), `ui_skills` (`ui_skill: { title, component_type, status, instruction, flow_id }`), `websites`, and `POST /meta_agent/conversations/:id/release`.

## Quirks & non-obvious behaviour

1. **Dual surface (`ai_manager` on `saas` vs. `meta_agent` on `core`)**:
   - The newer AI Manager Workspace (`saas` `/ai_manager/inboxes/:inbox_id/meta_business_agent/*`) unifies resources under `/resources/:resource_kind` and gates live Meta mutations behind `AiManager::MetaBusinessAgent::LiveOperationsGate.live_enabled?` (`403 { error: "meta_business_agent_live_operations_disabled", safety: ... }`).
   - Curated tools in lane 004 (`AIA-06..08`) should target the `ai_manager` workspace endpoints and `/conversations/:conversation_id/meta_business_agent_control`, while keeping `core` `/meta_agent/*` reachable through the catalog.
2. **Terms attestation requires explicit boolean**:
   - `POST .../terms/confirm` rejects unless `confirmed_in_whatsapp_manager === true` (`422 { error: "terms_attestation_required" }`).
3. **Canary phone check on `release_confirmation`**:
   - Passing `consumer_phone_number` validates canary thread eligibility and returns `422` with `blockers` if ineligible.

## Open questions

None.
