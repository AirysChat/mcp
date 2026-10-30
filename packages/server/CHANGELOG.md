# @airyschat/mcp

## 1.0.1

### Patch Changes

- 4f987ba: Add `"mcp"` default binary alias in `package.json` so `npx -y @airyschat/mcp@latest` resolves `dist/index.js` without `"could not determine executable to run"`, pass explicit `-p @airyschat/mcp@latest airyschat-mcp` args across all 4 client plugin manifests, and resolve unexpanded `${VAR:-default}` optional env placeholders in `loadConfig`.

## 1.0.0

### Major Changes

- 1c883e1: General Availability (`v1.0.0`) release of `@airyschat/mcp` on public npm (`https://registry.npmjs.org`) with SLSA build provenance, Official MCP Registry ownership metadata (`mcpName: "chat.airys/mcp"`), hosted Streamable HTTP production endpoint (`https://mcp.airys.chat/mcp`), 80 stability-frozen `stable` tools across 9 toolsets (`212` curated tools covering `807` AirysChat and Airys Platform endpoints), and synchronized plugin bundles for Claude Code, Codex, Gemini CLI, and Antigravity.

## 0.7.0

### Minor Changes

- a33571c: Promote `platform_numbers_health`, `platform_alerts_list`, `platform_instances_list`, and `platform_usage` from `experimental` to `beta` following the `AirysBR/airys-platform` Management & Usage API (`PLAT-8.1`, `PLAT-8.5`, `PLAT-11.1`), expanding `platform_alerts_list` to all 15 control-plane rules (`delivery_rejected`, `webhook_unrouted`) and `platform_usage` to all 7 Meta `pricing_analytics` categories (`MARKETING_LITE`, `AUTHENTICATION_INTERNATIONAL`, `REFERRAL_CONVERSION`).

### Patch Changes

- 3592a87: Complete `REM-14` production cutover of the hosted Streamable HTTP MCP server at `https://mcp.airys.chat/mcp` behind Cloud Run, Cloud Armor, and Google-managed TLS, paired with the `https://airys.chat` OAuth 2.1 Authorization Server and `https://api.airys.chat` Management & Usage API.

## 0.6.0

### Minor Changes

- 87d620b: Add the stateless Streamable HTTP server (`airyschat-mcp-http` / `dist/http.js`) and OAuth 2.1 Resource Server for hosted MCP (`REM-01..REM-06`, `REM-09`, `REM-12`, `REM-13`, `REM-15`):
  
  - **Per-request server factory (`src/server.ts`)**: shares toolset selection and registration between `src/index.ts` (stdio) and `src/http.ts` (Streamable HTTP) with zero process-global state in tool handlers.
  - **OAuth 2.1 Resource Server (`src/auth.ts`)**: serves RFC 9728 Protected Resource Metadata (`/.well-known/oauth-protected-resource`), validates scoped AirysChat MCP tokens (`mcp_...`) via `/oauth/introspect` with a bounded SHA-256-keyed cache (TTL ≤ 60 s), enforces audience (`aud`), expiration (`exp`), and single-account (`account_id`) binding, rejects classic `api_access_token` keys on hosted HTTP, and emits `WWW-Authenticate` challenges.
  - **Scope-based tool filtering & pre-call refusal (`src/config.ts`, `src/toolsets.ts`, `src/tools/raw.ts`)**: enforces `mcp:read` ⊂ `mcp:write` ⊂ `mcp:irreversible` and optional `mcp:toolset:<name>` restrictions across `tools/list`, tool execution, and the `airyschat_api` escape hatch (also available locally via `AIRYSCHAT_SCOPES`).
  - **Anti-SSRF instance allowlist & managed-instance routing (`/<instance>/mcp`)**: maps `mcp.airys.chat`, `mcp.staging.airys.chat`, and allowlisted `/<instance>/mcp` routes (`AIRYSCHAT_ALLOWED_INSTANCES`), rejecting unknown instances with `400` before any outbound call; enforces 256 KiB request body limits, per-token sliding-window rate limiting (`429`), and secret-free structured JSON logging (`token_fp` only).
  - **Containerization (`Dockerfile`, `.github/workflows/image.yml`)**: multi-stage distroless Node 24 container (`gcr.io/distroless/nodejs24-debian12:nonroot`) and Workload Identity Federation build/deploy workflow.
