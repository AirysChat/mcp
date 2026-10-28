# 008 — Admin & help center · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| ADM-01 | P0 | M | Domain briefs `admin.md`, `help_center.md` | reviewed (`docs/api/domains/admin.md`, `docs/api/domains/help_center.md`) | Done |
| ADM-02 | P0 | L | Inboxes, agents, teams (CRUD + members) | staging evidence (`inbox_get`, `team_get`, `inbox_upsert`, `inbox_delete`, `inbox_members_sync`, `agent_invite`, `agent_update`, `agent_delete`, `team_upsert`, `team_delete`, `team_members_sync`) | Done |
| ADM-03 | P1 | M | Automation rules, macros | staging evidence (`automation_rules_list`, `automation_rule_upsert`, `automation_rule_delete`, `macros_list`, `macro_upsert`, `macro_execute`, `macro_delete`) | Done |
| ADM-04 | P0 | M | Webhooks + integrations hooks with URL validation | tests reject internal hosts (`validateWebhookUrl`, `validateHookSettingsUrls`, `docs/security/008-admin-and-help-center.md`) | Done |
| ADM-05 | P1 | M | Custom attributes, SLA policies, labels CRUD, canned responses CRUD | staging evidence (`custom_attributes_list`, `custom_attribute_upsert`, `custom_attribute_delete`, `sla_policies_list`, `sla_policy_upsert`, `sla_policy_delete`, `assignment_policies_list`, `assignment_policy_upsert`, `label_upsert`, `label_delete`, `canned_response_upsert`, `canned_response_delete`, `custom_filter_upsert`, `custom_filter_delete`) | Done |
| ADM-06 | P2 | S | Account settings, audit logs read | live readback (`account_settings_get`, `account_settings_update`, `audit_logs_list`) | Done |
| ADM-07 | P0 | L | `help_center`: portals, categories, articles CRUD + publish, search | cycle on staging (`portals_list`, `portal_get`, `portal_upsert`, `categories_list`, `category_upsert`, `category_delete`, `articles_list`, `article_get`, `article_upsert`, `article_publish`, `article_delete`) | Done |
| ADM-08 | P1 | S | Skill `account-audit` | shipped (`plugins/claude/skills/account-audit/SKILL.md`) and verified on staging | Done |
| ADM-09 | P0 | XS | Promotions, changeset, coverage | `inventory:check` green (`355` curated endpoints, `205` tools, `.changeset/008-admin-and-help-center.md`) | Done |
