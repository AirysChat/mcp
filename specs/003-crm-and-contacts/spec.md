# 003 — CRM & contacts

- Release: **0.3.0** · Target 2026-11-30 · Prefix `CRM` · Toolsets `crm` (new), `core`
- Depends on: 001, 002 · Upstream: AirysChat lane `024-crm-v2`

## Why

The native CRM is AirysChat's biggest product change since v0.1. Sales teams want an agent that can
answer "which deals are stuck in Proposal?" and act on it ("move it, log the call, schedule a
follow-up"). Contacts, companies and labels are the substrate every other workflow depends on.

## What

### Phase A — CRM operations (toolset `crm`)

| Area | Tools (initial `beta`) | Gate |
|---|---|---|
| Pipelines | `crm_pipelines_list`, `crm_pipeline_get` (stages included) | read |
| Deals | `crm_deals_search`, `crm_deal_get`, `crm_deal_timeline` | read, untrusted |
| Deal writes | `crm_deal_create`, `crm_deal_update`, `crm_deal_move` (stage), `crm_deal_delete` | write; delete irreversible |
| Closing | `crm_deal_close` (`won` / `lost` + reason) | **irreversible + confirm** — `won` may send a Meta Conversions API Purchase event |
| Bulk | `crm_deals_bulk_update` | write, max N ids, confirm above threshold |
| Notes & activities | `crm_deal_notes_*`, `crm_activities_list/create/update/complete/postpone` | write |
| Insights | `crm_insights` (dashboard, results) | read |
| Reasons | `crm_close_reasons_list`, `crm_loss_reasons_list` | read |
| Conversation ↔ deal | `conversation_deal_get`, `conversation_deal_update` | write |
| Saved views | `crm_views_list` | read |

### Phase B — CRM configuration (`AIRYSCHAT_FEATURES=beta`)

Pipelines/stages CRUD, automations, follow-up rules, CRM settings, business hours, conversion
settings. Admin-only on AirysChat; tools surface the 403 clearly.

### Core additions (toolset `core`)

`contact_create`, `contact_update`, `contact_delete` (irreversible), `contact_labels_set`,
`contacts_merge` (irreversible), `companies_list/get/create/update`, `conversation_labels_add`
(merges, never replaces), `canned_responses_list`, `search` (global), `notifications_list`,
`custom_filters_list`.

## Rules specific to this lane

- Deal and contact payloads carry customer text → `untrustedJson`.
- `crm_deal_close won` must state the CAPI side effect in the confirmation preview.
- Lost requires a reason id from `crm_loss_reasons_list`; the tool validates before calling.
- Respect AirysChat permissions; never fall back to platform/super-admin tokens.

## Acceptance

- Every Phase A and core tool has a smoke test and a sanitized live readback on staging account 6.
- `crm_deal_close` verified on a fictitious deal in a staging pipeline with CAPI disabled/test mode.
- `curated.json` updated; coverage for the `crm` toolset ≥ 60% of its addressable endpoints.
