# Domain Brief — `admin` (v0.8.0, Lane 008)

- **Source**: `AirysChat@c9ea590d8c` (`origin/develop`)
- **Date**: 2026-10-28
- **Lane task**: `ADM-01` (feeds `ADM-02..ADM-06` in lane 008)
- **Prefixes**:
  - `core` (`/api/v1/accounts/:account_id/*` — inboxes, inbox members, agents, teams, team members, automation rules, macros, webhooks, integrations/apps & hooks, custom attribute definitions, SLA policies, applied SLAs, assignment policies, labels, canned responses, custom filters, notification settings, branded email layout, audit logs)
  - `raw` (`/api/v1/accounts/:id` — account settings show & update)

## 1. Endpoint Catalog & Parameters

### 1.1 Inboxes, Agents & Teams (`Api::V1::Accounts::InboxesController`, `InboxMembersController`, `AgentsController`, `TeamsController`, `TeamMembersController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `core` | `/inboxes` | `api/v1/accounts/inboxes#index` | `inbox:index?` | none | read | no | `inboxes_list` (0.1.0) |
| `GET` | `core` | `/inboxes/:id` | `api/v1/accounts/inboxes#show` | `inbox:show?` | `id*` | read | no | `inbox_get` |
| `GET` | `core` | `/inboxes/:id/assignable_agents` | `api/v1/accounts/inboxes#assignable_agents` | `inbox:assignable_agents?` | `id*` | read | no | `inbox_get` |
| `GET` | `core` | `/inboxes/:id/agent_bot` | `api/v1/accounts/inboxes#agent_bot` | `inbox:agent_bot?` | `id*` | read | no | `inbox_get` |
| `POST` | `core` | `/inboxes` | `api/v1/accounts/inboxes#create` | `inbox:create?` (admin) | `name*`, `channel*: { type*: 'web_widget'\|'api'\|'email'\|'line'\|'telegram'\|'whatsapp'\|'sms'\|'rcs', ... }`, `greeting_enabled`, `greeting_message`, `enable_auto_assignment`, `working_hours_enabled`, `out_of_office_message`, `timezone`, `allow_messages_after_resolved`, `lock_to_single_conversation`, `portal_id`, `sender_name_type`, `business_name` | write | no | `inbox_upsert` |
| `PATCH`/`PUT` | `core` | `/inboxes/:id` | `api/v1/accounts/inboxes#update` | `inbox:update?` (admin) | `id*`, `name`, `greeting_enabled`, `greeting_message`, `enable_email_collect`, `csat_survey_enabled`, `csat_config`, `enable_auto_assignment`, `working_hours_enabled`, `working_hours`, `out_of_office_message`, `timezone`, `allow_messages_after_resolved`, `lock_to_single_conversation`, `portal_id`, `sender_name_type`, `business_name`, `disabled`, `channel` | write | no | `inbox_upsert` |
| `POST` | `core` | `/inboxes/:id/set_agent_bot` | `api/v1/accounts/inboxes#set_agent_bot` | `inbox:set_agent_bot?` (admin) | `id*`, `agent_bot` (bot ID or `null` to clear) | write | no | `inbox_upsert` |
| `DELETE` | `core` | `/inboxes/:id` | `api/v1/accounts/inboxes#destroy` | `inbox:destroy?` (admin) | `id*` | write + **irreversible** (enqueues `DeleteObjectJob` destroying inbox and its conversations) | no | `inbox_delete` |
| `GET` | `core` | `/inbox_members/:inbox_id` | `api/v1/accounts/inbox_members#show` | `inbox:show?` | `inbox_id*` | read | no | `inbox_get` |
| `POST` | `core` | `/inbox_members` | `api/v1/accounts/inbox_members#create` | `inbox:create?` (admin) | `inbox_id*`, `user_ids*` (`number[]`) | write | no | `inbox_members_sync` |
| `PATCH` | `core` | `/inbox_members` | `api/v1/accounts/inbox_members#update` | `inbox:update?` (admin) | `inbox_id*`, `user_ids*` (`number[]`, replaces set) | write + **irreversible** | no | `inbox_members_sync` |
| `DELETE` | `core` | `/inbox_members` | `api/v1/accounts/inbox_members#destroy` | `inbox:destroy?` (admin) | `inbox_id*`, `user_ids*` (`number[]`) | write + **irreversible** | no | `inbox_members_sync` |
| `GET` | `core` | `/agents` | `api/v1/accounts/agents#index` | `user:index?` | none | read | no | `agents_list` (0.1.0) |
| `POST` | `core` | `/agents` | `api/v1/accounts/agents#create` | `user:create?` (admin) | `email*`, `name*`, `role*` (`agent`\|`administrator`), `availability`, `auto_offline` (wrapped in `agent`) | write + **irreversible** (sends external invitation email) | no | `agent_invite` |
| `POST` | `core` | `/agents/bulk_create` | `api/v1/accounts/agents#bulk_create` | `user:bulk_create?` (admin) | `emails*` (`string[]`) | write + **irreversible** (sends external invitation emails) | no | `agent_invite` |
| `PATCH`/`PUT` | `core` | `/agents/:id` | `api/v1/accounts/agents#update` | `user:update?` (admin) | `id*`, `name`, `role` (`agent`\|`administrator`), `availability` (`online`\|`offline`\|`busy`), `auto_offline` | write | no | `agent_update` |
| `DELETE` | `core` | `/agents/:id` | `api/v1/accounts/agents#destroy` | `user:destroy?` (admin) | `id*` | write + **irreversible** (removes account user and enqueues `DeleteObjectJob` if last account) | no | `agent_delete` |
| `GET` | `core` | `/teams` | `api/v1/accounts/teams#index` | `team:index?` | none | read | no | `teams_list` (0.1.0) |
| `GET` | `core` | `/teams/:id` | `api/v1/accounts/teams#show` | `team:show?` | `id*` | read | no | `team_get` |
| `POST` | `core` | `/teams` | `api/v1/accounts/teams#create` | `team:create?` (admin) | `team*: { name*, description, allow_auto_assign, icon, icon_color }` | write | no | `team_upsert` |
| `PATCH`/`PUT` | `core` | `/teams/:id` | `api/v1/accounts/teams#update` | `team:update?` (admin) | `id*`, `team*: { name, description, allow_auto_assign, icon, icon_color }` | write | no | `team_upsert` |
| `DELETE` | `core` | `/teams/:id` | `api/v1/accounts/teams#destroy` | `team:destroy?` (admin) | `id*` | write + **irreversible** | no | `team_delete` |
| `GET` | `core` | `/teams/:team_id/team_members` | `api/v1/accounts/team_members#index` | `team:index?` | `team_id*` | read | no | `team_get` |
| `POST` | `core` | `/teams/:team_id/team_members` | `api/v1/accounts/team_members#create` | `team:create?` (admin) | `team_id*`, `user_ids*` (`number[]`) | write | no | `team_members_sync` |
| `PATCH` | `core` | `/teams/:team_id/team_members` | `api/v1/accounts/team_members#update` | `team:update?` (admin) | `team_id*`, `user_ids*` (`number[]`, replaces set) | write + **irreversible** | no | `team_members_sync` |
| `DELETE` | `core` | `/teams/:team_id/team_members` | `api/v1/accounts/team_members#destroy` | `team:destroy?` (admin) | `team_id*`, `user_ids*` (`number[]`) | write + **irreversible** | no | `team_members_sync` |

