# Domain Brief — `crm` & `core` additions (v0.3.0, Lane 003)

- **Source**: `AirysChat@090c8ae510` (`origin/develop`)
- **Date**: 2026-10-27
- **Lane tasks**: `CAT-04`, `CRM-01` (feeds `CRM-02..CRM-17` in lane 003)
- **Prefixes**: `saas` (`/saas/api/v1/accounts/:account_id/*`, 70 endpoints) and `core` (`/api/v1/accounts/:account_id/*`)

## 1. CRM Phase A & B (`saas` prefix)

| Method | Prefix | Path | Controller#action | Permission / Gate | Parameters (`*` required) | Effect | Untrusted | Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `saas` | `/pipelines` | `pipelines#index` | `account:show?` | — | read | no | `crm_pipelines_list` |
| `GET` | `saas` | `/pipelines/:id` | `pipelines#show` | `account:show?` | `id*` | read | no | `crm_pipeline_get` |
| `GET` | `saas` | `/pipelines/:pipeline_id/pipeline_stages` | `pipeline_stages#index` | `account:show?` | `pipeline_id*` | read | no | `crm_pipeline_get` |
| `POST` | `saas` | `/pipelines` | `pipelines#create` | `account:update?` (admin) | `pipeline*: { name*, description }` | write | no | `crm_pipeline_upsert` |
| `PATCH`/`PUT` | `saas` | `/pipelines/:id` | `pipelines#update` | `account:update?` (admin) | `id*`, `pipeline*: { name, description }` | write | no | `crm_pipeline_upsert` |
| `DELETE` | `saas` | `/pipelines/:id` | `pipelines#destroy` | `account:update?` (admin) | `id*` | irreversible | no | raw (`airyschat_api`) |
| `POST` | `saas` | `/pipelines/:pipeline_id/pipeline_stages` | `pipeline_stages#create` | `account:update?` (admin) | `pipeline_id*`, `pipeline_stage*: { name*, color, position, stage_type, probability, stale_after_days, conversion_event_name, required_fields: [] }` | write | no | `crm_stage_upsert` |
| `PATCH`/`PUT` | `saas` | `/pipelines/:pipeline_id/pipeline_stages/:id` | `pipeline_stages#update` | `account:update?` (admin) | `pipeline_id*`, `id*`, `pipeline_stage*: { ... }` | write | no | `crm_stage_upsert` |
| `PATCH` | `saas` | `/pipelines/:pipeline_id/pipeline_stages/reorder` | `pipeline_stages#reorder` | `account:update?` (admin) | `pipeline_id*`, `stage_ids*: number[]` | write | no | `crm_stage_upsert` |
| `DELETE` | `saas` | `/pipelines/:pipeline_id/pipeline_stages/:id` | `pipeline_stages#destroy` | `account:update?` (admin) | `pipeline_id*`, `id*` | irreversible | no | raw |
| `GET` | `saas` | `/crm_deals` | `crm_deals#index` | `account:show?` | `view` (`board`\|`list`), `pipeline_id`, `stage_id`, `stage_ids[]`, `owner_id`, `status` (`open`\|`won`\|`lost`), `inbox_id`, `labels[]`, `q`, `per_page` (≤100, default 50), `offset`, `page`, `sort` | read | **yes** | `crm_deals_search` |
| `GET` | `saas` | `/crm_deals/search` | `crm_deals#search` | `account:show?` | `q`, `owner_id`, `without_activity` (returns ≤20 open deals) | read | **yes** | `crm_deals_search` |
| `GET` | `saas` | `/crm_deals/:id` | `crm_deals#show` | `account:show?` | `id*` | read | **yes** | `crm_deal_get` |
| `GET` | `saas` | `/crm_deals/:crm_deal_id/timeline` | `crm_deal_timelines#show` | `account:show?` | `crm_deal_id*` | read | **yes** | `crm_deal_timeline` |
| `POST` | `saas` | `/crm_deals` | `crm_deals#create` | `account:show?` | `crm_deal*: { title*, contact_id*, saas_pipeline_id*, saas_pipeline_stage_id*, conversation_id, conversation_display_id, owner_id, amount_cents, currency, position, product_name, probability, expected_close_on }` | write | **yes** | `crm_deal_create` |
| `PATCH`/`PUT` | `saas` | `/crm_deals/:id` | `crm_deals#update` | `account:show?` | `id*`, `crm_deal*: { ... }` | write | **yes** | `crm_deal_update` |
| `PATCH` | `saas` | `/crm_deals/:id/move` | `crm_deals#move` | `account:show?` | `id*`, `saas_pipeline_stage_id*`, `after_deal_id`, `position`, `amount_cents`, `lost_reason_id`, `lost_comment` | write | **yes** | `crm_deal_move` |
| `POST` | `saas` | `/crm_deals/:id/won` | `crm_deals#won` | `account:show?` | `id*`, top-level: `stage_id`, `amount_cents`, `product_name`, `won_on`, `resolve_conversation`, `send_conversion_event` | **irreversible** (may fire Meta CAPI `Purchase`) | **yes** | `crm_deal_close` |
| `POST` | `saas` | `/crm_deals/:id/lost` | `crm_deals#lost` | `account:show?` | `id*`, top-level: `stage_id`, `lost_reason_id`, `lost_comment`, `resolve_conversation`, `reopen_on`, `reopen_owner_id` | **irreversible** | **yes** | `crm_deal_close` |
| `DELETE` | `saas` | `/crm_deals/:id` | `crm_deals#destroy` | `account:update?` (admin) | `id*` | **irreversible** | no | `crm_deal_delete` |
| `POST` | `saas` | `/crm_deals/bulk` | `crm_deal_bulk_actions#create` | `account:show?` (`delete` admin-only) | `operation*` (`move_stage`\|`assign_owner`\|`add_labels`\|`mark_lost`\|`delete`), `ids*: number[]`, `stage_id`, `owner_id`, `lost_reason_id`, `lost_comment`, `labels: []` | **irreversible** | no | `crm_deals_bulk_update` |
| `GET` | `saas` | `/crm_deals/loss_reasons` | `crm_deals#loss_reasons` | `account:show?` | — (90-day usage counts + share %) | read | no | `crm_loss_reasons_list` |
| `GET` | `saas` | `/closure_reasons` | `closure_reasons#index` | `account:show?` | — (auto-seeds defaults when empty) | read | no | `crm_close_reasons_list` |
| `POST` | `saas` | `/closure_reasons` | `closure_reasons#create` | `ClosureReasonPolicy` (admin) | `closure_reason*: { name*, reason_type* (`lost`\|`won`) }` | write | no | `crm_close_reason_upsert` |
| `PATCH`/`PUT` | `saas` | `/closure_reasons/:id` | `closure_reasons#update` | `ClosureReasonPolicy` (admin) | `id*`, `closure_reason*: { name, reason_type }` | write | no | `crm_close_reason_upsert` |
| `GET` | `saas` | `/crm_deals/:crm_deal_id/notes` | `crm_deal_notes#index` | `account:show?` | `crm_deal_id*` | read | **yes** | `crm_deal_notes_list` |
| `POST` | `saas` | `/crm_deals/:crm_deal_id/notes` | `crm_deal_notes#create` | `account:show?` | `crm_deal_id*`, `content*` | write | **yes** | `crm_deal_note_create` |
| `PATCH`/`PUT` | `saas` | `/crm_deals/:crm_deal_id/notes/:id` | `crm_deal_notes#update` | author or admin | `crm_deal_id*`, `id*`, `content*` | write | **yes** | `crm_deal_note_update` |
| `DELETE` | `saas` | `/crm_deals/:crm_deal_id/notes/:id` | `crm_deal_notes#destroy` | author or admin | `crm_deal_id*`, `id*` | **irreversible** | no | `crm_deal_note_delete` |
| `GET` | `saas` | `/crm_activities` | `crm_activities#index` | `account:show?` | `deal_id`, `owner_id` (or `'me'`), `scope` (`overdue`\|`today`\|`upcoming`\|`pending`\|`completed`), `source`, `from`, `to`, `per_page`, `offset` | read | **yes** | `crm_activities_list` |
| `GET` | `saas` | `/crm_activities/:id` | `crm_activities#show` | `account:show?` | `id*` | read | **yes** | `crm_activities_list` |
| `POST` | `saas` | `/crm_activities` | `crm_activities#create` | `account:show?` | `crm_activity*: { crm_deal_id*, title*, activity_type*, notes, due_at, owner_id, reminder_minutes }` | write | **yes** | `crm_activity_create` |
| `PATCH`/`PUT` | `saas` | `/crm_activities/:id` | `crm_activities#update` | `account:show?` | `id*`, `crm_activity*: { title, activity_type, notes, due_at, owner_id, reminder_minutes }` | write | **yes** | `crm_activity_update` |
| `POST` | `saas` | `/crm_activities/:id/complete` | `crm_activities#complete` | `account:show?` | `id*` | write | **yes** | `crm_activity_complete` |
| `POST` | `saas` | `/crm_activities/:id/postpone` | `crm_activities#postpone` | `account:show?` | `id*`, `days` (default 1, ≤365) or `due_at` (ISO-8601 with offset) | write | **yes** | `crm_activity_postpone` |
| `DELETE` | `saas` | `/crm_activities/:id` | `crm_activities#destroy` | `account:show?` | `id*` | **irreversible** | no | `crm_activity_delete` |
| `GET` | `saas` | `/conversations/:id/crm_deal` | `conversation_crm_deal#show` | `conversation:show?` | `id*` (**conversation `display_id`**) | read | **yes** | `conversation_deal_get` |
| `PATCH` | `saas` | `/conversations/:id/crm_deal` | `conversation_crm_deal#update` | `conversation:show?` | `id*` (**conversation `display_id`**), `product_name`, `amount_cents` | write | **yes** | `conversation_deal_update` |
| `GET` | `saas` | `/crm_saved_views` | `crm_saved_views#index` | `account:show?` | — | read | no | `crm_views_list` |
| `POST` | `saas` | `/crm_saved_views` | `crm_saved_views#create` | `account:show?` | `crm_saved_view*: { name*, sort, visibility, filters: {}, columns: [] }` | write | no | `crm_view_upsert` |
| `PATCH`/`PUT` | `saas` | `/crm_saved_views/:id` | `crm_saved_views#update` | author or admin | `id*`, `crm_saved_view*: { ... }` | write | no | `crm_view_upsert` |
| `GET` | `saas` | `/crm_dashboard` | `crm_dashboard#show` | `account:show?` + `crm_management_dashboard` flag | `pipeline_id`, `since`, `until`, `owner_id`, `inbox_id` | read | no | `crm_insights` |
| `GET` | `saas` | `/crm_results` | `crm_results#show` | `account:show?` | `pipeline_id`, `since`, `until` | read | no | `crm_insights` |
| `GET` | `saas` | `/crm_pipeline_settings` | `crm_pipeline_settings#show` | `account:show?` | — | read | no | `crm_settings_get` |
| `PATCH`/`PUT` | `saas` | `/crm_pipeline_settings` | `crm_pipeline_settings#update` | `account:update?` (admin) | `crm_pipeline_setting*: { card_creation_mode, default_pipeline_id, default_stage_id, eligible_inbox_ids: [], lifecycle_settings: {} }` | write | no | `crm_settings_update` |
| `GET` | `saas` | `/crm_business_hours` | `crm_business_hours#show` | `account:show?` + `crm_management_dashboard` | — | read | no | `crm_business_hours_get` |
| `PATCH`/`PUT` | `saas` | `/crm_business_hours` | `crm_business_hours#update` | `account:update?` (admin) + `crm_management_dashboard` | `enabled*`, `timezone`, `working_hours: []` | write | no | `crm_business_hours_update` |
| `GET` | `saas` | `/crm_follow_up_rules` | `crm_follow_up_rules#index` | `account:show?` | `pipeline_id` | read | **yes** | `crm_follow_up_rules_list` |
| `POST` | `saas` | `/crm_follow_up_rules` | `crm_follow_up_rules#create` | `account:update?` (admin) | `crm_follow_up_rule*: { name*, enabled, delay_minutes*, message_mode*, message_body, message_template_id, saas_pipeline_id*, saas_pipeline_stage_id*, template_params: {} }` | write | **yes** | `crm_follow_up_rule_upsert` |
| `PATCH`/`PUT` | `saas` | `/crm_follow_up_rules/:id` | `crm_follow_up_rules#update` | `account:update?` (admin) | `id*`, `crm_follow_up_rule*: { ... }` | write | **yes** | `crm_follow_up_rule_upsert` |
| `GET` | `saas` | `/crm_stage_automations` | `crm_stage_automations#index` | `account:show?` | `pipeline_id` | read | no | `crm_automations_list` |
| `POST` | `saas` | `/crm_stage_automations` | `crm_stage_automations#create` | `account:update?` (admin) | `crm_stage_automation*: { saas_pipeline_stage_id*, trigger*, action_type*, delay_minutes, enabled, config: {} }` | write | no | `crm_automation_upsert` |
| `PATCH`/`PUT` | `saas` | `/crm_stage_automations/:id` | `crm_stage_automations#update` | `account:update?` (admin) | `id*`, `crm_stage_automation*: { ... }` | write | no | `crm_automation_upsert` |
| `GET` | `saas` | `/whatsapp_conversion_settings` | `whatsapp_conversion_settings#show` | `account:show?` + `whatsapp_conversions_api` flag | `inbox_id*`, `pipeline_id*` | read | no | `crm_conversion_settings_get` |
| `PATCH`/`PUT` | `saas` | `/whatsapp_conversion_settings` | `whatsapp_conversion_settings#update` | `account:update?` (admin) + `whatsapp_conversions_api` flag | `inbox_id*`, `pipeline_id*`, `test_event_code`, `mappings: [{ saas_pipeline_stage_id, event_name, enabled }]` | **irreversible** | no | `crm_conversion_settings_update` |
| `POST` | `saas` | `/whatsapp_conversion_events/:id/retry` | `whatsapp_conversion_events#retry` | `account:update?` (admin) + `whatsapp_conversions_api` flag | `id*` | **irreversible** (re-sends CAPI event to Meta; events themselves are returned inside `crm_deal_get` and `crm_deal_timeline`) | no | raw (`airyschat_api`) |

