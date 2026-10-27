#!/usr/bin/env bash
# Seed GitHub issues for open lane tasks of a milestone and one epic per release.
# Idempotent: skips issues whose title already exists.
# Usage: scripts/github/seed-issues.sh [owner/repo]
set -euo pipefail
REPO="${1:-AirysChat/mcp}"
existing=$(gh issue list --repo "$REPO" --state all --limit 500 --json title --jq '.[].title')

issue() { # title milestone labels body
  grep -qxF "$1" <<<"$existing" && { echo "skip: $1"; return; }
  gh issue create --repo "$REPO" --title "$1" --milestone "$2" --label "$3" --body "$4" >/dev/null
  echo "created: $1"
}

task() { # id P lane milestone area title
  local id=$1 p=$2 lane=$3 ms=$4 area=$5 title=$6
  local dir; dir=$(ls -d specs/${lane}-* | head -1)
  issue "$id: $title" "$ms" "type:feat,$p,lane:$lane,area:$area" \
    "Lane task **$id** — see [\`$dir/tasks.md\`](../blob/main/$dir/tasks.md) for scope and *done when*.

Close from the PR that completes it, with evidence recorded in the lane."
}

# --- v0.2.0: open tasks of lanes 001 and 002 ---
task FND-02 P0 001 v0.2.0 server  "GitHub repo settings, labels, milestones, ruleset on main"
task FND-03 P0 001 v0.2.0 server  "CI: typecheck, smoke, unit tests, inventory check, audit"
task FND-04 P0 001 v0.2.0 server  "Changesets release workflow"
task FND-06 P0 001 v0.2.0 server  "Upgrade MCP SDK to 2.4.x and adapt to spec 2026-07-28"
task FND-07 P0 001 v0.2.0 server  "Stability tiers and AIRYSCHAT_FEATURES filter"
task FND-08 P0 001 v0.2.0 server  "Unit tests for client, result helpers and filters"
task FND-09 P1 001 v0.2.0 server  "outputSchema and structuredContent for read tools"
task FND-10 P0 001 v0.2.0 server  "Live-verify v0.1 tools on staging account 6"
task FND-11 P1 001 v0.2.0 server  "Publish to GitHub Packages and client install docs"
task FND-12 P2 001 v0.2.0 server  "Spike: elicitation/MRTR confirmations (ADR 0005)"
task FND-13 P0 001 v0.2.0 server  "Remove references to nonexistent airyschat_swagger.json"
task FND-14 P1 001 v0.2.0 server  "Read server version from package.json"
task CAT-02 P1 002 v0.2.0 catalog "Inventory drift automation"
task CAT-03 P0 002 v0.2.0 catalog "Catalog params from application_swagger.json"
task CAT-04 P1 002 v0.2.0 catalog "SaaS domain briefs for 0.3/0.4 domains"
task CAT-05 P0 002 v0.2.0 catalog "Embed catalog.json in the package"
task CAT-06 P0 002 v0.2.0 catalog "Tool airyschat_api_search"
task CAT-07 P0 002 v0.2.0 catalog "airyschat_api validation and gates from the catalog"
task CAT-08 P1 002 v0.2.0 catalog "Classify irreversible endpoints"

# --- one epic per release ---
epic() { # milestone lane title
  local dir; dir=$(ls -d specs/${2}-* | head -1)
  issue "Epic $1 — $3" "$1" "type:epic,lane:$2" \
    "Tracks release **$1** — spec: [\`$dir/spec.md\`](../blob/main/$dir/spec.md), tasks: [\`$dir/tasks.md\`](../blob/main/$dir/tasks.md).

Per-task issues are created when the lane starts (\`.agents/skills/spec-lane\`)."
}
epic v0.3.0 003 "CRM & contacts"
epic v0.4.0 004 "AI agents & Meta Business Agent"
epic v0.5.0 005 "Hosted MCP on Cloud Run"
epic v0.6.0 006 "WhatsApp complete & reports"
epic v0.7.0 007 "MCP Apps, elicitation, tasks"
epic v0.8.0 008 "Admin & help center"
epic v0.9.0 009 "Airys platform API toolset"
epic v1.0.0 010 "GA & distribution"

# --- owner decisions ---
decision() { issue "Decision: $1" "$2" "needs-decision,lane:$3" "$4"; }
decision "OAuth design for hosted MCP" v0.5.0 005 "Options in ADR 0004 (a) Doorkeeper in AirysChat (b) \`mcp\` as AS + AirysChat consent page (c) MCP-scoped tokens. Recommendation: (b) now, (c) later."
decision "npm scope @airyschat and public npm timing" v1.0.0 010 "Confirm ownership of the \`@airyschat\` npm scope. Recommendation: GitHub Packages until 1.0."
decision "Captain vs AirysChat AI Agents coverage" v0.4.0 004 "Recommendation: curate AI Agents + MBA; Captain catalog-only unless still sold."
decision "MCP Registry namespace" v1.0.0 010 "Recommendation: \`chat.airys/mcp\` (DNS verification) over \`io.github.airyschat/mcp\`."
