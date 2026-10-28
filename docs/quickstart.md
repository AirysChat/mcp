# Per-Client Quickstart Guide (`@airyschat/mcp`)

`@airyschat/mcp` runs either as a **local stdio server** (`npx -y @airyschat/mcp@latest`) or as a **remote Streamable HTTP connector** (`https://mcp.airys.chat/mcp`).

## Environment Variables (Local Stdio)

| Variable | Required | Default | Description |
|---|---|---|---|
| `AIRYSCHAT_BASE_URL` | Yes | — | Base URL of your AirysChat instance (e.g. `https://airys.chat`) |
| `AIRYSCHAT_API_KEY` | Yes | — | Personal `api_access_token` (Profile Settings → Access Token) |
| `AIRYSCHAT_ACCOUNT_ID` | Yes | — | Numeric account ID from your AirysChat URL (`/app/accounts/<id>/...`) |
| `AIRYSCHAT_TOOLSETS` | No | `core,whatsapp` | Comma-separated list: `core`, `whatsapp`, `crm`, `ai_agents`, `meta_agent`, `reports`, `admin`, `help_center`, `platform` |
| `AIRYSCHAT_FEATURES` | No | `stable` | Highest tool maturity tier exposed: `stable`, `beta`, or `experimental` |
| `AIRYSCHAT_READ_ONLY` | No | `false` | Set to `1` or `true` to hide and refuse all write tools |
| `AIRYS_PLATFORM_URL` | No | `https://api.airys.chat` | Base URL for the `platform` toolset (`AirysBR/airys-platform`) |
| `AIRYS_API_TOKEN` | No | — | Bearer token for `api.airys.chat` (required only when using authenticated `platform` tools) |

---

## 1. Claude Code

Install the bundled Claude Code plugin (includes `.mcp.json` and all 8 operational skills):

```bash
export AIRYSCHAT_BASE_URL="https://airys.chat"
export AIRYSCHAT_API_KEY="your-api-access-token"
export AIRYSCHAT_ACCOUNT_ID="1"
export AIRYSCHAT_TOOLSETS="core,whatsapp,crm,ai_agents,meta_agent,reports,admin,help_center"
```

```text
/plugin marketplace add AirysChat/mcp
/plugin install airyschat@airyschat
```

Or add the server directly via CLI:

```bash
claude mcp add airyschat -- npx -y @airyschat/mcp@latest
```

---

## 2. OpenAI Codex (CLI & Desktop)

Use the Codex plugin in [`plugins/codex`](../plugins/codex/README.md) or add to `~/.codex/config.toml`:

```toml
[mcp_servers.airyschat]
command = "npx"
args = ["-y", "@airyschat/mcp@latest"]
env = { AIRYSCHAT_BASE_URL = "https://airys.chat", AIRYSCHAT_API_KEY = "your-api-access-token", AIRYSCHAT_ACCOUNT_ID = "1", AIRYSCHAT_TOOLSETS = "core,whatsapp,crm" }
```

---

## 3. Google Gemini CLI

Install the Gemini CLI extension from [`plugins/gemini`](../plugins/gemini/README.md):

```bash
export AIRYSCHAT_BASE_URL="https://airys.chat"
export AIRYSCHAT_API_KEY="your-api-access-token"
export AIRYSCHAT_ACCOUNT_ID="1"

gemini extensions install https://github.com/AirysChat/mcp/tree/main/plugins/gemini
```

---

## 4. Google Antigravity

Copy or link [`plugins/antigravity`](../plugins/antigravity/README.md) into `.agents/plugins/airyschat` (workspace) or `~/.gemini/config/plugins/airyschat` (global), or add `@airyschat/mcp` to `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "airyschat": {
      "command": "npx",
      "args": ["-y", "@airyschat/mcp@latest"],
      "env": {
        "AIRYSCHAT_BASE_URL": "https://airys.chat",
        "AIRYSCHAT_API_KEY": "your-api-access-token",
        "AIRYSCHAT_ACCOUNT_ID": "1",
        "AIRYSCHAT_TOOLSETS": "core,whatsapp,crm,ai_agents,meta_agent,reports,admin,help_center"
      }
    }
  }
}
```

---

## 5. Claude Desktop / Cursor

Add to `claude_desktop_config.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "airyschat": {
      "command": "npx",
      "args": ["-y", "@airyschat/mcp@latest"],
      "env": {
        "AIRYSCHAT_BASE_URL": "https://airys.chat",
        "AIRYSCHAT_API_KEY": "your-api-access-token",
        "AIRYSCHAT_ACCOUNT_ID": "1",
        "AIRYSCHAT_TOOLSETS": "core,whatsapp,crm"
      }
    }
  }
}
```

---

## 6. Remote Connector (Claude.ai, ChatGPT, Meta Muse)

Connect to `https://mcp.airys.chat/mcp` (or `https://mcp.airys.chat/<instance>/mcp` for dedicated instances) using OAuth 2.1 + PKCE and scoped MCP tokens (`mcp:read`, `mcp:write`, `mcp:irreversible`). See:
- [Meta Muse & Muse Code Setup Guide](./guides/meta-muse-setup.md)
- [Claude & ChatGPT Connector Directory Guide](./distribution/connector-directories.md)
