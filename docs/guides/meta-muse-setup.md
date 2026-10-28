# Meta Muse & Muse Code Setup Guide (`GA-10`)

`@airyschat/mcp` supports both **Meta Muse Code** (local developer CLI/IDE agent) and **Meta Muse** (hosted enterprise workspace assistant) over the Model Context Protocol (`2026-07-28`).

## 1. Meta Muse Code (Local Stdio)

Add `@airyschat/mcp` to your Muse Code MCP configuration (`.muse/mcp.json` or `~/.config/muse/mcp.json`):

```json
{
  "mcpServers": {
    "airyschat": {
      "command": "npx",
      "args": ["-y", "@airyschat/mcp@latest"],
      "env": {
        "AIRYSCHAT_BASE_URL": "${AIRYSCHAT_BASE_URL}",
        "AIRYSCHAT_API_KEY": "${AIRYSCHAT_API_KEY}",
        "AIRYSCHAT_ACCOUNT_ID": "${AIRYSCHAT_ACCOUNT_ID}",
        "AIRYSCHAT_TOOLSETS": "core,whatsapp,crm,ai_agents,meta_agent,reports,admin,help_center",
        "AIRYSCHAT_FEATURES": "beta"
      }
    }
  }
}
```

### Bundled Skills for Muse Code

Copy or symlink the shared `skills/` directory into `.agents/skills/` (or `.muse/skills/`) so Muse Code discovers:
- `airyschat` — core trust boundary and ID conventions (`display_id` vs primary key)
- `triage` — read-only inbox triage
- `campaign-check` — pre-launch WhatsApp broadcast check
- `campaign-retro` — post-campaign delivery, read, reply, and conversion retrospective
- `crm-pipeline-review` — stuck deals, overdue activities, and next actions
- `agent-supervision` — daily health of AI Agents and Meta Business Agent
- `account-audit` — read-only administrative hygiene audit
- `number-health-watch` — cross-instance WhatsApp number quality and token health

---

## 2. Meta Muse Workspace Connector (Remote Streamable HTTP)

Meta Muse connects to the hosted Streamable HTTP server at `https://mcp.airys.chat/mcp` (or `https://mcp.airys.chat/<instance>/mcp` for dedicated AirysChat instances).

### Connection Parameters

| Setting | Value |
|---|---|
| **Transport** | Streamable HTTP (`2026-07-28` / `2025-06-18`) |
| **Server URL** | `https://mcp.airys.chat/mcp` |
| **Protected Resource Metadata (RFC 9728)** | `https://mcp.airys.chat/.well-known/oauth-protected-resource` |
| **Authorization Server Metadata (RFC 8414)** | `https://airys.chat/.well-known/oauth-authorization-server` |
| **Grant Type** | Authorization Code + PKCE (`S256`) |
| **Recommended Scopes (Read + Reversible Writes)** | `mcp:read mcp:write mcp:toolset:core mcp:toolset:whatsapp mcp:toolset:crm mcp:toolset:reports` |
| **Full Supervision Scopes (with Confirmation Gates)** | `mcp:irreversible mcp:toolset:core mcp:toolset:whatsapp mcp:toolset:crm mcp:toolset:ai_agents mcp:toolset:meta_agent mcp:toolset:reports` |

### Capabilities Supported in Meta Muse

- **Multi-Round-Trip Elicitation (`2026-07-28`)**: When Muse invokes an `irreversible: true` tool (such as `wa_campaign_launch`, `crm_deal_close`, or `mba_business_info_update`), `@airyschat/mcp` returns `resultType: "input_required"` with an HMAC-signed `requestState` so the human operator approves the exact side effect in the Muse UI.
- **Tasks & Progress Notifications**: Long-running operations (`wa_campaign_launch`, `wa_campaign_test_send`, `crm_deals_bulk_update`) attach `_meta["io.modelcontextprotocol/related-task"]` and support `tasks/list`, `tasks/get`, and `tasks/cancel`.
- **MCP Apps (`ui://airyschat/*`)**: Interactive HTML cards (`crm-board.html`, `campaign-preflight-report.html`, `conversation-view.html`) render inline when the client advertises `io.modelcontextprotocol/ui`, and automatically fall back to structured JSON in text-only sessions.
