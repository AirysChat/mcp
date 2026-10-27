#!/usr/bin/env bash
# Idempotent GitHub bootstrap for AirysChat/mcp: repo settings, labels, milestones.
# Usage: scripts/github/bootstrap.sh [owner/repo]
set -euo pipefail
REPO="${1:-AirysChat/mcp}"

gh repo edit "$REPO" \
  --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
  --delete-branch-on-merge --enable-auto-merge --enable-issues --enable-wiki=false \
  --add-topic mcp --add-topic model-context-protocol --add-topic airyschat \
  --add-topic whatsapp --add-topic crm --add-topic ai-agents >/dev/null

label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; }

# type
label "type:feat"      "1D76DB" "New tool, toolset or capability"
label "type:bug"       "D73A4A" "Something is broken"
label "type:docs"      "0075CA" "Documentation and specs"
label "type:chore"     "C5DEF5" "Maintenance"
label "type:ci"        "BFD4F2" "CI and release automation"
label "type:security"  "B60205" "Security hardening or finding"
label "type:epic"      "3E4B9E" "Release epic tracking a lane"
# priority
label "P0" "B60205" "Blocks the release"
label "P1" "D93F0B" "Belongs in the release"
label "P2" "FBCA04" "May slip to the next minor"
# status (mirrors specs vocabulary)
label "blocked-external"      "5319E7" "Waiting on AirysChat or airys-platform"
label "needs-decision"        "E99695" "NEEDS_PRODUCT_DECISION"
label "needs-security-review" "B60205" "NEEDS_SECURITY_REVIEW"
# areas
for a in core whatsapp crm ai_agents meta_agent reports admin help_center platform catalog server plugins hosted apps deps specs; do
  label "area:$a" "C2E0C6" "Area: $a"
done
# lanes
lanes=(001-foundation 002-api-catalog 003-crm-and-contacts 004-ai-agents-and-meta-agent 005-hosted-mcp \
       006-whatsapp-and-reports 007-apps-elicitation-tasks 008-admin-and-help-center 009-airys-platform-toolset 010-distribution-ga)
for l in "${lanes[@]}"; do label "lane:${l%%-*}" "EDEDED" "specs/$l"; done

# milestones: version|due|description
milestones=(
  "v0.2.0|2026-11-09|Foundation & API catalog (lanes 001, 002)"
  "v0.3.0|2026-11-30|CRM & contacts (lane 003)"
  "v0.4.0|2026-12-14|AI agents & Meta Business Agent (lane 004)"
  "v0.5.0|2027-01-11|WhatsApp complete & reports (lane 006)"
  "v0.6.0|2027-03-01|Hosted MCP on Cloud Run + scoped MCP tokens (lane 005, ADR 0006)"
  "v0.7.0|2027-03-22|MCP Apps, elicitation, tasks (lane 007)"
  "v0.8.0|2027-04-12|Admin & help center (lane 008)"
  "v0.9.0||Airys platform API toolset (lane 009)"
  "v1.0.0|2027-05-31|GA & distribution (lane 010)"
)
existing=$(gh api "repos/$REPO/milestones?state=all&per_page=100" --jq '.[].title')
for m in "${milestones[@]}"; do
  IFS='|' read -r title due desc <<<"$m"
  args=(-f title="$title" -f description="$desc")
  [[ -n "$due" ]] && args+=(-f due_on="${due}T23:59:59Z")
  if grep -qx "$title" <<<"$existing"; then
    number=$(gh api "repos/$REPO/milestones?state=all&per_page=100" --jq ".[] | select(.title==\"$title\") | .number")
    gh api -X PATCH "repos/$REPO/milestones/$number" "${args[@]}" >/dev/null   # keep description/due in sync
  else
    gh api "repos/$REPO/milestones" "${args[@]}" >/dev/null
  fi
done
echo "bootstrap done for $REPO"
