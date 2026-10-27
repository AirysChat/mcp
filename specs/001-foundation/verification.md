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
