# AirysChat Plugin for Google Antigravity

Native Antigravity plugin (`plugin.json`, `mcp_config.json`, `rules/AGENTS.md`, and `skills/*`) bundling `@airyschat/mcp` and all 8 AirysChat operational skills.

## Installation

Copy or link `plugins/antigravity` into `.agents/plugins/airyschat` in your workspace (or `~/.gemini/config/plugins/airyschat` globally), or reference it in `plugins.json`:

```bash
export AIRYSCHAT_BASE_URL="https://airys.chat"
export AIRYSCHAT_API_KEY="your-api-access-token"
export AIRYSCHAT_ACCOUNT_ID="1"
```

For remote Streamable HTTP in `mcp_config.json`:

```json
{
  "mcpServers": {
    "airyschat": {
      "url": "https://mcp.airys.chat/mcp"
    }
  }
}
```