- 1794ed8: Ship Lane 007 (`v0.7.0`) — MCP Apps (`io.modelcontextprotocol/ui`), elicitation-based confirmations with `confirm: true` fallback, and MCP Tasks & progress notifications:
  
  - **MCP Apps (`APP-02..APP-05`)**: Register `ui://airyschat/crm-board.html`, `ui://airyschat/campaign-preflight-report.html`, and `ui://airyschat/conversation-view.html` (`mimeType: "text/html;profile=mcp-app"`) with strict zero-network CSP (`connectDomains: []`, `resourceDomains: []`, `frameDomains: []`, `baseUriDomains: []`), `Node.textContent`-only DOM rendering, and visual untrusted customer-content fencing, plus composite tools `crm_board`, `campaign_preflight_report`, and `conversation_view` (`stability: "stable"`).
  - **Elicitation-based confirmations (`APP-06`)**: Irreversible tools return `inputRequired.elicit` with an HMAC-SHA256 `requestState` bound to `(method, accountId, toolName, sha256(args))` when the client advertises form elicitation (`capabilities.elicitation`), while preserving the deterministic `confirm: true` parameter fallback for headless clients and subagents.
  - **MCP Tasks & progress (`APP-07`)**: Long-running tools (`crm_deals_bulk_update`, `wa_campaign_launch`, `wa_campaign_test_send`) emit `notifications/progress` when `_meta.progressToken` is supplied, stamp `_meta["io.modelcontextprotocol/related-task"]`, and expose account-isolated `tasks/list`, `tasks/get`, `tasks/result`, and `tasks/cancel` handlers with mid-batch cancellation.
  - **Client compatibility matrix (`APP-01`)**: Add `docs/compat/matrix.md` and security review `docs/security/007-apps-elicitation-tasks.md`.
- c55bdeb: Add the `admin` and `help_center` toolsets (Lane 008, `ADM-01..ADM-09`):
  
  - **`admin` toolset (`packages/server/src/tools/admin.ts`)**: 41 curated tools covering inboxes (`inbox_get`, `inbox_upsert`, `inbox_delete`, `inbox_members_sync`), agents (`agent_invite`, `agent_update`, `agent_delete`), teams (`team_get`, `team_upsert`, `team_delete`, `team_members_sync`), automation rules (`automation_rules_list`, `automation_rule_upsert`, `automation_rule_delete`), macros (`macros_list`, `macro_upsert`, `macro_execute`, `macro_delete`), webhooks with anti-SSRF URL validation (`webhooks_list`, `webhook_upsert`, `webhook_delete`), integrations & hooks with URL validation (`integrations_list`, `integration_hook_upsert`, `integration_hook_delete`), custom attribute definitions (`custom_attributes_list`, `custom_attribute_upsert`, `custom_attribute_delete`), SLA policies & applied SLAs (`sla_policies_list`, `sla_policy_upsert`, `sla_policy_delete`), assignment policies (`assignment_policies_list`, `assignment_policy_upsert`), labels CRUD (`label_upsert`, `label_delete`), canned responses CRUD (`canned_response_upsert`, `canned_response_delete`), custom filters CRUD (`custom_filter_upsert`, `custom_filter_delete`), account settings (`account_settings_get`, `account_settings_update`), and audit logs (`audit_logs_list`).
  - **`help_center` toolset (`packages/server/src/tools/help_center.ts`)**: 11 curated tools (`portals_list`, `portal_get`, `portal_upsert`, `categories_list`, `category_upsert`, `category_delete`, `articles_list`, `article_get`, `article_upsert`, `article_publish`, `article_delete`), promoted to `stable` after live create → publish → delete verification on staging account 6.
  - **`account-audit` skill (`plugins/claude/skills/account-audit/SKILL.md`)**: read-only administrative configuration audit across account settings, inboxes, teams, automations, webhooks, custom attributes, and help center portals.
