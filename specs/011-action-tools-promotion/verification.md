# 011 — Action Tools Scope Alignment & Stable Promotion · Verification

- **Date**: `2026-11-17`
- **Target host**: `https://staging.airys.app` · Account `6` ("Airys Demo", fictitious data)
- **Local suite (`pnpm check`)**:
  - `pnpm typecheck`: pass (`tsc --noEmit && tsc -p tsconfig.test.json`)
  - `pnpm test`: `69/69` unit tests passing (`98.24%` line coverage, `89.13%` branch coverage, `95.09%` function coverage)
  - `pnpm smoke`: `67/67` end-to-end stdio & Streamable HTTP assertions passing
  - `pnpm inventory:check`: consistent (`807` endpoints, `212` tools)
  - `pnpm plugins:check`: consistent (`4` bundles × `8` skills)
  - `pnpm docs:check`: consistent (`docs/tools/reference.md`, `87` `stable` / `112` `beta` / `13` `experimental`)
  - `pnpm security:scan`: `0` findings across tracked files

## 1. Safety & Scope Alignment Checklist

| Check | Result | Notes |
|---|---|---|
| `mcp:irreversible` parity with `Saas::Mcp::RouteCatalog` | PASS | Marked `crm_deal_move` (`PATCH /crm_deals/:id/move`), `crm_deal_update` (`PATCH /crm_deals/:id`), and `wa_campaign_create` (`POST /campaigns`) `irreversible: true` with `confirm` + `requireConfirmation`. `mcp:write` tokens hide all three in `tools/list`. |
| Untrusted content fencing (`untrustedJson`) | PASS | Switched `wa_campaign_create` from `json` to `untrustedJson`; verified `_untrusted` fencing across `crm_deal_create`, `crm_deal_update`, `crm_deal_move`, `crm_activity_create`, `wa_template_upsert`, `wa_campaign_create`, and `wa_flow_upsert`. |
| `1.x` frozen input ergonomics (`crm_deal_create` & `crm_stage_upsert`) | PASS | `crm_deal_create` freezes only `['contact_id']` (resolving default pipeline and first active stage when omitted). `crm_stage_upsert` auto-populates `position` (`maxPosition + 1`) on create when omitted so `Saas::PipelineStage` presence validation succeeds. |
| Zero customer sends & zero Meta API submissions | PASS | `wa_template_upsert` verified as a local draft without `inbox_id` (`platform_template_id: null`). `wa_campaign_create` verified with `save_mode: "draft"` (`campaign_status: "draft"`, `enabled: false`). `wa_flow_upsert` kept `beta` (covered by unit + smoke tests) because `WhatsappFlow` requires `inbox_id NOT NULL` and submits to Meta `POST /{waba_id}/flows` on create. |
| Ephemeral fixture cleanup | PASS | Post-run readback confirmed `0` remaining `mcp-verify-011` deals, contacts, campaigns, pipelines, and templates on staging account `6`. |

## 2. Sanitized Live Verification (`https://staging.airys.app`, Account `6`, `AIRYSCHAT_FEATURES=stable`)

| Step / Tool | Date | Result | ms | Notes |
|---|---|---|---:|---|
| `crm_pipeline_upsert` (`create`) | 2026-11-17 | pass — `{id, account_id, name, description, created_at, updated_at}` | 1784 | Promoted `experimental` → `stable` |
| `crm_pipeline_upsert` (`update`) | 2026-11-17 | pass — `{account_id, name, id, description, created_at, updated_at}` | 2469 | — |
| `crm_stage_upsert` (`create`, omitted `position`) | 2026-11-17 | pass — `object{13 keys}` (auto-assigned `position`) | 4031 | Promoted `experimental` → `stable` |
| `crm_stage_upsert` (`update`) | 2026-11-17 | pass — `object{13 keys}` | 1701 | — |
| `crm_stage_upsert` (`reorder`) | 2026-11-17 | pass — `{result}` | 1678 | Reordered all stages on ephemeral pipeline |
| `crm_deal_create` (explicit pipeline & stage) | 2026-11-17 | pass — `object{37 keys}` · untrusted-fenced | 1658 | Promoted `beta` → `stable` |
| `crm_deal_create` (`contact_id` only) | 2026-11-17 | pass — `object{37 keys}` · untrusted-fenced | 9412 | Auto-resolved default pipeline, active stage, and upstream default title |
| `crm_deal_update` (without `confirm`) | 2026-11-17 | pass — refused with server-derived deal & contact preview | 9466 | `mcp:irreversible` + `requireConfirmation` |
| `crm_deal_update` (`confirm: true`) | 2026-11-17 | pass — `object{37 keys}` · untrusted-fenced | 1817 | Promoted `beta` → `stable` |
| `crm_deal_move` (without `confirm`) | 2026-11-17 | pass — refused with server-derived stage transition preview | 1693 | `mcp:irreversible` + `requireConfirmation` |
| `crm_deal_move` (`confirm: true`) | 2026-11-17 | pass — `object{37 keys}` · untrusted-fenced | 3336 | Promoted `beta` → `stable` |
| `crm_activity_create` | 2026-11-17 | pass — `object{15 keys}` · untrusted-fenced | 5174 | Promoted `beta` → `stable` |
| `wa_template_upsert` (without `confirm`) | 2026-11-17 | pass — refused with local-draft preview | 3 | — |
| `wa_template_upsert` (`create` local draft, no `inbox_id`) | 2026-11-17 | pass — `status: "draft"`, `platform_template_id: null`, `object{16 keys}` · untrusted-fenced | 6662 | Zero Meta calls; promoted `beta` → `stable` |
| `wa_template_upsert` (`update` local draft) | 2026-11-17 | pass — `platform_template_id: null`, `object{16 keys}` · untrusted-fenced | 3146 | — |
| `wa_campaign_create` (without `confirm`) | 2026-11-17 | pass — refused with local-draft preview | 2 | `mcp:irreversible` + `requireConfirmation` |
| `wa_campaign_create` (`save_mode: "draft"`, `confirm: true`) | 2026-11-17 | pass — `campaign_status: "draft"`, `enabled: false`, `object{28 keys}` · untrusted-fenced | 2142 | Zero sends; promoted `beta` → `stable` |
| Ephemeral cleanup (`wa_campaign_delete`, `wa_template_delete`, `crm_activity_delete`, `crm_deal_delete` × 2, `DELETE /pipelines/:id`, `contact_delete`) | 2026-11-17 | pass — `deleted: true` across all fixtures (`0` residue verified) | — | Verified `deals=0, contacts=0, campaigns=0, pipelines=0, templates=0` |
