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
  grep -qE "^${id}:" <<<"$existing" && { echo "skip: $id: $title"; return; }
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
task FND-13 P0 001 v0.2.0 server  "Remove references to a nonexistent swagger file"
task FND-14 P1 001 v0.2.0 server  "Read server version from package.json"
task CAT-02 P1 002 v0.2.0 catalog "Inventory drift automation"
task CAT-03 P0 002 v0.2.0 catalog "Catalog params from application_swagger.json"
task CAT-04 P1 002 v0.2.0 catalog "SaaS domain briefs for 0.3/0.4 domains"
task CAT-05 P0 002 v0.2.0 catalog "Embed catalog.json in the package"
task CAT-06 P0 002 v0.2.0 catalog "Tool airyschat_api_search"
task CAT-07 P0 002 v0.2.0 catalog "airyschat_api validation and gates from the catalog"
task CAT-08 P1 002 v0.2.0 catalog "Classify irreversible endpoints"

# --- v0.3.0: tasks of lane 003 (CRM & contacts) ---
task CRM-01 P0 003 v0.3.0 crm     "Domain brief docs/api/domains/crm.md (routes, controllers, params, permissions, CAPI side effects)"
task CRM-02 P0 003 v0.3.0 crm     "Toolset crm scaffolding (src/tools/crm.ts, registration, default off)"
task CRM-03 P0 003 v0.3.0 crm     "Pipelines read: crm_pipelines_list, crm_pipeline_get"
task CRM-04 P0 003 v0.3.0 crm     "Deals read: crm_deals_search, crm_deal_get, crm_deal_timeline"
task CRM-05 P0 003 v0.3.0 crm     "Deal writes: create, update, move"
task CRM-06 P0 003 v0.3.0 crm     "crm_deal_close won/lost with confirm preview incl. CAPI effect; reason validation"
task CRM-07 P1 003 v0.3.0 crm     "crm_deal_delete (irreversible) and crm_deals_bulk_update (threshold confirm)"
task CRM-08 P1 003 v0.3.0 crm     "Notes and activities (list/create/update/complete/postpone)"
task CRM-09 P1 003 v0.3.0 crm     "crm_insights, close/loss reasons, saved views"
task CRM-10 P1 003 v0.3.0 crm     "conversation_deal_get / conversation_deal_update"
task CRM-11 P2 003 v0.3.0 crm     "Phase B config tools (pipelines/stages CRUD, automations, follow-up rules, settings, business hours, conversion settings)"
task CRM-12 P0 003 v0.3.0 core    "Contacts writes: create, update, delete, labels set, merge"
task CRM-13 P1 003 v0.3.0 crm     "Companies list/get/create/update"
task CRM-14 P0 003 v0.3.0 core    "conversation_labels_add (merge semantics; never replace)"
task CRM-15 P1 003 v0.3.0 core    "canned_responses_list, global search, notifications_list, custom_filters_list"
task CRM-16 P1 003 v0.3.0 plugins "Skill plugins/claude/.../crm-pipeline-review (stuck deals, next actions)"
task CRM-17 P0 003 v0.3.0 crm     "Promote read tools to stable; changeset; coverage >= 60% crm"

# --- v0.4.0: tasks of lane 004 (AI agents & Meta Business Agent) ---
task AIA-01 P0 004 v0.4.0 ai_agents  "Domain briefs ai_agents.md, meta_agent.md via api-cartographer"
task AIA-02 P0 004 v0.4.0 ai_agents  "ai_agents read: list, get, analytics, versions, monitor, ownership"
task AIA-03 P1 004 v0.4.0 ai_agents  "Workflow runs, KB search, documents list, AI usage"
task AIA-04 P0 004 v0.4.0 ai_agents  "Writes: publish, restore, mode transition with ownership preflight + confirm"
task AIA-05 P2 004 v0.4.0 ai_agents  "KB document upload/delete"
task AIA-06 P0 004 v0.4.0 meta_agent "meta_agent read: settings, business info, FAQs, skills, thread control, handoff, budget, allowlist"
task AIA-07 P1 004 v0.4.0 meta_agent "meta_agent writes (irreversible + confirm): business info, FAQs, skills, thread control, handoff, budget, allowlist"
task AIA-08 P2 004 v0.4.0 meta_agent "MBA evals experimental"
task AIA-10 P1 004 v0.4.0 plugins    "Skill agent-supervision (daily health of AI agents + MBA, handoff gaps)"
task AIA-11 P0 004 v0.4.0 ai_agents  "Promotions, changeset, coverage update"

