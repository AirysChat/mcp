# 012 — Zero-Cost Local CI, Release & Cloud Run Deploy · Verification

- **Date**: `2026-11-17`
- **Local suite (`pnpm ci:local`)**:
  - `pnpm install --frozen-lockfile`: pass
  - `pnpm check`: `typecheck` pass, `69/69` unit tests (`98.24%` line / `89.13%` branch / `95.09%` function coverage), `67/67` smoke checks, `inventory:check` (`807` endpoints / `212` tools), `plugins:check` (`4` bundles × `8` skills), `docs:check` (`87` `stable`), `security:scan` (`0` findings)
  - `pnpm audit --prod --audit-level high`: `0` vulnerabilities
  - `node scripts/security/secret-scan.mjs --history`: `0` findings across tracked files + full git history
  - `pnpm docker:smoke`: distroless image built from `Dockerfile`, `/healthz` (`"status":"ok"`) and `/.well-known/oauth-protected-resource` (`staging.airys.app`) verified over HTTP, container & image cleaned up on exit
- **Deploy & release dry-runs**:
  - `pnpm deploy:staging --dry-run`: pass
  - `pnpm deploy:prod --dry-run`: pass
- **GitHub ruleset & workflows**:
  - Ruleset `25923947` (`main`) updated via `scripts/github/ruleset-main.json`: enforces `deletion`, `non_fast_forward`, `pull_request` (squash-only), and `required_linear_history` without GitHub Actions `required_status_checks`.
  - `.github/workflows/{ci,image,inventory-drift,release}.yml` restricted to manual `workflow_dispatch` only (`0` automatic workflow runs on PR/push/schedule).
