# 003 — CRM & contacts · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| CRM-01 | P0 | M | Domain brief `docs/api/domains/crm.md` (routes, controllers, params, permissions, CAPI side effects) via `api-cartographer` | Brief reviewed; quirks listed | Planned |
| CRM-02 | P0 | S | Toolset `crm` scaffolding (`src/tools/crm.ts`, registration, default off) | `AIRYSCHAT_TOOLSETS=crm` lists tools | Planned |
| CRM-03 | P0 | M | Pipelines read: `crm_pipelines_list`, `crm_pipeline_get` | smoke + live readback | Planned |
| CRM-04 | P0 | M | Deals read: `crm_deals_search`, `crm_deal_get`, `crm_deal_timeline` | smoke + live readback; untrusted fencing asserted | Planned |
| CRM-05 | P0 | M | Deal writes: create, update, move | live create/move/delete on fictitious deal | Planned |
| CRM-06 | P0 | M | `crm_deal_close` won/lost with confirm preview incl. CAPI effect; reason validation | `safety-reviewer` sign-off + staging evidence (CAPI test mode) | Planned · `NEEDS_SECURITY_REVIEW` |
| CRM-07 | P1 | S | `crm_deal_delete` (irreversible) and `crm_deals_bulk_update` (threshold confirm) | smoke covers confirm paths | Planned |
| CRM-08 | P1 | M | Notes and activities (list/create/update/complete/postpone) | live readback | Planned |
| CRM-09 | P1 | S | `crm_insights`, close/loss reasons, saved views | live readback | Planned |
| CRM-10 | P1 | S | `conversation_deal_get` / `conversation_deal_update` | live readback | Planned |
| CRM-11 | P2 | L | Phase B config tools (pipelines/stages CRUD, automations, follow-up rules, settings, business hours, conversion settings) `experimental` | smoke + 403 handling for non-admins | Planned |
| CRM-12 | P0 | M | Contacts writes: create, update, delete, labels set, merge | live on fictitious contact; merge/delete confirm | Planned |
| CRM-13 | P1 | S | Companies list/get/create/update | live readback | Planned |
| CRM-14 | P0 | S | `conversation_labels_add` (merge semantics; never replace) | smoke asserts existing labels preserved | Planned |
| CRM-15 | P1 | S | `canned_responses_list`, global `search`, `notifications_list`, `custom_filters_list` | live readback | Planned |
| CRM-16 | P1 | S | Skill `plugins/claude/.../crm-pipeline-review` (stuck deals, next actions) | Skill invoked end-to-end on staging | Planned |
| CRM-17 | P0 | XS | Promote read tools to `stable`; changeset; coverage ≥ 60% `crm` | `inventory:check` + release notes | Planned |
