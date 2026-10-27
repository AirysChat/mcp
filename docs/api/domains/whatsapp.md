# Domain Brief — `whatsapp` (v0.5.0, Lane 006)

- **Source**: `AirysChat@c9ea590d8c` (`origin/develop`)
- **Date**: 2026-10-27
- **Lane task**: `WAR-01` (feeds `WAR-02..WAR-06` in lane 006)
- **Prefixes**:
  - `core` (`/api/v1/accounts/:account_id/*` — templates, campaigns, WhatsApp Flows, contact preferences, stickers, WhatsApp calls, enterprise calls)
  - `saas` (`/saas/api/v1/accounts/:account_id/*` — scheduled WhatsApp messages, contact call history, call transcriptions)

## 1. Endpoint Catalog & Parameters

### 1.1 Message Templates (`Api::V1::Accounts::MessageTemplatesController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `core` | `/message_templates` | `api/v1/accounts/message_templates#index` | `message_template:index?` | `inbox_id`, `channel_type`, `status` | read | **yes** | `wa_templates_list` (0.1.0) |
| `GET` | `core` | `/message_templates/:id` | `api/v1/accounts/message_templates#show` | `message_template:show?` | `id*` | read | **yes** | `wa_template_get` (0.1.0) / `wa_template_rejection_explain` (0.5.0) |
| `GET` | `core` | `/message_templates/:id/analytics` | `api/v1/accounts/message_templates#analytics` | `message_template:analytics?` | `id*`, `days` (`7`\|`30`\|`90`) | read | no | `wa_template_analytics` (0.1.0) |
| `POST` | `core` | `/message_templates/sync` | `api/v1/accounts/message_templates#sync` | `message_template:sync?` | `inbox_id` | write (local sync) | no | `wa_templates_sync` (0.1.0) |
| `POST` | `core` | `/message_templates` | `api/v1/accounts/message_templates#create` | `message_template:create?` (admin) | `message_template*: { name*, language*, channel_type, category*, inbox_id, content: {}, metadata: {} }` | write + **irreversible** (submits to Meta when `inbox_id` present) | **yes** | `wa_template_upsert` |
| `PATCH`/`PUT` | `core` | `/message_templates/:id` | `api/v1/accounts/message_templates#update` | `message_template:update?` (admin) | `id*`, `message_template*: { category, content: {}, metadata: {} }` (`name`, `language`, `inbox_id`, `channel_type` locked after submission) | write + **irreversible** (resubmits to Meta) | **yes** | `wa_template_upsert` |
| `DELETE` | `core` | `/message_templates/:id` | `api/v1/accounts/message_templates#destroy` | `message_template:destroy?` (admin) | `id*` | write + **irreversible** (deletes template on Meta WABA by `name` + `hsm_id`) | no | `wa_template_delete` |
| `POST` | `core` | `/message_templates/:id/appeal` | `api/v1/accounts/message_templates#appeal` | `message_template:appeal?` (admin) | `id*`, `appeal_reason`, `components` | write + **irreversible** (appeals rejected template at Meta) | **yes** | `wa_template_upsert` |
| `POST` | `core` | `/message_templates/:id/duplicate` | `api/v1/accounts/message_templates#duplicate` | `message_template:duplicate?` (admin) | `id*`, `name`, `bid_amount` | write + **irreversible** | **yes** | `wa_template_upsert` |

### 1.2 Scheduled WhatsApp Messages (`Saas::Api::V1::ScheduledWhatsappMessagesController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `saas` | `/conversations/:conversation_id/scheduled_whatsapp_messages` | `saas/api/v1/scheduled_whatsapp_messages#index` | `conversation:show?` | `conversation_id*` (`display_id`) | read | **yes** | `wa_scheduled_messages_list` |
| `POST` | `saas` | `/conversations/:conversation_id/scheduled_whatsapp_messages` | `saas/api/v1/scheduled_whatsapp_messages#create` | `conversation:show?` | `conversation_id*` (`display_id`), `scheduled_whatsapp_message*: { content, scheduled_at*, template_params: {} }` | write + **irreversible** (customer-visible scheduled send) | **yes** | `wa_scheduled_message_upsert` |
| `PATCH`/`PUT` | `saas` | `/conversations/:conversation_id/scheduled_whatsapp_messages/:id` | `saas/api/v1/scheduled_whatsapp_messages#update` | `conversation:show?` | `conversation_id*` (`display_id`), `id*`, `scheduled_whatsapp_message*: { scheduled_at* }` | write + **irreversible** | **yes** | `wa_scheduled_message_upsert` |
| `DELETE` | `saas` | `/conversations/:conversation_id/scheduled_whatsapp_messages/:id` | `saas/api/v1/scheduled_whatsapp_messages#destroy` | `conversation:show?` | `conversation_id*` (`display_id`), `id*` | write (cancels pending scheduled message) | no | `wa_scheduled_message_cancel` |

