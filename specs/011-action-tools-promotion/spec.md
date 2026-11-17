# 011 — Action Tools Scope Alignment & Stable Promotion

- **Release**: `1.1.0`
- **Target**: `2026-11-17`
- **Prefix**: `ACT`
- **Toolsets**: `crm`, `whatsapp`
- **Dependencies**: [003](../003-crm-and-contacts/spec.md), [006](../006-whatsapp-and-reports/spec.md), [010](../010-distribution-ga/spec.md)

## Why

Production hosted MCP (`mcp.airys.chat`) defaults to `AIRYSCHAT_FEATURES=stable`. Read tools are `stable`, while almost every CRM and WhatsApp action tool remained in `beta` or `experimental`, blocking agents from creating/updating/moving deals, scheduling activities, managing CRM pipelines/stages, or preparing local WhatsApp template/campaign drafts in production.

Additionally, cross-auditing `@airyschat/mcp` against AirysChat's `Saas::Mcp::RouteCatalog::IRREVERSIBLE_RULES` (`scripts/inventory/irreversible.json`) revealed three scope-classification mismatches:
1. `crm_deal_move` (`PATCH /crm_deals/:id/move`)
2. `crm_deal_update` (`PATCH /crm_deals/:id`)
3. `wa_campaign_create` (`POST /campaigns`, where `save_mode: "schedule"` schedules billed broadcasts)

All three require `mcp:irreversible` in the AirysChat API, yet were declared `write: true` without `irreversible: true` or `confirm` in `@airyschat/mcp` (and `wa_campaign_create` returned `json` instead of `untrustedJson`). Clients holding `mcp:write` tokens saw them in `tools/list` and hit `403 insufficient_scope` on execution.

## What

1. **Align irreversible scope & confirmation gates (`ACT-01`)**:
   - Mark `crm_deal_move`, `crm_deal_update`, and `wa_campaign_create` `irreversible: true`.
   - Add optional `confirm` + `requireConfirmation` with server-derived previews (`crm_deal_move` and `crm_deal_update` fetch the deal title/contact/stage; `wa_campaign_create` states template, inbox, and whether the campaign saves as a local draft or schedules billed delivery).
   - Fence `wa_campaign_create` responses with `untrustedJson`.
   - Update the interactive CRM Board MCP App (`ui://airyschat/crm-board.html`) so drag/move actions confirm with the operator and pass `confirm: true`.
2. **Relax `crm_deal_create` required inputs before `1.x` freeze (`ACT-02`)**:
   - Keep only `contact_id` required. Make `title`, `saas_pipeline_id`, and `saas_pipeline_stage_id` optional, resolving the account's default pipeline and first active stage when omitted.
3. **Expand unit and smoke test coverage (`ACT-03`)**:
   - Add unit tests covering all 9 candidate tools (`crm_deal_create`, `crm_deal_update`, `crm_deal_move`, `crm_activity_create`, `crm_pipeline_upsert`, `crm_stage_upsert`, `wa_template_upsert`, `wa_campaign_create`, and `wa_flow_upsert`), including `mcp:write` vs `mcp:irreversible` filtering, confirmation gates, untrusted fencing, and default pipeline/stage resolution.
   - Extend `packages/server/scripts/smoke.mjs` for the updated confirmation gates, `wa_campaign_create`, and `wa_flow_upsert`.
4. **Live-verify on staging & promote 8 verifiable tools to `stable` (`ACT-04`)**:
   - Verify `crm_pipeline_upsert`, `crm_stage_upsert`, `crm_deal_create`, `crm_deal_update`, `crm_deal_move`, `crm_activity_create`, `wa_template_upsert` (local draft without `inbox_id`), and `wa_campaign_create` (`save_mode: "draft"`) on `staging.airys.app` account `6` with full cleanup (`0` remaining `mcp-verify-*` records).
   - Promote those 8 tools to `stable`, freeze their required inputs in `packages/server/test/stability-freeze.test.ts`, regenerate `docs/tools/reference.md`, sync plugin skill bundles, and add a `minor` changeset.

## Out of scope

- Promoting `wa_flow_upsert` to `stable`: `WhatsappFlow` requires `inbox_id NOT NULL` and `WhatsappFlowsController#create` immediately calls `POST /{waba_id}/flows` at Meta whenever an inbox is attached. To respect the zero-Meta-submission constraint, `wa_flow_upsert` gains unit and smoke coverage and stays `beta`.
- Customer-visible sends (`wa_campaign_launch`, `wa_campaign_test_send`, `conversation_reply`) and `crm_deal_close`.

## Acceptance

- `pnpm check` passes (`typecheck`, `test`, `smoke`, `inventory:check`, `plugins:check`, `docs:check`, `security:scan`).
- Sanitized live staging evidence recorded in `specs/011-action-tools-promotion/verification.md` with zero orphaned test records on `staging.airys.app` account `6`.
