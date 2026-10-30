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

- `server.json` (`$schema: https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`) declares `name: "chat.airys/mcp"` with npm stdio package (`@airyschat/mcp`) and remote Streamable HTTP endpoint (`https://mcp.airys.chat/mcp`).
- `.github/workflows/release.yml` includes OIDC provenance publishing (`npm publish --registry https://registry.npmjs.org --access public --provenance` when `vars.NPM_PUBLIC_ENABLED == 'true'`) and MCP Registry publishing (`./mcp-publisher publish` when `vars.MCP_REGISTRY_PUBLISH_ENABLED == 'true'`).
- Version lockstep across `packages/server/package.json`, all 4 plugin manifests, and `server.json` enforced by `scripts/plugins/sync-plugins.mjs` and `scripts/release/prepare.sh`.

## 3. Security Scan, Stability Freeze & Documentation (`GA-07..GA-12`)

- `node scripts/security/secret-scan.mjs --history`: `0` findings across all tracked files and full git commit history (`GA-07`).
- `SECURITY.md` and `LICENSE` (MIT) verified (`GA-07`).
- `pnpm docs:check` (`scripts/docs/generate-tool-reference.mjs --check`): generated and verified `docs/tools/reference.md` covering all **212** tools (`80` `stable`, `98` `beta`, `34` `experimental`) (`GA-08`).
- `docs/quickstart.md`, `docs/safety-model.md`, `docs/guides/meta-whatsapp-business-tools-mcp.md` (`GA-09`), `docs/guides/meta-muse-setup.md` (`GA-10`), `docs/stability-policy.md` (`GA-11`), `docs/distribution/npm-and-registry.md` (`GA-05`/`GA-06`), and `docs/distribution/connector-directories.md` (`GA-12`) authored and linked from `README.md`.
- `packages/server/test/stability-freeze.test.ts` (`GA-11`): freezes all `80` `stable` tools and their required input parameters in CI.

## 4. `v1.0.0` GA Release & Live Distribution Evidence (2026-10-30)

- **Repository visibility**: `AirysChat/mcp` switched to `public` after `node scripts/security/secret-scan.mjs --history` confirmed `0` findings.
- **Release & Git tag**: `@airyschat/mcp@1.0.0` (`008955740ce591b4c9cdfca8a267e9e4b80fcf31`), GitHub Release `https://github.com/AirysChat/mcp/releases/tag/%40airyschat/mcp%401.0.0` (`isPrerelease: false`), CI `release.yml` run `41126285718` (`success`).
- **Public npm (`npmjs.org`)**:
  - Package URL: `https://www.npmjs.com/package/@airyschat/mcp/v/1.0.0`
  - Metadata verified via `GET https://registry.npmjs.org/@airyschat%2fmcp/1.0.0` (`200 OK`): `version: "1.0.0"`, `mcpName: "chat.airys/mcp"`, `shasum: "0b5497f0cf4fb31c6ca63f33ff856760ef7713fd"`.
  - SLSA v1 provenance attestation verified: `https://registry.npmjs.org/-/npm/v1/attestations/@airyschat%2fmcp@1.0.0` (`predicateType: "https://slsa.dev/provenance/v1"`, Sigstore transparency `logIndex=3602376090`).
  - OIDC Trusted Publisher (`AirysChat/mcp` `release.yml`, `Allow npm publish`) enabled on `npmjs.com` with `Require two-factor authentication and disallow bypass 2fa tokens`, and temporary bootstrap `NPM_TOKEN` deleted.
- **Official MCP Registry (`registry.modelcontextprotocol.io`, `GA-06`)**:
  - Ed25519 DNS TXT proof verified on apex `airys.chat`; published via `release.yml` run `41131422598` (`success`).
  - Live listing verified via `GET https://registry.modelcontextprotocol.io/v0/servers?search=chat.airys/mcp` (`200 OK`): `name: "chat.airys/mcp"`, `version: "1.0.0"`, `status: "active"`, `isLatest: true`, advertising both npm `stdio` (`@airyschat/mcp@1.0.0`) and Streamable HTTP (`https://mcp.airys.chat/mcp`).
- **GitHub Packages (`npm.pkg.github.com`)**: `@airyschat/mcp@1.0.0` published (`release.yml` run `41123062945`).
- **Hosted Streamable HTTP service (`image.yml`)**:
  - Staging (`41123063034`): `GET https://mcp-tdtyqbghua-rj.a.run.app/health` -> `200 OK` (`{"status":"ok","version":"1.0.0"}`).
  - Production (`41126501900`): `GET https://mcp.airys.chat/healthz` -> `200 OK` (`{"status":"ok","version":"1.0.0"}`), `GET https://mcp.airys.chat/.well-known/oauth-protected-resource` -> `200 OK` (`{"resource":"https://mcp.airys.chat/mcp","authorization_servers":["https://airys.chat"]}`).