- b66651b: Add the `platform` toolset (`AirysPlatformClient`, `AIRYS_PLATFORM_URL`, `AIRYS_API_TOKEN`) for the Airys Platform API (`api.airys.chat` / `AirysBR/airys-platform`, lane 009):
  
  - **Second HTTP client (`AirysPlatformClient`)**: dedicated base URL (`AIRYS_PLATFORM_URL`, default `https://api.airys.chat`) and Bearer credential (`AIRYS_API_TOKEN`), isolated from `AIRYSCHAT_API_KEY`.
  - **Live OpenAPI 3.1 tools**: `platform_health` (`stable`), `platform_signals_attribution_list` (`beta`, `untrustedJson`), and `platform_signals_outcome_record` (`beta`, idempotent Business Messaging Conversions API outcome writer).
  - **Control-plane Management API tools (`experimental`, awaiting `PLAT-8.1` / `PLAT-8.5`)**: `platform_numbers_health`, `platform_alerts_list`, `platform_instances_list`, and `platform_usage`.
  - **Skill**: `plugins/claude/skills/number-health-watch/SKILL.md`.
- 9ccca70: Add multi-client plugin bundles, MCP Registry manifest, stability freeze, and GA documentation (lane `010-distribution-ga`, `GA-01..GA-12`):
  
  - **Shared skills & 4 client plugins (`GA-01..GA-04`)**: canonical `skills/*` synchronized into `plugins/claude`, `plugins/codex`, `plugins/gemini`, and `plugins/antigravity` via `pnpm plugins:sync` / `pnpm plugins:check`.
  - **Official MCP Registry & npm provenance (`GA-05`, `GA-06`)**: `server.json` (`chat.airys/mcp`) with stdio + Streamable HTTP transports, and OIDC provenance publishing in `.github/workflows/release.yml`.
  - **Security & stability freeze (`GA-07`, `GA-11`)**: `SECURITY.md`, full-history secret scanner (`pnpm security:scan`), `docs/stability-policy.md`, and `stability-freeze.test.ts` locking all 80 `stable` tools.
  - **Documentation & guides (`GA-08..GA-10`, `GA-12`)**: generated 212-tool reference (`docs/tools/reference.md`), `docs/quickstart.md`, `docs/safety-model.md`, Meta WhatsApp Business Tools MCP complementarity guide, Meta Muse setup guide, and Claude/ChatGPT connector directory package.

## 0.5.0

### Minor Changes

- d73c0c3: Expand the `whatsapp` toolset and add the `reports` v2 toolset (Lane 006 — v0.5.0):
  
  - **`whatsapp` toolset (31 tools total, 74% curated coverage across 88 endpoints)**:
    - Templates: `wa_template_upsert` (`create`, `update`, `appeal`, `duplicate` with `LOCKED_AFTER_SUBMISSION` awareness and `requireConfirmation`), `wa_template_delete` (with server-fetched template preview + `requireConfirmation`), and `wa_template_rejection_explain` (`stable`, root-cause diagnosis and concrete fix suggestions for Meta rejection codes and variable/category linting).
    - Scheduled WhatsApp messages (`saas`): `wa_scheduled_messages_list` (`stable`), `wa_scheduled_message_upsert`, and `wa_scheduled_message_cancel`.
    - Calls & transcriptions: `wa_contact_calls_list` (`stable`, contact call history, single WhatsApp call lookup, and account call log) and `wa_call_transcribe` (idempotent Whisper voicemail/call transcription).
    - Campaigns & Flows: `wa_campaign_update`, `wa_campaign_delete`, `wa_campaign_results` (`stable`: `summary`, `mm_metrics`, `suppressions`, `ab_comparison`, `ab_winner`), `wa_campaign_intelligence` (`stable`: `intelligence`, `inbox_summaries`, `optimal_send_time`), `wa_campaign_send_plan`, `wa_contact_preferences`, `wa_contact_preference_update`, `wa_flows_list` (`stable`), and `wa_flow_upsert`.
  - **`reports` toolset (9 `stable` read-only tools, 100% curated coverage across all 26 `reports` endpoints)**:
    - `reports_summary` (`summary`, `bot_summary`, `bot_metrics`, `open_conversations`, `outgoing_messages`, `year_in_review`), `reports_timeseries` (including hourly conversation traffic heatmap), `reports_by_dimension` (`agent`, `team`, `inbox`, `label`, `channel`), `reports_live_metrics`, `reports_inbox_label_matrix`, `reports_distribution`, `reports_drilldown`, `csat_responses` (`metrics` and `list`), and `reports_csv_export`.
  - **Claude plugin skill**: Added `campaign-retro` (`plugins/claude/skills/campaign-retro/SKILL.md`).

