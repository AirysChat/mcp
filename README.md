# @airyschat/mcp

MCP server for [AirysChat](https://github.com/AirysChat/AirysChat) — drive WhatsApp
campaigns, message templates, and conversations from Claude Code, Codex, or Gemini CLI.

**Status: v0.1.0, unreleased.** Verified end-to-end against a mock API
(`npm run smoke`), not yet against a live AirysChat instance.

## Install

```bash
claude mcp add airyschat \
  --env AIRYSCHAT_BASE_URL=https://app.airyschat.com \
  --env AIRYSCHAT_API_KEY=... \
  --env AIRYSCHAT_ACCOUNT_ID=5 \
  -- npx -y @airyschat/mcp
```

<details>
<summary>Codex — <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.airyschat]
command = "npx"
args = ["-y", "@airyschat/mcp"]
env = { AIRYSCHAT_BASE_URL = "https://app.airyschat.com", AIRYSCHAT_API_KEY = "...", AIRYSCHAT_ACCOUNT_ID = "5" }
```
</details>

<details>
<summary>Gemini CLI — <code>~/.gemini/settings.json</code></summary>

```json
{
  "mcpServers": {
    "airyschat": {
      "command": "npx",
      "args": ["-y", "@airyschat/mcp"],
      "env": {
        "AIRYSCHAT_BASE_URL": "https://app.airyschat.com",
        "AIRYSCHAT_API_KEY": "...",
        "AIRYSCHAT_ACCOUNT_ID": "5"
      }
    }
  }
}
```
</details>

## Configuration

| Variable | Required | Default | |
|---|---|---|---|
| `AIRYSCHAT_BASE_URL` | yes | — | Instance URL, no trailing slash |
| `AIRYSCHAT_API_KEY` | yes | — | Agent or admin token, sent as the `api_access_token` header |
| `AIRYSCHAT_ACCOUNT_ID` | yes | — | Numeric account ID |
| `AIRYSCHAT_TOOLSETS` | no | `core,whatsapp` | Comma-separated |
| `AIRYSCHAT_READ_ONLY` | no | off | `1` unregisters every write tool |
| `AIRYSCHAT_TIMEOUT_MS` | no | `30000` | Per-request timeout |

Config is validated at startup, so a missing variable fails in the client's server log
rather than as a confusing tool error mid-conversation.

## Tools

28 tools. Reads are unrestricted; writes are gated (see Safety).

**`core`** — `conversations_list`, `conversation_get`, `conversation_messages`,
`conversation_reply`\*, `conversation_update`\*, `contacts_search`, `contact_get`,
`contact_conversations`, `inboxes_list`, `agents_list`, `labels_list`, `teams_list`, `me`

**`whatsapp`** — `wa_templates_list`, `wa_template_get`, `wa_template_analytics`,
`wa_templates_sync`\*, `wa_campaigns_list`, `wa_campaign_get`, `wa_campaign_metrics`,
`wa_audience_estimate`, `wa_campaign_preflight`, `wa_campaign_create`\*,
`wa_campaign_launch`\*, `wa_campaign_cancel`\*, `wa_campaign_test_send`\*, `wa_inbox_health`

**Always on** — `airyschat_api`\*, the raw-endpoint escape hatch.

\* write

### Why not a tool per endpoint

AirysChat serves ~480 endpoints. One tool each would bury the useful ones and bloat
every client's tool list, so verb families are collapsed (`conversation_update` covers
status, priority, assignment, and labels) and everything else goes through
`airyschat_api`. That mirrors what `chatwoot api` does in Chatwoot's own CLI.

`airyschat_api` needs a `prefix`, because AirysChat serves two account-scoped trees:

| prefix | resolves to | holds |
|---|---|---|
| `core` | `/api/v1/accounts/{id}{path}` | features extending a Chatwoot resource |
| `saas` | `/saas/api/v1/accounts/{id}{path}` | AirysChat-only: AI agents, CRM, Meta Business Agent, billing |
| `raw` | `{path}` | non-account-scoped, e.g. `/api/v1/profile` |

Endpoint reference: `swagger/tag_groups/airyschat_swagger.json` in the AirysChat repo.
Operations marked `x-airys-stub: true` are placeholders whose shapes are not yet
documented — treat them as unverified.

## Safety

**Customer content is untrusted.** Everything returned from a conversation, message,
contact, or template is written by third parties. Payloads that can carry it are fenced
and labelled as data, not instructions. Prompt injection arriving through a support
ticket is the realistic threat here, not a malicious operator.

**Irreversible actions need `confirm: true`.** `wa_campaign_launch`,
`wa_campaign_test_send`, `conversation_reply` (public), `wa_campaign_cancel`, label
replacement, and any non-GET `airyschat_api` call refuse on the first attempt and
explain the exact effect. The model must restate it and call again — a speed bump that
gives the human a chance to stop it, not a security boundary.

`wa_campaign_test_send` is **not** a dry run: it sends a real, billed WhatsApp message.

**Tool annotations** carry `readOnlyHint` / `destructiveHint` / `idempotentHint` so
hosts can apply their own gating.

**`AIRYSCHAT_READ_ONLY=1`** unregisters every write tool, including the escape hatch.

### Known behaviours worth reading

Descriptions come from AirysChat's OpenAPI spec, written against the controllers. The
non-obvious ones:

- **A blocked campaign preflight returns HTTP 200.** Read `allowed` and
  `blocking_issues`; absence of an error means nothing.
- **Campaign `id` is the account-scoped `display_id`**, not the primary key.
- **`wa_template_analytics` returns `{}` with a 200** when the template was never
  submitted to Meta — success, not failure.
- **`conversation_update` with `labels` replaces the whole set.** Read first, pass the
  full list, or you silently strip labels.
- **A 403 from a `/saas` path is usually a plan limit**, not a bad key, and is reported
  that way.

## Development

```bash
npm install
npm run typecheck
npm run smoke      # builds, then drives the server over stdio against a mock API
```

`scripts/smoke.mjs` covers transport framing, tool-list annotations, prefix routing,
the untrusted-content fence, both refusal gates, array query encoding, and read-only
mode — the things unit tests over the handlers would miss.

## Roadmap

- Replace the `confirm: true` gate with MCP elicitation (2026-07-28 multi-round-trip
  requests), which the SDK supports; deferred until it can be tested against real clients.
- `meta_agent`, `ai_agents`, and `crm` toolsets, once their endpoints stop being stubs
  in the AirysChat spec.
- Claude Code plugin bundling this server with an agent skill.
- Hosted streamable-HTTP deployment — belongs in the Rails app, where it can reuse
  Pundit scoping rather than re-implementing it.

## License

MIT
