# ADR 0002 — Coverage strategy: every endpoint, three layers

- Status: Accepted (2026-10-26)

## Context

The owner's goal is that **every AirysChat action is reachable by an agent**. On 2026-10-26
AirysChat serves **807 account-scoped endpoints** (`docs/api/coverage.md`); v0.1 has 28 curated
tools covering 30 of them. One tool per endpoint would put ~800 tools in every client's context —
unusable, and the reason GitHub, Anthropic and Cloudflare moved to toolsets and dynamic discovery.

## Decision

Coverage has three layers, and the inventory tracks which one serves each endpoint.

1. **Curated tools** — hand-written, typed, with safety gates and descriptions that carry the
   non-obvious behaviour. Target: the workflows people actually run (≈120–180 tools across all
   toolsets), each toolset under ~25 tools.
2. **Catalog** (lane 002) — the inventory ships inside the package. `airyschat_api_search` (read-only)
   lets the model find an operation by intent and get its method, path, parameters and safety class;
   `airyschat_api` then calls it with the same gates as today. This makes **100% of addressable
   endpoints discoverable** without loading them as tools.
3. **Raw** — `airyschat_api` with an explicit path, for anything else. Always on, always gated.

`docs/api/inventory.csv` is the backlog: one row per endpoint with `toolset`, target `release`,
`coverage` (`curated` / `raw` / `excluded` / `removed`) and the covering `tool`.
`scripts/inventory/build-inventory.mjs` regenerates it from `bin/rails routes`, and
`pnpm inventory:check` fails CI when the curated map and the code disagree.

An endpoint is **done** when it is `curated`, or when a lane explicitly decides it stays
catalog-only (recorded in `notes`), or it is `excluded` with a reason (OAuth redirects, multipart
uploads until a file design exists).

## Consequences

- "Cover everything" becomes measurable per release (`docs/api/coverage.md`).
- Adding a curated tool requires updating `curated.json` — enforced.
- The catalog needs parameter metadata the routes dump does not have; lane 002 derives it from
  swagger where present and from strong params via `api-cartographer` briefs otherwise.
