# MCP Client Compatibility Matrix (`APP-01`)

- **Last verified**: 2026-10-29
- **Server version**: `@airyschat/mcp` (`0.6.0` live on staging Cloud Run `https://mcp-tdtyqbghua-rj.a.run.app`)
- **SDK**: `@modelcontextprotocol/server@2.4.0` (dual-era `2025-11-25` + `2026-07-28`)
- **Maintainer skill**: [`.agents/skills/mcp-client-check/SKILL.md`](../../.agents/skills/mcp-client-check/SKILL.md)

## Capability Matrix by Client

| Client | Transport | `tools/list` & `tools/call` | Annotations (`readOnlyHint` / `destructiveHint`) | `outputSchema` & `structuredContent` | Confirmations: Elicitation (`elicitation/create` / MRTR `input_required`) | Confirmations: `confirm: true` Fallback | MCP Apps (`ui://` / `text/html;profile=mcp-app`) | Tasks (`notifications/progress` & `tasks/*`) | OAuth 2.1 + PKCE (`RFC 9728`) |
|---|---|---|---|---|---|---|---|---|---|
| **Claude Desktop / Claude.ai** | stdio & Streamable HTTP | Supported | Supported (prompts before destructive tools) | Supported | Supported (`elicitation/create` form + MRTR rolling out) | Supported | **Supported** (`ui://` iframe sandbox + `postMessage` JSON-RPC bridge) | Supported (`notifications/progress` + cancellation) | Supported (Remote Connector OAuth 2.1 + PKCE) |
| **Claude Code** | stdio & Streamable HTTP | Supported | Supported (permission gate uses annotations) | Supported | Partial (interactive TTY form elicitation; headless uses fallback) | Supported | Degrades to `structuredContent` + fenced text | Supported (`notifications/progress` + `AbortSignal`) | Supported (`--transport http` + OAuth / Bearer) |
| **ChatGPT (Connectors / Apps)** | Streamable HTTP | Supported | Supported (`readOnlyHint` / `destructiveHint` gate confirmation) | Supported | Supported (MRTR / Apps confirmation UI) | Supported | **Supported** (MCP Apps `ui://` + `_meta.ui.resourceUri`) | Supported (progress streaming) | Supported (OAuth 2.1 + PKCE via RFC 9728) |
| **Meta Muse / Muse Code** | stdio & Streamable HTTP | Supported | Supported (maps to **Sentinel** read/write boundary) | Supported | Partial (Sentinel native prompt + `confirm: true`) | Supported | Supported in Muse Web/App; degrades to text in Muse Code CLI | Supported (`notifications/progress`) | Supported (OAuth 2.1 Bearer) |
| **OpenAI Codex CLI & App** | stdio & Streamable HTTP | Supported | Supported (sandbox approval policy) | Supported | Unsupported in headless `codex exec`; App supports form modal | **Supported** (primary path in CLI) | Degrades to fenced JSON text in CLI; App renders `ui://` | Supported (`notifications/progress` + cancel) | Supported (Bearer token / OAuth in App) |
| **Gemini CLI** | stdio & Streamable HTTP | Supported | Supported (`destructiveHint` triggers confirmation) | Supported | Partial (interactive CLI prompt) | **Supported** | Degrades to `structuredContent` + fenced text | Supported (`notifications/progress`) | Supported (`gemini-extension.json` settings / OAuth) |
| **Google Antigravity** | stdio & Streamable HTTP | Supported | Supported | Supported | Partial (interactive session form; subagents use `confirm: true`) | **Supported** | Degrades to `structuredContent` + fenced text | Supported (`notifications/progress` + cancel) | Supported (`mcp_config.json` / plugin manager) |
| **Cursor** | stdio & Streamable HTTP | Supported | Supported | Supported | Supported (modal dialog for `elicitation/create`) | Supported | Degrades to `structuredContent` + fenced text | Supported (`notifications/progress`) | Supported (OAuth 2.1 / Bearer header) |
| **MCP Inspector 2.12** | stdio & Streamable HTTP | Supported | Supported (displays badges) | Supported (validates `outputSchema`) | **Supported** (both `2025-11-25` `elicitation/create` and `2026-07-28` MRTR `input_required`) | Supported | **Supported** (Apps preview tab renders `ui://` resources) | **Supported** (progress bar + `tasks/*` inspector) | Supported (OAuth 2.1 flow debugger) |

