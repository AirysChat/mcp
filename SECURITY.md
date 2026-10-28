# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| `0.x` (latest minor) | :white_check_mark: |
| `1.0.x` (upon GA) | :white_check_mark: |
| `< latest minor` | :x: |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report vulnerabilities privately via GitHub Private Vulnerability Reporting ([Security Advisories](https://github.com/AirysChat/mcp/security/advisories/new)) or by e-mailing `security@airys.chat`.

Include:
1. Affected package version (`@airyschat/mcp`), transport (`stdio` or Streamable HTTP `src/http.ts`), and toolset/tool name.
2. Minimal reproduction steps or proof-of-concept request payload.
3. Expected vs. actual behavior and impact assessment.

We acknowledge reports within **48 hours** and aim to ship a fix and advisory within **7 days** for critical/high findings.

## Security Architecture & Non-Negotiables

1. **Indirect Prompt Injection Defense (`untrustedJson`)**:
   - Every tool response carrying customer-authored or third-party text (conversations, messages, contacts, CRM deal notes, WhatsApp templates, Help Center articles, CSAT feedback, ad touches) is wrapped in a prompt-injection warning fence (`_untrusted`) and labeled as untrusted data.
2. **Write & Irreversible Gates (`requireConfirmation` + Elicitation)**:
   - Every state-changing tool sets `write: true` (automatically hidden and refused when `AIRYSCHAT_READ_ONLY=1` or token scope is `mcp:read`).
   - Every customer-visible or Meta-billed action (sending messages, launching WhatsApp campaigns, closing CRM deals, switching AI Agent / Meta Business Agent responder modes, publishing Help Center articles, deleting records, registering webhooks) sets `irreversible: true` and requires either an HMAC-signed multi-round-trip elicitation approval (`requestState` bound to `(accountId, toolName, sha256(args))`) or explicit second-turn `confirm: true`.
3. **Scoped MCP Tokens & OAuth 2.1 Resource Server (`ADR 0006`)**:
   - The hosted Streamable HTTP server (`mcp.airys.chat`) accepts only scoped, revocable, audience-bound `mcp_*` tokens (`mcp:read`, `mcp:write`, `mcp:irreversible`, `mcp:toolset:<name>`) verified against the target AirysChat instance's `/oauth/introspect` endpoint, and rejects classic `api_access_token` keys.
4. **SSRF & Outbound URL Validation**:
   - Instance routing in hosted mode is strictly gated by `AIRYSCHAT_ALLOWED_INSTANCES`.
   - Webhook and integration hook URLs (`webhook_upsert`, `integration_hook_upsert`) enforce `https://`, forbid inline credentials, and reject loopback, RFC1918, link-local / cloud metadata (`169.254.169.254`, `metadata.google.internal`), CGNAT, and internal IPv6 addresses.
5. **Zero Secrets in Repository**:
   - Credentials are read exclusively from environment variables or Secret Manager at runtime. Every PR and release runs `scripts/security/secret-scan.mjs` across the working tree and git history.
