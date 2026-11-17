#!/usr/bin/env bash
# Local release publisher (`LCI-02`).
# Cuts git tag `@airyschat/mcp@X.Y.Z`, creates the GitHub Release, publishes to public npm
# (when not already published), and optionally publishes `server.json` to the Official MCP Registry
# without requiring GitHub Actions runners.
#
# Usage:
#   pnpm release:publish --dry-run
#   pnpm release:publish [--skip-npm]
set -euo pipefail

DRY_RUN=0
SKIP_NPM=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-npm) SKIP_NPM=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

[[ -z "$(git status --porcelain)" ]] || { echo "working tree not clean" >&2; exit 1; }
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || { echo "run from main" >&2; exit 1; }
git fetch -q origin main --tags
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || { echo "main is not up to date with origin/main" >&2; exit 1; }

pending="$(find .changeset -name '*.md' ! -name README.md | wc -l | tr -d ' ')"
if [[ "$pending" -gt 0 ]]; then
  echo "$pending pending changeset(s) found — run 'pnpm release:prepare' and merge the release PR first." >&2
  exit 1
fi

VERSION="$(node -p "require('./packages/server/package.json').version")"
TAG="@airyschat/mcp@${VERSION}"

grep -qx "## ${VERSION}" packages/server/CHANGELOG.md || {
  echo "No '## ${VERSION}' section found in packages/server/CHANGELOG.md." >&2
  exit 1
}

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[dry-run] Would run local CI, tag ${TAG} at $(git rev-parse --short HEAD), publish @airyschat/mcp@${VERSION} to npmjs.org (if unpublished), and create GitHub Release."
  exit 0
fi

ALREADY_ON_NPM=0
if [[ "$(npm view "@airyschat/mcp@${VERSION}" version --registry https://registry.npmjs.org/ 2>/dev/null || true)" == "$VERSION" ]]; then
  ALREADY_ON_NPM=1
fi

if [[ "$SKIP_NPM" == "0" && "$ALREADY_ON_NPM" == "0" ]]; then
  if ! npm whoami --registry https://registry.npmjs.org/ >/dev/null 2>&1; then
    echo "npm authentication missing for registry.npmjs.org. Run 'npm login' and retry (or pass '--skip-npm' to tag/release on GitHub only)." >&2
    exit 1
  fi
fi

bash scripts/ci/local-ci.sh

if ! git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "→ Tagging and pushing ${TAG}…"
  git tag "$TAG" HEAD
  git push origin "refs/tags/${TAG}"
fi

if ! gh release view "$TAG" >/dev/null 2>&1; then
  notes_file="$(mktemp)"
  trap 'rm -f "$notes_file"' EXIT
  awk -v v="## ${VERSION}" '$0==v{f=1;next} /^## /{f=0} f' packages/server/CHANGELOG.md > "$notes_file"
  prerelease=()
  [[ "$VERSION" == 0.* ]] && prerelease=(--prerelease)
  gh release create "$TAG" --title "@airyschat/mcp ${VERSION}" --notes-file "$notes_file" --verify-tag "${prerelease[@]}"
fi

if [[ "$SKIP_NPM" == "1" ]]; then
  echo "→ Skipping npm publish (--skip-npm)."
elif [[ "$ALREADY_ON_NPM" == "1" ]]; then
  echo "→ @airyschat/mcp@${VERSION} already published on registry.npmjs.org; skipping npm publish."
else
  echo "→ Publishing @airyschat/mcp@${VERSION} to registry.npmjs.org…"
  (
    cd packages/server
    npm publish --registry https://registry.npmjs.org/ --access public
  )
fi

if [[ -n "${MCP_REGISTRY_DNS_PRIVATE_KEY:-}" ]]; then
  echo "→ Publishing server.json to Official MCP Registry (chat.airys/mcp)…"
  if command -v mcp-publisher >/dev/null 2>&1; then
    mcp-publisher validate
    mcp-publisher login dns --domain airys.chat --private-key "$MCP_REGISTRY_DNS_PRIVATE_KEY"
    mcp-publisher publish
  else
    echo "mcp-publisher CLI not found in PATH; install mcp-publisher or run 'gh workflow run release.yml -f mcp_registry_only=true'." >&2
  fi
fi

echo "✓ Released ${TAG}"
