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
SERVICE="mcp"
STAGING_IMAGE="${REGION}-docker.pkg.dev/airys-platform-staging/images/mcp"
PROD_IMAGE="${REGION}-docker.pkg.dev/airys-platform-prod/images/mcp"
SHA="${COMMIT_ARG:-$(git rev-parse HEAD)}"

if [[ "$ENV_TARGET" == "staging" ]]; then
  PROJECT_ID="airys-platform-staging"
  echo "→ Validating local suite before staging image build (${SHA:0:7})…"
  pnpm check

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] Would build linux/amd64 image ${STAGING_IMAGE}:${SHA} and deploy Cloud Run service '${SERVICE}' in ${PROJECT_ID} (${REGION}) by immutable digest."
    exit 0
  fi

  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  docker buildx build \
    --platform linux/amd64 \
    --build-arg "GIT_SHA=${SHA}" \
    --label "org.opencontainers.image.source=https://github.com/AirysChat/mcp" \
    --label "org.opencontainers.image.revision=${SHA}" \
    --tag "${STAGING_IMAGE}:${SHA}" \
    --push \
    .

  DIGEST="$(gcloud artifacts docker images describe "${STAGING_IMAGE}:${SHA}" --format='value(image_summary.digest)')"
  [[ -n "$DIGEST" ]] || { echo "Failed to resolve Artifact Registry digest for ${STAGING_IMAGE}:${SHA}" >&2; exit 1; }

  echo "→ Deploying ${STAGING_IMAGE}@${DIGEST} to Cloud Run (${PROJECT_ID}/${REGION}/${SERVICE})…"
  gcloud run deploy "$SERVICE" \
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

  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  docker buildx imagetools create --tag "${PROD_IMAGE}:${SHA}" "${STAGING_IMAGE}:${SHA}"
  DIGEST="$(gcloud artifacts docker images describe "${PROD_IMAGE}:${SHA}" --format='value(image_summary.digest)')"
  [[ -n "$DIGEST" ]] || { echo "Failed to resolve Artifact Registry digest for ${PROD_IMAGE}:${SHA}" >&2; exit 1; }

  echo "→ Deploying ${PROD_IMAGE}@${DIGEST} to Cloud Run (${PROJECT_ID}/${REGION}/${SERVICE})…"
  gcloud run deploy "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "${PROD_IMAGE}@${DIGEST}" \
    --quiet
  echo "✓ Deployed prod: ${PROD_IMAGE}@${DIGEST}"
fi
