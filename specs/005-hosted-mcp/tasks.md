# 005 — Hosted MCP · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| REM-01 | P0 | M | Refactor config to per-request context (no process-global env in tool handlers) | stdio behaviour unchanged; unit tests | Done (2026-10-28) |
| REM-02 | P0 | M | `src/http.ts` Streamable HTTP stateless entry point | Inspector connects over HTTP locally | Done (2026-10-28) |
| REM-03 | P0 | M | Resource server: protected-resource metadata, introspection client + cache, audience/scope/account checks, `WWW-Authenticate` | tests incl. wrong audience, expired, revoked, classic token rejected | Done (2026-10-28) |
| REM-04 | P0 | S | Scope-based tool filtering and pre-call refusal | `mcp:read` token sees no write tools; smoke covers it | Done (2026-10-28) |
| REM-05 | P0 | S | Instance allowlist + limits + structured logging without secrets | bad instance 400 w/o outbound call; log review by `safety-reviewer` | Done (2026-10-28) |
| REM-06 | P0 | S | Dockerfile (distroless), healthcheck, image build workflow (WIF → Artifact Registry) | image workflow + distroless Dockerfile verified | Done (2026-10-28) |
| REM-07 | P0 | M | Terraform PR in `airys-platform/infra`: Cloud Run `mcp`, NEG, host rules, Armor | applied in staging (`AirysBR/airys-platform#28`, `https://mcp-tdtyqbghua-rj.a.run.app`) | Done (2026-10-29) |
| REM-08 | P0 | XS | Auth design decision | ADR 0006 accepted | Done (2026-10-27, owner chose scoped MCP tokens issued by AirysChat) |
| REM-09 | P0 | M | Draft the AirysChat lane "MCP tokens & OAuth" (spec + tasks) from ADR 0006 for the owner to open in `AirysChat/AirysChat` | drafted in [`airyschat-lane-mcp-tokens.md`](airyschat-lane-mcp-tokens.md) | Done (2026-10-28) |
| REM-10 | P0 | L | AirysChat: token model, OAuth AS endpoints, consent UI, settings UI, scope enforcement | AirysChat lane `025-mcp-tokens-and-oauth` merged (`AirysChat/AirysChat#498`) and deployed to staging (`40889339934`) | Done (2026-10-29) |
| REM-11 | P0 | S | Staging deploy + client checks (Claude.ai connector OAuth, Claude Code, Codex, Gemini CLI, Antigravity) | `18/18` live staging E2E checks recorded in [`verification.md`](verification.md) & [`docs/compat/matrix.md`](../../docs/compat/matrix.md) | Done (2026-10-29) |
| REM-12 | P0 | S | Security review (SSRF, token handling, scope bypass, DoS, prompt-injection surface) | review doc in [`docs/security/005-hosted-mcp.md`](../../docs/security/005-hosted-mcp.md) | Done (2026-10-28) |
| REM-13 | P1 | S | Load test (k6) 50 rps | k6 script in [`k6-load-test.js`](k6-load-test.js); local benchmark `713.9 rps`, `p95=91.03 ms` | Done (2026-10-28) |
| REM-14 | P1 | S | Prod deploy `mcp.airys.chat` | Owner approval + GET-only smoke against prod | `BLOCKED_EXTERNAL` |
| REM-15 | P2 | S | Managed-instance routing (`/<instance>/mcp`) | ADR 0006 note + tests | Done (2026-10-28) |
