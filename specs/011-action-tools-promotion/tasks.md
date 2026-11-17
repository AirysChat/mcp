# 011 — Action tools scope alignment & stable promotion · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| ACT-01 | P0 | M | Mark `crm_deal_move`, `crm_deal_update`, and `wa_campaign_create` `irreversible: true` with `confirm` + `requireConfirmation` (`untrustedJson` on `wa_campaign_create`); align CRM Board MCP App move confirmation | `mcp:write` hides all 3 tools; unconfirmed calls return server-derived previews | Done (2026-11-17) |
| ACT-02 | P0 | S | Relax `crm_deal_create` so only `contact_id` is required (auto-resolve default pipeline/stage when omitted; optional `title`); auto-assign `position` on `crm_stage_upsert` create when omitted | Unit + smoke + staging tests verify explicit and default pipeline/stage creation | Done (2026-11-17) |
| ACT-03 | P0 | M | Add unit tests (`test/crm-and-whatsapp-actions.test.ts`) and smoke checks for all 9 candidate tools (including `wa_flow_upsert` at `beta`) | `pnpm test` (`69/69`) and `pnpm smoke` (`67/67`) pass | Done (2026-11-17) |
| ACT-04 | P0 | M | Live-verify the 8 local-safe tools on `staging.airys.app` acct 6 with full cleanup; promote to `stable`, update `FROZEN_STABLE_TOOLS`, `docs/tools/reference.md`, skills, and changeset | `pnpm check` green + sanitized `verification.md` recorded | Done (2026-11-17) |