### 1.3 Calls & Transcriptions (`Saas::Api::V1::ContactCallsController`, `CallsController`, `CallTranscriptionsController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `saas` | `/contacts/:contact_id/calls` | `saas/api/v1/contact_calls#index` | `contact:show?` | `contact_id*` (returns up to 25 most recent calls) | read | no | `wa_contact_calls_list` |
| `GET` | `core` | `/calls` | `api/v1/accounts/calls#index` | authenticated agent/admin | `page`, `inbox_id`, `status`, `direction` | read | **yes** (`transcript`) | `wa_contact_calls_list` |
| `GET` | `core` | `/whatsapp_calls/:id` | `api/v1/accounts/whatsapp_calls#show` | `conversation:show?` | `id*` | read | **yes** | `wa_contact_calls_list` |
| `POST` | `saas` | `/calls/:call_id/transcription` | `saas/api/v1/call_transcriptions#create` | authenticated agent/admin | `call_id*` | write (caches Whisper voicemail transcript) | **yes** (`transcript`) | `wa_call_transcribe` |

### 1.4 Campaign Updates, Results, Intelligence & Consent (`Api::V1::Accounts::CampaignsController`, `WhatsappContactPreferencesController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `PATCH`/`PUT` | `core` | `/campaigns/:id` | `api/v1/accounts/campaigns#update` | `campaign:update?` (admin) | `id*` (`display_id`), `campaign*: { title, message, inbox_id, scheduled_at, save_mode, audience, template_params }` | write | **yes** | `wa_campaign_update` |
| `DELETE` | `core` | `/campaigns/:id` | `api/v1/accounts/campaigns#destroy` | `campaign:destroy?` (admin) | `id*` (`display_id`) | write + **irreversible** | no | `wa_campaign_delete` |
| `GET` | `core` | `/campaigns/:id/mm_metrics` | `api/v1/accounts/campaigns#mm_metrics` | `campaign:mm_metrics?` | `id*` (`display_id`) | read | no | `wa_campaign_results` |
| `GET` | `core` | `/campaigns/:id/suppressions` | `api/v1/accounts/campaigns#suppressions` | `campaign:suppressions?` + `whatsapp_campaign_intelligence` feature | `id*` (`display_id`) | read | **yes** (`contact_name`, `reason`) | `wa_campaign_results` |
| `GET` | `core` | `/campaigns/:id/summary` | `api/v1/accounts/campaigns#summary` | `campaign:summary?` | `id*` (`display_id`) | read | **yes** | `wa_campaign_results` |
| `GET` | `core` | `/campaigns/:id/ab_comparison` | `api/v1/accounts/campaigns#ab_comparison` | `campaign:ab_comparison?` | `id*` (`display_id`) | read | **yes** | `wa_campaign_results` |
| `GET` | `core` | `/campaigns/:id/ab_winner` | `api/v1/accounts/campaigns#ab_winner` | `campaign:ab_winner?` | `id*` (`display_id`) | read | **yes** | `wa_campaign_results` |
| `GET` | `core` | `/campaigns/intelligence` | `api/v1/accounts/campaigns#intelligence` | `campaign:intelligence?` + `whatsapp_campaign_intelligence` | `inbox_id*`, `since` (`YYYY-MM-DD`), `until` (`YYYY-MM-DD`) | read | no | `wa_campaign_intelligence` |
| `GET` | `core` | `/campaigns/whatsapp_inbox_summaries` | `api/v1/accounts/campaigns#whatsapp_inbox_summaries` | `campaign:whatsapp_inbox_summaries?` + `whatsapp_campaign_intelligence` | none | read | no | `wa_campaign_intelligence` |
| `GET` | `core` | `/campaigns/optimal_send_time` | `api/v1/accounts/campaigns#optimal_send_time` | `campaign:optimal_send_time?` | none | read | no | `wa_campaign_intelligence` |
| `POST` | `core` | `/campaigns/send_plan` | `api/v1/accounts/campaigns#send_plan` | `campaign:send_plan?` + `whatsapp_campaign_intelligence` | `inbox_ids[]`, `whatsapp_template_category`, `recipient_count`, `starts_at`, `ends_at`, `persist` | write (when `persist: true`) | no | `wa_campaign_send_plan` |
| `POST` | `core` | `/campaigns/qualified_audience_preview` | `api/v1/accounts/campaigns#qualified_audience_preview` | `campaign:qualified_audience_preview?` + `whatsapp_campaign_intelligence` | `inbox_ids[]`, `days`, `since`, `until`, `recency_buckets[]` | read | no | `wa_campaign_send_plan` |
| `POST` | `core` | `/campaign_intelligence_reports` | `api/v1/accounts/campaign_intelligence_reports#create` | `campaign:create?` + `whatsapp_campaign_intelligence` | `inbox_id*`, `since`, `until`, `title` | write | no | `wa_campaign_intelligence` |
| `GET` | `core` | `/whatsapp_contact_preferences` | `api/v1/accounts/whatsapp_contact_preferences#index` | `campaign:index?` + `whatsapp_campaign_intelligence` | `inbox_id*`, `status`, `source`, `subscription_scope`, `confidence`, `q`, `page` | read | **yes** | `wa_contact_preferences` |
| `GET` | `core` | `/whatsapp_contact_preferences/:contact_id` | `api/v1/accounts/whatsapp_contact_preferences#show` | `campaign:show?` + `whatsapp_campaign_intelligence` | `contact_id*`, `inbox_id*`, `include_events` | read | **yes** | `wa_contact_preferences` |
| `PATCH`/`PUT` | `core` | `/whatsapp_contact_preferences/:contact_id` | `api/v1/accounts/whatsapp_contact_preferences#update` | `campaign:update?` + `whatsapp_campaign_intelligence` | `contact_id*`, `inbox_id*`, `status*` (`opted_in`\|`opted_out`), `reason*`, `subscription_scope` | write + **irreversible** | **yes** | `wa_contact_preference_update` |
| `POST` | `core` | `/whatsapp_contact_preferences/review_candidate` | `api/v1/accounts/whatsapp_contact_preferences#review_candidate` | `campaign:update?` + `whatsapp_campaign_intelligence` | `inbox_id*`, `event_id*`, `review_action*` (`accept`\|`dismiss`), `reason*` | write + **irreversible** | **yes** | `wa_contact_preference_update` |

