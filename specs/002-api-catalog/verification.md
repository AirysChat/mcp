# 002 — API catalog · verification

## Automated gates (2026-10-27)

- `node scripts/inventory/build-catalog.mjs --stats`:
  - `807` endpoints from `AirysChat@090c8ae510` (`510` writes, `207` irreversible, `32` excluded, `107` swagger-documented, `235 KB` raw / `48 KB` packed).
- `pnpm test`: 35/35 unit tests passing (`catalog.test.ts` verifies path/swagger param merging, literal-over-parameterised route matching, irreversible classification, and keyword/filtered search).
- `pnpm smoke`: 21/21 end-to-end checks passing:
  - `airyschat_api_search` returns ready-to-call `call` templates (`method`, `prefix`, `path`) with `irreversible` reason and `params` without calling the upstream API.
  - `airyschat_api` refuses unknown routes (`No AirysChat endpoint matches ... Call airyschat_api_search`) and `excluded` routes (`cannot be called through MCP`) locally before any HTTP request is made.
  - `airyschat_api` supports `prefix: "core_v2"` (`/api/v2/accounts/{id}{path}` for analytics and summary reports).
  - `airyschat_api` non-GET calls require `confirm: true` and surface the catalog's `irreversible` reason plus any dedicated `tool` recommendation in the confirmation prompt.

## Safety review of `scripts/inventory/irreversible.json` (CAT-08, 2026-10-27)

All `510` write endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) across `docs/api/inventory.csv` were audited against the four non-negotiable irreversible categories (customer-visible sends/calls/emails, external Meta/Salvy state & billing changes, bulk/destructive mutations, and credential rotation).

### Rules summary (`207` endpoints matched)

| Category | Endpoints matched | Representative patterns |
|---|---|---|
| Every `DELETE` | 91 | `DELETE .*` |
| Customer-visible messages, calls & emails | 16 | `POST /conversations/:conversation_id/messages`, `scheduled_whatsapp_messages`, `campaigns/:id/(launch\|test_send)`, `whatsapp_calls/*`, `inboxes/:inbox_id/calling/request_permission`, `conversations/:id/transcript`, `portals/:id/send_instructions`, `profile/resend_confirmation` |
| Bulk mutations, merges & imports | 16 | `actions/contact_merge`, `bulk_actions`, `crm_deals/bulk`, `agents/bulk_create`, `contacts/bulk_enrich_whatsapp`, `whatsapp_contact_preferences/backfill_apply`, `macros/:id/execute`, `portals/:portal_id/articles/bulk_actions/*`, `notifications/destroy_all`, `destroy_custom_attributes`, `contacts/import`, `data_imports` |
| CRM deal closure & Meta Conversions API | 5 | `crm_deals/:id/(won\|lost)`, `whatsapp_conversion_events/:id/retry`, `whatsapp_conversion_settings` |
| Meta & Salvy configuration / live AI routing | 74 | `message_templates*`, `csat_template`, `whatsapp_flows*`, `meta_agent/*` (excluding playground & eligibility), `ai_manager/.../meta_business_agent/*` (excluding preflight, eligibility/check, evals/runs, tests), `meta_business_agent_control`, `ai_agents/(mode_transition\|publish_workflow\|restore)`, `meta_ads/campaigns/:campaign_id/status`, `phone_verification/*`, `inboxes/:inbox_id/username`, `(enable\|disable)_whatsapp_calling`, `set_inbound_calls`, `salvy/(create_virtual_number\|register_number)` |
| Credential & MFA rotation | 5 | `*/reset_(access_token\|secret)`, `inboxes/:id/reset_secret`, `api/v1/profile/mfa/backup_codes` |

### Adjustments made during review

1. **Removed 4 false positives** (read/check/sandbox POSTs that do not mutate live state or contact customers):
   - `POST /meta_agent/inboxes/:inbox_id/playground`
   - `POST /meta_agent/inboxes/:inbox_id/agent/eligibility`
   - `POST /ai_manager/inboxes/:inbox_id/meta_business_agent/evals/runs`
   - `POST /ai_manager/inboxes/:inbox_id/meta_business_agent/tests`
2. **Added 13 previously missed irreversible writes**:
   - Outbound emails: `POST /conversations/:id/transcript`, `POST /api/v1/profile/resend_confirmation`
   - Bulk/macro operations: `POST /macros/:id/execute`, `POST /portals/:portal_id/articles/bulk_actions/translate`, `POST /whatsapp_contact_preferences/backfill_apply`, `POST /data_imports/:id/retry`
   - Meta phone identity & Salvy provisioning: `POST /inboxes/:inbox_id/phone_verification/(request_code|verify_code|update_display_name)`, `POST /inboxes/:inbox_id/username`, `POST /salvy/(create_virtual_number|register_number)`
   - Credential rotation: `POST /api/v1/profile/mfa/backup_codes`
