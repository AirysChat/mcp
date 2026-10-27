# 002 — API catalog · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| CAT-01 | P0 | M | Inventory generator, domain plan, curated map, `inventory.csv` + `coverage.md` | `pnpm inventory:check` green; 807 rows from `AirysChat@c9ea590d8c` | Done (2026-10-26) |
| CAT-02 | P1 | M | Drift automation: AirysChat CI artifact (routes dump) or scheduled workflow here; bot PR on change; `sync-api-inventory` skill | A route added on `develop` produces an inventory PR within 24h | Planned (may be `BLOCKED_EXTERNAL` on AirysChat CI) |
| CAT-03 | P0 | M | Extract params/required/enums from `application_swagger.json` into `docs/api/params.json` | every swagger-documented account operation extracted (path, query, body) | Done (2026-10-27: 112 operations / 367 params from `AirysChat@090c8ae510`. Swagger documents only 107 of 618 core endpoints and no `saas` ones, so the original "≥ 90%" target is unreachable from swagger: path params come from routes (CAT-05), the rest from domain briefs (CAT-04)) |
| CAT-04 | P1 | L | SaaS endpoint params (CRM, AI agents, MBA, reports v2) via `api-cartographer` domain briefs in `docs/api/domains/*.md` | Every 0.3.0/0.4.0 domain has a brief | Planned |
| CAT-05 | P0 | S | Build `catalog.json` at package build time (method, path, domain, summary, params, write, irreversible, stability) | Package tarball contains it; size < 300 KB | Done (2026-10-27: generated at build from inventory + params + irreversible rules; 807 endpoints, 240 KB raw / 48 KB packed; `src/catalog.ts` loader, matcher and search with 6 unit tests) |
| CAT-06 | P0 | M | Tool `airyschat_api_search` (read-only; query, domain, method filters; top-N) | Smoke covers 3 queries | Done (2026-10-27: always-on `stable` tool — local, calls no endpoint; unit tests cover queries/filters/limits, smoke covers the MCP call) |
| CAT-07 | P0 | M | `airyschat_api` validates against catalog, applies write/irreversible gates, refuses excluded rows | Smoke: unknown path refused, irreversible requires confirm | Planned |
| CAT-08 | P1 | S | Classify irreversible endpoints in `domains.json` (sends, Meta writes, deletes, deal won) | Review by `safety-reviewer` recorded in verification | In progress (first rule set: 198 irreversible endpoints; review pending) |
