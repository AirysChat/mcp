---
"@airyschat/mcp": patch
---

Require `@modelcontextprotocol/server` ≥ 2.4.0 and `zod` ≥ 4.6.7. Earlier versions carry advisories for cross-client message delivery on shared HTTP transports, memory exhaustion during validation, and bearer tokens accepted across services.
