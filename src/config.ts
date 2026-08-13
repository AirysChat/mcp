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

export interface Config {
  baseUrl: string;
  apiKey: string;
  accountId: number;
  toolsets: Set<ToolsetName>;
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
    // Opt-in read-only. The inverse default would be safer in isolation but would
    // silently break every write tool for users who never set the variable.
    readOnly: isTruthy(env.AIRYSCHAT_READ_ONLY),
    timeoutMs: Number(env.AIRYSCHAT_TIMEOUT_MS ?? 30_000),
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new ConfigError(`${name} is required`);
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

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}
