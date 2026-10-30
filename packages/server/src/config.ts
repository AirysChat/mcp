/**
 * Environment-derived configuration.
 *
 * Everything is read once at startup and validated eagerly: a stdio MCP server that
 * discovers a missing API key on the first tool call surfaces it as a confusing tool
 * error inside the model's context, whereas failing at launch surfaces it in the
 * client's server log where a human will actually see it.
 */

export const TOOLSET_NAMES = [
  'core',
  'whatsapp',
  'crm',
  'ai_agents',
  'meta_agent',
  'reports',
  'admin',
  'help_center',
  'platform',
] as const;
export type ToolsetName = (typeof TOOLSET_NAMES)[number];

export const DEFAULT_TOOLSETS: ToolsetName[] = ['core', 'whatsapp'];
export const DEFAULT_PLATFORM_BASE_URL = 'https://api.airys.chat';

/** Tool maturity, lowest to highest risk. `deprecated` is visible like `stable`. */
export const STABILITY_LEVELS = ['stable', 'beta', 'experimental'] as const;
export type Stability = (typeof STABILITY_LEVELS)[number] | 'deprecated';
export const STABILITY_RANK: Record<Exclude<Stability, 'deprecated'>, number> = { stable: 0, beta: 1, experimental: 2 };

/**
 * Access levels from ADR 0006 (`mcp:read` ⊂ `mcp:write` ⊂ `mcp:irreversible`).
 *
 * - `read`: read-only tools and `GET` on `airyschat_api`
 * - `write`: read tools plus reversible write tools
 * - `irreversible`: all tools (customer-facing sends, Meta writes, deletes, merges, deal closes)
 */
export const ACCESS_LEVELS = ['read', 'write', 'irreversible'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const ACCESS_RANK: Record<AccessLevel, number> = { read: 0, write: 1, irreversible: 2 };

export interface ParsedTokenScopes {
  maxAccess: AccessLevel;
  toolsets: Set<ToolsetName>;
  toolsetsRestricted: boolean;
  expandedScopes: string[];
}

export interface Config {
  baseUrl: string;
  apiKey: string;
  accountId: number;
  toolsets: Set<ToolsetName>;
  /** Highest maturity exposed (AIRYSCHAT_FEATURES). Default `stable`. */
  features: Exclude<Stability, 'deprecated'>;
  readOnly: boolean;
  timeoutMs: number;
  /** Highest access tier allowed by the token (`mcp:read|write|irreversible`). Default `irreversible` (or `read` when `readOnly`). */
  maxAccess?: AccessLevel;
  /** True when token scopes explicitly restrict toolsets via `mcp:toolset:<name>`. */
  toolsetsRestricted?: boolean;
  /** Header scheme used when talking to AirysChat (`api_access_token` on stdio, `bearer` on hosted HTTP). */
  authScheme?: 'api_access_token' | 'bearer';
  /** Base URL for the Airys Platform API (`AIRYS_PLATFORM_URL`, default `https://api.airys.chat`). */
  platformBaseUrl?: string;
  /** Bearer credential for the Airys Platform API (`AIRYS_API_TOKEN`), separate from `AIRYSCHAT_API_KEY`. */
  platformApiToken?: string;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = required(env, 'AIRYSCHAT_BASE_URL').replace(/\/+$/, '');
  const apiKey = required(env, 'AIRYSCHAT_API_KEY');
  const accountId = Number(required(env, 'AIRYSCHAT_ACCOUNT_ID'));

  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new ConfigError('AIRYSCHAT_ACCOUNT_ID must be a positive integer');
  }
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new ConfigError('AIRYSCHAT_BASE_URL must start with http:// or https://');
  }

  const rawPlatformUrl = optional(env, 'AIRYS_PLATFORM_URL');
  const platformBaseUrl = (rawPlatformUrl ?? DEFAULT_PLATFORM_BASE_URL).replace(/\/+$/, '');
  if (!/^https?:\/\//.test(platformBaseUrl)) {
    throw new ConfigError('AIRYS_PLATFORM_URL must start with http:// or https://');
  }
  const platformApiToken = optional(env, 'AIRYS_API_TOKEN');

  const baseToolsets = parseToolsets(env.AIRYSCHAT_TOOLSETS);
  const envReadOnly = isTruthy(env.AIRYSCHAT_READ_ONLY);
  const parsedScopes = env.AIRYSCHAT_SCOPES?.trim()
    ? parseTokenScopes(env.AIRYSCHAT_SCOPES, baseToolsets)
    : undefined;
  const maxAccess: AccessLevel = envReadOnly
    ? 'read'
    : (parsedScopes?.maxAccess ?? 'irreversible');

  return {
    baseUrl,
    apiKey,
    accountId,
    toolsets: parsedScopes ? parsedScopes.toolsets : baseToolsets,
    features: parseFeatures(env.AIRYSCHAT_FEATURES),
    // Opt-in read-only (or forced when token scope is mcp:read).
    readOnly: envReadOnly || maxAccess === 'read',
    timeoutMs: Number(env.AIRYSCHAT_TIMEOUT_MS ?? 30_000),
    maxAccess,
    toolsetsRestricted: parsedScopes?.toolsetsRestricted ?? false,
    authScheme: 'api_access_token',
    platformBaseUrl,
    platformApiToken,
  };
}

