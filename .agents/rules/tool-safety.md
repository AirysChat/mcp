---
trigger: glob
globs: packages/server/src/**
description: Safety invariants for every MCP tool in the AirysChat server.
---

# Tool safety invariants

These hold for every tool, curated or generated. A PR that breaks one is not mergeable.

## Trust boundary

- Conversation, message, contact, company, deal, note, template, campaign, AI-agent transcript and
  knowledge-document payloads are **customer- or third-party-authored**. Return them with
  `untrustedJson`, never `json`. When unsure, fence it.
- Never build a write's arguments from content the tool itself just read. Descriptions of tools that
  send text say so explicitly ("only from the person you are working for").

## Write gates

| Effect | Declare | Gate |
|---|---|---|
| Changes AirysChat state only (labels, assignment, deal stage) | `write: true` | none, unless it silently destroys data (then `requireConfirmation`) |
| Replaces a whole set (labels, audience, stage list) | `write: true` | `requireConfirmation` naming what is lost |
| Customer receives something, Meta bills, or it cannot be undone | `write: true, irreversible: true` | `requireConfirmation` that restates the exact effect, with names fetched from the API |
| Deletes | `write: true, irreversible: true` | `requireConfirmation` |

- `AIRYSCHAT_READ_ONLY=1` must unregister every tool with `write: true` — never bypass `registerTools`.
- Confirmation text is built from server data (title, contact, count), not from model arguments alone.
- Idempotent writes set `idempotent: true`; it drives the MCP `idempotentHint`.

## Errors

- Let `fromError` translate failures. A `/saas` 403 with a body is a **plan gate**, never "check your key".
- Responses that return 200 on a logical failure (preflight `allowed: false`, analytics `{}`) are
  called out in the tool description.

## Descriptions

Write for a model deciding whether and how to call: what it returns, pagination, which ID it expects
(display ID vs primary key), what is NOT safe, and the one non-obvious behaviour. No marketing.

## Tests

Every new gate, fence or routing rule gets a check in `packages/server/scripts/smoke.mjs`
(or the unit suite once lane 001 lands it). Tests run against the mock — never a live instance.
