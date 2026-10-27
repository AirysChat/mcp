---
name: live-verify
description: Verify MCP tools against a real AirysChat instance (staging.airys.app account 6 by default) and record sanitized evidence. Use before promoting a tool to stable, after an upstream API change, or when a tool misbehaves in the field.
---

# Live verification

Binding: `.agents/rules/secrets-and-evidence.md`. Default target is **`staging.airys.app`,
account 6 ("Airys Demo", fictitious data)**. Any other target needs the owner to name it.

## Credentials: macOS Keychain → environment, never a file

The owner stores the staging token **once** in the login Keychain. The prompt keeps it out of shell
history and out of every file:

```bash
security add-generic-password -U -a "$USER" -s airyschat-mcp-staging -w
# (prompts for the token; -U updates an existing entry)
```

Use a **dedicated staging user** (e.g. "MCP Verify", administrator on account 6) so the token can be
rotated without touching anyone's login. Rotate by re-running the command; remove with
`security delete-generic-password -s airyschat-mcp-staging`.

Agents inject it per command, inline, so it lives only in that process environment. Use the
driver `packages/server/scripts/live-verify.mjs`: it forces read-only, refuses hosts other than
`staging.airys.app` (unless `LIVE_VERIFY_ALLOW_HOST` names one the owner approved), and prints only
shapes (keys, counts, latency) — ready to paste into `verification.md`:

```bash
pnpm --filter @airyschat/mcp build
cd packages/server
AIRYSCHAT_API_KEY="$(security find-generic-password -s airyschat-mcp-staging -w)" \
AIRYSCHAT_BASE_URL=https://staging.airys.app \
AIRYSCHAT_ACCOUNT_ID=6 \
  node scripts/live-verify.mjs                                   # all no-arg read tools
# one tool with args:  node scripts/live-verify.mjs conversation_get '{"conversation_id": 1}'
```

Do not use `npx @modelcontextprotocol/inspector -e AIRYSCHAT_API_KEY=…` for live runs: the token
would appear in the process list.

Rules: never `echo`/`printenv` it, never pass it as a CLI argument (visible in `ps`), never write it
to `.env`, logs, evidence or chat. If the Keychain entry is missing, stop and ask the owner. Check
that it exists without revealing it:
`security find-generic-password -s airyschat-mcp-staging >/dev/null && echo present`.



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
