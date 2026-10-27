# 007 — MCP Apps, elicitation & tasks

- Release: **0.7.0** · Target 2027-03-22 (moved 2026-10-27) · Prefix `APP`
- Depends on: 001 (FND-12 spike), 003, 006; 005 for remote clients (ChatGPT)

## Why

MCP 2026-07-28 standardised **extensions**: MCP Apps (interactive UI rendered by the client —
Claude, ChatGPT, Muse), Tasks (long-running operations) and elicitation (structured user input).
These turn "agent reads JSON" into "operator sees a CRM board and clicks". They also give a better
confirmation UX than a `confirm` boolean.

## What

- **MCP Apps** (`@modelcontextprotocol/ext-apps`): `crm_board` (pipeline kanban, drag = `crm_deal_move`
  with confirm), `campaign_preflight_report` (audience, template preview, cost estimate),
  `conversation_view` (thread with untrusted content clearly fenced).
- **Elicitation**: confirmation forms for irreversible tools when the client supports it; fallback to
  `confirm` argument otherwise (capability negotiation).
- **Tasks**: campaign send and bulk updates as tasks with progress and cancellation.
- Compatibility matrix per client (`compat-tester`).

## Acceptance

- `crm_board` and `campaign_preflight_report` render in Claude and ChatGPT; degrade to text elsewhere.
- Irreversible tools use elicitation in at least one client, `confirm` fallback tested.
