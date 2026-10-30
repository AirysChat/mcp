# 010 — Distribution & GA · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| GA-01 | P0 | M | Shared `skills/` + build step copying into each plugin bundle | bundles diff-clean after build (`pnpm plugins:check`) | Done |
| GA-02 | P0 | M | Codex plugin (`plugins/codex/.codex-plugin/plugin.json`) | manifest, `.mcp.json`, skills, README synced | Done |
| GA-03 | P0 | M | Gemini CLI extension (`plugins/gemini/gemini-extension.json`) | manifest, `GEMINI.md`, skills, README synced | Done |
| GA-04 | P0 | M | Antigravity plugin (`plugins/antigravity/plugin.json`) | `plugin.json`, `mcp_config.json`, `rules/AGENTS.md`, skills synced | Done |
| GA-05 | P0 | S | npm scope `@airyschat` + trusted publishing with provenance | `.github/workflows/release.yml` OIDC provenance step + `docs/distribution/npm-and-registry.md` | Done |
| GA-06 | P0 | S | MCP Registry `chat.airys/mcp` (`server.json`, publish in release workflow) | `server.json` at root + `release.yml` publish step + DNS guide | Done |
| GA-07 | P0 | M | Secret scan of full history; LICENSE review; `SECURITY.md` | `scripts/security/secret-scan.mjs --history` 0 findings + `SECURITY.md` | Done |
| GA-08 | P0 | L | Docs: per-client quickstarts, generated tool reference, safety model | `docs/quickstart.md`, `docs/tools/reference.md` (`pnpm docs:check`), `docs/safety-model.md` | Done |
| GA-09 | P1 | S | Guide: AirysChat MCP + Meta WhatsApp Business Tools MCP | `docs/guides/meta-whatsapp-business-tools-mcp.md` | Done |
| GA-10 | P1 | S | Muse Code / Muse connector setup guide | `docs/guides/meta-muse-setup.md` | Done |
| GA-11 | P0 | S | API stability policy + freeze stable tools | `docs/stability-policy.md` + `packages/server/test/stability-freeze.test.ts` (80 frozen stable tools) | Done |
| GA-12 | P1 | S | Claude/ChatGPT connector directory submission package | `docs/distribution/connector-directories.md` (`mcp.airys.chat` prod live on `1.0.0`) | Done |
