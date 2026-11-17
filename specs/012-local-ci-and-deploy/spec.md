# 012 — Zero-Cost Local CI, Release & Cloud Run Deploy

- **Release**: `1.1.0`
- **Target**: `2026-11-17`
- **Prefix**: `LCI`
- **Toolsets**: repo infrastructure (`scripts/ci`, `scripts/deploy`, `scripts/release`, `.githooks`, `.github/workflows`)
- **Dependencies**: [005](../005-hosted-mcp/spec.md), [010](../010-distribution-ga/spec.md)

## Why

Automatic GitHub Actions workflows across the organization (`pull_request`, `push`, `schedule`) consume billed runner minutes on private repositories and block PR checks across all repositories in the org whenever GitHub Actions billing locks. Running CI, dependency audits, secret history scans, distroless Docker builds, and Cloud Run digest deployments locally costs `$0.00/month`, finishes in ~14 seconds on Apple Silicon, and removes external runner lock-in.

## What

1. **Unified local CI & distroless Docker smoke (`LCI-01`)**:
   - `scripts/ci/local-ci.sh` (`pnpm ci:local` / `pnpm ci:fast`): runs `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm audit --prod --audit-level high`, `secret-scan.mjs --history`, and `scripts/ci/docker-smoke.sh`.
   - `scripts/ci/docker-smoke.sh` (`pnpm docker:smoke`): builds the production distroless image from `Dockerfile`, verifies `/healthz` and `/.well-known/oauth-protected-resource`, and cleans up container + image on exit.
   - `.githooks/pre-push` (`pnpm hooks:install`): runs `pnpm ci:fast` before every push.
2. **Local release & Cloud Run immutable-digest deploy scripts (`LCI-02`)**:
   - `scripts/release/publish.sh` (`pnpm release:publish`): local tag + npm publish + GitHub Release + optional MCP Registry publish with `--dry-run` support.
   - `scripts/deploy/cloud-run.sh` (`pnpm deploy:staging` / `pnpm deploy:prod`): builds `linux/amd64` images, pushes/promotes in GCP Artifact Registry, and deploys Cloud Run service `mcp` by immutable `@sha256:...` digest (`--dry-run` supported).
3. **Disable automatic GitHub Actions triggers & update `main` ruleset (`LCI-03`)**:
   - Switch `.github/workflows/{ci,image,inventory-drift,release}.yml` to `on: workflow_dispatch` only (retaining `release.yml` on-demand for optional OIDC `--provenance` publishing) and fix the stale `extract-swagger-params.mjs --check` line in `inventory-drift.yml`.
   - Remove the GitHub Actions `required_status_checks` entry from `scripts/github/ruleset-main.json` and live ruleset `25923947` while keeping `pull_request` (squash-only), `required_linear_history`, `non_fast_forward`, and `deletion` protection active on `main`.

## Out of scope

-Cutting `v1.1.0` or deploying Cloud Run in this PR.

## Acceptance

- `pnpm ci:local` passes end-to-end locally (including distroless Docker build & HTTP smoke).
- `pnpm deploy:staging --dry-run` and `pnpm deploy:prod --dry-run` succeed.
- Pushing the PR branch triggers `0` automatic GitHub Actions workflow runs, and the PR merges cleanly via standard squash-merge without `--admin` bypass.
