# AirysChat Plugin for OpenAI Codex

Bundles the `@airyschat/mcp` server and all 8 AirysChat operational skills (`airyschat`, `triage`, `campaign-check`, `crm-pipeline-review`, `agent-supervision`, `campaign-retro`, `account-audit`, `number-health-watch`) for OpenAI Codex CLI and Codex Desktop.

## Quickstart

1. Export your AirysChat credentials:
   ```bash
   export AIRYSCHAT_BASE_URL="https://airys.chat"
   export AIRYSCHAT_API_KEY="your-api-access-token"
   export AIRYSCHAT_ACCOUNT_ID="1"
   export AIRYSCHAT_TOOLSETS="core,whatsapp,crm,ai_agents,meta_agent,reports,admin,help_center"
   ```

2. Add the MCP server to `~/.codex/config.toml` (or load this plugin directory):
   ```toml
   [mcp_servers.airyschat]
   command = "npx"
   args = ["-y", "@airyschat/mcp@latest"]
   env = { AIRYSCHAT_BASE_URL = "https://airys.chat", AIRYSCHAT_API_KEY = "your-api-access-token", AIRYSCHAT_ACCOUNT_ID = "1", AIRYSCHAT_TOOLSETS = "core,whatsapp,crm" }
   ```

   Or connect to the hosted Streamable HTTP endpoint:
   ```toml
   [mcp_servers.airyschat]
   url = "https://mcp.airys.chat/mcp"
   bearer_token_env_var = "AIRYSCHAT_MCP_TOKEN"
   ```
