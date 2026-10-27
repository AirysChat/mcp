# 001 — Foundation · verification

Sanitized, dated evidence only (`.agents/rules/secrets-and-evidence.md`).

## 2026-10-26 — FND-01 monorepo

Local, macOS, Node 24, pnpm 10.30.3, branch `chore/foundation`.

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm smoke` (mock API over stdio) | pass — 11/11 checks |
| `pnpm inventory:check` | pass — 775 addressable endpoints, 30 curated (4%), 32 excluded; source `AirysChat@c9ea590d8c` |

## FND-10 — live verification of v0.1 tools

Target: `staging.airys.app`, account 6 ("Airys Demo", fictitious data), owner's staging user,
token from the macOS Keychain injected as env only. Driver: `packages/server/scripts/live-verify.mjs`
(forced `AIRYSCHAT_READ_ONLY=1`, shape-only output). Date: **2026-10-27**. Server 0.1.0, SDK 2.4.0.

| Tool | Result (shape only) | ms | Notes |
|---|---|---:|---|
| `me` | ok — `{account_id, base_url, profile{18 keys}}` | 75 | |
| `conversations_list` | ok — `{data{meta, payload}}`, untrusted-fenced | 172 | |
| `conversation_get` | ok — 29 top-level keys incl. `messages[1]`, `labels[5]`, untrusted-fenced | 586 | |
| `conversation_messages` | ok — `{meta{7}, payload[15]}`, untrusted-fenced | 218 | |
| `contacts_search` | ok — `{meta{3}, payload[15]}`, untrusted-fenced | 170 | |
| `contact_get` | ok — `{payload{17 keys}}`, untrusted-fenced | 157 | |
| `contact_conversations` | ok — `{payload[1]}`, untrusted-fenced | 316 | |
| `inboxes_list` | ok — `{payload[1]}` | 74 | |
| `agents_list` | ok — `array(6)` | 77 | |
| `labels_list` | ok — `{payload[19]}` | 61 | |
| `teams_list` | ok — `array(3)` | 71 | |
| `wa_templates_list` | ok — `array(1)`, untrusted-fenced | 91 | |
| `wa_template_get` | ok — 16 keys (`status`, `category`, `content`, `platform_template_id`…), untrusted-fenced | 164 | |
| `wa_template_analytics` | ok — `{analytics{2 keys}}` | 1437 | slowest call |
| `wa_campaigns_list` | ok — `{meta{2}, payload[0]}`, untrusted-fenced | 78 | account has no campaigns |
| `wa_audience_estimate` | ok — `{total, with_phone, with_identifier, sample_contact}` | 54 | |
| `wa_inbox_health` | ok — `{latest{10}, snapshots[76], campaign_volume[0], alerts[0]}` | 200 | |
| `wa_campaign_preflight` (with `inbox_id`) | ok — `allowed`, `status`, `risk_score`, `blocking_issues[1]`, `warnings[2]`, … (16 keys) | 204 | blocked check returns 200 as documented |
| `wa_campaign_preflight` (no args) | **error** — 404 "Resource could not be found" + misleading campaign-ID hint | 54 | → FND-17 |
| `wa_campaign_get`, `wa_campaign_metrics` | not run — no campaign on account 6 | | → FND-19 |
| `airyschat_api` (GET) | not registered in read-only mode | | → FND-18 |

Write tools were not exercised (GET-only run). Result: **18/18 runnable read tools pass**; customer
content is fenced on every tool that returns it.

## 2026-10-27 — foundation merged

| Check | Result |
|---|---|
| PR #32 CI (`check`, node 20, node 22) | pass |
| Merge | merge commit `828b180` (one-time ruleset exception to keep plugin history; ruleset restored to squash-only + linear history right after, merge commits disabled again) |
| CI on `main` after merge | pass |
| Dependabot open alerts | 0 (4 advisories on the old `package-lock.json` cleared by SDK ≥ 2.4.0 / zod ≥ 4.6.7) |
| Release workflow on `main` | fail at PR creation — enterprise policy: "GitHub Actions is not permitted to create or approve pull requests" (FND-04) |
