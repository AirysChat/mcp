#!/usr/bin/env bash
# Local Cloud Run build & deploy by immutable digest (`LCI-02`).
# Replaces automatic `.github/workflows/image.yml` runs with zero GitHub Actions cost.
#
# Usage:
#   pnpm deploy:staging [--dry-run]
#   pnpm deploy:prod [commit_sha] [--dry-run]
set -euo pipefail

ENV_TARGET="${1:-}"
shift || true

DRY_RUN=0
COMMIT_ARG=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) COMMIT_ARG="$arg" ;;
  esac
done

if [[ "$ENV_TARGET" != "staging" && "$ENV_TARGET" != "prod" ]]; then
  echo "Usage: scripts/deploy/cloud-run.sh <staging|prod> [commit_sha] [--dry-run]" >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

REGION="southamerica-east1"
REGISTRY_HOST="${REGION}-docker.pkg.dev"
SERVICE="mcp"
STAGING_IMAGE="${REGISTRY_HOST}/airys-platform-staging/images/mcp"
PROD_IMAGE="${REGISTRY_HOST}/airys-platform-prod/images/mcp"
SHA="${COMMIT_ARG:-$(git rev-parse HEAD)}"

setup_isolated_docker_auth() {
  local token
  if ! token="$(CLOUDSDK_CORE_DISABLE_PROMPTS=1 gcloud auth print-access-token 2>/dev/null)" || [[ -z "$token" ]]; then
    echo "gcloud authentication expired or missing. Run 'gcloud auth login' in an interactive terminal and retry." >&2
    exit 1
  fi

  TMP_DOCKER_CFG="$(mktemp -d)"
  chmod 700 "$TMP_DOCKER_CFG"
  for d in contexts cli-plugins buildx; do
    [[ -e "$HOME/.docker/$d" ]] && ln -s "$HOME/.docker/$d" "$TMP_DOCKER_CFG/$d"
  done

  REGISTRY_HOST="$REGISTRY_HOST" ACCESS_TOKEN="$token" node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const auth = Buffer.from("oauth2accesstoken:" + process.env.ACCESS_TOKEN).toString("base64");
    const cfg = { auths: { [process.env.REGISTRY_HOST]: { auth } } };
    fs.writeFileSync(path.join(process.argv[1], "config.json"), JSON.stringify(cfg), { mode: 0o600 });
  ' "$TMP_DOCKER_CFG"
}

TMP_DOCKER_CFG=""
trap '[[ -n "$TMP_DOCKER_CFG" ]] && rm -rf "$TMP_DOCKER_CFG"' EXIT

if [[ "$ENV_TARGET" == "staging" ]]; then
  PROJECT_ID="airys-platform-staging"
  echo "→ Validating local suite before staging image build (${SHA:0:7})…"
  pnpm check

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] Would build linux/amd64 image ${STAGING_IMAGE}:${SHA} and deploy Cloud Run service '${SERVICE}' in ${PROJECT_ID} (${REGION}) by immutable digest."
    exit 0
  fi

  setup_isolated_docker_auth
  DOCKER_CONFIG="$TMP_DOCKER_CFG" docker buildx build \
    --platform linux/amd64 \
    --build-arg "GIT_SHA=${SHA}" \
    --label "org.opencontainers.image.source=https://github.com/AirysChat/mcp" \
    --label "org.opencontainers.image.revision=${SHA}" \
    --tag "${STAGING_IMAGE}:${SHA}" \
    --push \
    .

  DIGEST="$(CLOUDSDK_CORE_DISABLE_PROMPTS=1 gcloud artifacts docker images describe "${STAGING_IMAGE}:${SHA}" --format='value(image_summary.digest)')"
  [[ -n "$DIGEST" ]] || { echo "Failed to resolve Artifact Registry digest for ${STAGING_IMAGE}:${SHA}" >&2; exit 1; }

  echo "→ Deploying ${STAGING_IMAGE}@${DIGEST} to Cloud Run (${PROJECT_ID}/${REGION}/${SERVICE})…"
  CLOUDSDK_CORE_DISABLE_PROMPTS=1 gcloud run deploy "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "${STAGING_IMAGE}@${DIGEST}" \
    --quiet
  echo "✓ Deployed staging: ${STAGING_IMAGE}@${DIGEST}"
else
  PROJECT_ID="airys-platform-prod"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] Would promote ${STAGING_IMAGE}:${SHA} -> ${PROD_IMAGE}:${SHA} and deploy Cloud Run service '${SERVICE}' in ${PROJECT_ID} (${REGION}) by immutable digest."
    exit 0
  fi

  setup_isolated_docker_auth
  DOCKER_CONFIG="$TMP_DOCKER_CFG" docker buildx imagetools create --tag "${PROD_IMAGE}:${SHA}" "${STAGING_IMAGE}:${SHA}"
  DIGEST="$(CLOUDSDK_CORE_DISABLE_PROMPTS=1 gcloud artifacts docker images describe "${PROD_IMAGE}:${SHA}" --format='value(image_summary.digest)')"
  [[ -n "$DIGEST" ]] || { echo "Failed to resolve Artifact Registry digest for ${PROD_IMAGE}:${SHA}" >&2; exit 1; }

  echo "→ Deploying ${PROD_IMAGE}@${DIGEST} to Cloud Run (${PROJECT_ID}/${REGION}/${SERVICE})…"
  CLOUDSDK_CORE_DISABLE_PROMPTS=1 gcloud run deploy "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "${PROD_IMAGE}@${DIGEST}" \
    --quiet
  echo "✓ Deployed prod: ${PROD_IMAGE}@${DIGEST}"
fi
