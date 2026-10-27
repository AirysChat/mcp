# 005 — Hosted MCP · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| REM-01 | P0 | M | Refactor config to per-request context (no process-global env in tool handlers) | stdio behaviour unchanged; unit tests | Planned |
| REM-02 | P0 | M | `src/http.ts` Streamable HTTP stateless entry point | Inspector connects over HTTP locally | Planned |
| REM-03 | P0 | S | Header auth + instance allowlist + limits | tests: missing token 401, bad instance 400 w/o outbound call | Planned |
| REM-04 | P0 | S | Structured logging without secrets; token fingerprint | log review by `safety-reviewer` | Planned |
| REM-05 | P0 | S | Dockerfile (distroless), healthcheck, image build workflow (WIF → Artifact Registry) | image pushed for a tag | Planned |
| REM-06 | P0 | M | Terraform PR in `airys-platform/infra`: Cloud Run `mcp`, NEG, host rules, Armor | applied in staging | `BLOCKED_EXTERNAL` |
| REM-07 | P0 | S | Staging deploy + client checks (Claude Code, Codex, Gemini CLI, Antigravity) | `compat-tester` matrix in verification | Planned |
| REM-08 | P1 | S | Load test (k6) 50 rps | p95 recorded | Planned |
| REM-09 | P0 | S | Security review (SSRF, token handling, DoS, prompt injection surface) | review doc in `docs/security/` | Planned · `NEEDS_SECURITY_REVIEW` |
| REM-10 | P1 | S | Prod deploy `mcp.airys.chat` | Owner approval + smoke against prod (GET-only) | Planned |
| REM-11 | P0 | XS | OAuth design decision (ADR 0006) | Owner picks option a/b/c | `NEEDS_PRODUCT_DECISION` |
| REM-12 | P1 | L | 005b: OAuth 2.1 + PKCE + CIMD, protected-resource metadata, consent flow | Claude.ai custom connector works on staging | Planned |
