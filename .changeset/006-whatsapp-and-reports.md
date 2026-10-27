---
'@airyschat/mcp': minor
---

Expand the `whatsapp` toolset and add the `reports` v2 toolset (Lane 006 — v0.5.0):

- **`whatsapp` toolset (31 tools total, 74% curated coverage across 88 endpoints)**:
  - Templates: `wa_template_upsert` (`create`, `update`, `appeal`, `duplicate` with `LOCKED_AFTER_SUBMISSION` awareness and `requireConfirmation`), `wa_template_delete` (with server-fetched template preview + `requireConfirmation`), and `wa_template_rejection_explain` (`stable`, root-cause diagnosis and concrete fix suggestions for Meta rejection codes and variable/category linting).
  - Scheduled WhatsApp messages (`saas`): `wa_scheduled_messages_list` (`stable`), `wa_scheduled_message_upsert`, and `wa_scheduled_message_cancel`.
  - Calls & transcriptions: `wa_contact_calls_list` (`stable`, contact call history, single WhatsApp call lookup, and account call log) and `wa_call_transcribe` (idempotent Whisper voicemail/call transcription).
  - Campaigns & Flows: `wa_campaign_update`, `wa_campaign_delete`, `wa_campaign_results` (`stable`: `summary`, `mm_metrics`, `suppressions`, `ab_comparison`, `ab_winner`), `wa_campaign_intelligence` (`stable`: `intelligence`, `inbox_summaries`, `optimal_send_time`), `wa_campaign_send_plan`, `wa_contact_preferences`, `wa_contact_preference_update`, `wa_flows_list` (`stable`), and `wa_flow_upsert`.
- **`reports` toolset (9 `stable` read-only tools, 100% curated coverage across all 26 `reports` endpoints)**:
  - `reports_summary` (`summary`, `bot_summary`, `bot_metrics`, `open_conversations`, `outgoing_messages`, `year_in_review`), `reports_timeseries` (including hourly conversation traffic heatmap), `reports_by_dimension` (`agent`, `team`, `inbox`, `label`, `channel`), `reports_live_metrics`, `reports_inbox_label_matrix`, `reports_distribution`, `reports_drilldown`, `csat_responses` (`metrics` and `list`), and `reports_csv_export`.
- **Claude plugin skill**: Added `campaign-retro` (`plugins/claude/skills/campaign-retro/SKILL.md`).
