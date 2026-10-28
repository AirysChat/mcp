# AirysChat MCP

AirysChat for AI agents. This monorepo ships:

- **[`@airyschat/mcp`](packages/server/README.md)** — an MCP server that lets Claude, ChatGPT, Codex,
  Gemini, Antigravity, Muse and any MCP client work with AirysChat: conversations, contacts,
  CRM, AI Agents, Meta Business Agent, WhatsApp templates/campaigns/flows, analytics reports,
  account administration, Help Center, and the Airys Platform API (`api.airys.chat`).
- **Plugins** for 4 agent clients: [Claude Code](plugins/claude/README.md), [OpenAI Codex](plugins/codex/README.md), [Google Gemini CLI](plugins/gemini/README.md), and [Google Antigravity](plugins/antigravity/README.md).
- **Skills** (`skills/*`) that encode safe AirysChat workflows (`airyschat`, `triage`, `campaign-check`, `campaign-retro`, `crm-pipeline-review`, `agent-supervision`, `account-audit`, `number-health-watch`).

> **Status — 212 curated & catalog tools across 9 toolsets (`80` `stable`, `98` `beta`, `34` `experimental`) + embedded 807-endpoint catalog (`airyschat_api_search` + `airyschat_api`) + 3 interactive MCP Apps (`ui://airyschat/*`).** See the [Quickstart Guide](docs/quickstart.md), [Generated Tool Reference](docs/tools/reference.md), [Safety Model](docs/safety-model.md), and [Release Train](specs/README.md).

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
| 0.5.0 | WhatsApp complete & reports | 2027-01-11 |
| 0.6.0 | Hosted MCP on Cloud Run + scoped MCP tokens | 2027-03-01 |
| 0.7.0 | MCP Apps, elicitation, tasks | 2027-03-22 |
| 0.8.0 | Admin & help center | 2027-04-12 |
| 0.9.0 | Airys platform API toolset | after platform M2 |
| 1.0.0 | GA: public npm, MCP Registry, 4 client plugins, connector directories | 2027-05-31 |

Coverage is computed from the AirysChat routes: [docs/api/coverage.md](docs/api/coverage.md).

## Repository

| Path | |
|---|---|
| [`packages/server`](packages/server) | The MCP server (`stdio` + stateless Streamable HTTP) |
| [`plugins/`](plugins) | Client plugin bundles (`claude`, `codex`, `gemini`, `antigravity`) |
| [`skills/`](skills) | Canonical shared operational skills synced into every plugin bundle |
| [`server.json`](server.json) | Official MCP Registry manifest (`chat.airys/mcp`) |
| [`specs/`](specs/README.md) | Lanes, tasks and verification — the plan |
| [`docs/tools/reference.md`](docs/tools/reference.md) | Generated reference for all 212 tools |
| [`docs/quickstart.md`](docs/quickstart.md) | Per-client setup (Claude, Codex, Gemini CLI, Antigravity, Cursor, Muse) |
| [`docs/safety-model.md`](docs/safety-model.md) | Indirect prompt-injection fencing, write gates, elicitation, SSRF |
| [`docs/stability-policy.md`](docs/stability-policy.md) | API stability policy & frozen `stable` tool surface |
| [`docs/guides/`](docs/guides) | Meta WhatsApp Business Tools MCP complementarity & Meta Muse setup |
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
