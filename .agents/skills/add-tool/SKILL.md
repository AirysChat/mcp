---
name: add-tool
description: Add or change a curated MCP tool in packages/server (new endpoint wrapper, new toolset, or behaviour change). Use whenever a task asks to "expose", "wrap", "add a tool for" an AirysChat endpoint.
---

# Add a curated tool

Read `.agents/rules/tool-safety.md` and `.agents/rules/api-source-of-truth.md` first. They are binding.

## Inputs you need before writing code

1. The lane task ID (e.g. `CRM-04`). No task → stop and use the `spec-lane` skill.
2. A domain brief in `docs/api/domains/<domain>.md` or, for one endpoint, your own reading of:
   - the route (`git -C ~/AirysChat show origin/develop:config/routes.rb`, or the inventory row),
   - the controller action and its permitted params / Pundit policy,
   - `swagger/tag_groups/application_swagger.json` when the endpoint is in the application API.
   Never mutate `~/AirysChat`; read with `git show origin/develop:<path>`.

## Steps

1. **Pick the toolset file**: `packages/server/src/tools/<toolset>.ts`. New toolset → add the file,
   export the array, register it where `core`/`whatsapp` are registered, and add the name to the
   toolset list in `config.ts`.
2. **Name**: `<noun>_<verb>` snake_case (`crm_deal_get`, `contacts_merge`). Lists are plural
   (`crm_deals_search`). Never rename a `stable` tool; deprecate instead (ADR 0003).
3. **Define** with `defineTool({...})`:
   - `title`, a `description` that states side effects in CAPS when customer-visible or billed,
     units, ID semantics (display id vs primary key) and pagination.
   - `inputSchema` (zod) — tight types, `.describe()` on every non-obvious field, enums from source.
   - `write: true` for any state change; `irreversible: true` for sends, Meta writes, deletes,
     merges, deal `won`; `idempotent: true` only when truly so.
   - `stability: 'beta'` for new tools (required field). `experimental` when the upstream endpoint is
     itself unstable. Promotion to `stable` is a separate change backed by `live-verify` evidence.
4. **Handler**:
   - Customer-authored content in the response → `untrustedJson(...)`; otherwise `json(...)`.
   - Irreversible → `requireConfirmation(confirm, '<exact effect, with ids and text>')` before the
     request. The preview must name every side effect (e.g. Meta CAPI Purchase event).
   - Validate cross-field rules locally (e.g. lost requires reason) with `failure(...)`.
   - Use `client.request(path, { method, query, body })`; paths are account-relative.
5. **Curated map**: add `[toolset, METHOD, "/normalized/{}/path", tool_name, "<release>"]` to
   `scripts/inventory/curated.json`, then `pnpm inventory` and commit the regenerated docs.
6. **Smoke**: extend `packages/server/scripts/smoke.mjs` mock routes and assertions — happy path,
   confirm refusal for irreversible tools, read-only build hides write tools.
7. **Changeset**: `pnpm changeset` (minor for new tools before 1.0) describing the tool for users.
8. **Run** `pnpm check`. Ask the `safety-reviewer` subagent to review the diff when the tool writes.
9. **Tasks**: update the lane `tasks.md` status and note evidence; live readback goes through the
   `live-verify` skill before promotion to `stable`.

## Don'ts

- No generic "update anything" tools that pass arbitrary bodies — that is what `airyschat_api` is for.
- No platform/super-admin tokens; tools act with the user's token only.
- Never log request bodies or headers; stdout is the MCP transport.
