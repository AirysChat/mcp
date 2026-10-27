# ADR 0005 — Confirmations: `confirm: true` baseline with progressive MRTR elicitation in 0.7

- Status: Accepted (2026-10-27, FND-12)

## Context

`@airyschat/mcp` wraps operations that cannot be undone and have real external effects: sending a
WhatsApp message to a customer, launching or test-sending a Meta-billed campaign, closing a CRM deal
as won (which fires a Meta Conversions API `Purchase` event), rotating credentials, or deleting
records.

Today every `irreversible: true` tool — and every non-GET call through `airyschat_api` — gates
execution behind `requireConfirmation(args.confirm, effect)` in [`src/result.ts`](../../packages/server/src/result.ts):
1. Call 1 (without `confirm: true`) returns `isError: true` with the exact effect preview.
2. The assistant shows the preview to the user and asks for approval.
3. Call 2 (with `confirm: true`) executes the operation.

Protocol revision **2026-07-28** and `@modelcontextprotocol/server@2.4.0` provide two native
human-in-the-loop primitives:
- **Stateful `elicitation/create`** (2025 era): server pushes a JSON-RPC request asking the client
  to render a form (`ElicitRequestFormParams`).
- **Multi-Round-Trip Requests (MRTR, 2026-07-28)**: tool handler returns
  `inputRequired({ inputRequests, requestState })` (`resultType: "input_required"`), and the SDK's
  `createRequestStateCodec` seals `requestState` with HMAC-SHA256 (`v1.<payload>.<mac>`, TTL, and
  principal/method binding).

We spiked replacing `confirm: true` with elicitation/MRTR in v0.2.0.

## Client support matrix (2026-10-27)

| Client | `confirm: true` arg (2-turn tool call) | `elicitation/create` (2025 form) | MRTR `input_required` (2026-07-28) |
|---|---|---|---|
| Claude Code | Supported | Partial (interactive sessions only) | Rolling out |
| Claude Desktop | Supported | Supported | Rolling out |
| OpenAI Codex CLI | Supported | Unsupported in headless/exec runs | Not yet supported |
| Gemini CLI | Supported | Partial | Not yet supported |
| Google Antigravity | Supported | Partial | Rolling out |
| Cursor | Supported | Supported (modal dialog) | Not yet supported |
| MCP Inspector 2.12 | Supported | Supported | Supported |

## Findings

1. **`confirm: true` is the only mechanism that works across 100% of clients today**, including
   subagents, CLI sessions, and older protocol revisions (`2024-11-05` and `2025-11-25`).
2. **Replacing `confirm: true` with elicitation alone would break headless/CLI clients** (or force an
   unsafe fallback if elicitation is unsupported).
3. **Prompt-injection resistance**: `confirm: true` is a deliberate speed bump (forcing a second
   turn where the user sees the tool call and effect preview), whereas native host elicitation
   renders a trusted UI prompt outside the model's control. On the hosted service (lane 005, ADR
   0006), the hard security boundary is token scope (`mcp:irreversible`), not the confirmation UX.
4. **Progressive enhancement in 0.7 (lane 007, `APP-04`)**: `@modelcontextprotocol/server@2.4.0`
   ships `inputRequired` and `createRequestStateCodec` out of the box. When a client advertises
   elicitation/MRTR capability and `confirm` is omitted, the server can return `inputRequired` bound
   to `(accountId, toolName, sha256(args))` so supporting hosts render a native confirmation card
   in one flow, while still accepting `confirm: true` for clients without elicitation.

## Decision

1. **Keep `confirm: true` (`requireConfirmation`) as the mandatory, universal baseline** for all
   irreversible tools and non-GET `airyschat_api` calls in v0.2–v0.6.
2. **Do not require client elicitation support** for any tool to function.
3. **Add opt-in MRTR / form elicitation in lane 007 (v0.7.0, `APP-04`)** as a progressive
   enhancement when `confirm` is omitted and the client advertises form elicitation, using
   `createRequestStateCodec` to bind the pending confirmation to the authenticated principal, tool
   name, and argument digest.

## Consequences

- Every v0.2–v0.6 tool works identically in Claude Code, Claude Desktop, Codex, Gemini CLI,
  Antigravity, Cursor, and MCP Inspector without client-specific branches.
- Lane 007 (`APP-04`) has a clear implementation recipe (`inputRequired` + `createRequestStateCodec`)
  already verified against `@modelcontextprotocol/server@2.4.0`.
