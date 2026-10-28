/**
 * The escape hatch.
 *
 * AirysChat serves ~800 account-scoped endpoints. Generating a tool per endpoint would
 * bury the curated ones and blow up every client's tool list, so anything without a
 * first-class tool goes through here — paired with `airyschat_api_search` for discovery.
 *
 * Every call is validated against the embedded catalog (`catalog.json`): unknown routes
 * and excluded endpoints are refused locally, and every non-GET requires `confirm: true`
 * with a preview showing the catalog's irreversible classification when present.
 */

import { z } from 'zod';
import { loadCatalog, matchEndpoint } from '../catalog.js';
import type { Prefix } from '../client.js';
import { ACCESS_RANK, type ToolsetName } from '../config.js';
import { defineTool } from '../toolsets.js';
import { failure, readOnlyRefusal, requireConfirmation, scopeRefusal, untrustedJson } from '../result.js';

export const rawTools = [
  defineTool({
    name: 'airyschat_api',
    stability: 'stable',
    title: 'Call an AirysChat API endpoint directly',
    description:
      'Call any AirysChat endpoint from the catalog that has no dedicated tool. Prefer dedicated tools when one exists — ' +
      'they carry argument validation and tailored responses. Use `airyschat_api_search` first to find the exact `method`, ' +
      '`prefix`, `path`, and parameters.\n\n' +
      'Choose `prefix` carefully, because the account-scoped trees are different APIs:\n' +
      '  core    — /api/v1/accounts/{account_id}{path}       features extending a Chatwoot resource\n' +
      '  core_v2 — /api/v2/accounts/{account_id}{path}       analytics and v2 summary reports\n' +
      '  saas    — /saas/api/v1/accounts/{account_id}{path}  AirysChat-only features (AI agents, CRM, Meta Business Agent)\n' +
      '  raw     — {path} verbatim, for non-account-scoped endpoints such as /api/v1/profile\n\n' +
      'Pass `path` WITHOUT the prefix for core, core_v2, and saas — "/campaigns/12", not "/api/v1/accounts/5/campaigns/12". ' +
      'Unknown or excluded endpoints are refused before calling the API. Any method other than GET requires `confirm: true`; ' +
      'with AIRYSCHAT_READ_ONLY set, only GET is allowed.',
    write: true,
    // Stays available in read-only builds for GET; the handler refuses every other method.
    readOnlyCapable: true,
    inputSchema: z.object({
      path: z.string().min(1).describe('Path without the account prefix, e.g. "/whatsapp_flows"'),
      method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).optional().describe('Defaults to GET'),
      prefix: z.enum(['core', 'core_v2', 'saas', 'raw']).optional().describe('Defaults to core'),
      query: z.record(z.string(), z.unknown()).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
      confirm: z.boolean().optional().describe('Required for any method other than GET'),
    }),
    handler: async (args, { client, config }) => {
      const method = args.method ?? 'GET';
      const prefix = args.prefix ?? 'core';
      const maxAccess = config.readOnly ? 'read' : (config.maxAccess ?? 'irreversible');

      if (method !== 'GET' && config.readOnly && config.authScheme !== 'bearer') {
        return readOnlyRefusal(`airyschat_api ${method}`);
      }

      const entry = matchEndpoint(loadCatalog(), method, prefix, args.path);
      if (!entry) {
        return failure(
          `No AirysChat endpoint matches ${method} (${prefix}) ${args.path}. ` +
            'Call `airyschat_api_search` to find the exact method, prefix, and path template.',
        );
      }
      if (entry.excluded) {
        return failure(`${method} (${prefix}) ${entry.path} cannot be called through MCP: ${entry.excluded}.`);
      }

      if (
        config.toolsetsRestricted &&
        entry.toolset !== 'none' &&
        !config.toolsets.has(entry.toolset as ToolsetName)
      ) {
        return scopeRefusal(`airyschat_api ${method} ${entry.path}`, `mcp:toolset:${entry.toolset}`);
      }

      if (method !== 'GET') {
        if (ACCESS_RANK[maxAccess] < ACCESS_RANK.write) {
          return scopeRefusal(`airyschat_api ${method} ${entry.path}`, entry.irreversible ? 'mcp:irreversible' : 'mcp:write');
        }
        if (entry.irreversible && ACCESS_RANK[maxAccess] < ACCESS_RANK.irreversible) {
          return scopeRefusal(`airyschat_api ${method} ${entry.path}`, 'mcp:irreversible');
        }
        const detail = entry.irreversible ?? `Writes to ${entry.action}${entry.summary ? ` (${entry.summary})` : ''}.`;
        const hint = entry.tool ? ` Prefer the dedicated tool \`${entry.tool}\` when possible.` : '';
        const refusal = requireConfirmation(
          args.confirm,
          `${method} ${describePath(prefix, args.path, config.accountId)}${args.body ? ` with body ${JSON.stringify(args.body)}` : ''}. ${detail}${hint}`,
        );
        if (refusal) return refusal;
      }

      return untrustedJson(await client.request(args.path, { method, prefix, query: args.query, body: args.body }));
    },
  }),
];

function describePath(prefix: Prefix, path: string, accountId: number): string {
  if (prefix === 'raw') return path;
  const apiVersion = prefix === 'core_v2' ? 'v2' : 'v1';
  return `${prefix === 'saas' ? '/saas' : ''}/api/${apiVersion}/accounts/${accountId}${path.startsWith('/') ? path : `/${path}`}`;
}
