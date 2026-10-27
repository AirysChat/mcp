# Domain Brief — `crm` (v0.3.0, Lane 003)

- **Source**: `AirysChat@090c8ae510` (`origin/develop`)
- **Date**: 2026-10-27
- **Lane task**: `CAT-04` (feeds `CRM-01..CRM-08` in lane 003)
- **Prefixes**: `saas` (`/saas/api/v1/accounts/:account_id/*`, 70 endpoints) and `core` (`/api/v1/accounts/:account_id/{companies,orders}/*`, 20 endpoints)

## Endpoint catalog & parameters

| Method | Prefix | Path | Controller#action | Permission / Gate | Parameters (`*` required) | Effect | Untrusted | Proposed tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `saas` | `/pipelines` | `pipelines#index` | `account:show?` | — | read | no | `crm_pipelines_list` |
| `GET` | `saas` | `/pipelines/:id` | `pipelines#show` | `account:show?` | `id*` | read | no | `crm_pipelines_list` |
| `POST` | `saas` | `/pipelines` | `pipelines#create` | `account:update?` (admin) | `pipeline*: { name*, description }` | write | no | `crm_pipeline_upsert` |
| `PATCH`/`PUT` | `saas` | `/pipelines/:id` | `pipelines#update` | `account:update?` (admin) | `id*`, `pipeline*: { name, description }` | write | no | `crm_pipeline_upsert` |
| `DELETE` | `saas` | `/pipelines/:id` | `pipelines#destroy` | `account:update?` (admin) | `id*` | irreversible | no | raw (`airyschat_api`) |
| `GET` | `saas` | `/pipelines/:pipeline_id/pipeline_stages` | `pipeline_stages#index` | `account:show?` | `pipeline_id*` | read | no | `crm_pipelines_list` |
| `POST` | `saas` | `/pipelines/:pipeline_id/pipeline_stages` | `pipeline_stages#create` | `account:update?` (admin) | `pipeline_id*`, `pipeline_stage*: { name*, color, position, stage_type, probability, stale_after_days, conversion_event_name, required_fields: [] }` | write | no | `crm_stage_upsert` |
| `PATCH`/`PUT` | `saas` | `/pipelines/:pipeline_id/pipeline_stages/:id` | `pipeline_stages#update` | `account:update?` (admin) | `pipeline_id*`, `id*`, `pipeline_stage*: { ... }` | write | no | `crm_stage_upsert` |
| `PATCH` | `saas` | `/pipelines/:pipeline_id/pipeline_stages/reorder` | `pipeline_stages#reorder` | `account:update?` (admin) | `pipeline_id*`, `stage_ids*: number[]` | write | no | `crm_stage_upsert` |
| `DELETE` | `saas` | `/pipelines/:pipeline_id/pipeline_stages/:id` | `pipeline_stages#destroy` | `account:update?` (admin) | `pipeline_id*`, `id*` | irreversible | no | raw |
| `GET` | `saas` | `/crm_deals` | `crm_deals#index` | `account:show?` | `view` (`board`\|`list`), `pipeline_id`, `stage_id`, `stage_ids[]`, `owner_id`, `status` (`open`\|`won`\|`lost`), `inbox_id`, `labels[]`, `q`, `per_page` (≤100, default 50), `offset`, `page`, `sort` | read | **yes** | `crm_deals_list` |
| `GET` | `saas` | `/crm_deals/search` | `crm_deals#search` | `account:show?` | `q`, `owner_id`, `without_activity` (returns ≤20 open deals) | read | **yes** | `crm_deals_list` |
| `GET` | `saas` | `/crm_deals/:id` | `crm_deals#show` | `account:show?` | `id*` | read | **yes** | `crm_deal_get` |
| `GET` | `saas` | `/crm_deals/:crm_deal_id/timeline` | `crm_deal_timelines#show` | `account:show?` | `crm_deal_id*` | read | **yes** | `crm_deal_get` |
| `POST` | `saas` | `/crm_deals` | `crm_deals#create` | `account:show?` | `crm_deal*: { title*, contact_id*, saas_pipeline_id*, saas_pipeline_stage_id*, conversation_id, conversation_display_id, owner_id, amount_cents, currency, position, product_name, probability, expected_close_on }` | write | **yes** | `crm_deal_create` |
| `PATCH`/`PUT` | `saas` | `/crm_deals/:id` | `crm_deals#update` | `account:show?` | `id*`, `crm_deal*: { ... }` | write | **yes** | `crm_deal_update` |
| `PATCH` | `saas` | `/crm_deals/:id/move` | `crm_deals#move` | `account:show?` | `id*`, `saas_pipeline_stage_id*`, `after_deal_id`, `position`, `amount_cents`, `lost_reason_id`, `lost_comment` | write | **yes** | `crm_deal_move` |
| `POST` | `saas` | `/crm_deals/:id/won` | `crm_deals#won` | `account:show?` | `id*`, top-level: `stage_id`, `amount_cents`, `product_name`, `won_on`, `resolve_conversation`, `send_conversion_event` | **irreversible** (may fire Meta CAPI `Purchase`) | **yes** | `crm_deal_close` |
| `POST` | `saas` | `/crm_deals/:id/lost` | `crm_deals#lost` | `account:show?` | `id*`, top-level: `stage_id`, `lost_reason_id`, `lost_comment`, `resolve_conversation`, `reopen_on`, `reopen_owner_id` | **irreversible** | **yes** | `crm_deal_close` |
| `DELETE` | `saas` | `/crm_deals/:id` | `crm_deals#destroy` | `account:update?` (admin) | `id*` | **irreversible** | no | raw |
| `POST` | `saas` | `/crm_deals/bulk` | `crm_deal_bulk_actions#create` | `account:show?` | `operation*`, `ids*: number[]`, `stage_id`, `owner_id`, `lost_reason_id`, `lost_comment`, `labels: []` | **irreversible** | no | raw |
| `GET` | `saas` | `/crm_deals/loss_reasons` | `crm_deals#loss_reasons` | `account:show?` | — (90-day usage counts + share %) | read | no | `crm_closure_reasons_list` |
| `GET` | `saas` | `/closure_reasons` | `closure_reasons#index` | `account:show?` | `reason_type` (`lost`\|`won`) | read | no | `crm_closure_reasons_list` |
| `GET` | `saas` | `/crm_deals/:crm_deal_id/notes` | `crm_deal_notes#index` | `account:show?` | `crm_deal_id*` | read | **yes** | `crm_deal_notes` |
| `POST` | `saas` | `/crm_deals/:crm_deal_id/notes` | `crm_deal_notes#create` | `account:show?` | `crm_deal_id*`, `content*` (or `crm_deal_note: { content* }`) | write | **yes** | `crm_deal_notes` |
| `GET` | `saas` | `/crm_activities` | `crm_activities#index` | `account:show?` | `deal_id`, `owner_id`, `status`, `activity_type` | read | **yes** | `crm_activities_list` |
| `POST` | `saas` | `/crm_activities` | `crm_activities#create` | `account:show?` | `crm_activity*: { title*, activity_type*, notes, due_at, owner_id, reminder_minutes }`, `deal_id` | write | **yes** | `crm_activity_create` |
| `POST` | `saas` | `/crm_activities/:id/complete` | `crm_activities#complete` | `account:show?` | `id*` | write | **yes** | `crm_activity_complete` |
| `POST` | `saas` | `/crm_activities/:id/postpone` | `crm_activities#postpone` | `account:show?` | `id*`, `due_at*` | write | **yes** | `crm_activity_update` |
| `GET` | `saas` | `/crm_saved_views` | `crm_saved_views#index` | `account:show?` | — | read | no | `crm_saved_views_list` |
| `GET` | `saas` | `/crm_dashboard` | `crm_dashboard#show` | `account:show?` + `crm_management_dashboard` flag | `pipeline_id`, `since`, `until`, `owner_id`, `inbox_id` | read | no | `crm_dashboard` |
| `GET` | `saas` | `/crm_results` | `crm_results#show` | `account:show?` | `pipeline_id`, `since`, `until` | read | no | `crm_dashboard` |
| `GET` | `saas` | `/whatsapp_conversion_events` | `whatsapp_conversion_events#index` | `account:show?` + CAPI feature | `status`, `deal_id`, `page` | read | no | `crm_capi_events` |
| `POST` | `saas` | `/whatsapp_conversion_events/:id/retry` | `whatsapp_conversion_events#retry` | `account:update?` + CAPI feature | `id*` | **irreversible** (re-sends CAPI event to Meta) | no | `crm_capi_retry` |
| `GET` | `core` | `/companies` | `companies#index` | `ensure_companies_enabled!` | `page`, `sort` | read | **yes** | `companies_list` |
| `GET` | `core` | `/companies/search` | `companies#search` | `ensure_companies_enabled!` | `q*`, `page` | read | **yes** | `companies_list` |
| `GET` | `core` | `/companies/:id` | `companies#show` | `ensure_companies_enabled!` | `id*` | read | **yes** | `company_get` |
| `POST` | `core` | `/companies` | `companies#create` | `ensure_companies_enabled!` | `name*`, `domain`, `description`, `custom_attributes: {}` | write | **yes** | `company_upsert` |
| `PATCH`/`PUT` | `core` | `/companies/:id` | `companies#update` | `ensure_companies_enabled!` | `id*`, `name`, `domain`, `description`, `custom_attributes: {}` | write | **yes** | `company_upsert` |

