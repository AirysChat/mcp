# ADR 0003 — Feature control and releases

- Status: Accepted (2026-10-26)

## Context

The owner wants features and releases under explicit control. The server will grow from 28 to well
over 100 tools across ~9 toolsets, and it is consumed by people who cannot be broken silently:
operators running campaigns, the hosted service, and plugins in four clients.

## Decision

### Feature units

| Level | Switch | Default |
|---|---|---|
| **Toolset** (`core`, `whatsapp`, `crm`, `ai_agents`, `meta_agent`, `reports`, `admin`, `help_center`, `platform`) | `AIRYSCHAT_TOOLSETS` | `core,whatsapp` until 1.0; then `core,whatsapp,crm` |
| **Stability** per tool: `experimental` → `beta` → `stable` (+ `deprecated`) | `AIRYSCHAT_FEATURES=beta` or `experimental` | `stable` only |
| **Writes** | `AIRYSCHAT_READ_ONLY=1` | writes on |

- New tools ship `beta`. Promotion to `stable` is a lane task that needs live evidence on staging
  (`.agents/skills/live-verify`) and a changeset.
- `experimental` is for tools wrapping endpoints that are themselves unstable upstream
  (e.g. `x-airys-stub`, MBA evals).
- `deprecated` tools stay registered for one minor release, with a description prefix
  `DEPRECATED — use X`, then are removed.
- The hosted service (lane 005) maps the same switches to per-connection configuration.

Lane 001 implements `stability` in `ToolMetadata` and the `AIRYSCHAT_FEATURES` filter. Every
existing v0.1 tool starts as `beta` until verified live, except read-only reference tools already
exercised (`me`, `inboxes_list`, `agents_list`, `labels_list`, `teams_list`).

### Versioning and release train

- SemVer via **Changesets**. Before 1.0 a breaking change is a `minor` with a callout.
- Each minor release is a theme with one or more lanes (`specs/README.md`). A release ships when its
  lanes' tasks are closed or explicitly deferred; dates are targets, scope is the contract.
- Release flow (amended 2026-10-27, FND-04): PRs with changesets → release PR opened with
  `pnpm release:prepare` via gh CLI (the enterprise policy forbids Actions from opening PRs) →
  merge → tag `@airyschat/mcp@x.y.z` + GitHub Release.
- **Distribution until 1.0 (repo private):** GitHub Packages (`npm.pkg.github.com`) for internal
  testers, plus the hosted endpoint from 0.6. **At 1.0:** public npm, MCP Registry, public repo,
  marketplaces. This is `NEEDS_PRODUCT_DECISION` only if the owner wants public npm earlier.

### Branching

Trunk-based on `main`, short-lived branches `type/<lane>-<slug>`, squash merge, Conventional Commit
titles. `main` is protected: PR + green CI.

## Consequences

- Users can try new capability without risk (`AIRYSCHAT_FEATURES=beta`), and the default tool list
  stays small and trustworthy.
- Every promotion leaves evidence in `specs/*/verification.md`.