### 1.2 Automation Rules & Macros (`Api::V1::Accounts::AutomationRulesController`, `MacrosController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `core` | `/automation_rules` | `api/v1/accounts/automation_rules#index` | `automation_rule:index?` (admin) | none | read | **yes** (action message params) | `automation_rules_list` |
| `GET` | `core` | `/automation_rules/:id` | `api/v1/accounts/automation_rules#show` | `automation_rule:show?` (admin) | `id*` | read | **yes** | `automation_rules_list` |
| `POST` | `core` | `/automation_rules` | `api/v1/accounts/automation_rules#create` | `automation_rule:create?` (admin) | `name*`, `description`, `event_name*` (`conversation_created`\|`conversation_updated`\|`message_created`\|`conversation_opened`\|`conversation_resolved`), `active`, `conditions*` (`array`), `actions*` (`array`) | write | **yes** | `automation_rule_upsert` |
| `PATCH`/`PUT` | `core` | `/automation_rules/:id` | `api/v1/accounts/automation_rules#update` | `automation_rule:update?` (admin) | `id*`, `name`, `description`, `event_name`, `active`, `conditions`, `actions` | write | **yes** | `automation_rule_upsert` |
| `POST` | `core` | `/automation_rules/:automation_rule_id/clone` | `api/v1/accounts/automation_rules#clone` | `automation_rule:clone?` (admin) | `automation_rule_id*` | write | **yes** | `automation_rule_upsert` |
| `DELETE` | `core` | `/automation_rules/:id` | `api/v1/accounts/automation_rules#destroy` | `automation_rule:destroy?` (admin) | `id*` | write + **irreversible** | no | `automation_rule_delete` |
| `GET` | `core` | `/macros` | `api/v1/accounts/macros#index` | authenticated agent/admin | none | read | **yes** | `macros_list` |
| `GET` | `core` | `/macros/:id` | `api/v1/accounts/macros#show` | `macro:show?` | `id*` | read | **yes** | `macros_list` |
| `POST` | `core` | `/macros` | `api/v1/accounts/macros#create` | authenticated agent/admin | `name*`, `visibility*` (`global`\|`personal`), `actions*` (`array`) | write | **yes** | `macro_upsert` |
| `PATCH`/`PUT` | `core` | `/macros/:id` | `api/v1/accounts/macros#update` | `macro:update?` | `id*`, `name`, `visibility`, `actions` | write | **yes** | `macro_upsert` |
| `POST` | `core` | `/macros/:id/execute` | `api/v1/accounts/macros#execute` | `macro:execute?` | `id*`, `conversation_ids*` (`number[]`) | write + **irreversible** (enqueues `MacrosExecutionJob` across target conversations) | no | `macro_execute` |
| `DELETE` | `core` | `/macros/:id` | `api/v1/accounts/macros#destroy` | `macro:destroy?` | `id*` | write + **irreversible** | no | `macro_delete` |