## Quirks & non-obvious behaviour

1. **Board vs. list mode on `GET /crm_deals`**:
   - Without `view=list`, `crm_deals#index` returns up to `per_page` (default 50) cards **per stage** using `ROW_NUMBER() OVER (PARTITION BY saas_pipeline_stage_id)` plus `meta: { counts_by_stage, sums_by_stage, totals, won_this_month }`.
   - Pass `view=list` for standard pagination across all matching deals, or pass `stage_id` + `offset` to page a single column.
2. **Parameter nesting mismatch (`crm_deal` vs. top-level)**:
   - `POST /crm_deals` and `PATCH /crm_deals/:id` require a nested `crm_deal: { ... }` object.
   - `PATCH /crm_deals/:id/move`, `POST /crm_deals/:id/won`, and `POST /crm_deals/:id/lost` read parameters at the **top level** (`saas_pipeline_stage_id`, `after_deal_id`, `stage_id`, `amount_cents`, `send_conversion_event`, `lost_reason_id`, `lost_comment`, `reopen_on`).
3. **`conversation_id` vs. `conversation_display_id` on deal creation**:
   - `normalize_conversation_param!` accepts `conversation_display_id` (looked up via `conversations.find_by(display_id:)`) or `conversation_id` (which tries primary key `id` first and falls back to `display_id`). Curated tools should expose both clearly.
4. **Stage required-fields enforcement on move/close**:
   - `move`, `won`, and `lost` set `@deal.enforce_stage_requirements = true`. When a stage requires fields (e.g. `amount_cents` or `product_name`), missing fields return `422` with `{ errors: [...], missing_fields: [...], stage_id }`.
5. **Meta Conversions API side effect on `won`**:
   - `POST /crm_deals/:id/won` (or moving to a won stage with a configured CAPI mapping) can dispatch a `Purchase` event to Meta when `send_conversion_event` is truthy or defaulted by stage settings. Thus `won` is always `irreversible: true` and requires `confirm: true`.
6. **Feature gates**:
   - `GET /crm_dashboard` and `/crm_business_hours` require the `crm_management_dashboard` feature flag (`403` when disabled).
   - `/companies/*` requires `ensure_companies_enabled!` (Enterprise/SaaS companies feature).
   - `/orders/*` requires `ensure_whatsapp_payments_enabled`.

## Open questions

None — all controller contracts and CAPI side effects are verified on `origin/develop`.
