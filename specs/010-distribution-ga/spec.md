# 010 — Distribution & GA

- Release: **1.0.0** · Target 2027-04-30 · Prefix `GA`

## Why

1.0 is the public promise: stable tool names, semver, public npm, listed in the MCP Registry and in
the plugin marketplaces of the clients our customers use.

## What

- **Plugins** under `plugins/`: Claude Code (exists), Codex (`.codex-plugin`), Gemini CLI
  (`gemini-extension.json`), Antigravity (`.agents` plugin). Shared skills in `skills/` copied into
  each bundle at build time.
- **MCP Registry** entry `chat.airys/mcp` (DNS verification) with both packages (npm stdio) and
  remotes (`mcp.airys.chat`).
- **Public npm** `@airyschat/mcp` with provenance (OIDC trusted publishing).
- **Public repo**: history secret scan (gitleaks/trufflehog), license confirmation, SECURITY.md.
- **Docs site** (or README set): quickstarts per client, toolset reference generated from code,
  safety model, "AirysChat MCP + Meta WhatsApp Business Tools MCP" complementarity guide, Muse Code
  and Antigravity setup.
- **OAuth live** (005b) for Claude.ai / ChatGPT / Muse connectors.
- API stability policy: stable tool names/params frozen; deprecations follow ADR 0003.

## Acceptance

- `npx @airyschat/mcp` from public npm; registry lists the server; 4 plugins install cleanly.
- Repo public with zero secret findings; 1.0.0 GitHub Release with notes.
