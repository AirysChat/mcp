---
name: mcp-client-check
description: Check the server (stdio or hosted HTTP) in MCP clients — Inspector, Claude Code, Codex, Gemini CLI, Antigravity, Cursor, Claude.ai/ChatGPT/Muse for remote — and update the compatibility matrix. Use after SDK upgrades, new protocol features (Apps, elicitation, tasks) or before a release.
---

# MCP client compatibility check

## Matrix location

`docs/compat/matrix.md` — one row per client × feature, dated. Features: tools list/call,
annotations honoured, `outputSchema`/`structuredContent`, elicitation, MCP Apps, tasks, remote
headers, OAuth.

## Local (stdio)

```bash
pnpm --filter @airyschat/mcp build
SERVER="node $(pwd)/packages/server/dist/index.js"
npx @modelcontextprotocol/inspector --cli $SERVER --method tools/list | head
```

| Client | How to register |
|---|---|
| Claude Code | `claude mcp add airyschat -e AIRYSCHAT_BASE_URL=... -- node .../dist/index.js` or the plugin in `plugins/claude` |
| Codex | `~/.codex/config.toml` → `[mcp_servers.airyschat] command = "node" args = [".../dist/index.js"]` |
| Gemini CLI | `gemini mcp add airyschat node .../dist/index.js` |
| Antigravity | MCP servers settings (`mcp_config.json`) → command + env |
| Cursor | `.cursor/mcp.json` |

Use staging credentials per the `live-verify` skill; `AIRYSCHAT_READ_ONLY=1` unless testing writes.

## Remote (from lane 005)

Point clients at `https://mcp.staging.airys.chat/mcp` with headers `Authorization: Bearer …` and
`X-AirysChat-Account: 6`. For Claude.ai / ChatGPT / Muse connectors this requires OAuth (005b).

## What to check per client

1. Tool list matches toolsets/features config (default = stable only).
2. Write tools show as destructive/needs approval where the client supports annotations.
3. An irreversible tool without `confirm` returns the refusal text, not an error crash.
4. Untrusted payload notice is visible to the model.
5. New feature under test (structured output, elicitation form, App render, task progress).

Record results with date and client version. Failures → task in the owning lane with the client name.
