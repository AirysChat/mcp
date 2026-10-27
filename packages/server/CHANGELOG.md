# @airyschat/mcp

## 0.2.0

### Minor Changes

- 90908c7: Validate `airyschat_api` calls against the embedded endpoint catalog (`core`, `core_v2`, `saas`, and `raw` prefixes), refuse unknown or excluded endpoints locally, and surface catalog irreversible reasons and dedicated tool recommendations in confirmation prompts.
- 5b46a0a: New tool `airyschat_api_search`: finds any of the ~800 AirysChat endpoints by intent ("deal won", "pipeline stages", "template quality") and returns the exact call for `airyschat_api` — method, prefix, path, known params, whether it writes, why it is irreversible, and the dedicated tool to prefer when one exists. It reads a catalog shipped with the server and never calls AirysChat. Always on, like `airyschat_api`.
- 5060d12: `wa_campaign_preflight` now requires `inbox_id`. AirysChat always resolves the inbox first, so calls with only `campaign_id` (or no arguments) failed with a 404; they are now refused locally with a clear validation error. 404s outside campaign routes no longer suggest that campaign display IDs are the problem.
- a06880a: `airyschat_api` stays available with `AIRYSCHAT_READ_ONLY=1`, limited to GET and annotated read-only. Any other method is refused locally, even with `confirm: true`. Read-only setups can now reach every endpoint that has no dedicated tool.
- 00cfd43: Tools now carry a stability tier (`stable`, `beta`, `experimental`, `deprecated`) and `AIRYSCHAT_FEATURES` chooses the highest tier exposed. The default is `stable`.
  
  **Heads-up:** write tools (`conversation_reply`, `conversation_update`, `wa_templates_sync`, `wa_campaign_create`, `wa_campaign_launch`, `wa_campaign_cancel`, `wa_campaign_test_send`) stay `beta` until they are verified live, so they are hidden by default. Set `AIRYSCHAT_FEATURES=beta` to keep using them. Non-stable tools start their description with `[beta]` or `[experimental]`.
- 21290db: Add `outputSchema` and `structuredContent` support for core and catalog read tools (`me`, `inboxes_list`, `agents_list`, `labels_list`, `teams_list`, `conversations_list`, and `airyschat_api_search`) while preserving the fenced text fallback and `_untrusted` prompt-injection notice on customer payloads.
- 90fab39: Requires Node.js 22 or newer (Node 20 reached end-of-life in April 2026). On MCP 2026-07-28 connections the tool list is now marked cacheable for an hour (`private` scope), since it is fixed for the life of the process.

### Patch Changes

- e477c9b: `airyschat_api` no longer points agents to a swagger file and `x-airys-stub` markers that do not exist. It now says where the reference really is: `application_swagger.json` for inherited Chatwoot endpoints, and the controllers for AirysChat-only (`saas`) endpoints, which have no published schema.
- 14d16fc: The server reports its real version (from `package.json`) in `serverInfo` and in the startup log line. Earlier builds always said `0.1.0`.

## 0.1.1

### Patch Changes

- eb34fab: Require `@modelcontextprotocol/server` ≥ 2.4.0 and `zod` ≥ 4.6.7. Earlier versions carry advisories for cross-client message delivery on shared HTTP transports, memory exhaustion during validation, and bearer tokens accepted across services.
