# AirysChat MCP

AirysChat for AI agents. This monorepo ships:

- **[`@airyschat/mcp`](packages/server/README.md)** — an MCP server that lets Claude, ChatGPT, Codex,
  Gemini, Antigravity, Muse and any MCP client work with AirysChat: conversations, contacts,
  WhatsApp templates and campaigns today; CRM, AI agents, Meta Business Agent, reports and admin next.
- **Plugins** for agent clients (Claude Code now; Codex, Gemini CLI and Antigravity in 1.0).
- **Skills** that encode safe AirysChat workflows (triage, campaign pre-flight, pipeline review…).

> **Status — v0.1.0, private, pre-release.** 28 tools, verified against a mock API. The project
> restarted on 2026-10-26; see the [release train](specs/README.md).

## Why this exists

Every major assistant now speaks MCP and installs plugins/skills. AirysChat customers increasingly
operate through those assistants instead of a dashboard. The goal is simple: **every AirysChat
action reachable by any agent, safely** — from a local install or a hosted URL (`mcp.airys.chat`).

## Roadmap at a glance

| Release | Theme | Target |
|---|---|---|
| 0.2.0 | Foundation + API catalog (`airyschat_api_search`) | 2026-11-09 |
| 0.3.0 | CRM & contacts | 2026-11-30 |
| 0.4.0 | AI agents & Meta Business Agent | 2026-12-14 |
| 0.5.0 | Hosted MCP on Cloud Run | 2027-01-11 |
| 0.6.0 | WhatsApp complete & reports | 2027-02-01 |
| 0.7.0 | MCP Apps, elicitation, tasks | 2027-02-22 |
| 0.8.0 | Admin & help center | 2027-03-15 |
| 0.9.0 | Airys platform API toolset | after platform M2 |
| 1.0.0 | GA: public npm, MCP Registry, 4 client plugins, OAuth | 2027-04-30 |

Coverage is computed from the AirysChat routes: [docs/api/coverage.md](docs/api/coverage.md).

## Repository

| Path | |
|---|---|
| [`packages/server`](packages/server) | The MCP server |
| [`plugins/`](plugins) | Client plugin bundles |
| [`specs/`](specs/README.md) | Lanes, tasks and verification — the plan |
| [`docs/adr`](docs/adr) | Architecture decisions |
| [`docs/api`](docs/api) | API inventory and coverage |
| [`docs/research`](docs/research) | Market research (dated) |
| [`docs/architecture.md`](docs/architecture.md) | How the pieces fit |
| [`AGENTS.md`](AGENTS.md) | Guide for coding agents (rules, skills, subagents) |

## Development

```bash
nvm use            # Node 24
corepack enable    # pnpm
pnpm install
pnpm check         # typecheck + smoke + inventory drift
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the feature/release workflow and
[SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

MIT
