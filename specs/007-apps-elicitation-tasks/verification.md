# 007 — MCP Apps, elicitation & tasks · verification

**Date:** 2026-10-28
**Target:** `https://staging.airys.app`, account `6` ("Airys Demo", fictitious data) + local Streamable HTTP & stdio harnesses

## 1. Compatibility Matrix (`APP-01`, `#131`)

- Documented in `docs/compat/matrix.md` across 9 clients (Claude Desktop & Claude.ai, Claude Code, ChatGPT, Meta Muse & Muse Code, OpenAI Codex CLI/App, Gemini CLI, Google Antigravity, Cursor, and MCP Inspector `2.12`).

## 2. MCP Apps Scaffolding, CSP, and Views (`APP-02..APP-05`, `#132`..`#135`)

- `resources/list` returns 3 `ui://airyschat/*.html` resources (`mimeType: "text/html;profile=mcp-app"`) with `_meta.ui.csp = { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] }` and `prefersBorder: true`:
  - `ui://airyschat/crm-board.html` (`crm_board`, `crm_deals_search`, `crm_deal_move`)
  - `ui://airyschat/campaign-preflight-report.html` (`campaign_preflight_report`, `wa_campaign_preflight`)
  - `ui://airyschat/conversation-view.html` (`conversation_view`, `conversation_get`, `conversation_messages`)
- Security review recorded in `docs/security/007-apps-elicitation-tasks.md` (`APP-05`): zero external CSP origins, `Node.textContent` only (`0` occurrences of `.innerHTML`, `.outerHTML`, `insertAdjacentHTML`, `document.write`), and visual `.untrusted-fence` banners.
- Live verification on `https://staging.airys.app` account `6` (2026-10-28):
  - `crm_board`: `isError: false`, `hasUntrustedBanner: true`, `pipeline_id: 5`, `stages_count: 7`, `deals_count: 48`.
  - `campaign_preflight_report` (`inbox_id: 9`, `message: "hello_world"`, `whatsapp_template_category: "utility"`): `isError: false`, `hasUntrustedBanner: true`, `preflight_keys: [allowed, status, risk_score, health_status, blocking_issues, warnings, campaign_safety_settings, quality_recovery_mode, recent_performance, audience_source, template_review, suppression_counts, eligible_count, audience_counts, frequency_cap_days, recommendation_payload]`, `inbox_health_keys: [latest, snapshots, campaign_volume, alerts]`.
  - `conversation_view` (`conversation_id: 1`): `isError: false`, `hasUntrustedBanner: true`, `messages_count: 3`.

## 3. Elicitation-Based Confirmations with `confirm: true` Fallback (`APP-06`, `#136`)

- Verified in `packages/server/test/apps-elicitation-tasks.test.ts` and `packages/server/scripts/smoke.mjs`:
  - Without `capabilities.elicitation` and without `confirm: true`: returns deterministic `requireConfirmation` refusal (`isError: true`).
  - With `capabilities.elicitation.form`: returns `{ resultType: "input_required", inputRequests: { confirm: { type: "elicit", ... } }, requestState }` with HMAC-SHA256 signature bound to `(method, accountId, toolName, sha256(args))`.
  - Retrying with `action: "decline"`, `action: "cancel"`, `confirm: false`, mutated arguments, or tampered `requestState` refuses execution with `0` upstream writes.
  - Retrying with valid `requestState` and `inputResponses.confirm = { action: "accept", content: { confirm: true } }` executes the tool.
  - Passing `confirm: true` directly in `arguments` executes immediately on all clients.

## 4. MCP Tasks & Progress Notifications (`APP-07`, `#137`)

- Verified in `packages/server/test/apps-elicitation-tasks.test.ts` and `packages/server/scripts/smoke.mjs`:
  - `crm_deals_bulk_update`, `wa_campaign_launch`, and `wa_campaign_test_send` emit `notifications/progress` when `_meta.progressToken` is supplied and stamp `_meta["io.modelcontextprotocol/related-task"] = { taskId }` on the tool result.
  - `tasks/list`, `tasks/get`, `tasks/result`, and `tasks/cancel` enforce strict per-`accountId` isolation (cross-tenant access from account `7` to account `6` tasks is rejected with `-32602`).
  - Mid-batch cancellation via `tasks/cancel` aborts the task's `AbortSignal` and stops remaining chunks in `crm_deals_bulk_update`.

## 5. Quality Gates (`APP-08`, `#138`)

- `pnpm typecheck`: passed (`0` errors).
- `pnpm test`: `48/48` tests passed (`98.53%` line / `89.57%` branch / `95.33%` function coverage).
- `pnpm smoke`: `65/65` end-to-end checks passed.
- `pnpm inventory:check`: consistent (`807` endpoints, `153` tools).
