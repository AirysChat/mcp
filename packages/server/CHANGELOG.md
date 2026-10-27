# @airyschat/mcp

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
