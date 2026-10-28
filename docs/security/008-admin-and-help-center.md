# Security Review — Lane 008 (`008-admin-and-help-center`)

- **Date**: 2026-10-28
- **Lane tasks**: `ADM-04` (`#142`, `NEEDS_SECURITY_REVIEW`), `ADM-02..ADM-07`
- **Reviewer**: `safety-reviewer` checklist (ADR 0002, ADR 0003, ADR 0005, `.agents/rules/secrets-and-evidence.md`)

## 1. Threat Model & Scope

Lane 008 introduces two opt-in toolsets:
1. **`admin`** (`packages/server/src/tools/admin.ts`) — account administration: inboxes, inbox members, agents, teams, team members, automation rules, macros, webhooks, integration hooks, custom attributes, SLA policies, assignment policies, labels, canned responses, custom filters, account settings, and audit logs.
2. **`help_center`** (`packages/server/src/tools/help_center.ts`) — portals, categories, and articles (CRUD, publish, bulk status/category/delete).

Three security surfaces require explicit controls:
- **Outbound SSRF via webhooks and integration hooks (`ADM-04`)**: AirysChat's Sidekiq workers deliver webhook POSTs (`WebhooksController`) and integration hook callbacks (`Integrations::HooksController`) to administrator-configured URLs. An unvalidated URL could target cloud metadata (`169.254.169.254`, `metadata.google.internal`), localhost services (`127.0.0.1`, `::1`), or RFC1918 internal networks (`10/8`, `172.16/12`, `192.168/16`).
- **Prompt injection via untrusted text**: Automation rules, macros, canned responses, audit logs, and help center portals/categories/articles can contain user- or customer-authored text.
- **Irreversible administrative mutations**: Deleting inboxes, agents, teams, rules, macros, webhooks, hooks, custom attributes, SLA policies, labels, canned responses, custom filters, portals, categories, or articles; inviting external agents by email; executing macros across conversations; or publishing help center articles to the public portal.

## 2. Controls Verified

### 2.1 Anti-SSRF Webhook & Integration Hook URL Validation (`ADM-04`)

Implemented in [`validateWebhookUrl`](file:///Users/gabrielholanda/airyschat-mcp/packages/server/src/tools/admin.ts#L34-L128) and [`validateHookSettingsUrls`](file:///Users/gabrielholanda/airyschat-mcp/packages/server/src/tools/admin.ts#L133-L147):
- **Scheme**: Requires `https:` (`parsed.protocol === 'https:'`); rejects `http:`, `file:`, `ftp:`, `javascript:`, `data:`, etc.
- **Credentials**: Rejects URLs containing `username` or `password` (`https://user:pass@example.com`).
- **Internal hostnames**: Rejects `localhost`, `*.localhost`, `*.local`, `*.internal`, `metadata`, `metadata.google.internal`, `instance-data`, and single-label hostnames (`https://intranet/hook`).
- **IPv4 ranges**: Rejects `0.0.0.0/8` (current network), `10.0.0.0/8`, `127.0.0.0/8` (loopback, including integer/hex/octal forms normalized by WHATWG `URL`), `169.254.0.0/16` (link-local / cloud metadata), `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` (CGNAT), `192.0.0.0/24`, `192.0.2.0/24`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, and `224.0.0.0/3` (multicast/reserved).
- **IPv6 ranges**: Rejects `::1`, `::`, `fe80::/10` (link-local), `fc00::/7` (`fc00:`/`fd00:` unique-local), `ff00::/8` (multicast), `2001:db8::/32` (documentation), and `::ffff:0:0/96` (IPv4-mapped IPv6).
- **Recursive settings inspection**: `integration_hook_upsert` inspects every nested key/value in `settings` and validates any key matching `/(?:^|_)(?:url|uri|endpoint|webhook|callback)$/i` or any string value starting with `http://` or `https://`.

### 2.2 Untrusted Content Fencing

- `automation_rules_list`, `automation_rule_upsert`, `macros_list`, `macro_upsert`, `canned_response_upsert`, `audit_logs_list`, `portals_list`, `portal_get`, `portal_upsert` (create/update), `categories_list`, `category_upsert` (create/update), `articles_list`, `article_get`, `article_upsert` (create/update), and `article_publish` (single article) all return through `untrustedJson`.

### 2.3 Write Declarations & Confirmation Gates

- Every mutating tool in `admin` and `help_center` sets `write: true` and `stability: 'beta'`.
- All destructive, external-email, or public-publishing tools set `irreversible: true` and gate execution with `requireConfirmation`:
  - `inbox_delete`, `inbox_members_sync` (`set`/`remove`), `agent_invite`, `agent_delete`, `team_delete`, `team_members_sync` (`set`/`remove`), `automation_rule_delete`, `macro_execute`, `macro_delete`, `webhook_delete`, `integration_hook_delete`, `custom_attribute_delete`, `sla_policy_delete`, `assignment_policy_upsert` (`delete`), `label_delete`, `canned_response_delete`, `custom_filter_delete`
  - `portal_upsert` (`archive`/`send_instructions`/`delete`), `category_delete`, `article_publish`, `article_delete`

## 3. Verdict

**Approved (`ADM-04`)** — All SSRF vectors, untrusted content boundaries, and irreversible confirmation gates are enforced and covered by automated unit tests in [`packages/server/test/admin-and-help-center.test.ts`](file:///Users/gabrielholanda/airyschat-mcp/packages/server/test/admin-and-help-center.test.ts).
