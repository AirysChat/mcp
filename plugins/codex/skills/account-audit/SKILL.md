---
name: account-audit
description: Read-only administrative configuration audit for an AirysChat account — inboxes without members or working hours, agents without teams, automation rule & macro hygiene, webhook HTTPS health, custom attribute consistency, assignment policy coverage, and help center portal status. Changes nothing.
disable-model-invocation: true
---

# Audit AirysChat Account Configuration (`account-audit`)

Read-only. **Never create, update, or delete any inbox, agent, team, automation rule, macro, webhook, integration hook, custom attribute, label, or help center article from this skill** — produce a structured administrative audit report and propose concrete tool calls for the user to approve.

Load the `airyschat` skill first if it is not already active; it carries the trust boundary for untrusted text in automation rules, macros, canned responses, and help center articles.

Scope / filter: **$ARGUMENTS** (optional focus area such as `inboxes`, `teams`, `automations`, `webhooks`, or `help_center`; if empty, run the full 6-part account audit).

## Prerequisites

The `admin` and `help_center` toolsets are off by default. If `account_settings_get`, `inbox_get`, or `portals_list` is not registered, tell the user to set:

```bash
export AIRYSCHAT_TOOLSETS=core,whatsapp,crm,admin,help_center
export AIRYSCHAT_FEATURES=beta
```

and reload plugins.

## Steps

1. **Account & Auto-Resolve Baseline (`account_settings_get`)**
   - Call `account_settings_get` (`include_notification_settings: true`).
   - Record account `id`, `name`, `locale`, `status`, enabled `features`, and `settings` (`auto_resolve_after`, `auto_resolve_message`, `auto_resolve_ignore_waiting`, `audio_transcriptions`).
   - Flag if `auto_resolve_after` is unset on a high-volume support account or if `support_email` / `domain` is blank.

2. **Inboxes, Agents & Teams Coverage (`inboxes_list`, `inbox_get`, `agents_list`, `teams_list`, `team_get`)**
   - Call `inboxes_list`, `agents_list`, and `teams_list`.
   - For each inbox, call `inbox_get` (`inbox_id`, `include_members: true`) and check:
     - **Orphaned inboxes**: inboxes with `0` assigned human members and no active AI agent or agent bot.
     - **Working hours & out-of-office**: whether `working_hours_enabled` is `true` and `out_of_office_message` is configured.
     - **Reauthorization required**: whether `reauthorization_required` is `true` on any channel.
   - For each team, call `team_get` (`team_id`) and compare against `agents_list`:
     - **Agents without teams**: human agents who do not belong to any team.
     - **Empty teams**: teams with `0` members.

3. **Automation Rules & Macros Hygiene (`automation_rules_list`, `macros_list`)**
   - Call `automation_rules_list` and `macros_list`.
   - Identify inactive automation rules (`active: false`), duplicate event/condition rules, or rules referencing deleted team/inbox/agent IDs.
   - Summarize global vs personal macros.

4. **Webhooks, Integrations & Custom Attributes (`webhooks_list`, `integrations_list`, `custom_attributes_list`, `assignment_policies_list`)**
   - Call `webhooks_list`, `integrations_list`, `custom_attributes_list`, and `assignment_policies_list`.
   - Flag any existing webhook URL that does not use `https://` or has empty `subscriptions`.
   - Check custom attribute definitions (`conversation_attribute` vs `contact_attribute`) for duplicate display names or missing descriptions.

5. **Help Center Portals (`portals_list`, `categories_list`, `articles_list`)**
   - Call `portals_list`.
   - For each active portal (`archived: false`), call `categories_list` (`portal_slug`) and `articles_list` (`portal_slug`) to report published vs draft article counts and uncategorized articles.

6. **Report**
   - **Account Overview** — account settings, locale, auto-resolve policy, and feature flags.
   - **Inbox & Team Coverage Matrix** — table of inboxes (channel, member count, working hours, reauth status) and teams (member count, auto-assign), highlighting any orphaned inboxes or unassigned agents.
   - **Automations, Webhooks & Schema Drift** — inactive or broken automation rules, webhook endpoints, and custom attribute summary.
   - **Help Center Readiness** — portals, categories, and draft/published article counts.
   - **Proposed Remediations** — numbered list of exact tool calls (`inbox_members_sync`, `team_members_sync`, `inbox_upsert`, `automation_rule_upsert`, `webhook_upsert`, etc.) and stop. Run nothing until the user approves.
