# 003 — CRM & contacts · verification

- **Date**: 2026-10-27
- **Target**: `https://staging.airys.app` · Account **6** ("Airys Demo", fictitious data)
- **Toolsets**: `core,whatsapp,crm` · **Tools registered**: 80
- **Coverage**: `crm` **72%** (65 / 90 endpoints curated; target ≥ 60%), overall **15%** (114 / 775 addressable endpoints curated)

## 1. Automated suite (`pnpm check`)

- `pnpm typecheck`: pass (`tsc --noEmit` across `src/` and `test/`).
- `pnpm test`: 35 / 35 unit tests pass; core line coverage **99.67%**, branch **95.88%**, functions **98.11%**.
- `pnpm smoke`: 42 / 42 end-to-end stdio JSON-RPC checks pass against the mock server (including `crm` toolset opt-in, `crm_deal_move` closing-stage refusal, `crm_deal_close` server-derived confirmation preview with CAPI Purchase notice, `crm_deals_bulk_update` threshold & destructive gates, `conversation_labels_add` non-destructive merge semantics, `contact_labels_set` / `contacts_merge` / `contact_delete` server-derived confirmations, and Phase B `experimental` Pundit 401/403 administrator permission handling).
- `pnpm inventory:check`: pass (807 endpoints, 80 tools).

## 2. Live verification on `staging.airys.app` (Account 6)

### 2.1 Read tools (`AIRYSCHAT_READ_ONLY=1`)

| Tool | Date | Result | ms | Notes |
|---|---|---|---:|---|
| `crm_pipelines_list` | 2026-10-27 | pass — `array(2)` | 51 | Promoted to `stable` |
| `crm_pipeline_get` | 2026-10-27 | pass — `{pipeline: object{6 keys}, stages: array(7)}` | 115 | Stages use `stage_type: "active" \| "won" \| "lost"` (`Saas::PipelineStage`). Promoted to `stable` |
| `crm_deals_search` (board) | 2026-10-27 | pass — `{payload: array(50), meta: object{5 keys}}` · untrusted-fenced | 447 | Promoted to `stable` |
| `crm_deals_search` (list + `status: "active"`, `stale: true`) | 2026-10-27 | pass — `{payload: array(1), meta: object{5 keys}}` · untrusted-fenced | 135 | `status: "open"` automatically mapped to `"active"` (`Saas::CrmDeal.statuses`). Promoted to `stable` |
| `crm_deals_search` (`without_activity: true`) | 2026-10-27 | pass — `{payload: array(20)}` · untrusted-fenced | 308 | Sends `no_activity=true` to `/crm_deals/search`. Promoted to `stable` |
| `crm_deal_get` | 2026-10-27 | pass — `{id, title, amount_cents, stage, pipeline, contact, conversation, next_activity, attribution, meta_signals, ...}` (43 keys) · untrusted-fenced | 103 | Promoted to `stable` |
| `crm_deal_timeline` | 2026-10-27 | pass — `{payload: array(16), meta: object{2 keys}}` · untrusted-fenced | 95 | Promoted to `stable` |
| `crm_deal_notes_list` | 2026-10-27 | pass — `{payload: array(1)}` · untrusted-fenced | 56 | Promoted to `stable` |
| `crm_activities_list` | 2026-10-27 | pass — `{payload: array(23), meta: object{3 keys}}` · untrusted-fenced | 101 | Promoted to `stable` |
| `conversation_deal_get` | 2026-10-27 | pass — `{deal_id, product_name, amount_cents, currency, stage_name, stage_color, deal: object{37 keys}, stages: array(7)}` · untrusted-fenced | 126 | Promoted to `stable` |
| `crm_insights` (`report: "dashboard"`) | 2026-10-27 | pass — `{business_hours, reply_now, recovery, response_speed, conversion, bottleneck, loss_reasons, leads_per_day, funnel, stage_flow, follow_ups, service, sales, top_products}` | 188 | Promoted to `stable` |
| `crm_insights` (`report: "results"`) | 2026-10-27 | pass — `{period, kpis: object{12 keys}, by_source: array(4), ad_funnel, campaigns: array(4), losses, owners: array(4), signals: array(6), spend}` | 133 | Promoted to `stable` |
| `crm_close_reasons_list` | 2026-10-27 | pass — `array(9)` (`array(6)` when filtered to `reason_type: "lost"`) | 65 | Promoted to `stable` |
| `crm_loss_reasons_list` | 2026-10-27 | pass — `{payload: array(6)}` | 62 | Promoted to `stable` |
| `crm_views_list` | 2026-10-27 | pass — `{payload: array(5)}` | 73 | Promoted to `stable` |
| `crm_settings_get` | 2026-10-27 | pass — `{id, card_creation_mode, default_pipeline_id, default_stage_id, eligible_inbox_ids: array(1), lifecycle_settings: object{5 keys}}` | 90 | Phase B `experimental` |
| `crm_business_hours_get` | 2026-10-27 | pass — `{enabled: boolean, timezone: object, working_hours: array(0), inboxes_count: number, own_schedule_inboxes_count: number}` | 101 | Phase B `experimental` |
| `crm_follow_up_rules_list` | 2026-10-27 | pass — `array(2)` · untrusted-fenced | 116 | Phase B `experimental` |
| `crm_automations_list` | 2026-10-27 | pass — `{payload: array(9)}` | 94 | Phase B `experimental` |
| `canned_responses_list` | 2026-10-27 | pass — `array(8)` · untrusted-fenced | 126 | Promoted to `stable` |
| `search` (`scope: "all"` & `"contacts"`) | 2026-10-27 | pass — `{payload: object{4 keys}}` / `{payload: object{1 keys}}` · untrusted-fenced | 125 / 54 | Promoted to `stable` |
| `custom_filters_list` | 2026-10-27 | pass — `array(0)` | 135 | Promoted to `stable` |
| `notifications_list` (`unread_count_only: true` & `page: 2`) | 2026-10-27 | pass — `{unread_count: number}` / `{data: object{2 keys}}` · untrusted-fenced | 163 / 159 | Kept `beta`: `page: 1` on staging hits upstream `NoMethodError` in `app/views/api/v1/accounts/notifications/index.json.jbuilder:17` when a `crm_activity_reminder` notification has a deleted `Saas::CrmActivity` (`primary_actor` nil) |

