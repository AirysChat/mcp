# 010 — Distribution & GA · verification

- **Date**: 2026-10-28
- **Scope**: `GA-01..GA-12`

## 1. Plugin Bundles & Shared Skills (`GA-01..GA-04`)

- Canonical skills in `skills/{airyschat,triage,campaign-check,campaign-retro,crm-pipeline-review,agent-supervision,account-audit,number-health-watch}/SKILL.md` (8 skills).
- Synchronized and verified across all 4 client bundles via `pnpm plugins:check` (`scripts/plugins/sync-plugins.mjs --check`):
  - `plugins/claude/` (`.claude-plugin/plugin.json`, `.mcp.json`, `skills/*`)
  - `plugins/codex/` (`.codex-plugin/plugin.json`, `.mcp.json`, `skills/*`, `README.md`)
  - `plugins/gemini/` (`gemini-extension.json`, `GEMINI.md`, `skills/*`, `README.md`)
  - `plugins/antigravity/` (`plugin.json`, `mcp_config.json`, `rules/AGENTS.md`, `skills/*`, `README.md`)

## 2. Public npm Provenance & Official MCP Registry (`GA-05`, `GA-06`)

- `server.json` (`$schema: https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json`) declares `name: "chat.airys/mcp"` with npm stdio package (`@airyschat/mcp`) and remote Streamable HTTP endpoint (`https://mcp.airys.chat/mcp`).
- `.github/workflows/release.yml` includes OIDC provenance publishing (`npm publish ./packages/server --registry https://registry.npmjs.org --access public --provenance` when `vars.NPM_PUBLIC_ENABLED == 'true'`) and MCP Registry publishing (`npx -y @modelcontextprotocol/registry-publisher publish server.json` when `vars.MCP_REGISTRY_PUBLISH_ENABLED == 'true'`).
- Version lockstep across `packages/server/package.json`, all 4 plugin manifests, and `server.json` enforced by `scripts/plugins/sync-plugins.mjs` and `scripts/release/prepare.sh`.

## 3. Security Scan, Stability Freeze & Documentation (`GA-07..GA-12`)

- `node scripts/security/secret-scan.mjs --history`: `0` findings across all tracked files and full git commit history (`GA-07`).
- `SECURITY.md` and `LICENSE` (MIT) verified (`GA-07`).
- `pnpm docs:check` (`scripts/docs/generate-tool-reference.mjs --check`): generated and verified `docs/tools/reference.md` covering all **212** tools (`80` `stable`, `98` `beta`, `34` `experimental`) (`GA-08`).
- `docs/quickstart.md`, `docs/safety-model.md`, `docs/guides/meta-whatsapp-business-tools-mcp.md` (`GA-09`), `docs/guides/meta-muse-setup.md` (`GA-10`), `docs/stability-policy.md` (`GA-11`), `docs/distribution/npm-and-registry.md` (`GA-05`/`GA-06`), and `docs/distribution/connector-directories.md` (`GA-12`) authored and linked from `README.md`.
- `packages/server/test/stability-freeze.test.ts` (`GA-11`): freezes all `80` `stable` tools and their required input parameters in CI.