## 2. Core additions (`core` prefix, Lane 003)

| Method | Prefix | Path | Controller#action | Parameters (`*` required) | Effect | Untrusted | Tool |
|---|---|---|---|---|---|---|---|
| `POST` | `core` | `/contacts` | `contacts#create` | `name`, `email`, `phone_number`, `identifier`, `inbox_id`, `source_id`, `additional_attributes: {}`, `custom_attributes: {}` | write | **yes** | `contact_create` |
| `PATCH`/`PUT` | `core` | `/contacts/:id` | `contacts#update` | `id*`, `name`, `email`, `phone_number`, `identifier`, `blocked`, `additional_attributes: {}`, `custom_attributes: {}` | write | **yes** | `contact_update` |
| `DELETE` | `core` | `/contacts/:id` | `contacts#destroy` | `id*` (fails 422 if contact is currently online) | **irreversible** | no | `contact_delete` |
| `GET`/`POST` | `core` | `/contacts/:contact_id/labels` | `contacts/labels#index`, `#create` | `contact_id*`, `labels*: string[]` (**replaces** label set) | write | no | `contact_labels_set` |
| `POST` | `core` | `/actions/contact_merge` | `actions/contact_merges#create` | `base_contact_id*` (survives), `mergee_contact_id*` (deleted after merge) | **irreversible** | **yes** | `contacts_merge` |
| `GET`/`POST` | `core` | `/conversations/:conversation_id/labels` | `conversations/labels#index`, `#create` | `conversation_id*` (**display_id**), `labels*: string[]` | write (tool reads existing labels first and merges) | no | `conversation_labels_add` |
| `GET` | `core` | `/canned_responses` | `canned_responses#index` | `search` | read | **yes** | `canned_responses_list` |
| `GET` | `core` | `/search` (`/conversations`, `/contacts`, `/messages`, `/articles`) | `search#index` (`#conversations`, `#contacts`, `#messages`, `#articles`) | `q*`, `page`, `since`, `until`, `inbox_id`, `team_id` | read | **yes** | `search` |
| `GET` | `core` | `/notifications` (`/unread_count`) | `notifications#index`, `#unread_count` | `page`, `includes[]`, `sort_order` | read | **yes** | `notifications_list` |
| `GET` | `core` | `/custom_filters` (`/:id`) | `custom_filters#index`, `#show` | `filter_type` (`conversation`\|`contact`\|`report`, default `conversation`), `id` | read | no | `custom_filters_list` |

