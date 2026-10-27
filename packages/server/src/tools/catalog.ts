/**
 * Discovery over the endpoint catalog (CAT-06).
 *
 * Curated tools cover a fraction of AirysChat. This tool lets an agent find the right
 * endpoint for anything else — with params, write/irreversible flags and the curated tool
 * to prefer when one exists — and then call it through `airyschat_api`. It reads only the
 * shipped catalog; it never calls AirysChat.
 */

import { z } from 'zod';
import { loadCatalog, searchCatalog, type CatalogEndpoint } from '../catalog.js';
import { json } from '../result.js';
import { defineTool } from '../toolsets.js';

export const catalogTools = [
  defineTool({
    name: 'airyschat_api_search',
    // Local and read-only: it never reaches AirysChat, so there is nothing to verify live.
    stability: 'stable',
    title: 'Search the AirysChat API catalog',
    description:
      'Find AirysChat endpoints by intent ("move a CRM deal", "pipeline stages", "template quality") before using ' +
      'airyschat_api. Each result gives the exact call (method, prefix, path with :params), known params, whether it ' +
      'writes, why it is irreversible, and the dedicated tool to prefer when one exists. Excluded endpoints come last ' +
      'with the reason they cannot be called. Reads a catalog shipped with this server; it does not call AirysChat.',
    idempotent: true,
    inputSchema: z.object({
      query: z.string().min(2).describe('Keywords, e.g. "deal won", "scheduled whatsapp messages", "inbox members"'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('Only endpoints with this method'),
      domain: z.string().optional().describe('Only this domain (first path segment), e.g. "crm_deals"'),
      toolset: z.string().optional().describe('Only endpoints planned for this toolset, e.g. "crm"'),
      limit: z.number().int().min(1).max(50).optional().describe('Default 10'),
    }),
    handler: async ({ query, method, domain, toolset, limit }) => {
      const catalog = loadCatalog();
      const results = searchCatalog(catalog, query, { method, domain, toolset, limit });
      return json({
        source: catalog.source,
        hint: results.length
          ? 'Prefer `use_tool` when present. Otherwise call airyschat_api with `call` (replace :params in the path); ' +
            'non-GET calls need confirm: true and, when `irreversible` is set, the user must approve that exact effect.'
          : 'No endpoint matched. Try fewer or different keywords, or drop the filters.',
        results: results.map(present),
      });
    },
  }),
];

function present(endpoint: CatalogEndpoint) {
  return {
    call: { method: endpoint.method, prefix: endpoint.prefix, path: endpoint.path },
    ...(endpoint.tool ? { use_tool: endpoint.tool } : {}),
    action: endpoint.action,
    ...(endpoint.summary ? { summary: endpoint.summary } : {}),
    ...(endpoint.params?.length ? { params: endpoint.params } : {}),
    ...(endpoint.write ? { write: true } : {}),
    ...(endpoint.irreversible ? { irreversible: endpoint.irreversible } : {}),
    ...(endpoint.excluded ? { excluded: endpoint.excluded } : {}),
  };
}
