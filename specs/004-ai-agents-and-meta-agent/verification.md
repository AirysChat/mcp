# 004 — AI Agents & Meta Business Agent · Verification

Target: `https://staging.airys.app`, account `6` ("Airys Demo", fictitious data) + mock stdio harness (`packages/server/scripts/smoke.mjs`).
Date: `2026-10-27`.

## 1. Security Review (`AIA-04` · `safety-reviewer`)

Reviewed [`packages/server/src/tools/ai_agents.ts`](../../packages/server/src/tools/ai_agents.ts) (24 tools) and [`packages/server/src/tools/meta_agent.ts`](../../packages/server/src/tools/meta_agent.ts) (17 tools) against `AGENTS.md` and `.agents/agents/safety-reviewer.md`:

| Check | Status | Notes |
|---|---|---|
| Customer / third-party content fenced via `untrustedJson` | Pass | All tools returning prompts, conversation messages, knowledge documents/chunks, workflow run logs, business info, settings greetings/prompts, FAQs/skills/websites/files, or eval/playground outputs return via `untrustedJson`. |
| Write & irreversible annotations (`write: true`, `irreversible: true`, `readOnlyCapable`) | Pass | Every mutating tool sets `write: true`; live responder changes, workflow publishes/restores, destructive deletes, and all Meta Graph API writes set `irreversible: true` and require `confirm: true` via `requireConfirmation`. Hybrid tools (`ai_mode_transition`, `mba_connectors`, `mba_evals`) set `readOnlyCapable: true` and enforce `readOnlyRefusal` on non-read actions when `AIRYSCHAT_READ_ONLY=1`. |
| One-responder-per-inbox ownership rule enforced in preflight | Pass | `ai_mode_transition` (`action: "activate"`) always executes `POST /ai_manager/mode_transition_preview` first, surfaces any `readiness_state` blockers, and includes `deactivated_ai_channel_modes` in the `requireConfirmation` prompt. `ai_agent_inbox_upsert` (`auto_reply: true`) fetches `GET /ai_agents/ownership_overview` first and refuses locally if the inbox's canonical `Saas::AiChannelMode` is not `airyschat_native` owned by `agent_id` or if another active `auto_reply: true` link exists. |
| Optimistic concurrency (`observed_hash`) & `idempotency_key` on MBA writes | Pass | `mba_settings_update` and `mba_business_info_update` automatically fetch the current `observed_hash` when omitted, include it in the `requireConfirmation` summary, and send a generated `idempotency_key` (`mcp-<uuid>`) on every `AiManager::MetaBusinessAgent::Command` call. |
| Secrets & tenant data hygiene | Pass | Zero tokens, credentials, phone numbers, or customer PII in code, tests, specs, or commits. |

## 2. Live Verification on `staging.airys.app` (Account 6)

Executed on `2026-10-27` against `https://staging.airys.app` (account `6`, "Airys Demo"):

| Tool | Date | Result | Notes |
|---|---|---|---|
| `llm_models_list` (`include_health: true`) | 2026-10-27 | Pass — `200 OK`, keys `models, health`, `health.healthy: true` | Promoted to `stable` (`AIA-11`). |
| `conversation_ai_usage` (`conversation_id: 94`) | 2026-10-27 | Pass — `200 OK`, keys `total_input, total_output, total_tokens, request_count, total_cost_microcents, records` | Resolved `display_id: 94` → internal conversation `id: 197` via `/conversations/94/crm_deal`. Promoted to `stable` (`AIA-11`). |
| `ai_agents_list`, `ai_agents_ownership_overview`, `ai_agents_monitor`, `ai_agent_upsert` | 2026-10-27 | Plan-gate verified — `403`, classified as `Not available on this account's plan — Recurso não disponível no seu plano atual` | `GET /saas/api/v1/accounts/6/plans` returned `200 []` (`Saas::Plan.count == 0` on staging DB); `Concerns::Saas::FeatureGate#require_plan_feature!(:ai_agents)` returns `403`. Tools remain `beta` until `rake saas:seed_plans` + subscription is seeded on staging. |
| `mba_inboxes_list`, `mba_workspace_get`, `mba_settings_get`, `mba_business_info_get`, `mba_resources_list`, `mba_thread_control_get`, `mba_handoff_get`, `mba_budget_get`, `mba_preflight` | 2026-10-27 | Plan-gate verified — `403`, classified as `Not available on this account's plan — Recurso não disponível no seu plano atual` | Both `/saas/api/v1/accounts/6/ai_manager/...` and `/api/v1/accounts/6/meta_agent/*` (`core` prefix) include `Concerns::Saas::FeatureGate#require_plan_feature!(:meta_business_agent)`. Fixed `ApiError.isPlanGate` in `packages/server/src/client.ts` so `/meta_agent` `403` responses are classified as plan limits rather than permission errors. Tools remain `beta` until staging plan entitlements are seeded. |

## 3. Smoke & Coverage Verification

- `pnpm check` (`typecheck` + `test` + `smoke` + `inventory:check`):
  - **35 unit tests passed** (`99.67%` line coverage, `95.88%` branch coverage, `98.11%` function coverage).
  - **52 end-to-end stdio smoke checks passed**, covering all `ai_agents` (24 tools) and `meta_agent` (17 tools) read, write, ownership preflight, confirmation, and `experimental` (`mba_evals`) flows.
  - **Inventory check passed**: `807` endpoints, `124` tools (`252/775` addressable endpoints curated = `33%`; `meta_agent` `94/94` = `100%`; `ai_agents` `45/45` non-Captain endpoints = `100%`).
