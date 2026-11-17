#!/usr/bin/env bash
# Build the distroless production container image locally and smoke-test
# /healthz and /.well-known/oauth-protected-resource (`LCI-01`).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

SHA="$(git rev-parse HEAD)"
IMAGE_TAG="airyschat-mcp:local-ci-$$"
CONTAINER_NAME="mcp-local-ci-$$"
PORT="${MCP_SMOKE_PORT:-18080}"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rmi "$IMAGE_TAG" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "→ Building distroless container image ($IMAGE_TAG, GIT_SHA=${SHA:0:7})…"
docker build --quiet --build-arg "GIT_SHA=$SHA" -t "$IMAGE_TAG" . >/dev/null

echo "→ Starting container ($CONTAINER_NAME on 127.0.0.1:$PORT)…"
docker run -d --name "$CONTAINER_NAME" -p "127.0.0.1:${PORT}:8080" \
  -e AIRYSCHAT_DEFAULT_INSTANCE=staging \
  "$IMAGE_TAG" >/dev/null

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

healthz="$(curl -fsS "http://127.0.0.1:${PORT}/healthz")"
well_known="$(curl -fsS "http://127.0.0.1:${PORT}/.well-known/oauth-protected-resource")"

grep -q '"status":"ok"' <<<"$healthz" || {
  echo "✗ /healthz did not return status ok: $healthz" >&2
  exit 1
}
grep -q 'staging.airys.app' <<<"$well_known" || {
  echo "✗ /.well-known/oauth-protected-resource missing staging.airys.app: $well_known" >&2
  exit 1
}

echo "✓ Distroless container smoke passed (/healthz + RFC 9728 metadata)"
