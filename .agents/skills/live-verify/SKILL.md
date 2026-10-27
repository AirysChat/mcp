---
name: live-verify
description: Verify MCP tools against a real AirysChat instance (staging.airys.app account 6 by default) and record sanitized evidence. Use before promoting a tool to stable, after an upstream API change, or when a tool misbehaves in the field.
---

# Live verification

Binding: `.agents/rules/secrets-and-evidence.md`. Default target is **`staging.airys.app`,
account 6 ("Airys Demo", fictitious data)**. Any other target needs the owner to name it.

## Setup (never commit, never echo)

```bash
export AIRYSCHAT_BASE_URL=https://staging.airys.app
export AIRYSCHAT_ACCOUNT_ID=6
export AIRYSCHAT_API_KEY=...   # owner provides; read from the keychain or a local .env (gitignored)
export AIRYSCHAT_READ_ONLY=1   # default for verification runs
pnpm --filter @airyschat/mcp build
```

Drive the server with MCP Inspector CLI (`npx @modelcontextprotocol/inspector --cli
node packages/server/dist/index.js --method tools/call --tool-name me`) or a client.

## Procedure

1. **GET-only first.** `AIRYSCHAT_READ_ONLY=1` for read tools.
2. **Writes** only on fictitious records you create for the test (prefix names with `mcp-verify-`),
   only on staging, and clean up afterwards. Customer-visible sends (WhatsApp, email) and Meta
   writes need explicit owner approval even on staging.
3. **Production** (`airys.chat` or customer instances): GET-only and only with explicit owner approval
   in the conversation, every time.
4. For each tool record: date, tool, args shape (no values that identify people), result shape
   (status, top-level keys, counts), latency, quirks.

## Evidence format (append to the lane `verification.md`)

```markdown
| Tool | Date | Result | Notes |
|---|---|---|---|
| crm_deals_search | 2026-11-12 | pass — 200, 14 deals, keys id/title/stage/value | `stage_id` filter ignored upstream → CRM-18 |
```

Sanitize: no tokens, emails, phone numbers, names, message text, or URLs with ids of real people.
Counts and key names only.

## When something is wrong

File a task in the owning lane (quirk in our tool) or note `BLOCKED_EXTERNAL` with a link to an
AirysChat issue/lane (upstream bug). Do not "fix" AirysChat from this repo.
