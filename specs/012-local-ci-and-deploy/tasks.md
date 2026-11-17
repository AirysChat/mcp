# 012 — Zero-cost local CI, release & Cloud Run deploy · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| LCI-01 | P0 | S | Add `scripts/ci/local-ci.sh`, `scripts/ci/docker-smoke.sh`, and `.githooks/pre-push` (`pnpm ci:local`, `pnpm ci:fast`, `pnpm docker:smoke`, `pnpm hooks:install`) | `pnpm ci:local` passes end-to-end locally (incl. distroless container smoke) | Done (2026-11-17) |
| LCI-02 | P0 | S | Add `scripts/deploy/cloud-run.sh` (`pnpm deploy:staging`, `pnpm deploy:prod`) and `scripts/release/publish.sh` (`pnpm release:publish`) + update `AGENTS.md`, `CONTRIBUTING.md`, and `release` skill | `--dry-run` verified on deploy & release scripts; docs consistent | Done (2026-11-17) |
| LCI-03 | P0 | XS | Convert `.github/workflows/*.yml` to `workflow_dispatch` only and remove GitHub Actions `required_status_checks` from `scripts/github/ruleset-main.json` & live ruleset `25923947` | PR triggers `0` automatic Actions runs and merges without `--admin` | Done (2026-11-17) |
