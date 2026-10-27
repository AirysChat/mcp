/**
 * The endpoint catalog (lane 002).
 *
 * `catalog.json` is generated at build time from docs/api (inventory, swagger params,
 * irreversible classification) and shipped next to `dist/`. It lets agents discover every
 * AirysChat endpoint (`airyschat_api_search`) and lets the escape hatch validate calls and
 * apply the same gates curated tools use (`airyschat_api`).
 */

import { readFileSync } from 'node:fs';

export type CatalogPrefix = 'core' | 'core_v2' | 'saas' | 'raw';

export interface CatalogParam {
  name: string;
  in: 'path' | 'query' | 'body';
  required: boolean;
  type?: string;
  enum?: unknown[];
  description?: string;
}

export interface CatalogEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  prefix: CatalogPrefix;
  /** Route template relative to the prefix, with `:param` segments. */
  path: string;
  domain: string;
  toolset: string;
  /** controller#action, account prefix stripped. */
  action: string;
  coverage: 'curated' | 'raw' | 'excluded';
  /** Curated tool that already wraps this endpoint, if any. */
  tool?: string;
  summary?: string;
  params?: CatalogParam[];
  write?: boolean;
  /** Why the effect cannot be undone (shown in confirmation previews). */
  irreversible?: string;
  /** Why the endpoint cannot be driven through MCP. */
  excluded?: string;
}

export interface Catalog {
  source: string;
  endpoints: CatalogEndpoint[];
}

/** Next to `dist/` in the package, next to `src/` when running from source. */
const SHIPPED_CATALOG = new URL('../catalog.json', import.meta.url);
let cached: Catalog | undefined;

/** Loads the shipped catalog once; an explicit `path` (tests) is read fresh. */
export function loadCatalog(path?: URL | string): Catalog {
  if (path) return JSON.parse(readFileSync(path, 'utf8')) as Catalog;
  cached ??= JSON.parse(readFileSync(SHIPPED_CATALOG, 'utf8')) as Catalog;
  return cached;
}

const templateCache = new WeakMap<CatalogEndpoint, RegExp>();
function templateRegex(endpoint: CatalogEndpoint): RegExp {
  let regex = templateCache.get(endpoint);
  if (!regex) {
    const pattern = endpoint.path
      .split('/')
      .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/');
    regex = new RegExp(`^${pattern}$`);
    templateCache.set(endpoint, regex);
  }
  return regex;
}

/**
 * Finds the catalog entry for a concrete call. Literal routes win over parameterised ones
 * (`/campaigns/preflight` before `/campaigns/:id`), mirroring how Rails matches them.
 */
export function matchEndpoint(catalog: Catalog, method: string, prefix: CatalogPrefix, path: string): CatalogEndpoint | undefined {
  const normalized = (path.startsWith('/') ? path : `/${path}`).replace(/\/+$/, '') || '/';
  const candidates = catalog.endpoints.filter(
    (endpoint) => endpoint.method === method && endpoint.prefix === prefix && templateRegex(endpoint).test(normalized),
  );
  return candidates.sort((a, b) => paramCount(a) - paramCount(b))[0];
}

const paramCount = (endpoint: CatalogEndpoint) => (endpoint.path.match(/:/g) ?? []).length;

export interface SearchOptions {
  domain?: string;
  method?: string;
  toolset?: string;
  limit?: number;
}

/**
 * Keyword search. Every query token must appear somewhere in the entry (path, domain,
 * action, summary, toolset, param names); entries whose path matches score higher.
 * Excluded endpoints are listed last so agents see why they cannot be called.
 */
export function searchCatalog(catalog: Catalog, query: string, options: SearchOptions = {}): CatalogEndpoint[] {
  const tokens = tokenize(query);
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);

  const scored: Array<{ endpoint: CatalogEndpoint; score: number }> = [];
  for (const endpoint of catalog.endpoints) {
    if (options.domain && endpoint.domain !== options.domain) continue;
    if (options.toolset && endpoint.toolset !== options.toolset) continue;
    if (options.method && endpoint.method !== options.method.toUpperCase()) continue;

    const path = endpoint.path.toLowerCase();
    const haystack = [path, endpoint.domain, endpoint.action, endpoint.summary ?? '', endpoint.toolset, ...(endpoint.params ?? []).map((p) => p.name)]
      .join(' ')
      .toLowerCase()
      .replace(/[_/#:.-]+/g, ' ');
    let score = 0;
    let matchedAll = true;
    for (const token of tokens) {
      if (!haystack.includes(token)) {
        matchedAll = false;
        break;
      }
      score += path.includes(token) ? 3 : 1;
    }
    if (!matchedAll) continue;
    if (endpoint.excluded) score -= 10;
    if (endpoint.method === 'GET') score += 0.5;
    score -= paramCount(endpoint) * 0.1;
    scored.push({ endpoint, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(({ endpoint }) => endpoint);
}

function tokenize(query: string): string[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);
  // Light stemming so "deals" finds crm_deals and "templates" finds message_templates.
  return [...new Set(words.map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word)))];
}
