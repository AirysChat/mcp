#!/usr/bin/env node
/**
 * AirysChat API inventory and MCP coverage report.
 *
 * The inventory is the backlog: every account-scoped endpoint AirysChat serves is a row,
 * with the toolset and release that will cover it and how it is covered today.
 *
 *   pnpm inventory                                  re-derive coverage, rewrite docs
 *   pnpm inventory -- --routes routes.txt --source <sha>
 *                                                   merge a fresh `bin/rails routes` dump
 *   pnpm inventory:check                            CI: fail if docs are stale or the
 *                                                   curated map disagrees with the code
 *
 * Coverage values:
 *   curated   a dedicated tool calls this endpoint (scripts/inventory/curated.json)
 *   raw       reachable only through the `airyschat_api` escape hatch
 *   excluded  cannot be driven through MCP as-is; `notes` says why
 *   removed   no longer served by AirysChat; kept until the next release for traceability
 *
 * The route dump is never committed (it is regenerated from an AirysChat checkout); only
 * method, path and controller#action land in docs/api/inventory.csv. No tenant data.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INVENTORY = join(ROOT, 'docs/api/inventory.csv');
const META = join(ROOT, 'docs/api/inventory.meta.json');
const COVERAGE = join(ROOT, 'docs/api/coverage.md');
const TOOLS_DIR = join(ROOT, 'packages/server/src/tools');
const domains = JSON.parse(readFileSync(join(ROOT, 'scripts/inventory/domains.json'), 'utf8'));
const curated = JSON.parse(readFileSync(join(ROOT, 'scripts/inventory/curated.json'), 'utf8'));

const COLUMNS = ['prefix', 'domain', 'method', 'path', 'controller', 'toolset', 'release', 'coverage', 'tool', 'notes'];
const COVERAGE_VALUES = new Set(['curated', 'raw', 'excluded', 'removed']);
const PREFIXES = [
  ['saas', '/saas/api/v1/accounts/:account_id'],
  ['core_v2', '/api/v2/accounts/:account_id'],
  ['core', '/api/v1/accounts/:account_id'],
];

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const checkOnly = args.includes('--check');
const routesFile = flag('--routes');
const sourceRef = flag('--source');

const errors = [];
const key = (row) => `${row.prefix} ${row.method} ${row.path}`;
const normalize = (path) => path.replace(/:[a-z_]+/g, '{}');

// ------------------------------------------------------------------ load
const rows = new Map();
if (existsSync(INVENTORY)) {
  for (const row of parseCsv(readFileSync(INVENTORY, 'utf8'))) rows.set(key(row), row);
}

if (routesFile) {
  const seen = new Set();
  for (const route of parseRoutes(readFileSync(routesFile, 'utf8'))) {
    const id = key(route);
    seen.add(id);
    const existing = rows.get(id);
    if (existing) {
      existing.controller = route.controller;
      if (existing.coverage === 'removed') existing.coverage = 'raw';
    } else {
      rows.set(id, seed(route));
    }
  }
  for (const [id, row] of rows) {
    if (!seen.has(id) && row.coverage !== 'removed') {
      row.coverage = 'removed';
      row.notes = `Not in routes at ${sourceRef ?? 'latest dump'}`;
    }
  }
}

if (rows.size === 0) {
  console.error('No inventory yet. Run with --routes <file> from an AirysChat checkout: see .agents/skills/sync-api-inventory.');
  process.exit(1);
}

// ------------------------------------------------------------------ curated mapping
const toolsInCode = readToolNames();
const curatedIndex = new Map();
for (const [prefix, method, path, tool, release] of curated.endpoints) {
  curatedIndex.set(`${prefix} ${method} ${path}`, { tool, release });
  if (!toolsInCode.has(tool)) errors.push(`curated.json maps ${method} ${path} to "${tool}", which is not defined in packages/server/src/tools`);
  if (!/^\d+\.\d+\.\d+$/.test(release ?? '')) errors.push(`curated.json entry for "${tool}" (${method} ${path}) needs the release it shipped in as 5th element`);
}
const mappedTools = new Set(curated.endpoints.map((entry) => entry[3]));
for (const tool of toolsInCode.keys()) {
  if (!mappedTools.has(tool) && !(tool in curated.unmapped_tools)) {
    errors.push(`Tool "${tool}" exists in code but is not mapped in scripts/inventory/curated.json`);
  }
}

const matchedCurated = new Set();
for (const row of rows.values()) {
  if (row.coverage === 'removed') continue;
  const hit = curatedIndex.get(`${row.prefix} ${row.method} ${normalize(row.path)}`);
  if (hit) {
    row.coverage = 'curated';
    row.tool = hit.tool;
    row.toolset = toolsInCode.get(hit.tool) ?? row.toolset;
    row.release = hit.release;
    matchedCurated.add(`${row.prefix} ${row.method} ${normalize(row.path)}`);
  } else if (row.coverage === 'curated') {
    // A tool stopped covering this endpoint: fall back to the domain plan.
    row.coverage = 'raw';
    row.tool = '';
    [row.toolset, row.release] = domains[row.prefix]?.[row.domain] ?? ['unassigned', 'unplanned'];
  }
  if (!COVERAGE_VALUES.has(row.coverage)) errors.push(`${key(row)}: unknown coverage "${row.coverage}"`);
}
for (const id of curatedIndex.keys()) {
  if (!matchedCurated.has(id)) errors.push(`curated.json entry "${id}" matches no inventory row — stale mapping or route changed`);
}

// ------------------------------------------------------------------ render
const sorted = [...rows.values()].sort((a, b) =>
  a.prefix.localeCompare(b.prefix) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
);
const csv = renderCsv(sorted);
const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {};
if (routesFile) {
  meta.source = sourceRef ?? meta.source ?? 'unknown';
  meta.generated_from = 'bin/rails routes (AirysChat)';
}
const coverage = renderCoverage(sorted, meta);

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}

if (checkOnly) {
  const stale = [];
  if (!existsSync(INVENTORY) || readFileSync(INVENTORY, 'utf8') !== csv) stale.push('docs/api/inventory.csv');
  if (!existsSync(COVERAGE) || readFileSync(COVERAGE, 'utf8') !== coverage) stale.push('docs/api/coverage.md');
  if (stale.length > 0) {
    console.error(`✗ Stale: ${stale.join(', ')}. Run \`pnpm inventory\` and commit the result.`);
    process.exit(1);
  }
  console.log(`✓ inventory consistent: ${sorted.length} endpoints, ${toolsInCode.size} tools`);
} else {
  writeFileSync(INVENTORY, csv);
  writeFileSync(COVERAGE, coverage);
  if (routesFile) writeFileSync(META, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`wrote ${sorted.length} endpoints → docs/api/inventory.csv, docs/api/coverage.md`);
}

// ------------------------------------------------------------------ helpers
function seed(route) {
  const excluded = domains.exclude[route.domain];
  const [toolset, release] = domains[route.prefix]?.[route.domain] ?? ['unassigned', 'unplanned'];
  if (toolset === 'unassigned' && !excluded) console.warn(`! no default toolset for ${route.prefix}/${route.domain} — add it to scripts/inventory/domains.json`);
  return {
    ...route,
    toolset: excluded ? 'excluded' : toolset,
    release: excluded ? '' : release,
    coverage: excluded ? 'excluded' : 'raw',
    tool: '',
    notes: excluded ?? '',
  };
}

function parseRoutes(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const match = line.match(/\s((?:GET|POST|PATCH|PUT|DELETE)(?:\|(?:GET|POST|PATCH|PUT|DELETE))*)\s+(\/\S*)\s+(\S+#\S+)/);
    if (!match) continue;
    const [, verbs, rawPath, controller] = match;
    const path = rawPath.replace('(.:format)', '');
    let prefix;
    let rel;
    if (path === '/api/v1/profile' || path.startsWith('/api/v1/profile/')) {
      prefix = 'raw';
      rel = path;
    } else {
      const hit = PREFIXES.find(([, base]) => path === base || path.startsWith(`${base}/`));
      if (!hit) continue;
      prefix = hit[0];
      rel = path.slice(hit[1].length) || '/';
    }
    const domain = prefix === 'raw' ? 'api' : (rel.split('/').find((segment) => segment && !segment.startsWith(':')) ?? '(root)');
    for (const method of verbs.split('|')) out.push({ prefix, domain, method, path: rel, controller });
  }
  // Rails lists PATCH and PUT for the same update action; keep both — clients may use either.
  return out;
}

/** Tool name → toolset, where the toolset is the tool file's basename (tools/crm.ts → crm). */
function readToolNames() {
  const names = new Map();
  for (const file of readdirSync(TOOLS_DIR)) {
    if (!file.endsWith('.ts')) continue;
    const source = readFileSync(join(TOOLS_DIR, file), 'utf8');
    for (const match of source.matchAll(/name:\s*'([a-z0-9_]+)'/g)) names.set(match[1], file.replace(/\.ts$/, ''));
  }
  return names;
}

