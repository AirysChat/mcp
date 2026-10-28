# 008 — Admin & Help Center · Verification Evidence

- **Date**: 2026-10-28
- **Target host**: `https://staging.airys.app` (account `6` — Airys Demo, fictitious data)
- **Local suite**: `pnpm check` (`51/51` unit tests, `66/66` smoke checks, `807` endpoints / `205` tools consistent)

## 1. Automated Verification (`ADM-02..ADM-07`, `ADM-09`)

| Check | Target | Result |
|---|---|---|
| `validateWebhookUrl` & `validateHookSettingsUrls` (`ADM-04`) | `packages/server/test/admin-and-help-center.test.ts` | Rejects `http://`, embedded credentials, `localhost`, `.local`, `.internal`, `metadata.google.internal`, `0.0.0.0/8`, `10/8`, `127/8` (dotted, decimal, hex), `169.254/16`, `172.16/12`, `192.168/16`, `100.64/10`, `224/3`, `::1`, `fe80::/10`, `fc00::/7`, and `::ffff:0:0/96` |
| `admin` toolset handlers (`ADM-02..ADM-06`) | `packages/server/test/admin-and-help-center.test.ts` | 41 tools verified across inboxes, agents, teams, automation rules, macros, webhooks, integrations, custom attributes, SLA policies, assignment policies, labels, canned responses, custom filters, account settings, and audit logs |
| `help_center` toolset handlers (`ADM-07`) | `packages/server/test/admin-and-help-center.test.ts` + `packages/server/scripts/smoke.mjs` | 11 tools verified (`portals_list`, `portal_get`, `portal_upsert`, `categories_list`, `category_upsert`, `category_delete`, `articles_list`, `article_get`, `article_upsert`, `article_publish`, `article_delete`) |
| Coverage & catalog (`ADM-09`) | `pnpm inventory:check` | `807` endpoints, `205` tools (`355` curated endpoints, `44%` total / `46%` of Mappable) |

## 2. Live Staging Verification (`https://staging.airys.app`, Account `6`)

All ephemeral records created during verification were deleted in the same run (`deleted: true`). No customer or tenant PII was read or logged.

| Tool | Arguments (sanitized) | HTTP Status | Sanitized Result Summary |
|---|---|---|---|
| `account_settings_get` | `{ include_notification_settings: true }` | `200` | Returned `account` (`id: 6`, `settings`, `features`, `locale`) and `notification_settings` (`selected_email_flags`, `selected_push_flags`) |
| `inbox_get` | `{ inbox_id: 9, include_members: true, include_assignable_agents: true, include_agent_bot: true }` | `200` | Returned `inbox` (`id: 9`), `members` (`4` agents), `assignable_agents`, and `agent_bot` |
| `team_get` | `{ team_id: 4 }` | `200` | Returned `team` (`id: 4`) and `members` (`3` agents) |
| `automation_rules_list` | `{}` | `200` | Returned `_untrusted` + `payload` array |
| `macros_list` | `{}` | `200` | Returned `_untrusted` + `payload` array |
| `webhooks_list` | `{}` | `200` | Returned `payload` object |
| `integrations_list` | `{}` | `200` | Returned `payload` array of integration apps and hooks |
| `custom_attributes_list` | `{}` | `200` | Returned `10` custom attribute definitions |
| `assignment_policies_list` | `{}` | `200` | Returned `[]` (`0` policies) |
| `label_upsert` → `label_delete` | `{ title: "mcp-verify-008" }` → `{ confirm: true }` | `200` → `200` | Created ephemeral label and deleted it (`deleted: true`) |
| `portal_upsert` → `category_upsert` → `article_upsert` → `article_publish` → `article_delete` → `category_delete` → `portal_upsert(delete)` | `{ slug: "mcp-verify-008" }` | `200` (all 7 steps) | Created portal `"mcp-verify-008"`, created category `"getting-started"`, created draft article (`status: "draft"`), published article (`status: "published"`), and deleted article, category, and portal (`deleted: true`) |
