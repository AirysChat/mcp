---
"@airyschat/mcp": minor
---

Align `crm_deal_move`, `crm_deal_update`, and `wa_campaign_create` with AirysChat's `mcp:irreversible` route enforcement (`irreversible: true`, server-derived `confirm` previews, and `untrustedJson` fencing on `wa_campaign_create`), relax `crm_deal_create` so only `contact_id` is required (auto-resolving the account's default pipeline and first active stage when omitted), auto-assign stage `position` on `crm_stage_upsert` create when omitted, and promote 8 live-verified CRM and WhatsApp action tools (`crm_deal_create`, `crm_deal_update`, `crm_deal_move`, `crm_activity_create`, `crm_pipeline_upsert`, `crm_stage_upsert`, `wa_template_upsert`, and `wa_campaign_create`) to `stable`.