function parseCsv(text) {
  const lines = [];
  let field = '';
  let record = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { record.push(field); field = ''; }
    else if (char === '\n') { record.push(field); lines.push(record); record = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || record.length) { record.push(field); lines.push(record); }
  const [header, ...body] = lines;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((column, index) => [column, r[index] ?? ''])));
}

function renderCsv(list) {
  const escape = (value) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  return `${[COLUMNS.join(','), ...list.map((row) => COLUMNS.map((column) => escape(String(row[column] ?? ''))).join(','))].join('\n')}\n`;
}

function renderCoverage(list, info) {
  const live = list.filter((row) => row.coverage !== 'removed');
  const count = (predicate) => live.filter(predicate).length;
  const pct = (part, whole) => (whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`);
  const toolsets = [...new Set(live.map((row) => row.toolset))].sort();
  const releases = [...new Set(live.map((row) => row.release).filter(Boolean))].sort(semver);

  const curatedCount = count((row) => row.coverage === 'curated');
  const excludedCount = count((row) => row.coverage === 'excluded');
  const addressable = live.length - excludedCount;

  const lines = [
    '# AirysChat API coverage',
    '',
    '<!-- Generated by scripts/inventory/build-inventory.mjs. Do not edit; run `pnpm inventory`. -->',
    '',
    `Source: \`${info.source ?? 'unknown'}\` (${info.generated_from ?? 'bin/rails routes'}). ` +
      'Full list: [inventory.csv](inventory.csv).',
    '',
    `**${curatedCount} of ${addressable} addressable endpoints have a curated tool (${pct(curatedCount, addressable)}).** ` +
      `Every addressable endpoint is reachable today through \`airyschat_api\`; ${excludedCount} are excluded.`,
    '',
    '## By toolset',
    '',
    '| Toolset | Endpoints | Curated | Raw only | Excluded | Curated % |',
    '|---|---:|---:|---:|---:|---:|',
  ];
  for (const toolset of toolsets) {
    const inSet = (row) => row.toolset === toolset;
    const total = count(inSet);
    const cur = count((row) => inSet(row) && row.coverage === 'curated');
    const raw = count((row) => inSet(row) && row.coverage === 'raw');
    const exc = count((row) => inSet(row) && row.coverage === 'excluded');
    lines.push(`| \`${toolset}\` | ${total} | ${cur} | ${raw} | ${exc} | ${pct(cur, total - exc)} |`);
  }
  lines.push('', '## By target release', '', '| Release | Endpoints | Curated | Remaining |', '|---|---:|---:|---:|');
  for (const release of releases) {
    const inRelease = (row) => row.release === release;
    const total = count(inRelease);
    const cur = count((row) => inRelease(row) && row.coverage === 'curated');
    lines.push(`| ${release} | ${total} | ${cur} | ${total - cur} |`);
  }
  const removed = list.length - live.length;
  if (removed > 0) lines.push('', `${removed} endpoint(s) marked \`removed\` are kept for traceability until the next release.`);
  return `${lines.join('\n')}\n`;
}

function semver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}
