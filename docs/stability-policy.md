# API & Tool Surface Stability Policy (`GA-11`)

Status: **Binding for `@airyschat/mcp` 1.0+** · Reference: [ADR 0003](./adr/0003-feature-control-and-releases.md)

## 1. Maturity Tiers (`AIRYSCHAT_FEATURES`)

Every curated tool in `@airyschat/mcp` declares a `stability` tier in `defineTool`:

| Tier | Visible When | Contract |
|---|---|---|
| `stable` | Default (`AIRYSCHAT_FEATURES=stable`) | Live-verified against `staging.airys.app` (or `api.airys.chat`). Tool name, semantics, and required input parameters are **frozen** within a major version (`1.x`). |
| `beta` | `AIRYSCHAT_FEATURES=beta` or `experimental` | Feature-complete and covered by unit + smoke tests. May refine optional parameters before promotion to `stable`. |
| `experimental` | `AIRYSCHAT_FEATURES=experimental` | Early access or awaiting an upstream endpoint rollout (e.g. `PLAT-8.1`). Description is prefixed with `[experimental — may change or break]`. |
| `deprecated` | Same visibility as `stable` | Kept working as an alias for at least **one minor release** (`1.x` → `1.(x+1)`) before removal in the next major release. Description is prefixed with `DEPRECATED — use <replacedBy>.`. |

## 2. Rules for `stable` Tools (1.0 Freeze)

1. **No Renames or Removals Without a `deprecated` Alias**:
   - A `stable` tool name may never be removed or renamed in a minor or patch release. If a better name is introduced, the original tool must remain registered with `stability: 'deprecated'` and `replacedBy: '<new_tool_name>'` delegating to the new handler.
2. **No New Required Input Parameters**:
   - Adding a new parameter to a `stable` tool's `inputSchema` is allowed **only** if the parameter is `.optional()` (or has a `.default()`). Making an existing optional parameter required is a breaking change.
3. **Output Envelope Compatibility**:
   - `untrustedJson` fencing (`_untrusted`) and existing top-level keys in `structuredContent` must be preserved. New fields may be added additively.
4. **Automated Enforcement (`packages/server/test/stability-freeze.test.ts`)**:
   - CI runs `stability-freeze.test.ts` on every PR. Any removal of a frozen `stable` tool or addition of a new required input key fails `pnpm test`.
