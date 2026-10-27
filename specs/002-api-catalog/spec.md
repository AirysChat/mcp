# 002 — API catalog

- Release: **0.2.0** · Target 2026-11-09 · Prefix `CAT`
- Status: In progress (inventory done 2026-10-26)

## Why

The owner wants **every** AirysChat action reachable by agents (ADR 0002). Curating ~775 endpoints
by hand would take a year and bloat context windows. The catalog makes the whole API discoverable
and callable **today**, safely, while curated tools land release by release.

## What

1. **Inventory** — `scripts/inventory/build-inventory.mjs` merges a `rails routes` dump with the
   domain→toolset plan (`domains.json`) and the curated map (`curated.json`), producing
   `docs/api/inventory.csv` + `coverage.md`. `--check` fails CI on drift.
2. **Drift automation** — AirysChat CI (or a scheduled job here) publishes the routes dump for
   `origin/develop`; a bot PR updates the inventory when it changes.
3. **Parameters** — enrich catalog entries with params/required fields from
   `swagger/tag_groups/application_swagger.json`; for undocumented SaaS endpoints, domain briefs
   produced by `api-cartographer`.
4. **Embedded catalog** — a compact JSON shipped in the package (method, path template, domain,
   summary, params, write/irreversible flags, stability).
5. **`airyschat_api_search`** — read-only tool: keyword/domain search over the catalog, returns
   ready-to-call entries for `airyschat_api`.
6. **`airyschat_api` hardening** — validate method/path against the catalog, apply the same
   write/irreversible gates as curated tools, refuse excluded endpoints.

## Out of scope

Curated tools for specific domains (lanes 003, 004, 006, 008).

## Acceptance

- `airyschat_api_search("pipeline stages")` returns the CRM stage endpoints with params.
- `airyschat_api` refuses a path that is not in the catalog and demands `confirm` for irreversible
  entries.
- Inventory drift fails CI; refreshing is one command documented in the `sync-api-inventory` skill.
