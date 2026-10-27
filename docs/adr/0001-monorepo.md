# ADR 0001 — Monorepo for server, plugins and skills

- Status: Accepted (2026-10-26)
- Deciders: Gabriel

## Context

Until 2026-08 the MCP server (`~/airyschat-mcp`) and the Claude Code plugin
(`~/airyschat-claude-plugin`) were separate local repositories, neither on GitHub. The plugin pins
the server's tool names and behaviours in its skills, so every tool change needed a coordinated
change in the other repo. The roadmap adds plugins for Codex, Gemini CLI and Antigravity, a hosted
HTTP entry point, and a generated API catalog — all coupled to the same tool surface.

Market practice for official MCP servers of this size (Cloudflare, Stripe agent-toolkit, Sentry) is
a monorepo with Changesets. Claude Code marketplaces are designed to live at the root of the repo
that holds the plugins.

## Decision

One repository, `AirysChat/mcp`, managed with **pnpm workspaces** and **Changesets**:

```
packages/server/          @airyschat/mcp (stdio bin; HTTP entry added in lane 005)
plugins/claude/           Claude Code plugin (imported with history from airyschat-claude-plugin)
plugins/{codex,gemini,antigravity}/   lane 010
skills/                   product skills shared by every plugin (lane 010 moves them here)
.claude-plugin/marketplace.json       Claude marketplace at the repo root
specs/ docs/ scripts/ .agents/
```

A tool change, its skill update and its plugin bump land in one PR.

## Consequences

- One CI, one release train; plugins version independently through Changesets when they change.
- Product skills must stay client-neutral (`SKILL.md` is now an open standard); client-specific
  wrapping lives in each plugin directory, generated or copied by a script checked in CI (lane 010).
- The repo is private until 1.0, so marketplace installs need GitHub access until then.
