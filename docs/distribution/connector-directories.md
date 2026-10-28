# Claude & ChatGPT Connector Directory Submission Package (`GA-12`)

This document contains the complete submission metadata, OAuth 2.1 endpoints, security disclosures, and reviewer test plan for listing **AirysChat (`mcp.airys.chat`)** in:
1. **Anthropic MCP Connector Directory** (Claude.ai & Claude Desktop)
2. **OpenAI ChatGPT Connectors / Developer Mode Directory**

> **Prerequisite**: Production rollout of `https://mcp.airys.chat/mcp` and AirysChat OAuth AS endpoints (`REM-10`, `REM-14` in [lane 005](../../specs/005-hosted-mcp/tasks.md)).

---

## 1. Connector Identity & Endpoints

| Field | Value |
|---|---|
| **Connector Name** | AirysChat |
| **Publisher** | Airys (`https://airys.chat`) |
| **Registry ID** | `chat.airys/mcp` |
| **Category** | Customer Support, CRM & Messaging (WhatsApp Business Platform) |
| **Remote MCP Endpoint (Streamable HTTP)** | `https://mcp.airys.chat/mcp` |
| **Protected Resource Metadata (RFC 9728)** | `https://mcp.airys.chat/.well-known/oauth-protected-resource` |
| **OAuth 2.1 Authorization Server Metadata (RFC 8414)** | `https://airys.chat/.well-known/oauth-authorization-server` |
| **Authorization Endpoint** | `https://airys.chat/oauth/authorize` |
| **Token Endpoint** | `https://airys.chat/oauth/token` |
| **Revocation Endpoint** | `https://airys.chat/oauth/revoke` |
| **Introspection Endpoint** | `https://airys.chat/oauth/introspect` |
| **PKCE Requirement** | `S256` required |
| **Privacy Policy** | `https://airys.chat/privacy` |
| **Terms of Service** | `https://airys.chat/terms` |
| **Security Policy & Vulnerability Reporting** | `https://github.com/AirysChat/mcp/blob/main/SECURITY.md` (`security@airys.chat`) |

---

## 2. Scopes Requested During OAuth Consent

| Scope | Description Shown on Consent Screen |
|---|---|
| `mcp:read` | Read conversations, contacts, CRM pipelines/deals, WhatsApp templates/campaigns, AI agent status, and analytics reports on the selected AirysChat account. |
| `mcp:write` | Create and update reversible records (drafts, private notes, deal stage moves, contact attributes, labels). |
| `mcp:irreversible` | Perform customer-visible or Meta-billed actions (reply to conversations, launch WhatsApp campaigns, close CRM deals as won/lost, publish/switch AI Agent modes, delete records). Every call still requires per-action confirmation. |
| `mcp:toolset:<name>` | Optional restriction to specific domains (`core`, `whatsapp`, `crm`, `ai_agents`, `meta_agent`, `reports`, `admin`, `help_center`, `platform`). |

---

## 3. Safety & Tool Annotations Compliance Checklist

- [x] `readOnlyHint: true` on all read tools (`write !== true`).
- [x] `destructiveHint: true` on all irreversible write tools (`irreversible: true`).
- [x] `idempotentHint: true` on idempotent tools.
- [x] `openWorldHint: true` on all tools.
- [x] Multi-round-trip form elicitation (`2026-07-28`) with HMAC-signed `requestState` and `confirm: true` fallback on every `irreversible: true` tool.
- [x] Indirect prompt-injection fencing (`untrustedJson`) on all customer-authored content.
- [x] Zero-network CSP (`default-src 'none'; connect-src 'none'`) and zero `innerHTML` on all MCP App `ui://` resources (`crm-board.html`, `campaign-preflight-report.html`, `conversation-view.html`).

---

## 4. Reviewer Test Account Instructions

- **Staging Verification Instance**: `https://staging.airys.app` — Account **6** (`"Airys Demo"`, synthetic data only; zero real customer PII).
- **Safe Sample Prompts for Directory Reviewers**:
  1. *"List open conversations on Airys Demo and summarize the top priorities."* (`conversations_list`, `conversation_messages`)
  2. *"Open the interactive CRM board for pipeline 1."* (`crm_board` → renders `ui://airyschat/crm-board.html`)
  3. *"Run a pre-launch campaign health check for WhatsApp inbox 9."* (`wa_inbox_health`, `wa_templates_list`)
  4. *"Check AI Agent and Meta Business Agent readiness across inboxes."* (`ai_agents_list`, `mba_settings_get`)