# --- v0.5.0: tasks of lane 006 (WhatsApp complete & reports) ---
task WAR-01 P0 006 v0.5.0 whatsapp   "Domain briefs whatsapp.md (templates, scheduled, calls) and reports.md"
task WAR-02 P0 006 v0.5.0 whatsapp   "Template create/edit/delete (irreversible + confirm), sync, quality"
task WAR-03 P1 006 v0.5.0 whatsapp   "Template rejection explainer (reason -> fix suggestions)"
task WAR-04 P0 006 v0.5.0 whatsapp   "Scheduled messages list/create/cancel"
task WAR-05 P2 006 v0.5.0 whatsapp   "Contact call history"
task WAR-06 P0 006 v0.5.0 whatsapp   "Campaign results metrics"
task WAR-07 P0 006 v0.5.0 reports    "reports toolset: summary, agents, inboxes, labels, teams, CSAT, SLA, heatmap, bot metrics"
task WAR-08 P1 006 v0.5.0 plugins    "Skill campaign-retro"
task WAR-09 P0 006 v0.5.0 whatsapp   "Promotions, changeset, coverage"

# --- v0.6.0: tasks of lane 005 (Hosted MCP on Cloud Run + scoped MCP tokens) ---
task REM-01 P0 005 v0.6.0 server     "Refactor config to per-request context (no process-global env in tool handlers)"
task REM-02 P0 005 v0.6.0 hosted     "src/http.ts Streamable HTTP stateless entry point"
task REM-03 P0 005 v0.6.0 hosted     "Resource server: protected-resource metadata, introspection client + cache, audience/scope/account checks, WWW-Authenticate"
task REM-04 P0 005 v0.6.0 server     "Scope-based tool filtering and pre-call refusal"
task REM-05 P0 005 v0.6.0 hosted     "Instance allowlist + limits + structured logging without secrets"
task REM-06 P0 005 v0.6.0 hosted     "Dockerfile (distroless), healthcheck, image build workflow (WIF -> Artifact Registry)"
task REM-07 P0 005 v0.6.0 hosted     "Terraform PR in airys-platform/infra: Cloud Run mcp, NEG, host rules, Armor"
task REM-09 P0 005 v0.6.0 hosted     "Draft the AirysChat lane MCP tokens & OAuth (spec + tasks) from ADR 0006"
task REM-10 P0 005 v0.6.0 hosted     "AirysChat: token model, OAuth AS endpoints, consent UI, settings UI, scope enforcement"
task REM-11 P0 005 v0.6.0 hosted     "Staging deploy + client checks (Claude.ai connector OAuth, Claude Code, Codex, Gemini CLI, Antigravity)"
task REM-12 P0 005 v0.6.0 hosted     "Security review (SSRF, token handling, scope bypass, DoS, prompt-injection surface)"
task REM-13 P1 005 v0.6.0 hosted     "Load test (k6) 50 rps"
task REM-14 P1 005 v0.6.0 hosted     "Prod deploy mcp.airys.chat"
task REM-15 P2 005 v0.6.0 hosted     "Managed-instance routing (/<instance>/mcp)"

# --- v0.7.0: tasks of lane 007 (MCP Apps, elicitation, tasks) ---
task APP-01 P0 007 v0.7.0 apps       "Client capability matrix (Apps, elicitation, tasks) for Claude, ChatGPT, Muse, Codex, Gemini CLI, Antigravity, Cursor"
task APP-02 P0 007 v0.7.0 apps       "Apps scaffolding (packages/server/src/apps), build pipeline, CSP"
task APP-03 P0 007 v0.7.0 apps       "crm_board app"
task APP-04 P0 007 v0.7.0 apps       "campaign_preflight_report app"
task APP-05 P2 007 v0.7.0 apps       "conversation_view app with untrusted fencing"
task APP-06 P0 007 v0.7.0 server     "Elicitation-based confirmation with confirm fallback"
task APP-07 P1 007 v0.7.0 server     "Tasks for campaign send and bulk updates (progress, cancel)"
task APP-08 P0 007 v0.7.0 apps       "Changeset, docs, promotions"

# --- v0.8.0: tasks of lane 008 (Admin & help center) ---
task ADM-01 P0 008 v0.8.0 specs      "Domain briefs admin.md, help_center.md"
task ADM-02 P0 008 v0.8.0 admin      "Inboxes, agents, teams (CRUD + members)"
task ADM-03 P1 008 v0.8.0 admin      "Automation rules, macros"
task ADM-04 P0 008 v0.8.0 admin      "Webhooks + integrations hooks with URL validation"
task ADM-05 P1 008 v0.8.0 admin      "Custom attributes, SLA policies, labels CRUD, canned responses CRUD"
task ADM-06 P2 008 v0.8.0 admin      "Account settings, audit logs read"
task ADM-07 P0 008 v0.8.0 help_center "help_center: portals, categories, articles CRUD + publish, search"
task ADM-08 P1 008 v0.8.0 plugins    "Skill account-audit"
task ADM-09 P0 008 v0.8.0 admin      "Promotions, changeset, coverage"