## 3. Quirks & non-obvious behaviour

1. **Board vs. list mode on `GET /crm_deals`**:
   - Without `view=list`, `crm_deals#index` returns up to `per_page` (default 50) cards **per stage** using `ROW_NUMBER() OVER (PARTITION BY saas_pipeline_stage_id)` plus `meta: { counts_by_stage, sums_by_stage, totals, won_this_month }`.
   - Pass `view=list` for standard pagination across all matching deals, or pass `stage_id` + `offset` to page a single column.
2. **Parameter nesting mismatch (`crm_deal` vs. top-level)**:
   - `POST /crm_deals` and `PATCH /crm_deals/:id` require a nested `crm_deal: { ... }` object.
   - `PATCH /crm_deals/:id/move`, `POST /crm_deals/:id/won`, and `POST /crm_deals/:id/lost` read parameters at the **top level** (`saas_pipeline_stage_id`, `after_deal_id`, `stage_id`, `amount_cents`, `send_conversion_event`, `lost_reason_id`, `lost_comment`, `reopen_on`).
   - `POST /crm_activities` requires `crm_deal_id` nested inside `crm_activity: { crm_deal_id, title, activity_type, ... }`, whereas `GET /crm_activities` filters by top-level `deal_id`.
   - `POST /crm_deals/:crm_deal_id/notes` and `PATCH /crm_deals/:crm_deal_id/notes/:id` read top-level `content` (`params[:content]`).
