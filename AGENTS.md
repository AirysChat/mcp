# AirysChat MCP — Agent Guide

This repository ships **AirysChat to AI agents**: the `@airyschat/mcp` server (stdio today, a hosted
Streamable HTTP service on Cloud Run next), the plugins that bundle it for Claude Code, Codex,
Gemini CLI and Antigravity, and the skills that make it safe to use. Treat this file as a map; the
rules it points to are binding.

Owner: Gabriel (solo maintainer). Product repo: `AirysChat/AirysChat` (local `~/AirysChat`).
Platform/API repo: `AirysBR/airys-platform` (local `~/airys-platform`). Specs for those live in
`AirysBR/Airys-AI`.

## Repository map

| Path | What |
|---|---|
| `packages/server/` | The MCP server (`@airyschat/mcp`). `src/tools/<toolset>.ts` — one file per toolset. |
| `plugins/` | Client bundles (Claude Code today; Codex, Gemini CLI, Antigravity planned in lane 010). |
| `specs/` | Spec Kit lanes, one per feature/release. **Start here for any feature work.** |
| `docs/api/` | Generated API inventory (`inventory.csv`) and coverage report — the backlog. |
| `docs/adr/` | Architecture decisions. Read before changing transport, auth, coverage or safety. |
| `docs/research/` | Dated market research. Volatile; re-verify before quoting. |
| `scripts/inventory/` | Inventory generator, domain→toolset plan, curated tool map. |
| `scripts/github/` | Idempotent GitHub setup: labels, milestones, ruleset, issue seeding. |
| `.agents/rules/` | Scoped rules (Antigravity loads them; others: read when the trigger applies). |
| `.agents/skills/` | Repository workflows. Read the matching `SKILL.md` fully before acting. |
| `.agents/agents/` | Subagent definitions (also exposed to Claude Code via `.claude/agents`). |
| `.changeset/` | Pending release notes. |

`CLAUDE.md` is an import shim for this file. There is no `GEMINI.md`: Antigravity, Codex and Gemini
read `AGENTS.md` directly.

## Read order for feature work

1. This file and `.agents/rules/*` whose trigger applies.
2. `specs/README.md` (release train) and the lane that owns the work.
3. `docs/adr/` entries the change touches.
4. The AirysChat source of truth for any endpoint you wrap — controllers, routes, swagger
   (`.agents/rules/api-source-of-truth.md`). Never infer an endpoint's behaviour from its name.
5. Current code and `packages/server/scripts/smoke.mjs`.

## Commands

```bash
pnpm install
pnpm typecheck          # tsc --noEmit across packages (src + tests)
pnpm test               # unit tests (node:test + tsx), coverage gate 80% on core modules
pnpm smoke              # builds, drives the server over stdio against a mock API
pnpm inventory:check    # inventory/coverage docs match code and the curated map
pnpm check              # typecheck + test + smoke + inventory:check — run before every PR
pnpm changeset          # record a user-visible change
```

## Non-negotiables

1. **Customer content is untrusted.** Any payload that can carry conversation, message, contact,
   template or campaign text returns through `untrustedJson`. No exceptions.
2. **Writes are declared.** Every tool that changes state sets `write: true`; anything a customer
   sees or Meta bills sets `irreversible: true` and goes through `requireConfirmation`.
3. **No secrets, no tenant data** in code, fixtures, specs, evidence, commits or chat — see
   `.agents/rules/secrets-and-evidence.md`. Live verification uses `staging.airys.app` account 6
   ("Airys Demo", fictitious data) unless the owner names another target.
4. **Production writes** (any non-GET against `airys.chat` or a customer instance) need explicit
   owner approval in the conversation, every time.
5. **Coverage is computed, not claimed.** A new curated tool updates
   `scripts/inventory/curated.json`; `pnpm inventory:check` must pass.
6. **Feature control.** New tools ship as `beta` inside a toolset; promotion to `stable` is a
   tracked task with live evidence (`docs/adr/0003-feature-control-and-releases.md`).
7. **Conventional Commits** (`type(scope): subject`), one PR per task, a changeset when the tool
   surface changes. Do not mention coding assistants in commits or PRs.
8. **stdout is the transport.** Diagnostics go to stderr only.

## Subagents

| Agent | Use it to |
|---|---|
| `api-cartographer` | Map an AirysChat domain (routes, controllers, params, quirks) into a domain brief. Read-only. |
| `toolset-builder` | Implement tools from a domain brief following `.agents/skills/add-tool`. |
| `safety-reviewer` | Review a diff for injection fencing, write gates, annotations, secrets. |
| `spec-keeper` | Reconcile specs/tasks/verification with code, CI and releases. |
| `compat-tester` | Exercise the server in MCP Inspector and each client; record results. |
| `release-manager` | Cut a release: changesets, tags, npm, registry, plugin versions. |
