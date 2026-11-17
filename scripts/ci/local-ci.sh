#!/usr/bin/env bash
# Zero-cost local CI pipeline (`LCI-01`).
# Replaces automatic GitHub Actions runs on push/PR/schedule.
#
# Usage:
#   pnpm ci:local    # full gate: frozen install + check + prod audit + history secret scan + distroless Docker smoke
#   pnpm ci:fast     # skips Docker container build (used by pre-push hook or quick iteration)
set -euo pipefail

FAST=0
if [[ "${1:-}" == "--fast" ]] || [[ "${SKIP_DOCKER:-0}" == "1" ]]; then
  FAST=1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "=== [1/5] Frozen lockfile install ==="
pnpm install --frozen-lockfile

echo "=== [2/5] Typecheck, unit coverage (>=80%), stdio/HTTP smoke, inventory, plugins, docs & secret scan ==="
pnpm check

echo "=== [3/5] Production dependency audit (high+) ==="
pnpm audit --prod --audit-level high

echo "=== [4/5] Full git history secret scan ==="
node scripts/security/secret-scan.mjs --history

if [[ "$FAST" == "1" ]]; then
  echo "=== [5/5] Distroless container smoke skipped (--fast) ==="
else
  echo "=== [5/5] Distroless container build & HTTP smoke ==="
  bash scripts/ci/docker-smoke.sh
fi

echo "✓ Local CI passed"