3. **`conversation_id` vs. `conversation_display_id`**:
   - `GET/PATCH /conversations/:id/crm_deal` looks up `@conversation = Current.account.conversations.find_by!(display_id: params[:id])` — `:id` is always the **display_id**, and `PATCH` auto-creates the deal in the default pipeline stage if none exists yet.
   - `POST /crm_deals` (`normalize_conversation_param!`) accepts `conversation_display_id` (via `display_id`) or `conversation_id` (tries primary key `id` first, then falls back to `display_id`).
4. **Explicit UTC offset required on activity timestamps**:
   - `CrmActivitiesController::ISO_TIME` requires an explicit `Z` or `±HH:MM` offset on `due_at`, `from`, and `to` (`2026-11-01T14:00:00-03:00` or `2026-11-01T17:00:00Z`). Naive timestamps without an offset are rejected with `422`.
5. **Stage required-fields enforcement on move/close**:
   - `move`, `won`, and `lost` set `@deal.enforce_stage_requirements = true`. Missing stage-required fields return `422` with `{ errors: [...], missing_fields: [...], stage_id }`.
6. **Meta Conversions API side effect on `won`**:
   - `POST /crm_deals/:id/won` can dispatch a `Purchase` event to Meta when `send_conversion_event` is truthy or defaulted by stage CAPI mappings. `crm_deal_close` is therefore `irreversible: true` and requires `confirm: true` with a preview naming the deal, contact, amount, and CAPI side effect.
7. **Companies is an unimplemented stub in `AirysChat@090c8ae510` (`CRM-13` obsolete)**:
   - `app/controllers/api/v1/accounts/companies_controller.rb` only implements `def index; render json: { payload: [] }; end`. There is no `Company` model in `app/models/` and no `has_many :companies` on `Account` (confirmed in `AirysChat/specs/024-crm-v2/tasks.md` line 160: *"Companies are a stub in AirysChat (`CompaniesController#index` returns an empty list, no model)... the contact card shows the contact's `company_name`"*).
   - Company name on a contact is read and written via `additional_attributes.company_name` on `contact_create` / `contact_update`.
8. **Labels replacement vs. merge**:
   - `POST /contacts/:contact_id/labels` and `POST /conversations/:conversation_id/labels` (`LabelConcern#create`) call `model.update_labels(permitted_params[:labels])`, which **replaces** the entire label list.
   - `conversation_labels_add` (`CRM-14`) must first `GET /conversations/:conversation_id/labels`, compute `[...new Set([...existing, ...labels])]`, and `POST` the union so existing labels are never dropped.
   - `contact_labels_set` (`CRM-12`) replaces the contact's label set and calls `requireConfirmation` showing the current vs. new labels whenever existing labels would be removed.