### 1.3 Webhooks & Integrations (`Api::V1::Accounts::WebhooksController`, `Integrations::AppsController`, `Integrations::HooksController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `core` | `/webhooks` | `api/v1/accounts/webhooks#index` | `webhook:index?` (admin) | none | read | no | `webhooks_list` |
| `POST` | `core` | `/webhooks` | `api/v1/accounts/webhooks#create` | `webhook:create?` (admin) | `webhook*: { url*, name, inbox_id, subscriptions*: string[] }` | write (anti-SSRF URL validation required) | no | `webhook_upsert` |
| `PATCH`/`PUT` | `core` | `/webhooks/:id` | `api/v1/accounts/webhooks#update` | `webhook:update?` (admin) | `id*`, `webhook*: { url, name, inbox_id, subscriptions: string[] }` | write (anti-SSRF URL validation required) | no | `webhook_upsert` |
| `DELETE` | `core` | `/webhooks/:id` | `api/v1/accounts/webhooks#destroy` | `webhook:destroy?` (admin) | `id*` | write + **irreversible** | no | `webhook_delete` |
| `GET` | `core` | `/integrations/apps` | `api/v1/accounts/integrations/apps#index` | authenticated agent/admin | none | read | no | `integrations_list` |
| `GET` | `core` | `/integrations/apps/:id` | `api/v1/accounts/integrations/apps#show` | authenticated agent/admin | `id*` (slug, e.g. `webhooks`, `openai`, `slack`, `linear`, `dialogflow`) | read | no | `integrations_list` |
| `GET` | `core` | `/integrations/hooks/:id` | `api/v1/accounts/integrations/hooks#show` | `hook:show?` (admin) | `id*` | read | no | `integrations_list` |
| `POST` | `core` | `/integrations/hooks` | `api/v1/accounts/integrations/hooks#create` | `hook:create?` (admin) | `hook*: { app_id*, inbox_id, status, settings: {} }` | write (anti-SSRF URL validation on any URL in `settings`) | no | `integration_hook_upsert` |
| `PATCH`/`PUT` | `core` | `/integrations/hooks/:id` | `api/v1/accounts/integrations/hooks#update` | `hook:update?` (admin) | `id*`, `hook*: { status, settings: {} }` | write (anti-SSRF URL validation on any URL in `settings`) | no | `integration_hook_upsert` |
| `DELETE` | `core` | `/integrations/hooks/:id` | `api/v1/accounts/integrations/hooks#destroy` | `hook:destroy?` (admin) | `id*` | write + **irreversible** | no | `integration_hook_delete` |