### 1.5 WhatsApp Flows (`Api::V1::Accounts::WhatsappFlowsController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `core` | `/whatsapp_flows` | `api/v1/accounts/whatsapp_flows#index` | `whatsapp_flow:index?` | `inbox_id` | read | **yes** | `wa_flows_list` |
| `GET` | `core` | `/whatsapp_flows/:id` | `api/v1/accounts/whatsapp_flows#show` | `whatsapp_flow:show?` | `id*` | read | **yes** | `wa_flows_list` |
| `GET` | `core` | `/whatsapp_flows/:id/preview` | `api/v1/accounts/whatsapp_flows#preview` | `whatsapp_flow:preview?` | `id*` | read | no | `wa_flows_list` |
| `POST` | `core` | `/whatsapp_flows` | `api/v1/accounts/whatsapp_flows#create` | `whatsapp_flow:create?` (admin) | `whatsapp_flow*: { name*, inbox_id, categories: [], flow_json: {}, endpoint_uri: {} }` | write + **irreversible** (creates on Meta when `inbox_id` present) | **yes** | `wa_flow_upsert` |
| `PATCH`/`PUT` | `core` | `/whatsapp_flows/:id` | `api/v1/accounts/whatsapp_flows#update` | `whatsapp_flow:update?` (admin) | `id*`, `whatsapp_flow*: { name, categories: [], flow_json: {}, endpoint_uri: {} }` | write + **irreversible** | **yes** | `wa_flow_upsert` |
| `POST` | `core` | `/whatsapp_flows/:id/publish` | `api/v1/accounts/whatsapp_flows#publish` | `whatsapp_flow:publish?` (admin) | `id*` | write + **irreversible** (publishes flow on Meta; published flows cannot be edited) | **yes** | `wa_flow_upsert` |
| `POST` | `core` | `/whatsapp_flows/:id/deprecate` | `api/v1/accounts/whatsapp_flows#deprecate` | `whatsapp_flow:deprecate?` (admin) | `id*` | write + **irreversible** | **yes** | `wa_flow_upsert` |
| `POST` | `core` | `/whatsapp_flows/:id/sync` | `api/v1/accounts/whatsapp_flows#sync` | `whatsapp_flow:sync?` (admin) | `id*` | write | **yes** | `wa_flow_upsert` |
| `DELETE` | `core` | `/whatsapp_flows/:id` | `api/v1/accounts/whatsapp_flows#destroy` | `whatsapp_flow:destroy?` (admin) | `id*` | write + **irreversible** (deletes draft flow on Meta) | no | `wa_flow_upsert` |

