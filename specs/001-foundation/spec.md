# 001 — Foundation

- Release: **0.2.0** (with lane 002) · Target 2026-11-09 · Prefix `FND`
- Status: In progress (opened 2026-10-26)

## Why

v0.1.0 was written in August 2026 against a mock and never released. Since then AirysChat gained a
native CRM (lane 024), AI Agents, the Meta Business Agent, reports v2 and a Cloud Run platform API.
The MCP spec moved to **2026-07-28** (stateless HTTP, MRTR, cacheable lists, extensions), and every
major client (Claude, ChatGPT, Codex, Gemini CLI, Antigravity, Muse Code) now consumes MCP servers
and plugin bundles. Before adding coverage we need a repository that can absorb ~750 endpoints
without losing safety or control.

## What

1. **Monorepo** (`packages/server`, `plugins/*`, shared skills) — ADR 0001.
2. **GitHub** `AirysChat/mcp` (private), protected `main`, labels, milestones per release, issue
   and PR templates, CODEOWNERS, Dependabot.
3. **CI**: typecheck, smoke, unit tests, inventory drift check, audit.
4. **Releases**: Changesets + release workflow; distribution via GitHub Packages until 1.0.
5. **Feature control**: per-tool `stability` + `AIRYSCHAT_FEATURES` filter (ADR 0003).
6. **Protocol currency**: SDK 2.4.x, `outputSchema` + `structuredContent` for read tools, version
   read from `package.json`, spike on elicitation/MRTR for confirmations.
7. **Truth**: live-verify v0.1 tools on staging account 6; remove references to the nonexistent
   `swagger/tag_groups/airyschat_swagger.json`.
8. **Agent tooling**: `AGENTS.md`, `.agents/rules`, `.agents/skills`, `.agents/agents` (subagents),
   mirrored for Claude Code.
9. **Claude plugin** imported from `~/airyschat-claude-plugin` with history.

## Out of scope

New curated tools (lanes 003+), hosted transport and OAuth (005), public npm (010).

## Acceptance

- `pnpm check` green locally and in CI on every PR; `main` requires PR + green CI.
- A changeset-driven release PR produces `@airyschat/mcp@0.2.0` on GitHub Packages.
- Default tool list contains only `stable` tools; `AIRYSCHAT_FEATURES=beta` reveals the rest.
- Every v0.1 tool has a dated live readback (or documented quirk) in `verification.md`.
- Claude plugin installs from the repo marketplace and starts the server.