### 1.4 Custom Attributes, SLA Policies, Assignment Policies, Labels, Canned Responses & Custom Filters

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `core` | `/custom_attribute_definitions` | `api/v1/accounts/custom_attribute_definitions#index` | `custom_attribute_definition:index?` | `attribute_model` (`0`\|`conversation_attribute`\|`1`\|`contact_attribute`) | read | no | `custom_attributes_list` |
| `GET` | `core` | `/custom_attribute_definitions/:id` | `api/v1/accounts/custom_attribute_definitions#show` | `custom_attribute_definition:show?` | `id*` | read | no | `custom_attributes_list` |
| `POST` | `core` | `/custom_attribute_definitions` | `api/v1/accounts/custom_attribute_definitions#create` | `custom_attribute_definition:create?` (admin) | `custom_attribute_definition*: { attribute_display_name*, attribute_key*, attribute_display_type*, attribute_model*, attribute_description, regex_pattern, regex_cue, attribute_values: [] }` | write | no | `custom_attribute_upsert` |
| `PATCH`/`PUT` | `core` | `/custom_attribute_definitions/:id` | `api/v1/accounts/custom_attribute_definitions#update` | `custom_attribute_definition:update?` (admin) | `id*`, `custom_attribute_definition*: { attribute_display_name, attribute_description, regex_pattern, regex_cue, attribute_values: [] }` | write | no | `custom_attribute_upsert` |
| `DELETE` | `core` | `/custom_attribute_definitions/:id` | `api/v1/accounts/custom_attribute_definitions#destroy` | `custom_attribute_definition:destroy?` (admin) | `id*` | write + **irreversible** | no | `custom_attribute_delete` |
| `GET` | `core` | `/sla_policies` | `api/v1/accounts/sla_policies#index` | admin (Enterprise) | none | read | no | `sla_policies_list` |
| `GET` | `core` | `/sla_policies/:id` | `api/v1/accounts/sla_policies#show` | admin (Enterprise) | `id*` | read | no | `sla_policies_list` |
| `GET` | `core` | `/applied_slas` | `api/v1/accounts/applied_slas#index` | admin (Enterprise) | `since`, `until`, `inbox_id`, `team_id`, `sla_policy_id`, `assigned_agent_id`, `label_list`, `page` | read | no | `sla_policies_list` |
| `GET` | `core` | `/applied_slas/metrics` | `api/v1/accounts/applied_slas#metrics` | admin (Enterprise) | `since`, `until`, `inbox_id`, `team_id`, `sla_policy_id`, `assigned_agent_id`, `label_list` | read | no | `sla_policies_list` |
| `GET` | `core` | `/applied_slas/download` | `api/v1/accounts/applied_slas#download` | admin (Enterprise) | `since`, `until`, `inbox_id`, `team_id`, `sla_policy_id`, `assigned_agent_id`, `label_list` | read | no | `sla_policies_list` |
| `POST` | `core` | `/sla_policies` | `api/v1/accounts/sla_policies#create` | admin (Enterprise) | `sla_policy*: { name*, description, first_response_time_threshold, next_response_time_threshold, resolution_time_threshold, only_during_business_hours }` | write | no | `sla_policy_upsert` |
| `PATCH`/`PUT` | `core` | `/sla_policies/:id` | `api/v1/accounts/sla_policies#update` | admin (Enterprise) | `id*`, `sla_policy*: { name, description, first_response_time_threshold, next_response_time_threshold, resolution_time_threshold, only_during_business_hours }` | write | no | `sla_policy_upsert` |
| `DELETE` | `core` | `/sla_policies/:id` | `api/v1/accounts/sla_policies#destroy` | admin (Enterprise) | `id*` | write + **irreversible** | no | `sla_policy_delete` |
| `GET` | `core` | `/assignment_policies` | `api/v1/accounts/assignment_policies#index` | `assignment_policy:index?` | none | read | no | `assignment_policies_list` |
| `GET` | `core` | `/assignment_policies/:id` | `api/v1/accounts/assignment_policies#show` | `assignment_policy:show?` | `id*` | read | no | `assignment_policies_list` |
| `GET` | `core` | `/assignment_policies/:assignment_policy_id/inboxes` | `api/v1/accounts/assignment_policies/inboxes#index` | `assignment_policy:show?` | `assignment_policy_id*` | read | no | `assignment_policies_list` |
| `GET` | `core` | `/inboxes/:inbox_id/assignment_policy` | `api/v1/accounts/inboxes/assignment_policies#show` | `assignment_policy:show?` | `inbox_id*` | read | no | `assignment_policies_list` |
| `POST` | `core` | `/assignment_policies` | `api/v1/accounts/assignment_policies#create` | `assignment_policy:create?` (admin) | `assignment_policy*: { name*, description, assignment_order, conversation_priority, fair_distribution_limit, fair_distribution_window, enabled, exclude_older_than_hours }` | write | no | `assignment_policy_upsert` |
| `PATCH`/`PUT` | `core` | `/assignment_policies/:id` | `api/v1/accounts/assignment_policies#update` | `assignment_policy:update?` (admin) | `id*`, `assignment_policy*: { ... }` | write | no | `assignment_policy_upsert` |
| `POST` | `core` | `/inboxes/:inbox_id/assignment_policy` | `api/v1/accounts/inboxes/assignment_policies#create` | `assignment_policy:create?` (admin) | `inbox_id*`, `assignment_policy_id*` | write | no | `assignment_policy_upsert` |
| `DELETE` | `core` | `/inboxes/:inbox_id/assignment_policy` | `api/v1/accounts/inboxes/assignment_policies#destroy` | `assignment_policy:destroy?` (admin) | `inbox_id*` | write | no | `assignment_policy_upsert` |
| `DELETE` | `core` | `/assignment_policies/:id` | `api/v1/accounts/assignment_policies#destroy` | `assignment_policy:destroy?` (admin) | `id*` | write + **irreversible** | no | `assignment_policy_upsert` |
| `GET` | `core` | `/labels/:id` | `api/v1/accounts/labels#show` | `label:show?` | `id*` | read | no | `label_upsert` |
| `POST` | `core` | `/labels` | `api/v1/accounts/labels#create` | `label:create?` (admin) | `label*: { title*, description, color, show_on_sidebar }` | write | no | `label_upsert` |
| `PATCH`/`PUT` | `core` | `/labels/:id` | `api/v1/accounts/labels#update` | `label:update?` (admin) | `id*`, `label*: { title, description, color, show_on_sidebar }` | write | no | `label_upsert` |
| `DELETE` | `core` | `/labels/:id` | `api/v1/accounts/labels#destroy` | `label:destroy?` (admin) | `id*` | write + **irreversible** (removes label from all conversations/contacts via `Labels::RemoveAssociationsJob`) | no | `label_delete` |
| `POST` | `core` | `/canned_responses` | `api/v1/accounts/canned_responses#create` | authenticated agent/admin | `canned_response*: { short_code*, content* }` | write | **yes** | `canned_response_upsert` |
| `PATCH`/`PUT` | `core` | `/canned_responses/:id` | `api/v1/accounts/canned_responses#update` | authenticated agent/admin | `id*`, `canned_response*: { short_code, content }` | write | **yes** | `canned_response_upsert` |
| `DELETE` | `core` | `/canned_responses/:id` | `api/v1/accounts/canned_responses#destroy` | authenticated agent/admin | `id*` | write + **irreversible** | no | `canned_response_delete` |
| `POST` | `core` | `/custom_filters` | `api/v1/accounts/custom_filters#create` | authenticated agent/admin | `custom_filter*: { name*, filter_type, query*: {} }` | write | no | `custom_filter_upsert` |
| `PATCH`/`PUT` | `core` | `/custom_filters/:id` | `api/v1/accounts/custom_filters#update` | authenticated agent/admin | `id*`, `custom_filter*: { name, filter_type, query: {} }` | write | no | `custom_filter_upsert` |
| `DELETE` | `core` | `/custom_filters/:id` | `api/v1/accounts/custom_filters#destroy` | authenticated agent/admin | `id*` | write + **irreversible** | no | `custom_filter_delete` |

