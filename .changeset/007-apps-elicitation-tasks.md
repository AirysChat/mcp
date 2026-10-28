---
"@airyschat/mcp": minor
---

Ship Lane 007 (`v0.7.0`) — MCP Apps (`io.modelcontextprotocol/ui`), elicitation-based confirmations with `confirm: true` fallback, and MCP Tasks & progress notifications:

- **MCP Apps (`APP-02..APP-05`)**: Register `ui://airyschat/crm-board.html`, `ui://airyschat/campaign-preflight-report.html`, and `ui://airyschat/conversation-view.html` (`mimeType: "text/html;profile=mcp-app"`) with strict zero-network CSP (`connectDomains: []`, `resourceDomains: []`, `frameDomains: []`, `baseUriDomains: []`), `Node.textContent`-only DOM rendering, and visual untrusted customer-content fencing, plus composite tools `crm_board`, `campaign_preflight_report`, and `conversation_view` (`stability: "stable"`).
- **Elicitation-based confirmations (`APP-06`)**: Irreversible tools return `inputRequired.elicit` with an HMAC-SHA256 `requestState` bound to `(method, accountId, toolName, sha256(args))` when the client advertises form elicitation (`capabilities.elicitation`), while preserving the deterministic `confirm: true` parameter fallback for headless clients and subagents.
- **MCP Tasks & progress (`APP-07`)**: Long-running tools (`crm_deals_bulk_update`, `wa_campaign_launch`, `wa_campaign_test_send`) emit `notifications/progress` when `_meta.progressToken` is supplied, stamp `_meta["io.modelcontextprotocol/related-task"]`, and expose account-isolated `tasks/list`, `tasks/get`, `tasks/result`, and `tasks/cancel` handlers with mid-batch cancellation.
- **Client compatibility matrix (`APP-01`)**: Add `docs/compat/matrix.md` and security review `docs/security/007-apps-elicitation-tasks.md`.
