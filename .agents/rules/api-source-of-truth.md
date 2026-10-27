---
trigger: model_decision
description: Apply when wrapping, documenting or debugging any AirysChat API endpoint.
---

# AirysChat API: sources of truth

AirysChat serves ~800 account-scoped endpoints across two trees (`/api/v1|v2/accounts/{id}` and
`/saas/api/v1/accounts/{id}`). Most are not documented in swagger yet. Never guess a parameter,
response shape or status code.

## Order of evidence

1. **Controller + routes** in `~/AirysChat` — `config/routes.rb`, `app/controllers/api/v1/accounts/**`,
   `saas/app/controllers/saas/api/v1/**`, `enterprise/app/controllers/**`. Read the strong params,
   the policy (Pundit) and what the action renders (jbuilder under `app/views/api/**`).
2. **Request specs** under `spec/` (and `saas/spec/` if present) — they show real payloads.
3. **Swagger** `swagger/tag_groups/application_swagger.json` (Chatwoot-inherited) and, when present,
   the AirysChat swagger. Operations marked `x-airys-stub: true` are unverified.
4. **The active AirysChat Spec Kit lane** for the domain (`~/AirysChat/specs/0NN-*`), e.g.
   `024-crm-v2` for CRM, `014-meta-business-agent` for MBA.
5. **Live readback** on `staging.airys.app` account 6, GET only, sanitized
   (`.agents/skills/live-verify`).

Use `git -C ~/AirysChat show origin/develop:<path>` to read the integration branch without touching
the owner's checkout. Never run mutating git commands in `~/AirysChat`.

## Things that have bitten us

- Campaign IDs are account-scoped **display IDs**.
- `POST /conversations/{id}/labels` **replaces** the set.
- Preflight blocks with HTTP 200.
- Rails array params need `key[]=` repetition (the client does this).
- `PATCH` and `PUT` both route to `update`; prefer `PATCH`.
- `/saas` controllers add feature-flag and plan gates (`Saas::FeatureGate`).

Record every new quirk in the domain brief, in the tool description, and here if it is cross-cutting.

## Keeping the inventory current

When AirysChat adds or removes routes, refresh `docs/api/inventory.csv` with
`.agents/skills/sync-api-inventory`. New domains without a plan show up as `unassigned`.
