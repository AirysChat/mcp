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

Target: `staging.airys.app`, account 6 ("Airys Demo", fictitious data), GET-only.

| Tool | Date | Result | Notes |
|---|---|---|---|
| _pending_ | | | |

## 2026-10-27 — foundation merged

| Check | Result |
|---|---|
| PR #32 CI (`check`, node 20, node 22) | pass |
| Merge | merge commit `828b180` (one-time ruleset exception to keep plugin history; ruleset restored to squash-only + linear history right after, merge commits disabled again) |
| CI on `main` after merge | pass |
| Dependabot open alerts | 0 (4 advisories on the old `package-lock.json` cleared by SDK ≥ 2.4.0 / zod ≥ 4.6.7) |
| Release workflow on `main` | fail at PR creation — enterprise policy: "GitHub Actions is not permitted to create or approve pull requests" (FND-04) |