### 2.2 Fictitious fixture lifecycle (`mcp-verify-003-*`, cleaned up to 0 remaining records)

| Step / Tool | Date | Result | ms | Notes |
|---|---|---|---:|---|
| `contact_create` (base & mergee) | 2026-10-27 | pass — `{payload: {contact, contact_inbox}}` · untrusted-fenced | 74 / 72 | Documented nested `payload.contact` envelope |
| `contact_update` | 2026-10-27 | pass — `{payload: object{16 keys}}` · untrusted-fenced | 80 | Merges `additional_attributes` and `custom_attributes` |
| `contact_labels_set` | 2026-10-27 | pass — `{contact_id, previous_labels: array(0), removed_labels: array(0), labels: array(0)}` | 157 | Fetches current labels first; requires `confirm: true` when removing any existing label |
| `contacts_merge` (refused without `confirm`) | 2026-10-27 | pass — refused with server-fetched names/emails of both base and mergee contacts | 129 | Destructive gate verified |
| `contacts_merge` (`confirm: true`) | 2026-10-27 | pass — surviving contact object returned · untrusted-fenced | 124 | Mergee contact deleted after reassigning records |
| `crm_deal_create` (won & lost fixtures) | 2026-10-27 | pass — `{id, title, amount_cents, stage, contact, ...}` (37 keys) · untrusted-fenced | 976 / 88 | Created on `mcp-verify-003` contact |
| `crm_deal_update` | 2026-10-27 | pass — updated deal object · untrusted-fenced | 71 | — |
| `crm_deal_note_create` / `crm_deal_note_update` / `crm_deal_note_delete` | 2026-10-27 | pass — `{id, content, crm_deal_id, created_at, updated_at, user}` / `{deleted: true}` | 61 / 176 / 53 | Untrusted-fenced; delete requires `confirm: true` |
| `crm_activity_create` / `crm_activity_update` / `crm_activity_postpone` / `crm_activity_complete` / `crm_activity_delete` | 2026-10-27 | pass — full activity lifecycle verified | 80 / 160 / 75 / 91 / 115 | ISO-8601 UTC offset validated |
| `crm_deal_move` | 2026-10-27 | pass — moved between active stages · untrusted-fenced | 304 | Refuses moving into `won`/`lost` stages so `crm_deal_close` gate cannot be bypassed |
| `crm_deal_close` (`won` without `confirm`) | 2026-10-27 | pass — refused with server-fetched deal title, contact name, amount, and Meta CAPI notice | 71 | — |
| `crm_deal_close` (`won` with `confirm: true, send_conversion_event: false`) | 2026-10-27 | pass — `status: "won", won_at: number` · untrusted-fenced | 142 | `send_conversion_event: false` prevented Meta CAPI dispatch |
| `crm_deal_close` (`lost` with `confirm: true, lost_reason_id`) | 2026-10-27 | pass — `status: "lost", lost_at: number, lost_reason: object{2 keys}` · untrusted-fenced | 295 | — |
| `crm_deal_delete` (cleanup × 2) & `contact_delete` (cleanup) | 2026-10-27 | pass — `{deleted: true}` | 223 / 190 / 85 | `crm_deals_search` and `contacts_search` for `mcp-verify-003` both returned `0` items after cleanup |

### 2.3 Skill verification (`CRM-16`: `plugins/claude/skills/crm-pipeline-review/SKILL.md`)

Executed the 4-step read-only workflow end-to-end against `staging.airys.app` account 6:
- `crm_pipelines_list` + `crm_pipeline_get` (`pipeline_id: 5`, 7 stages: 5 `active`, 1 `won`, 1 `lost`)
- `crm_insights` (`report: "dashboard", pipeline_id: 5, days: "30"`): bottleneck stage `#32` (`stalled_count: 5`, `cards_count: 5`, `avg_seconds: 218005`), conversion `rate: 0.4` (`won_count: 18`, `leads_count: 45`)
- `crm_deals_search` (`without_activity: true, pipeline_id: 5` → `0` deals without activity; `view: "list", status: "active", stale: true, sort: "-days_in_stage"` → `1` stale deal)
- `crm_activities_list` (`scope: "overdue"`): `meta.counts` = `{ overdue: 18, today: 2, upcoming: 3, next_7_days: 5, deals_without_activity: 0 }`

## 3. Release `@airyschat/mcp@0.3.0` (2026-10-27)

- **Release PR**: `#88` (`89b8a5c`) — bumped `packages/server/package.json` and `plugins/claude/.claude-plugin/plugin.json` to `0.3.0` and updated `packages/server/CHANGELOG.md`.
- **Release workflow**: `release.yml` run `40544734627` succeeded in 31s.
- **GitHub Packages**: `@airyschat/mcp@0.3.0` published (`https://github.com/orgs/AirysChat/packages/npm/mcp/1455763285`).
- **GitHub Release**: `@airyschat/mcp@0.3.0` (`https://github.com/AirysChat/mcp/releases/tag/%40airyschat/mcp%400.3.0`).
- **Milestone `v0.3.0`**: closed with 19 / 19 issues closed (`0` open).
