/**
 * Environment-derived configuration.
 *
 * Everything is read once at startup and validated eagerly: a stdio MCP server that
 * discovers a missing API key on the first tool call surfaces it as a confusing tool
 * error inside the model's context, whereas failing at launch surfaces it in the
 * client's server log where a human will actually see it.
 */

export const TOOLSET_NAMES = ['core', 'whatsapp'] as const;
export type ToolsetName = (typeof TOOLSET_NAMES)[number];

const DEFAULT_TOOLSETS: ToolsetName[] = ['core', 'whatsapp'];

/** Tool maturity, lowest to highest risk. `deprecated` is visible like `stable`. */
export const STABILITY_LEVELS = ['stable', 'beta', 'experimental'] as const;
export type Stability = (typeof STABILITY_LEVELS)[number] | 'deprecated';
export const STABILITY_RANK: Record<Exclude<Stability, 'deprecated'>, number> = { stable: 0, beta: 1, experimental: 2 };

export interface Config {
  baseUrl: string;
  apiKey: string;
  accountId: number;
  toolsets: Set<ToolsetName>;
  /** Highest maturity exposed (AIRYSCHAT_FEATURES). Default `stable`. */
  features: Exclude<Stability, 'deprecated'>;
  readOnly: boolean;
  timeoutMs: number;
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

  return {
    baseUrl,
    apiKey,
    accountId,
    toolsets: parseToolsets(env.AIRYSCHAT_TOOLSETS),
    features: parseFeatures(env.AIRYSCHAT_FEATURES),
    // Opt-in read-only. The inverse default would be safer in isolation but would
    // silently break every write tool for users who never set the variable.
    readOnly: isTruthy(env.AIRYSCHAT_READ_ONLY),
    timeoutMs: Number(env.AIRYSCHAT_TIMEOUT_MS ?? 30_000),
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

function parseToolsets(raw: string | undefined): Set<ToolsetName> {
  if (!raw) return new Set(DEFAULT_TOOLSETS);

  const requested = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  const unknown = requested.filter((entry) => !TOOLSET_NAMES.includes(entry as ToolsetName));
  if (unknown.length > 0) {
    throw new ConfigError(`Unknown toolset(s): ${unknown.join(', ')}. Known: ${TOOLSET_NAMES.join(', ')}`);
  }

  return new Set(requested as ToolsetName[]);
}

function parseFeatures(raw: string | undefined): Exclude<Stability, 'deprecated'> {
  const value = raw?.trim().toLowerCase();
  if (!value) return 'stable';
  if (!(STABILITY_LEVELS as readonly string[]).includes(value)) {
    throw new ConfigError(`AIRYSCHAT_FEATURES must be one of: ${STABILITY_LEVELS.join(', ')} (got "${raw}")`);
  }
  return value as Exclude<Stability, 'deprecated'>;
}

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}