## 2. Quirks & Non-Obvious Behaviour

1. **Template create rolls back on Meta failure; template update does not**:
   - `MessageTemplatesController#create` saves a draft locally, calls `Whatsapp::TemplateCreationService#perform` when `inbox_id` is attached, and destroys the local record if Meta rejects submission (`422 { error: ... }`).
   - `MessageTemplatesController#update` locks `name`, `language`, `inbox_id`, and `channel_type` once `platform_template_id` is present (`LOCKED_AFTER_SUBMISSION`). For already-published templates, it validates and submits to Meta first so a failed Meta edit leaves the existing template untouched.
2. **Template deletion deletes by `name` + `hsm_id` at Meta**:
   - `MessageTemplatesController#destroy` calls `FacebookApiClient#delete_template(channel.messaging_account_id, name, hsm_id: platform_template_id)`. Requires `confirm: true` after previewing the template's `name`, `language`, `category`, and `status`.
3. **Scheduled WhatsApp messages use conversation `display_id` and Unix epoch `scheduled_at`**:
   - `Saas::Api::V1::ScheduledWhatsappMessagesController#set_conversation` finds the conversation by `display_id: params[:conversation_id]`.
   - `Saas::ScheduledWhatsappMessageEligibilityService` validates that the conversation is on a WhatsApp inbox, the contact has a valid identifier, `scheduled_at` is in the future, and either free-form `content` (within the 24h customer service window) or `template_params` is valid.
   - `update` and `destroy` only succeed while `status == 'pending'`; otherwise they return `422 { error: "not_pending" }`.
4. **Campaign intelligence & consent feature flag**:
   - `/campaigns/:id/suppressions`, `/campaigns/intelligence`, `/campaigns/whatsapp_inbox_summaries`, `/campaigns/send_plan`, `/campaigns/qualified_audience_*`, `/campaign_intelligence_reports`, and `/whatsapp_contact_preferences*` check `Current.account.feature_enabled?(:whatsapp_campaign_intelligence)` and return `403 { error: "WhatsApp campaign intelligence is not enabled" }` when disabled.
   - `ApiError.isPlanGate` should also recognize `"is not enabled"` on `403` responses so callers get a clear feature-flag explanation.
5. **WebRTC / onboarding-only endpoints left in catalog (`airyschat_api`)**:
   - `/whatsapp_calls/initiate`, `/accept`, `/reject`, `/terminate`, `/upload_recording` require live browser WebRTC SDP offers/answers (`sdp_offer` / `sdp_answer`) or binary audio uploads.
   - `/whatsapp/authorization`, `/whatsapp/concepto_signup`, `/whatsapp/twilio_signup*`, `/whatsapp/number_checks`, `/whatsapp/signup_route`, and `/salvy/*` are interactive WABA embedded-signup / number-provisioning flows.
   - Legacy Captain copywriting endpoints (`/campaigns/audience_suggest`, `/campaigns/generate_copy`) and stickers (`/whatsapp_stickers*`) remain reachable via `airyschat_api`.
