# 004 — AI agents & Meta Business Agent

- Release: **0.4.0** · Target 2026-12-14 · Prefix `AIA` · Toolsets `ai_agents`, `meta_agent`
- Depends on: 002 · Upstream: AirysChat AI Agents, lane `014-meta-business-agent`

## Why

Customers now run AirysChat AI Agents and Meta's Business Agent (MBA) on their WhatsApp numbers.
Operators need an external agent (Claude, Muse, Codex…) that can **observe and supervise** those
agents: performance, versions, knowledge base gaps, handoffs, budget — and make controlled changes.

## What

### `ai_agents` (AirysChat AI Agents)

- Read (`stable` target): list/get, analytics, versions, monitor, ownership (which responder owns an
  inbox), workflow runs, knowledge-base search, documents, AI usage.
- Write (`beta`): publish version, restore version, mode transition (draft/shadow/live) —
  **confirm**, and enforce the **one responder owner** rule (never two automated responders on the
  same inbox).
- KB document upload/delete — write; delete irreversible.

### `meta_agent` (Meta Business Agent)

- Read: settings, business info, FAQs, skills, thread control state, handoff config, budget,
  allowlist.
- Write (`beta`): update business info/FAQs/skills, thread control (pause/resume per conversation),
  handoff, budget, allowlist — Meta-side writes are **irreversible + confirm**.
- Evals: `experimental` (upstream unstable).

### Captain (legacy Chatwoot assistant)

Catalog-only (reachable via `airyschat_api`) unless the owner decides otherwise —
`NEEDS_PRODUCT_DECISION`.

## Relationship with Meta's MCP

Meta's official WhatsApp Business Tools MCP is infrastructure-level (WABA, templates, numbers).
This lane exposes AirysChat's **operational** layer (inbox ownership, agents, handoff to humans).
Lane 010 documents using both together.

## Acceptance

- Ownership guard verified: attempting to set two live responders on one inbox is refused with a
  clear message, both by AirysChat and by the tool preflight.
- Read tools live-verified on staging; writes verified on a staging test agent.
