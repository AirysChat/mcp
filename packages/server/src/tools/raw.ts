/**
 * The escape hatch.
 *
 * AirysChat serves ~480 endpoints. Generating a tool per endpoint would bury the
 * curated ones and blow up every client's tool list, so anything without a first-class
 * tool goes through here — the same trade-off `chatwoot api` makes in Chatwoot's CLI.
 *
 * It is deliberately the least convenient option: no response shaping, an explicit
 * prefix argument, and a confirmation gate on every non-GET.
 */

import { z } from 'zod';
import { defineTool } from '../toolsets.js';
import { requireConfirmation, untrustedJson } from '../result.js';

export const rawTools = [
  defineTool({
    name: 'airyschat_api',
    title: 'Call an AirysChat API endpoint directly',
    description:
      'Call any AirysChat endpoint that has no dedicated tool. Prefer dedicated tools when one exists — they carry the ' +
      'argument validation and the safety notes this does not.\n\n' +
      'Choose `prefix` carefully, because the two account-scoped trees are different APIs:\n' +
      '  core — /api/v1/accounts/{account_id}{path}       features extending a Chatwoot resource\n' +
      '  saas — /saas/api/v1/accounts/{account_id}{path}  AirysChat-only features (AI agents, CRM, Meta Business Agent, billing)\n' +
      '  raw  — {path} verbatim, for non-account-scoped endpoints such as /api/v1/profile\n\n' +
      'Pass `path` WITHOUT the prefix for core and saas — "/campaigns/12", not "/api/v1/accounts/5/campaigns/12". ' +
      'Any method other than GET requires `confirm: true`.\n\n' +
      'Endpoint reference: inherited Chatwoot endpoints (core) are documented in swagger/tag_groups/application_swagger.json ' +
      'in the AirysChat repo. AirysChat-only endpoints (saas) have no published schema: their behaviour is defined by ' +
      'their controllers, so inspect a GET response before writing and treat request shapes as unverified.',
    write: true,
    inputSchema: z.object({
      path: z.string().min(1).describe('Path without the account prefix, e.g. "/whatsapp_flows"'),
      method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).optional().describe('Defaults to GET'),
      prefix: z.enum(['core', 'saas', 'raw']).optional().describe('Defaults to core'),
      query: z.record(z.string(), z.unknown()).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
      confirm: z.boolean().optional().describe('Required for any method other than GET'),
    }),
    handler: async (args, { client, config }) => {
      const method = args.method ?? 'GET';
      const prefix = args.prefix ?? 'core';

      if (method !== 'GET') {
        const refusal = requireConfirmation(
          args.confirm,
          `${method} ${describePath(prefix, args.path, config.accountId)}${args.body ? ` with body ${JSON.stringify(args.body)}` : ''}. ` +
            'Effects of an arbitrary endpoint call are unknown to this server and may reach customers.',
        );
        if (refusal) return refusal;
      }

      return untrustedJson(await client.request(args.path, { method, prefix, query: args.query, body: args.body }));
    },
  }),
];

function describePath(prefix: string, path: string, accountId: number): string {
  if (prefix === 'raw') return path;
  return `${prefix === 'saas' ? '/saas' : ''}/api/v1/accounts/${accountId}${path.startsWith('/') ? path : `/${path}`}`;
}