## Feature Degradation & Safety Guarantees

1. **MCP Apps (`APP-02..APP-05`)**:
   - Tools with an interactive UI (`crm_board`, `crm_deals_search`, `campaign_preflight_report`, `wa_campaign_preflight`, `conversation_view`, `conversation_get`, `conversation_messages`) advertise both `_meta.ui.resourceUri` (MCP Apps `2026-01-26` standard) and `_meta["ui/resourceUri"]` (legacy host key).
   - Every tool response still carries the full `content` text block (with `UNTRUSTED_NOTICE` fencing on customer payloads) and `structuredContent`. Clients that do not render `ui://` resources consume the tool as a normal JSON tool with zero data loss.
   - Every `ui://airyschat/*.html` resource declares a strict zero-network Content Security Policy (`connectDomains: []`, `resourceDomains: []`, `frameDomains: []`, `baseUriDomains: []`) and renders untrusted strings exclusively via `Node.textContent`.
2. **Confirmations (`APP-06`, ADR 0005)**:
   - When `confirm: true` is passed in tool arguments, the call is pre-confirmed on every client.
   - When `confirm` is omitted and the client advertises form elicitation (`capabilities.elicitation`), the server returns an `input_required` result (`inputRequired.elicit`) with an HMAC-SHA256 `requestState` bound to `(accountId, toolName, sha256(args))`. On `2025-11-25` connections, `@modelcontextprotocol/server`'s `LegacyInputRequiredShim` automatically fulfills this via `elicitation/create` and re-enters the handler.
   - When `confirm` is omitted and the client does **not** advertise form elicitation (e.g. headless CLI, subagent, or stateless legacy call), the server returns the deterministic refusal (`isError: true`) instructing the assistant to show the preview and re-call with `confirm: true`.
3. **Tasks & Progress (`APP-07`)**:
   - Long-running operations (`wa_campaign_launch`, `wa_campaign_test_send`, `crm_deals_bulk_update`) emit `notifications/progress` whenever the client supplies `_meta.progressToken`, honor `ctx.mcpReq.signal` for mid-operation cancellation, and record task state queryable via `tasks/list`, `tasks/get`, `tasks/result`, and `tasks/cancel`.
4. **Live Hosted Streamable HTTP + OAuth 2.1 Staging Verification (`REM-11`, 2026-10-29)**:
   - Verified end-to-end between `https://staging.airys.app` (account `6`, OAuth 2.1 AS + token introspection) and Cloud Run `https://mcp-tdtyqbghua-rj.a.run.app/mcp` (`18/18` checks passing — see [`specs/005-hosted-mcp/verification.md`](../../specs/005-hosted-mcp/verification.md)):
     - RFC 9728 discovery (`/.well-known/oauth-protected-resource`) + RFC 8414 metadata (`/.well-known/oauth-authorization-server` with PKCE `S256`, CIMD, and CORS) + `WWW-Authenticate` `resource_metadata` challenge for connector clients (Claude.ai, ChatGPT, Cursor, MCP Inspector).
     - Both `Accept: application/json, text/event-stream` (`2025-11-25` handshake) and bare `Accept: application/json` (`2026-07-28` stateless calls + MRTR `input_required` elicitation) for CLI and IDE hosts (Claude Code, Codex, Gemini CLI, Antigravity, Muse).
     - Scope-filtered `tools/list` (`mcp:read` → `35` read-only tools; `mcp:read mcp:write mcp:toolset:core` → `23` core tools without irreversible operations), audience binding (`401` on `aud` mismatch), classic token rejection (`401`), and `<= 60 s` revocation propagation (`54.0 s` observed).
