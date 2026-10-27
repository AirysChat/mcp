# Domain Brief — `reports` (v0.5.0, Lane 006)

- **Source**: `AirysChat@090c8ae510` (`origin/develop`)
- **Date**: 2026-10-27
- **Lane task**: `CAT-04` (feeds `WA-06..WA-08` in lane 006)
- **Prefixes**: `core_v2` (`/api/v2/accounts/:account_id/*`, 23 endpoints) and `core` (`/api/v1/accounts/:account_id/csat_survey_responses*`, 3 endpoints)

## Endpoint catalog & parameters

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Proposed tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `core_v2` | `/reports/summary` | `api/v2/accounts/reports#summary` | `report:view?` (admin/report role) | `type*` (`account`\|`agent`\|`inbox`\|`label`\|`team`), `id`, `since*` (unix ts string), `until*` (unix ts string), `group_by` (`day`\|`week`\|`month`\|`year`), `business_hours` (bool), `timezone_offset` (float) | read | no | `reports_summary` |
| `GET` | `core_v2` | `/reports` | `api/v2/accounts/reports#index` | `report:view?` | `metric*` (`conversations_count`\|`incoming_messages_count`\|`outgoing_messages_count`\|`first_response_time`\|`resolution_time`\|`resolutions_count`\|`bot_resolutions_count`\|`bot_handoffs_count`), `type*` (`account`\|`agent`\|`inbox`\|`label`\|`team`), `id`, `since*`, `until*`, `group_by`, `business_hours`, `timezone_offset` | read | no | `reports_timeseries` |
| `GET` | `core_v2` | `/reports/drilldown` | `api/v2/accounts/reports#drilldown` | `report:view?` | `metric*`, `bucket_timestamp*`, `since*`, `until*`, `type` (default `account`), `id`, `group_by`, `timezone_offset`, `business_hours`, `page`, `per_page` | read | **yes** (conversation previews) | `reports_drilldown` |
| `GET` | `core_v2` | `/reports/conversations` | `api/v2/accounts/reports#conversations` | `report:view?` | `type*` (`account`\|`agent`), `user_id`, `page` | read | no | `reports_summary` |
| `GET` | `core_v2` | `/reports/bot_Summary` | `api/v2/accounts/reports#bot_summary` | `report:view?` | `since*`, `until*`, `business_hours`, `timezone_offset` | read | no | `reports_summary` |
| `GET` | `core_v2` | `/reports/bot_metrics` | `api/v2/accounts/reports#bot_metrics` | `report:view?` | `since*`, `until*` | read | no | `reports_summary` |
| `GET` | `core_v2` | `/reports/inbox_label_matrix` | `api/v2/accounts/reports#inbox_label_matrix` | `report:view?` | `since*`, `until*`, `inbox_ids[]`, `label_ids[]` | read | no | `reports_inbox_label_matrix` |
| `GET` | `core_v2` | `/reports/first_response_time_distribution` | `api/v2/accounts/reports#first_response_time_distribution` | `report:view?` | `since*`, `until*` | read | no | `reports_distribution` |
| `GET` | `core_v2` | `/reports/outgoing_messages_count` | `api/v2/accounts/reports#outgoing_messages_count` | `report:view?` | `group_by*` (`agent`\|`team`\|`inbox`\|`channel`), `since*`, `until*` | read | no | `reports_summary` |
| `GET` | `core_v2` | `/reports/agents` (`teams`, `inboxes`, `labels`) | `api/v2/accounts/reports#{agents,teams,inboxes,labels}` | `report:view?` | `since*`, `until*`, `business_hours` (returns CSV download) | read | no | excluded / CSV |
| `GET` | `core_v2` | `/summary_reports/agent` | `api/v2/accounts/summary_reports#agent` | `report:view?` | `since*`, `until*`, `business_hours` | read | no | `reports_by_dimension` |
| `GET` | `core_v2` | `/summary_reports/team` | `api/v2/accounts/summary_reports#team` | `report:view?` | `since*`, `until*`, `business_hours` | read | no | `reports_by_dimension` |
| `GET` | `core_v2` | `/summary_reports/inbox` | `api/v2/accounts/summary_reports#inbox` | `report:view?` | `since*`, `until*`, `business_hours` | read | no | `reports_by_dimension` |
| `GET` | `core_v2` | `/summary_reports/label` | `api/v2/accounts/summary_reports#label` | `report:view?` | `since*`, `until*`, `business_hours` | read | no | `reports_by_dimension` |
| `GET` | `core_v2` | `/summary_reports/channel` | `api/v2/accounts/summary_reports#channel` | `report:view?` | `since*`, `until*`, `business_hours` | read | no | `reports_by_dimension` |
| `GET` | `core_v2` | `/live_reports/conversation_metrics` | `api/v2/accounts/live_reports#conversation_metrics` | `report:view?` | `team_id` | read | no | `reports_live_metrics` |
| `GET` | `core_v2` | `/live_reports/grouped_conversation_metrics` | `api/v2/accounts/live_reports#grouped_conversation_metrics` | `report:view?` | `group_by*` (`assignee_id`\|`team_id`), `team_id` | read | no | `reports_live_metrics` |
| `GET` | `core` | `/csat_survey_responses` | `api/v1/accounts/csat_survey_responses#index` | `report:view?` | `page`, `since`, `until`, `user_ids[]`, `inbox_id`, `team_id`, `rating`, `sort` | read | **yes** (`feedback_message`) | `csat_responses` |
| `GET` | `core` | `/csat_survey_responses/metrics` | `api/v1/accounts/csat_survey_responses#metrics` | `report:view?` | `since`, `until`, `user_ids[]`, `inbox_id`, `team_id`, `rating` | read | no | `csat_responses` |
| `GET` | `core` | `/csat_survey_responses/download` | `api/v1/accounts/csat_survey_responses#download` | `report:view?` | `since`, `until`, `user_ids[]`, `inbox_id`, `team_id`, `rating` (CSV) | read | **yes** | excluded / CSV |

## Quirks & non-obvious behaviour

1. **`core_v2` prefix (`/api/v2/accounts/:account_id`)**:
   - All v2 analytics endpoints live under `/api/v2/accounts/:account_id/*` (`prefix: "core_v2"` in `AirysChatClient` and `airyschat_api`), except `csat_survey_responses` which lives under `core` (`/api/v1/accounts/:account_id/csat_survey_responses`).
2. **Unix timestamp strings (`since` and `until`)**:
   - `reports` and `summary_reports` expect `since` and `until` as Unix epoch seconds (e.g. `"1730000000"`).
   - `type` is required on `/reports` and `/reports/summary` (`params[:type].to_sym` raises `NoMethodError` if omitted!). Curated tools must require `type` (defaulting to `'account'`).
3. **`grouped_conversation_metrics` requires valid `group_by`**:
   - `live_reports#grouped_conversation_metrics` only allows `group_by` in `['assignee_id', 'team_id']`; any other value returns `422 { error: "invalid group_by" }`.
4. **Route casing quirk**:
   - Rails defines `/reports/bot_Summary` (capital `S`) pointing to `reports#bot_summary`.
5. **Untrusted content in CSAT & drilldowns**:
   - `GET /csat_survey_responses` returns customer-written `feedback_message`, and `GET /reports/drilldown` returns conversation subject/contact details — both must use `untrustedJson`.

## Open questions

None.
