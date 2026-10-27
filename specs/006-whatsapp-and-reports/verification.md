# 006 — WhatsApp complete & reports · Verification

- **Date**: 2026-10-27
- **Target**: `https://staging.airys.app` · Account `6` ("Airys Demo", fictitious data)
- **Source**: `AirysChat@c9ea590d8c`

## 1. Automated Verification (`pnpm check`)

- `pnpm typecheck`: passed (`tsc --noEmit` across `src` and `test`).
- `pnpm test`: `35/35` unit tests passing (`99.67%` line coverage, `95.94%` branch coverage, `98.11%` function coverage).
- `pnpm smoke`: `57/57` end-to-end stdio JSON-RPC assertions passing, including:
  - `wa_template_upsert` (`create`), `wa_template_rejection_explain` (diagnosing `PROMOTIONAL_CONTENT_IN_UTILITY`, `variable_at_boundary`, `non_sequential_variables`, `promotional_terms_in_utility`, and `url_shortener_in_body`), and `wa_template_delete` (server-fetched confirmation preview).
  - `wa_scheduled_messages_list`, `wa_scheduled_message_upsert`, and `wa_scheduled_message_cancel` under `/saas/api/v1/accounts/:id/conversations/:display_id/scheduled_whatsapp_messages`.
  - `wa_contact_calls_list` and `wa_call_transcribe` under `/saas`.
  - `wa_campaign_results`, `wa_campaign_intelligence`, `wa_contact_preferences`, and `wa_flows_list`.
  - All 9 `reports` tools (`reports_summary`, `reports_timeseries`, `reports_by_dimension`, `reports_live_metrics`, `reports_inbox_label_matrix`, `reports_distribution`, `reports_drilldown`, `csat_responses`, and `reports_csv_export`).
- `pnpm inventory:check`: consistent (`807` endpoints, `150` tools, `329/775` addressable endpoints curated = `42%`; `reports` at `100%` [26/26], `whatsapp` at `74%` [65/88]).

## 2. Safety Review (`safety-reviewer` Checklist)

| Check | Result | Notes |
|---|---|---|
| Untrusted content fencing (`untrustedJson`) | PASS | Every tool returning template content, scheduled message text, call transcripts, campaign copy/suppressions, contact consent events, Flow JSON, report drilldowns, dimension names, CSAT feedback, or CSV exports returns via `untrustedJson`. |
| Write & irreversible declarations | PASS | All mutating tools in `whatsapp.ts` declare `write: true`. All Meta-facing or customer-visible writes (`wa_template_upsert`, `wa_template_delete`, `wa_scheduled_message_upsert`, `wa_scheduled_message_cancel`, `wa_campaign_update`, `wa_campaign_delete`, `wa_campaign_send_plan`, `wa_contact_preference_update`, `wa_flow_upsert`) declare `irreversible: true` and gate execution with `requireConfirmation`. All 9 tools in `reports.ts` are strictly read-only. |
| No live outbound sends in verification | PASS | `wa_campaign_launch` and `wa_campaign_test_send` were not called against staging. Template and campaign write verification used local drafts (`inbox_id` omitted on template draft; `save_mode: "draft"` on campaign) and deleted them immediately within the same verification run. |
| Secrets & PII hygiene | PASS | Staging token read from macOS Keychain in memory only; all evidence below is sanitized to HTTP statuses, tool names, and top-level field keys. |

## 3. Sanitized Live Verification (`https://staging.airys.app`, Account `6`)