## 0.4.0

### Minor Changes

- 4e7fa7e: Add the `ai_agents` toolset (`ai_agents_list`, `ai_agent_get`, `ai_agent_analytics`, `ai_agent_versions_list`, `ai_agents_monitor`, `ai_agents_ownership_overview`, `ai_workflow_runs_list`, `ai_knowledge_bases_list`, `ai_knowledge_search`, `ai_knowledge_documents_list`, `ai_agent_tools_list`, `conversation_ai_usage`, `llm_models_list`, `ai_agent_upsert`, `ai_agent_delete`, `ai_agent_preview`, `ai_agent_publish`, `ai_agent_version_restore`, `ai_mode_transition`, `ai_agent_inbox_upsert`, `ai_knowledge_base_upsert`, `ai_knowledge_document_create`, `ai_knowledge_document_delete`, `ai_agent_tool_upsert`) with preflight enforcement of the one-responder-per-inbox rule (`AIA-02..AIA-05`).
- 9bd31e2: Add the `meta_agent` toolset covering Meta Business Agent workspace and direct endpoints (17 tools across 94 endpoints):
  
  - Read tools (`beta` — `AIA-06`): `mba_inboxes_list`, `mba_workspace_get`, `mba_settings_get`, `mba_business_info_get`, `mba_resources_list`, `mba_thread_control_get`, `mba_handoff_get`, `mba_budget_get`.
  - Write tools (`beta` — `AIA-07`): `mba_preflight`, `mba_onboarding`, `mba_settings_update`, `mba_business_info_update`, `mba_resource_upsert`, `mba_resource_delete`, `mba_connectors`, `mba_release`, `mba_thread_control_release`, `mba_handoff_update`, `mba_budget_update` with automatic `idempotency_key` generation, `observed_hash` optimistic concurrency preflight, and server-derived `requireConfirmation` gates.
  - Evaluation & playground tool (`experimental` — `AIA-08`): `mba_evals` (`list_cases`, `get_summary`, `get_details`, `get_run`, `run_eval`, `run_test`, `send_event`, `get_event`).

### Patch Changes

- ff9ddfe: Promote live-verified `llm_models_list` and `conversation_ai_usage` to `stable`, resolve `display_id` → internal conversation ID via `/conversations/:id/crm_deal` in `conversation_ai_usage`, classify `/meta_agent/*` HTTP 403 responses from `Concerns::Saas::FeatureGate` as plan entitlement limits (`ApiError.isPlanGate`), and add the `agent-supervision` Claude Code plugin skill (`AIA-10`, `AIA-11`).

## 0.3.0

### Minor Changes

- a60d024: Add contact write and merge tools (`contact_create`, `contact_update`, `contact_delete`, `contact_labels_set`, `contacts_merge`), non-destructive conversation label addition (`conversation_labels_add`), and account productivity read tools (`canned_responses_list`, `search`, `notifications_list`, `custom_filters_list`) in the `core` toolset.
- 7b99219: Add 14 Phase B `experimental` CRM configuration tools (`crm_pipeline_upsert`, `crm_stage_upsert`, `crm_close_reason_upsert`, `crm_view_upsert`, `crm_settings_get`, `crm_settings_update`, `crm_business_hours_get`, `crm_business_hours_update`, `crm_follow_up_rules_list`, `crm_follow_up_rule_upsert`, `crm_automations_list`, `crm_automation_upsert`, `crm_conversion_settings_get`, `crm_conversion_settings_update`) and report Pundit authorization refusals (`You are not authorized to do this action`) as permission errors rather than invalid API keys.
- 73507f5: Promote live-verified CRM and core read tools (`crm_pipelines_list`, `crm_pipeline_get`, `crm_deals_search`, `crm_deal_get`, `crm_deal_timeline`, `crm_deal_notes_list`, `crm_activities_list`, `conversation_deal_get`, `crm_insights`, `crm_close_reasons_list`, `crm_loss_reasons_list`, `crm_views_list`, `canned_responses_list`, `search`, `custom_filters_list`) to `stable`, normalize `crm_deals_search` status/stale/no_activity filters and `crm_stage_upsert` stage types against `AirysChat` CRM v2 models, and add the `/airyschat:crm-pipeline-review` skill.
- 5543ca1: Add the `crm` toolset (`AIRYSCHAT_TOOLSETS=crm`, off by default) with Phase A read tools (`crm_pipelines_list`, `crm_pipeline_get`, `crm_deals_search`, `crm_deal_get`, `crm_deal_timeline`, `crm_insights`, `crm_close_reasons_list`, `crm_loss_reasons_list`, `crm_views_list`).
- ebc4ec3: Add CRM Phase A write and lifecycle tools (`crm_deal_create`, `crm_deal_update`, `crm_deal_move`, `crm_deal_close`, `crm_deal_delete`, `crm_deals_bulk_update`, `crm_deal_notes_list`, `crm_deal_note_create`, `crm_deal_note_update`, `crm_deal_note_delete`, `crm_activities_list`, `crm_activity_create`, `crm_activity_update`, `crm_activity_complete`, `crm_activity_postpone`, `crm_activity_delete`, `conversation_deal_get`, `conversation_deal_update`).