# --- v0.9.0: tasks of lane 009 (Airys platform API toolset) ---
task PLT-01 P0 009 v0.9.0 specs      "Map platform roadmap (Airys-AI specs) to candidate tools; contract doc in docs/api/domains/platform.md"
task PLT-02 P0 009 v0.9.0 platform   "Second HTTP client + AIRYS_API_TOKEN config; toolset platform"
task PLT-03 P0 009 v0.9.0 platform   "platform_health, platform_signals_attribution_list, platform_signals_outcome_record, platform_numbers_health, platform_alerts_list"
task PLT-04 P1 009 v0.9.0 platform   "platform_instances_list, platform_usage"
task PLT-05 P1 009 v0.9.0 plugins    "Skill number-health-watch"
task PLT-06 P0 009 v0.9.0 platform   "Changeset, verification, docs"

# --- v1.0.0: tasks of lane 010 (Distribution & GA) ---
task GA-01 P0 010 v1.0.0 plugins     "Shared skills/ + build step copying into each plugin bundle"
task GA-02 P0 010 v1.0.0 plugins     "Codex plugin (.codex-plugin)"
task GA-03 P0 010 v1.0.0 plugins     "Gemini CLI extension (gemini-extension.json)"
task GA-04 P0 010 v1.0.0 plugins     "Antigravity plugin (.agents plugin)"
task GA-05 P0 010 v1.0.0 server      "npm scope @airyschat + trusted publishing with provenance"
task GA-06 P0 010 v1.0.0 server      "MCP Registry chat.airys/mcp (server.json + publish workflow)"
task GA-07 P0 010 v1.0.0 server      "Secret scan of full history; LICENSE review; SECURITY.md"
task GA-08 P0 010 v1.0.0 specs       "Docs: per-client quickstarts, generated tool reference, safety model"
task GA-09 P1 010 v1.0.0 specs       "Guide: AirysChat MCP + Meta WhatsApp Business Tools MCP"
task GA-10 P1 010 v1.0.0 specs       "Muse Code / Muse connector setup guide"
task GA-11 P0 010 v1.0.0 server      "API stability policy + freeze stable tools"
task GA-12 P1 010 v1.0.0 hosted      "Claude/ChatGPT connector directory submission package"


# --- one epic per release ---
epic() { # milestone lane title
  local dir; dir=$(ls -d specs/${2}-* | head -1)
  issue "Epic $1 — $3" "$1" "type:epic,lane:$2" \
    "Tracks release **$1** — spec: [\`$dir/spec.md\`](../blob/main/$dir/spec.md), tasks: [\`$dir/tasks.md\`](../blob/main/$dir/tasks.md).

Per-task issues are created when the lane starts (\`.agents/skills/spec-lane\`)."
}
epic v0.3.0 003 "CRM & contacts"
epic v0.4.0 004 "AI agents & Meta Business Agent"
epic v0.5.0 006 "WhatsApp complete & reports"
epic v0.6.0 005 "Hosted MCP on Cloud Run + scoped MCP tokens"
epic v0.7.0 007 "MCP Apps, elicitation, tasks"
epic v0.8.0 008 "Admin & help center"
epic v0.9.0 009 "Airys platform API toolset"
epic v1.0.0 010 "GA & distribution"

# --- owner decisions ---
decision() { issue "Decision: $1" "$2" "needs-decision,lane:$3" "$4"; }
decision "OAuth design for hosted MCP" v0.6.0 005 "Options in ADR 0004 (a) Doorkeeper in AirysChat (b) \`mcp\` as AS + AirysChat consent page (c) MCP-scoped tokens. Recommendation: (b) now, (c) later."
decision "npm scope @airyschat and public npm timing" v1.0.0 010 "Confirm ownership of the \`@airyschat\` npm scope. Recommendation: GitHub Packages until 1.0."
decision "Captain vs AirysChat AI Agents coverage" v0.4.0 004 "Recommendation: curate AI Agents + MBA; Captain catalog-only unless still sold."
decision "MCP Registry namespace" v1.0.0 010 "Recommendation: \`chat.airys/mcp\` (DNS verification) over \`io.github.airyschat/mcp\`."