| Tool | Arguments | Result | Top-level keys / Notes |
|---|---|---|---|
| `wa_templates_list` | `{}` | `200 OK` | `_untrusted`, `payload` (`stable`) |
| `wa_template_upsert` (`create` local draft) | `{ action: "create", name: "mcp_verify_006_draft", language: "pt_BR", category: "utility", confirm: true, ... }` | `201 Created` | Created draft template `id: 91` (`channel_type: "Channel::Whatsapp"`, `platform_template_id: null`) |
| `wa_template_rejection_explain` | `{ template_id: 91 }` | `200 OK` | `_untrusted`, `template_id`, `rejection_code`, `detected_issues` (4 issues detected), `suggested_fixes` (` promoted to stable`) |
| `wa_template_upsert` (`update` local draft) | `{ action: "update", template_id: 91, category: "utility", confirm: true, ... }` | `200 OK` | Updated draft template `id: 91` |
| `wa_template_delete` | `{ template_id: 91, confirm: true }` | `200 OK` | `{ deleted: true, template_id: 91, name: "mcp_verify_006_draft" }` (cleaned up) |
| `wa_scheduled_messages_list` | `{ conversation_id: 94 }` | `200 OK` | `_untrusted`, `payload` (`promoted to stable`) |
| `wa_contact_calls_list` | `{ contact_id: 201 }` / `{}` | `200 OK` | `_untrusted`, `payload`, `meta` (`promoted to stable`) |
| `wa_campaign_create` (`save_mode: "draft"`) | `{ title: "MCP Verify 006 Draft", inbox_id: 9, save_mode: "draft", ... }` | `200 OK` | Created draft campaign `display_id: 2` |
| `wa_campaign_results` | `{ campaign_id: 2, view: "mm_metrics" }` | `200 OK` | `_untrusted`, `mm_metrics` (`promoted to stable`) |
| `wa_campaign_update` | `{ campaign_id: 2, title: "MCP Verify 006 Draft Updated", confirm: true }` | `200 OK` | Updated draft campaign `display_id: 2` |
| `wa_campaign_delete` | `{ campaign_id: 2, confirm: true }` | `200 OK` | `{ deleted: true, campaign_id: 2 }` (cleaned up) |
| `wa_campaign_intelligence` | `{ view: "optimal_send_time" }` / `{ view: "inbox_summaries" }` | `200 OK` | `recommended_hour`, `recommended_day`, `inboxes` (`promoted to stable`) |
| `wa_flows_list` | `{}` | `200 OK` | `_untrusted`, `payload` (`promoted to stable`) |
| `reports_summary` | `summary`, `bot_summary`, `bot_metrics`, `open_conversations`, `outgoing_messages`, `year_in_review` (`since: "1735689600"`, `until: "1740787200"`) | `200 OK` | All 6 views returned `200 OK` (`promoted to stable`) |
| `reports_timeseries` | `metric: "conversations_count"`, `group_by: "day"` & `"hour"` | `200 OK` | `result` (`promoted to stable`) |
| `reports_by_dimension` | `dimension: "agent" \| "inbox" \| "team" \| "label" \| "channel"` | `200 OK` | All 5 dimensions returned `200 OK` (`promoted to stable`) |
| `reports_live_metrics` | `{}` and `{ group_by: "assignee_id" }` | `200 OK` | `open`, `unattended`, `unassigned`, `pending` (`promoted to stable`) |
| `reports_inbox_label_matrix` | `{ since: "1735689600", until: "1740787200" }` | `200 OK` | `_untrusted`, `inboxes`, `labels`, `matrix` (`promoted to stable`) |
| `reports_distribution` | `{ since: "1735689600", until: "1740787200" }` | `200 OK` | `{}` (`promoted to stable`) |
| `reports_drilldown` | `{ metric: "conversations_count", bucket_timestamp: "1735689600", since: "1735689600", until: "1740787200", group_by: "day" }` | `200 OK` | `_untrusted`, `meta`, `payload` (`promoted to stable`) |
| `csat_responses` | `view: "metrics"` & `view: "list"` | `200 OK` | `_untrusted`, `total_count`, `ratings_count`, `payload` (`promoted to stable`) |
| `reports_csv_export` | `report: "agents"` & `report: "conversation_traffic"` | `200 OK` | `_untrusted`, `report`, `csv` (`promoted to stable`) |
