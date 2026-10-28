import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { ApiError, type AirysChatClient } from '../src/client.js';
import { loadConfig } from '../src/config.js';
import { json } from '../src/result.js';
import { defineTool, registerTools, type AnyToolDefinition } from '../src/toolsets.js';

interface Registered {
  name: string;
  meta: { description: string; outputSchema?: z.ZodType; annotations: Record<string, boolean> };
  handler: (args: unknown) => Promise<{ isError?: boolean; content: Array<{ text?: string }> }>;
}

function fakeServer() {
  const registered: Registered[] = [];
  const server = {
    registerTool: (name: string, meta: Registered['meta'], handler: Registered['handler']) => registered.push({ name, meta, handler }),
  } as unknown as McpServer;
  return { server, registered };
}

function context(env: Record<string, string> = {}) {
  const config = loadConfig({ AIRYSCHAT_BASE_URL: 'https://h', AIRYSCHAT_API_KEY: 'k', AIRYSCHAT_ACCOUNT_ID: '1', ...env });
  return { config, client: {} as AirysChatClient };
}

const ok = async () => json('ok');
const outSchema = z.object({ ok: z.boolean() });
const tools: AnyToolDefinition[] = [
  defineTool({ name: 'read_stable', stability: 'stable', title: 't', description: 'Reads.', inputSchema: z.object({}), outputSchema: outSchema, handler: ok }),
  defineTool({ name: 'write_beta', stability: 'beta', title: 't', description: 'Writes.', write: true, inputSchema: z.object({}), handler: ok }),
  defineTool({ name: 'send_beta', stability: 'beta', title: 't', description: 'Sends.', write: true, irreversible: true, inputSchema: z.object({}), handler: ok }),
  defineTool({ name: 'lab', stability: 'experimental', title: 't', description: 'Lab.', inputSchema: z.object({}), handler: ok }),
  defineTool({ name: 'old', stability: 'deprecated', replacedBy: 'read_stable', title: 't', description: 'Old.', inputSchema: z.object({}), handler: ok }),
  defineTool({ name: 'hatch', stability: 'stable', title: 't', description: 'Hatch.', write: true, readOnlyCapable: true, inputSchema: z.object({}), handler: ok }),
];

const names = (registered: Registered[]) => registered.map((tool) => tool.name).sort();

test('default features expose stable and deprecated tools only', () => {
  const { server, registered } = fakeServer();
  const count = registerTools(server, tools, context());
  assert.equal(count, registered.length);
  assert.deepEqual(names(registered), ['hatch', 'old', 'read_stable']);
});

test('beta adds beta tools; experimental adds everything', () => {
  const beta = fakeServer();
  registerTools(beta.server, tools, context({ AIRYSCHAT_FEATURES: 'beta' }));
  assert.deepEqual(names(beta.registered), ['hatch', 'old', 'read_stable', 'send_beta', 'write_beta']);
  const all = fakeServer();
  registerTools(all.server, tools, context({ AIRYSCHAT_FEATURES: 'experimental' }));
  assert.equal(all.registered.length, tools.length);
});

test('descriptions are prefixed by maturity', () => {
  const { server, registered } = fakeServer();
  registerTools(server, tools, context({ AIRYSCHAT_FEATURES: 'experimental' }));
  const description = (name: string) => registered.find((tool) => tool.name === name)!.meta.description;
  assert.equal(description('read_stable'), 'Reads.');
  assert.equal(description('write_beta'), '[beta] Writes.');
  assert.match(description('lab'), /^\[experimental — may change or break\] Lab\.$/);
  assert.equal(description('old'), 'DEPRECATED — use read_stable. Old.');
});

test('annotations follow write and irreversible metadata', () => {
  const { server, registered } = fakeServer();
  registerTools(server, tools, context({ AIRYSCHAT_FEATURES: 'beta' }));
  const annotations = (name: string) => registered.find((tool) => tool.name === name)!.meta.annotations;
  assert.equal(annotations('read_stable').readOnlyHint, true);
  assert.equal(annotations('write_beta').readOnlyHint, false);
  assert.equal(annotations('write_beta').destructiveHint, false);
  assert.equal(annotations('send_beta').destructiveHint, true);
  assert.equal(annotations('read_stable').openWorldHint, true);
  assert.equal(registered.find((tool) => tool.name === 'read_stable')!.meta.outputSchema, outSchema);
  assert.equal(registered.find((tool) => tool.name === 'write_beta')!.meta.outputSchema, undefined);
});

test('read-only drops writes but keeps readOnlyCapable tools, annotated read-only', () => {
  const { server, registered } = fakeServer();
  registerTools(server, tools, context({ AIRYSCHAT_FEATURES: 'beta', AIRYSCHAT_READ_ONLY: '1' }));
  assert.deepEqual(names(registered), ['hatch', 'old', 'read_stable']);
  const hatch = registered.find((tool) => tool.name === 'hatch')!;
  assert.equal(hatch.meta.annotations.readOnlyHint, true);
  assert.equal(hatch.meta.annotations.destructiveHint, false);
});

test('handler exceptions become tool errors instead of protocol failures', async () => {
  const failing = defineTool({
    name: 'boom',
    stability: 'stable',
    title: 't',
    description: 'd',
    inputSchema: z.object({}),
    handler: async () => {
      throw new ApiError(404, 'https://h/api/v1/accounts/1/inboxes/9', 'GET', { error: 'gone' });
    },
  });
  const { server, registered } = fakeServer();
  registerTools(server, [failing], context());
  const result = await registered[0]!.handler({});
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text!, /Not found — gone/);
});

test('scope-based access filters irreversible tools on mcp:write and refuses unscoped calls', async () => {
  const { server, registered } = fakeServer();
  registerTools(
    server,
    tools,
    context({ AIRYSCHAT_FEATURES: 'beta', AIRYSCHAT_SCOPES: 'mcp:write' }),
  );
  assert.deepEqual(names(registered), ['hatch', 'old', 'read_stable', 'write_beta']);

  const withRefusal = fakeServer();
  const writeCtx = context({ AIRYSCHAT_FEATURES: 'beta', AIRYSCHAT_SCOPES: 'mcp:write' });
  registerTools(withRefusal.server, tools, writeCtx, { keepUnscopedForRefusal: true });
  const sendTool = withRefusal.registered.find((tool) => tool.name === 'send_beta')!;
  const sendRes = await sendTool.handler({});
  assert.equal(sendRes.isError, true);
  assert.match(sendRes.content[0]!.text!, /requires the "mcp:irreversible" token scope/);

  const readBearer = fakeServer();
  const readCtx = context({ AIRYSCHAT_FEATURES: 'beta', AIRYSCHAT_SCOPES: 'mcp:read' });
  readCtx.config.authScheme = 'bearer';
  registerTools(readBearer.server, tools, readCtx, { keepUnscopedForRefusal: true });
  const writeTool = readBearer.registered.find((tool) => tool.name === 'write_beta')!;
  const writeRes = await writeTool.handler({});
  assert.equal(writeRes.isError, true);
  assert.match(writeRes.content[0]!.text!, /requires the "mcp:write" token scope/);
});