## 0.2.0

### Minor Changes

- 90908c7: Validate `airyschat_api` calls against the embedded endpoint catalog (`core`, `core_v2`, `saas`, and `raw` prefixes), refuse unknown or excluded endpoints locally, and surface catalog irreversible reasons and dedicated tool recommendations in confirmation prompts.
- 5b46a0a: New tool `airyschat_api_search`: finds any of the ~800 AirysChat endpoints by intent ("deal won", "pipeline stages", "template quality") and returns the exact call for `airyschat_api` — method, prefix, path, known params, whether it writes, why it is irreversible, and the dedicated tool to prefer when one exists. It reads a catalog shipped with the server and never calls AirysChat. Always on, like `airyschat_api`.
- 5060d12: `wa_campaign_preflight` now requires `inbox_id`. AirysChat always resolves the inbox first, so calls with only `campaign_id` (or no arguments) failed with a 404; they are now refused locally with a clear validation error. 404s outside campaign routes no longer suggest that campaign display IDs are the problem.
- a06880a: `airyschat_api` stays available with `AIRYSCHAT_READ_ONLY=1`, limited to GET and annotated read-only. Any other method is refused locally, even with `confirm: true`. Read-only setups can now reach every endpoint that has no dedicated tool.
- 00cfd43: Tools now carry a stability tier (`stable`, `beta`, `experimental`, `deprecated`) and `AIRYSCHAT_FEATURES` chooses the highest tier exposed. The default is `stable`.
  
  **Heads-up:** write tools (`conversation_reply`, `conversation_update`, `wa_templates_sync`, `wa_campaign_create`, `wa_campaign_launch`, `wa_campaign_cancel`, `wa_campaign_test_send`) stay `beta` until they are verified live, so they are hidden by default. Set `AIRYSCHAT_FEATURES=beta` to keep using them. Non-stable tools start their description with `[beta]` or `[experimental]`.
- 21290db: Add `outputSchema` and `structuredContent` support for core and catalog read tools (`me`, `inboxes_list`, `agents_list`, `labels_list`, `teams_list`, `conversations_list`, and `airyschat_api_search`) while preserving the fenced text fallback and `_untrusted` prompt-injection notice on customer payloads.
- 90fab39: Requires Node.js 22 or newer (Node 20 reached end-of-life in April 2026). On MCP 2026-07-28 connections the tool list is now marked cacheable for an hour (`private` scope), since it is fixed for the life of the process.

### Patch Changes

- e477c9b: `airyschat_api` no longer points agents to a swagger file and `x-airys-stub` markers that do not exist. It now says where the reference really is: `application_swagger.json` for inherited Chatwoot endpoints, and the controllers for AirysChat-only (`saas`) endpoints, which have no published schema.
- 14d16fc: The server reports its real version (from `package.json`) in `serverInfo` and in the startup log line. Earlier builds always said `0.1.0`.

## 0.1.1

### Patch Changes

- eb34fab: Require `@modelcontextprotocol/server` ≥ 2.4.0 and `zod` ≥ 4.6.7. Earlier versions carry advisories for cross-client message delivery on shared HTTP transports, memory exhaustion during validation, and bearer tokens accepted across services.