### 1.5 Account Settings & Audit Logs (`Api::V1::AccountsController`, `NotificationSettingsController`, `BrandedEmailLayoutsController`, `AuditLogsController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `raw` | `/api/v1/accounts/:id` | `api/v1/accounts#show` | `account:show?` | `id*` | read | no | `account_settings_get` |
| `GET` | `core` | `/notification_settings` | `api/v1/accounts/notification_settings#show` | authenticated user | none | read | no | `account_settings_get` |
| `GET` | `core` | `/branded_email_layout` | `api/v1/accounts/branded_email_layouts#show` | `account:show?` (admin) | none | read | no | `account_settings_get` |
| `PATCH`/`PUT` | `raw` | `/api/v1/accounts/:id` | `api/v1/accounts#update` | `account:update?` (admin) | `name`, `locale`, `domain`, `support_email`, `auto_resolve_after`, `auto_resolve_message`, `auto_resolve_ignore_waiting`, `audio_transcriptions`, `auto_resolve_label`, `industry`, `company_size`, `timezone` | write | no | `account_settings_update` |
| `PATCH`/`PUT` | `core` | `/notification_settings` | `api/v1/accounts/notification_settings#update` | authenticated user | `notification_settings*: { selected_email_flags: string[], selected_push_flags: string[] }` | write | no | `account_settings_update` |
| `PATCH`/`PUT` | `core` | `/branded_email_layout` | `api/v1/accounts/branded_email_layouts#update` | `account:update?` (admin) | `branded_email_layout` | write | no | `account_settings_update` |
| `GET` | `core` | `/audit_logs` | `api/v1/accounts/audit_logs#show` | admin (Enterprise) | `page` | read | **yes** | `audit_logs_list` |

