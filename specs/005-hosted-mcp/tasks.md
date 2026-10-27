# 005 — Hosted MCP · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| REM-01 | P0 | M | Refactor config to per-request context (no process-global env in tool handlers) | stdio behaviour unchanged; unit tests | Planned |
| REM-02 | P0 | M | `src/http.ts` Streamable HTTP stateless entry point | Inspector connects over HTTP locally | Planned |
| REM-03 | P0 | M | Resource server: protected-resource metadata, introspection client + cache, audience/scope/account checks, `WWW-Authenticate` | tests incl. wrong audience, expired, revoked, classic token rejected | Planned |
| REM-04 | P0 | S | Scope-based tool filtering and pre-call refusal | `mcp:read` token sees no write tools; smoke covers it | Planned |
| REM-05 | P0 | S | Instance allowlist + limits + structured logging without secrets | bad instance 400 w/o outbound call; log review by `safety-reviewer` | Planned |
| REM-06 | P0 | S | Dockerfile (distroless), healthcheck, image build workflow (WIF → Artifact Registry) | image pushed for a tag | Planned |
| REM-07 | P0 | M | Terraform PR in `airys-platform/infra`: Cloud Run `mcp`, NEG, host rules, Armor | applied in staging | `BLOCKED_EXTERNAL` |
| REM-08 | P0 | XS | Auth design decision | ADR 0006 accepted | Done (2026-10-27, owner chose scoped MCP tokens issued by AirysChat) |
| REM-09 | P0 | M | Draft the AirysChat lane "MCP tokens & OAuth" (spec + tasks) from ADR 0006 for the owner to open in `AirysChat/AirysChat` | lane merged there; link recorded here | Planned |
| REM-10 | P0 | L | AirysChat: token model, OAuth AS endpoints, consent UI, settings UI, scope enforcement | AirysChat lane closed with staging evidence | `BLOCKED_EXTERNAL` |
| REM-11 | P0 | S | Staging deploy + client checks (Claude.ai connector OAuth, Claude Code, Codex, Gemini CLI, Antigravity) | `compat-tester` matrix in verification | Planned |
| REM-12 | P0 | S | Security review (SSRF, token handling, scope bypass, DoS, prompt-injection surface) | review doc in `docs/security/` | Planned · `NEEDS_SECURITY_REVIEW` |
| REM-13 | P1 | S | Load test (k6) 50 rps | p95 recorded | Planned |
| REM-14 | P1 | S | Prod deploy `mcp.airys.chat` | Owner approval + GET-only smoke against prod | Planned |
| REM-15 | P2 | S | Managed-instance routing (`/<instance>/mcp`) | ADR note + tests | Planned |
