import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCatalog, matchEndpoint, searchCatalog, type Catalog } from '../src/catalog.js';

const catalogFile = new URL('../catalog.json', import.meta.url);
let catalog: Catalog;

before(() => {
  // Same generator the build runs; keeps the test independent of a prior build.
  execFileSync(process.execPath, [fileURLToPath(new URL('../../../scripts/inventory/build-catalog.mjs', import.meta.url))]);
  catalog = loadCatalog();
});

test('catalog covers the whole inventory and stays small enough to ship', () => {
  assert.ok(catalog.endpoints.length > 700, `${catalog.endpoints.length} endpoints`);
  assert.ok(statSync(catalogFile).size < 300 * 1024, 'catalog.json must stay under 300 KB');
  assert.match(catalog.source, /^AirysChat@/);
  assert.equal(loadCatalog(), catalog, 'shipped catalog is cached');
  assert.notEqual(loadCatalog(catalogFile), catalog, 'explicit paths are read fresh');
});

test('every curated tool endpoint is present and points back to its tool', () => {
  const curated = catalog.endpoints.filter((endpoint) => endpoint.coverage === 'curated');
  assert.ok(curated.length >= 28);
  assert.ok(curated.every((endpoint) => endpoint.tool));
});

test('path params come from the route; swagger params enrich documented endpoints', () => {
  const messages = matchEndpoint(catalog, 'POST', 'core', '/conversations/12/messages');
  assert.ok(messages);
  assert.deepEqual(messages.params?.filter((param) => param.in === 'path').map((param) => param.name), ['conversation_id']);
  assert.ok(messages.params?.some((param) => param.in === 'body' && param.name === 'content' && param.required));
});

test('irreversible classification covers sends, Meta writes, deal won and deletes', () => {
  const reason = (method: string, prefix: 'core' | 'saas', path: string) => matchEndpoint(catalog, method, prefix, path)?.irreversible;
  assert.match(reason('POST', 'core', '/conversations/1/messages') ?? '', /customer receives/);
  assert.match(reason('POST', 'core', '/campaigns/7/launch') ?? '', /Meta bills/);
  assert.match(reason('POST', 'saas', '/crm_deals/3/won') ?? '', /Conversions API/);
  assert.match(reason('DELETE', 'core', '/labels/4') ?? '', /Deletes/);
  assert.equal(reason('POST', 'core', '/campaigns/preflight'), undefined, 'preflight is a check, not an effect');
  assert.equal(matchEndpoint(catalog, 'GET', 'core', '/labels')?.write, undefined);
});

test('literal routes win over parameterised ones', () => {
  assert.equal(matchEndpoint(catalog, 'POST', 'core', '/campaigns/preflight')?.path, '/campaigns/preflight');
  assert.equal(matchEndpoint(catalog, 'GET', 'core', '/campaigns/7/')?.path, '/campaigns/:id');
  assert.equal(matchEndpoint(catalog, 'GET', 'core', '/not_a_route'), undefined);
  assert.equal(matchEndpoint(catalog, 'PATCH', 'core', '/labels'), undefined, 'method must match too');
});

test('search finds endpoints by intent and honours filters', () => {
  const stages = searchCatalog(catalog, 'pipeline stages');
  assert.ok(stages.length > 0);
  assert.ok(stages.every((endpoint) => /pipeline|stage/.test(`${endpoint.path} ${endpoint.action}`)));

  const won = searchCatalog(catalog, 'deal won', { method: 'post' });
  assert.equal(won[0]?.path, '/crm_deals/:id/won');

  const templates = searchCatalog(catalog, 'templates', { domain: 'message_templates', limit: 3 });
  assert.ok(templates.length > 0 && templates.length <= 3);
  assert.ok(templates.every((endpoint) => endpoint.domain === 'message_templates'));

  assert.deepEqual(searchCatalog(catalog, 'zzzz-nothing'), []);
  assert.equal(searchCatalog(catalog, '', { limit: 500 }).length, 50, 'limit is capped');
});
