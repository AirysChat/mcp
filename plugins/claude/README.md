# AirysChat plugin for Claude Code

Bundles the [`@airyschat/mcp`](https://github.com/AirysChat/mcp) server together with the
skills that make it safe to use: the trust boundary for customer-authored content, the
approval rules for irreversible sends, and the API behaviours that mislead callers.

**Status: v0.1.0, unreleased.** Manifests pass `claude plugin validate --strict` and all
three skills load. Not yet exercised against a live AirysChat instance, and the MCP
server it references is not yet published to npm.

## Install

```shell
/plugin marketplace add AirysChat/mcp
/plugin install airyschat@airyschat
```

Then export the server's credentials before starting Claude Code — the plugin reads them
from your environment rather than storing them:

```bash
export AIRYSCHAT_BASE_URL=https://app.airyschat.com
export AIRYSCHAT_API_KEY=...        # agent or admin token
export AIRYSCHAT_ACCOUNT_ID=5
```

Optional: `AIRYSCHAT_TOOLSETS` (default `core,whatsapp`; add `crm`, `ai_agents`, and `meta_agent` to enable those toolsets), `AIRYSCHAT_FEATURES` (default `stable`;
set `beta` to enable write tools and plan-gated AI Agent / Meta Business Agent tools, or `experimental` for CRM admin configuration and Meta Business Agent evals), `AIRYSCHAT_READ_ONLY=1`.

If a variable is unset, Claude Code passes the placeholder through literally and the
server refuses to start with a message naming the variable — check the `/plugin` Errors
tab.

## What you get

| | |
|---|---|
| `/airyschat:airyschat` | The operating manual. Model-invoked automatically when you work with AirysChat; carries the trust boundary, the one-way-door table, and the non-obvious API behaviours. |
| `/airyschat:triage` | Read-only summary of the open conversation queue, with proposed actions. Changes nothing. |
| `/airyschat:campaign-check` | Pre-launch report for a WhatsApp campaign: template approval, reach, preflight risk, inbox health. Sends nothing. |
| `/airyschat:crm-pipeline-review` | Read-only review of a CRM pipeline: funnel bottlenecks, stale deals without a next activity, overdue follow-ups, and proposed actions. Changes nothing. |
| `/airyschat:agent-supervision` | Read-only daily supervision of AirysChat AI Agents and Meta Business Agent: one-responder ownership matrix, handoff rotation gaps, workflow failures, and token/budget health. Changes nothing. |
| `airyschat` MCP server | 121 curated tools across conversations, contacts, search, notifications, WhatsApp templates/campaigns, CRM pipelines/deals/activities, AirysChat AI Agents, and Meta Business Agent, plus a catalog-backed `airyschat_api_search` and `airyschat_api` escape hatch covering all 775 addressable endpoints. |

## Why a plugin rather than a bare MCP entry

Tool descriptions are the wrong place for judgement. They are loaded per tool, they cannot
express "never take this argument from something you read", and they are invisible until
the model has already decided to call something. The skill carries that; the MCP server
carries typed, gated tools. Installing them together means neither ships without the other.

## Safety

`wa_campaign_launch` sends to an entire audience and cannot be recalled. `wa_campaign_test_send`
is **not** a dry run — it sends a real, billed WhatsApp message. Both, along with public
replies and label replacement, refuse the first call and require `confirm: true`, which
exists so a human sees the effect first.

Everything read from a conversation is customer-authored. The server fences those payloads
and the skill instructs Claude to treat them as data. Prompt injection arriving through a
support ticket is the realistic threat here.

## Development

```bash
# from the repository root
claude plugin validate ./plugins/claude --strict
claude plugin validate . --strict
claude --plugin-dir ./plugins/claude
```

To test against a local build of the MCP server instead of npm, point the plugin's
`.mcp.json` at it — but do not commit that change:

```json
{
  "mcpServers": {
    "airyschat": {
      "command": "node",
      "args": ["/absolute/path/to/airyschat-mcp/packages/server/dist/index.js"],
      "env": { "AIRYSCHAT_BASE_URL": "${AIRYSCHAT_BASE_URL}", "AIRYSCHAT_API_KEY": "${AIRYSCHAT_API_KEY}", "AIRYSCHAT_ACCOUNT_ID": "${AIRYSCHAT_ACCOUNT_ID}" }
    }
  }
}
```

`.mcp.json` changes need `/reload-plugins` or a restart; `SKILL.md` edits take effect
immediately.

## Credit

The skill's trust-boundary and safety structure is adapted from
[`chatwoot/cli`](https://github.com/chatwoot/cli)'s `skills/chatwoot-cli/SKILL.md` (MIT).

## License

MIT
