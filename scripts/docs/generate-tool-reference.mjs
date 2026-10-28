#!/usr/bin/env node
/**
 * Generates `docs/tools/reference.md` directly from the compiled toolset definitions
 * in `packages/server/dist/tools/*.js` (`GA-08`).
 *
 * Usage:
 *   node scripts/docs/generate-tool-reference.mjs          # write docs/tools/reference.md
 *   node scripts/docs/generate-tool-reference.mjs --check  # fail if docs/tools/reference.md is stale
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checkOnly = process.argv.includes('--check');

const { TOOL_APP_META } = await import(join(ROOT, 'packages/server/dist/apps/index.js'));
const { catalogTools } = await import(join(ROOT, 'packages/server/dist/tools/catalog.js'));
const { rawTools } = await import(join(ROOT, 'packages/server/dist/tools/raw.js'));
const { coreTools } = await import(join(ROOT, 'packages/server/dist/tools/core.js'));
const { whatsappTools } = await import(join(ROOT, 'packages/server/dist/tools/whatsapp.js'));
const { crmTools } = await import(join(ROOT, 'packages/server/dist/tools/crm.js'));
const { aiAgentsTools } = await import(join(ROOT, 'packages/server/dist/tools/ai_agents.js'));
const { metaAgentTools } = await import(join(ROOT, 'packages/server/dist/tools/meta_agent.js'));
const { reportsTools } = await import(join(ROOT, 'packages/server/dist/tools/reports.js'));
const { adminTools } = await import(join(ROOT, 'packages/server/dist/tools/admin.js'));
const { helpCenterTools } = await import(join(ROOT, 'packages/server/dist/tools/help_center.js'));
const { platformTools } = await import(join(ROOT, 'packages/server/dist/tools/platform.js'));

const GROUPS = [
  { id: 'always-on', label: 'Always-on (`catalog` + `raw`)', defaultOn: true, tools: [...catalogTools, ...rawTools] },
  { id: 'core', label: '`core` — Conversations, Messages, Contacts, Inboxes, Teams, Labels, Search', defaultOn: true, tools: coreTools },
  { id: 'whatsapp', label: '`whatsapp` — Templates, Campaigns, Scheduled Messages, Flows, Calls', defaultOn: true, tools: whatsappTools },
  { id: 'crm', label: '`crm` — Pipelines, Deals, Notes, Activities, Companies, Conversion Settings', defaultOn: false, tools: crmTools },
  { id: 'ai_agents', label: '`ai_agents` — AirysChat AI Agents, Knowledge Base, Workflow Runs, Responder Guard', defaultOn: false, tools: aiAgentsTools },
  { id: 'meta_agent', label: '`meta_agent` — Meta Business Agent (MBA) Settings, FAQs, Skills, Thread Control, Evals', defaultOn: false, tools: metaAgentTools },
  { id: 'reports', label: '`reports` — Analytics v2, Summary Reports, Live Metrics, CSAT, SLA, Bot Metrics', defaultOn: false, tools: reportsTools },
  { id: 'admin', label: '`admin` — Inboxes, Agents, Teams, Automations, Macros, Webhooks, Integrations, Attributes, SLA', defaultOn: false, tools: adminTools },
  { id: 'help_center', label: '`help_center` — Portals, Categories, Articles CRUD & Publish', defaultOn: false, tools: helpCenterTools },
  { id: 'platform', label: '`platform` — Airys Platform API (`api.airys.chat`): Health, Ad Signals, Control Plane', defaultOn: false, tools: platformTools },
];

function accessTier(tool) {
  if (tool.irreversible) return '`mcp:irreversible`';
  if (tool.write) return '`mcp:write`';
  return '`mcp:read`';
}

const totalTools = GROUPS.reduce((acc, g) => acc + g.tools.length, 0);
const totalStable = GROUPS.reduce((acc, g) => acc + g.tools.filter((t) => t.stability === 'stable').length, 0);
const totalBeta = GROUPS.reduce((acc, g) => acc + g.tools.filter((t) => t.stability === 'beta').length, 0);
const totalExperimental = GROUPS.reduce((acc, g) => acc + g.tools.filter((t) => t.stability === 'experimental').length, 0);

const lines = [
  '# `@airyschat/mcp` Tool Reference',
  '',
  '> Generated from `packages/server/src/tools/*.ts` via `pnpm docs:tools`. Do not edit by hand.',
  '',
  `Total curated & catalog tools: **${totalTools}** (**${totalStable}** \`stable\`, **${totalBeta}** \`beta\`, **${totalExperimental}** \`experimental\`).`,
  '',
  '## Summary by Toolset',
  '',
  '| Toolset | Default | Total | `stable` | `beta` | `experimental` |',
  '|---|---|---:|---:|---:|---:|',
];

for (const g of GROUPS) {
  const s = g.tools.filter((t) => t.stability === 'stable').length;
  const b = g.tools.filter((t) => t.stability === 'beta').length;
  const e = g.tools.filter((t) => t.stability === 'experimental').length;
  lines.push(`| \`${g.id}\` | ${g.defaultOn ? 'on' : 'off'} | ${g.tools.length} | ${s} | ${b} | ${e} |`);
}

for (const g of GROUPS) {
  lines.push('', `## ${g.label}`, '');
  lines.push('| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |');
  lines.push('|---|---|---|---|---|---|');
  for (const tool of g.tools) {
    const appUri = (TOOL_APP_META[tool.name] ?? tool._meta)?.ui?.resourceUri;
    const appCol = appUri ? `\`${appUri}\`` : '—';
    const idemCol = tool.idempotent ? 'yes' : '—';
    const title = String(tool.title ?? '').replace(/\|/g, '\\|');
    lines.push(`| \`${tool.name}\` | \`${tool.stability}\` | ${accessTier(tool)} | ${idemCol} | ${appCol} | ${title} |`);
  }
}

lines.push('');
const rendered = lines.join('\n');
const outPath = join(ROOT, 'docs/tools/reference.md');

if (checkOnly) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== rendered) {
    console.error('docs/tools/reference.md is stale. Run `pnpm docs:tools` to regenerate.');
    process.exit(1);
  }
  console.log(`✓ docs/tools/reference.md is up to date (${totalTools} tools)`);
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, rendered, 'utf8');
  console.log(`✓ generated docs/tools/reference.md (${totalTools} tools)`);
}