## 2. Quirks & Non-Obvious Behaviour

1. **`InboxMembersController` vs `TeamMembersController` routing asymmetry**:
   - `InboxMembersController` takes `:inbox_id` in the path ONLY on `GET /inbox_members/:inbox_id`; `POST /inbox_members`, `PATCH /inbox_members`, and `DELETE /inbox_members` take `inbox_id` and `user_ids` in the JSON body!
   - Furthermore, `InboxMembersController#current_agents_ids` calls `@inbox.members.pluck(:id)` (Wait: `@inbox.members` is `has_many :members, through: :inbox_members, source: :user` or `inbox_members` — let's note that `PATCH /inbox_members` and `PATCH /teams/:team_id/team_members` compute diffs against `user_ids`).
   - `TeamMembersController` takes `:team_id` in the path for all four verbs (`GET`, `POST`, `PATCH`, `DELETE /teams/:team_id/team_members`) and `user_ids: number[]` in the JSON body.
2. **Webhook & Integration Hook SSRF surface (`ADM-04`)**:
   - `WebhooksController` (`webhook[url]`) and `Integrations::HooksController` (`hook[settings]`) accept outbound callback URLs that AirysChat's Sidekiq workers will POST to on conversation/message events.
   - `webhook_upsert` and `integration_hook_upsert` MUST validate all URLs via `validateWebhookUrl` before calling AirysChat, rejecting non-HTTPS schemes, embedded credentials, `localhost`, `.local`/`.internal`, RFC1918 private IPv4 (`10/8`, `172.16/12`, `192.168/16`), loopback (`127/8`, `::1`), link-local / cloud metadata (`169.254/16`, `metadata.google.internal`), CGNAT (`100.64/10`), and IPv6 ULA/link-local (`fc00::/7`, `fe80::/10`).
3. **Enterprise-only routes (`sla_policies`, `applied_slas`, `audit_logs`) on AirysChat**:
   - `config/routes.rb` registers `/sla_policies`, `/applied_slas`, and `/audit_logs`, but on AirysChat deployments where `Api::V1::Accounts::SlaPoliciesController` / `AuditLogsController` are not mounted, upstream returns `404 {"status":404,"error":"Not Found"}`.
   - `sla_policies_list`, `sla_policy_upsert`, `sla_policy_delete`, and `audit_logs_list` remain `beta` and surface a clear explanation when upstream responds with HTTP `404`.
4. **Destructive background jobs**:
   - `DELETE /inboxes/:id` enqueues `DeleteObjectJob.perform_later(@inbox, ...)` and returns `200 { message: ... }`.
   - `DELETE /labels/:id` destroys the label and enqueues `Labels::RemoveAssociationsJob` to strip the label title from all conversations and contacts on the account.
   - `POST /macros/:id/execute` enqueues `MacrosExecutionJob` across `conversation_ids`. All three require `irreversible: true` + `requireConfirmation`.
