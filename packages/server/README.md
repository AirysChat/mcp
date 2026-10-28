# @airyschat/mcp

MCP server for [AirysChat](https://github.com/AirysChat/AirysChat) — drive WhatsApp
campaigns, message templates, conversations, contacts, CRM, and AI agents from Claude Code,
Claude Desktop, Codex, Gemini CLI, Antigravity, Cursor, or any MCP client.

**Status: 212 curated & catalog tools across 9 toolsets (`core`, `whatsapp`, `crm`, `ai_agents`, `meta_agent`, `reports`, `admin`, `help_center`, `platform`) + embedded 807-endpoint API catalog (`airyschat_api_search` + `airyschat_api`) + 3 MCP Apps (`crm_board`, `campaign_preflight_report`, `conversation_view`).** See the full [Generated Tool Reference](../../docs/tools/reference.md), [Per-Client Quickstart](../../docs/quickstart.md), and [Safety Model](../../docs/safety-model.md).

## Install

Until v1.0.0, `@airyschat/mcp` is published to **GitHub Packages** (`npm.pkg.github.com`)
under the private `AirysChat/mcp` repository (ADR 0003). Point the `@airyschat` scope at
GitHub Packages in `~/.npmrc` (using a GitHub token with `read:packages`):

```ini
@airyschat:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### Claude Code

Install the bundled plugin (MCP server + `airyschat-ops` safety skill) from the repository
marketplace:

```bash
claude plugin marketplace add AirysChat/mcp
claude plugin install airyschat@airyschat
```

Or register the MCP server directly:

```bash
claude mcp add airyschat \
  --env AIRYSCHAT_BASE_URL=https://app.airys.chat \
  --env AIRYSCHAT_API_KEY=... \
  --env AIRYSCHAT_ACCOUNT_ID=5 \
  -- npx -y @airyschat/mcp
```

<details>
<summary>Claude Desktop — <code>~/Library/Application Support/Claude/claude_desktop_config.json</code></summary>

```json
{
  "mcpServers": {
    "airyschat": {
      "command": "npx",
      "args": ["-y", "@airyschat/mcp"],
      "env": {
        "AIRYSCHAT_BASE_URL": "https://app.airys.chat",
        "AIRYSCHAT_API_KEY": "...",
        "AIRYSCHAT_ACCOUNT_ID": "5"
      }
    }
  }
}
```
</details>

<details>
<summary>Codex — <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.airyschat]
command = "npx"
args = ["-y", "@airyschat/mcp"]
env = { AIRYSCHAT_BASE_URL = "https://app.airys.chat", AIRYSCHAT_API_KEY = "...", AIRYSCHAT_ACCOUNT_ID = "5" }
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
        "AIRYSCHAT_BASE_URL": "https://app.airys.chat",
        "AIRYSCHAT_API_KEY": "...",
        "AIRYSCHAT_ACCOUNT_ID": "5"
      }
    }
  }
}
```
</details>

<details>
<summary>Google Antigravity — <code>~/.gemini/antigravity/mcp_config.json</code></summary>

```json
{
  "mcpServers": {
    "airyschat": {
      "command": "npx",
      "args": ["-y", "@airyschat/mcp"],
      "env": {
        "AIRYSCHAT_BASE_URL": "https://app.airys.chat",
        "AIRYSCHAT_API_KEY": "...",
        "AIRYSCHAT_ACCOUNT_ID": "5"
      }
    }
  }
}
```
</details>

<details>
<summary>Cursor — <code>.cursor/mcp.json</code> or <code>~/.cursor/mcp.json</code></summary>

```json
{
  "mcpServers": {
    "airyschat": {
      "command": "npx",
      "args": ["-y", "@airyschat/mcp"],
      "env": {
        "AIRYSCHAT_BASE_URL": "https://app.airys.chat",
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
| `AIRYSCHAT_FEATURES` | no | `stable` | Highest tool maturity exposed: `stable`, `beta` or `experimental`. Write tools are `beta` until verified live |
| `AIRYSCHAT_READ_ONLY` | no | off | `1` unregisters every write tool (`airyschat_api` stays, GET only) |
| `AIRYSCHAT_TIMEOUT_MS` | no | `30000` | Per-request timeout |

Config is validated at startup, so a missing variable fails in the client's server log
rather than as a confusing tool error mid-conversation.

## Tools

29 tools. Reads are unrestricted; writes are gated (see Safety).

**`core`** — `conversations_list`, `conversation_get`, `conversation_messages`,
`conversation_reply`\*, `conversation_update`\*, `contacts_search`, `contact_get`,
`contact_conversations`, `inboxes_list`, `agents_list`, `labels_list`, `teams_list`, `me`

**`whatsapp`** — `wa_templates_list`, `wa_template_get`, `wa_template_analytics`,
`wa_templates_sync`\*, `wa_campaigns_list`, `wa_campaign_get`, `wa_campaign_metrics`,
`wa_audience_estimate`, `wa_campaign_preflight`, `wa_campaign_create`\*,
`wa_campaign_launch`\*, `wa_campaign_cancel`\*, `wa_campaign_test_send`\*, `wa_inbox_health`

**Always on** — `airyschat_api_search` (catalog discovery) and `airyschat_api`\* (catalog-validated escape hatch).

\* write

### Why not a tool per endpoint

AirysChat serves ~807 account-scoped endpoints. One tool each would bury the useful ones and bloat
every client's tool list, so verb families are collapsed (`conversation_update` covers
status, priority, assignment, and labels) and everything else is discoverable through
`airyschat_api_search` and callable through `airyschat_api`.

`airyschat_api` validates every call against the embedded catalog and routes across four prefixes:

| prefix | resolves to | holds |
|---|---|---|
| `core` | `/api/v1/accounts/{id}{path}` | features extending a Chatwoot resource |
| `core_v2` | `/api/v2/accounts/{id}{path}` | analytics and v2 summary reports |
| `saas` | `/saas/api/v1/accounts/{id}{path}` | AirysChat-only: AI agents, CRM, Meta Business Agent, billing |
| `raw` | `{path}` | non-account-scoped, e.g. `/api/v1/profile` |

Endpoint reference: every account-scoped route is listed in
[`docs/api/inventory.csv`](../../docs/api/inventory.csv). Inherited Chatwoot endpoints are
documented in `swagger/tag_groups/application_swagger.json` in the AirysChat repo;
AirysChat-only (`saas`) endpoints have no published schema yet — their controllers are the
source of truth, so treat request shapes as unverified.

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

**`AIRYSCHAT_READ_ONLY=1`** unregisters every write tool and restricts `airyschat_api` to `GET` only.

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

This package lives in the [AirysChat/mcp](https://github.com/AirysChat/mcp) monorepo.
From the repository root:

```bash
pnpm install
pnpm typecheck
pnpm smoke         # builds, then drives the server over stdio against a mock API
pnpm check         # typecheck + smoke + inventory drift check
```

`scripts/smoke.mjs` covers transport framing, tool-list annotations, prefix routing,
the untrusted-content fence, both refusal gates, array query encoding, and read-only
mode — the things unit tests over the handlers would miss.

## Roadmap

The release train, lanes and tasks live in [`specs/README.md`](../../specs/README.md);
API coverage is tracked in [`docs/api/coverage.md`](../../docs/api/coverage.md).
Highlights: API catalog + `airyschat_api_search` (0.2), CRM (0.3), AI agents and Meta
Business Agent (0.4), WhatsApp complete and reports (0.5), hosted Streamable HTTP on
Cloud Run at `mcp.airys.chat` with scoped MCP tokens (0.6, ADRs 0004/0006 — supersedes
the earlier "inside the Rails app" plan), MCP Apps and elicitation (0.7), GA with public
npm and the MCP Registry (1.0).

## License

MIT