/**
 * Parses OAuth / MCP scopes per ADR 0006 (`mcp:read` ⊂ `mcp:write` ⊂ `mcp:irreversible`,
 * plus optional `mcp:toolset:<name>` restrictions).
 */
export function parseTokenScopes(
  rawScopes: string | readonly string[],
  fallbackToolsets: Iterable<ToolsetName> = DEFAULT_TOOLSETS,
): ParsedTokenScopes {
  const tokens = (typeof rawScopes === 'string' ? rawScopes.split(/[\s,]+/) : rawScopes)
    .map((entry) => entry.trim())
    .filter(Boolean);

  let maxAccess: AccessLevel | undefined;
  if (tokens.includes('mcp:irreversible')) {
    maxAccess = 'irreversible';
  } else if (tokens.includes('mcp:write')) {
    maxAccess = 'write';
  } else if (tokens.includes('mcp:read')) {
    maxAccess = 'read';
  }

  if (!maxAccess) {
    throw new ConfigError(
      'Token must grant at least one access scope: mcp:read, mcp:write, or mcp:irreversible',
    );
  }

  const scopedToolsets: ToolsetName[] = [];
  const unknownToolsets: string[] = [];
  for (const token of tokens) {
    if (!token.startsWith('mcp:toolset:')) continue;
    const name = token.slice('mcp:toolset:'.length);
    if ((TOOLSET_NAMES as readonly string[]).includes(name)) {
      scopedToolsets.push(name as ToolsetName);
    } else {
      unknownToolsets.push(name);
    }
  }

  if (unknownToolsets.length > 0) {
    throw new ConfigError(
      `Unknown toolset scope(s): ${unknownToolsets.join(', ')}. Known: ${TOOLSET_NAMES.join(', ')}`,
    );
  }

  const expandedScopes: string[] = ['mcp:read'];
  if (ACCESS_RANK[maxAccess] >= ACCESS_RANK.write) expandedScopes.push('mcp:write');
  if (ACCESS_RANK[maxAccess] >= ACCESS_RANK.irreversible) expandedScopes.push('mcp:irreversible');
  for (const ts of scopedToolsets) expandedScopes.push(`mcp:toolset:${ts}`);

  const toolsetsRestricted = scopedToolsets.length > 0;
  const toolsets = toolsetsRestricted ? new Set(scopedToolsets) : new Set(fallbackToolsets);

  return {
    maxAccess,
    toolsets,
    toolsetsRestricted,
    expandedScopes,
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new ConfigError(`${name} is required`);

  // Claude Code expands ${VAR} in .mcp.json, but when the variable is unset and has no
  // `:-default` it passes the placeholder through verbatim. That is a non-empty string,
  // so a plain presence check would accept it and the server would authenticate with
  // the literal text "${AIRYSCHAT_API_KEY}" — surfacing as a confusing 401 instead of
  // the real problem, which is an unset variable on the user's machine.
  if (/^\$\{.*\}$/.test(value.trim())) {
    throw new ConfigError(`${name} was passed unexpanded as "${value}" — the referenced environment variable is not set on your machine`);
  }

  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = resolveDefaultPlaceholder(env[name]);
  if (!value) return undefined;
  if (/^\$\{.*\}$/.test(value)) {
    throw new ConfigError(
      `${name} was passed unexpanded as "${value}" — the referenced environment variable is not set on your machine`,
    );
  }
  return value;
}

/**
 * Resolves unexpanded `${VAR:-fallback}` strings that MCP clients without shell-default
 * expansion (e.g. Antigravity, Codex, Cursor) may pass verbatim from plugin manifest
 * `env` blocks, while leaving bare `${VAR}` intact so callers can report unset secrets.
 */
function resolveDefaultPlaceholder(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const match = /^\$\{[A-Za-z_][A-Za-z0-9_]*:-(.*)\}$/.exec(trimmed);
  if (!match) return trimmed;
  const fallback = match[1]?.trim();
  return fallback || undefined;
}

export function parseToolsets(raw: string | undefined): Set<ToolsetName> {
  const resolved = resolveDefaultPlaceholder(raw);
  if (!resolved) return new Set(DEFAULT_TOOLSETS);

  const requested = resolved.split(',').map((entry) => entry.trim()).filter(Boolean);
  const unknown = requested.filter((entry) => !TOOLSET_NAMES.includes(entry as ToolsetName));
  if (unknown.length > 0) {
    throw new ConfigError(`Unknown toolset(s): ${unknown.join(', ')}. Known: ${TOOLSET_NAMES.join(', ')}`);
  }

  return new Set(requested as ToolsetName[]);
}

export function parseFeatures(raw: string | undefined): Exclude<Stability, 'deprecated'> {
  const value = resolveDefaultPlaceholder(raw)?.toLowerCase();
  if (!value) return 'stable';
  if (!(STABILITY_LEVELS as readonly string[]).includes(value)) {
    throw new ConfigError(`AIRYSCHAT_FEATURES must be one of: ${STABILITY_LEVELS.join(', ')} (got "${raw}")`);
  }
  return value as Exclude<Stability, 'deprecated'>;
}

function isTruthy(value: string | undefined): boolean {
  const resolved = resolveDefaultPlaceholder(value);
  return resolved === '1' || resolved?.toLowerCase() === 'true';
}
