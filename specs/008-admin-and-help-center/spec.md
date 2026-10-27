# 008 — Admin & help center

- Release: **0.8.0** · Target 2027-03-15 · Prefix `ADM` · Toolsets `admin`, `help_center`

## Why

To reach "every action", administrators must be able to configure AirysChat through an agent:
inboxes, agents, teams, automations, macros, webhooks, integrations, custom attributes, SLA
policies, and the help center (portals, categories, articles).

## What

- `admin` (default off, `beta`): inboxes CRUD/settings/members, agents invite/update/remove, teams
  and members, automation rules, macros, webhooks, integrations hooks, custom attributes, SLA
  policies, labels CRUD, canned responses CRUD, account settings, audit logs (read).
- `help_center`: portals, categories, articles (CRUD, publish), search.
- All deletes and member removals irreversible + confirm. Webhook URLs validated (no internal hosts).
- Skill `account-audit` (config drift, unused inboxes, agents without teams, SLA coverage).

## Acceptance

- Admin toolset verified on staging account 6 with an admin token; non-admin 403 surfaced clearly.
- Help center article create→publish→delete cycle on staging portal.
