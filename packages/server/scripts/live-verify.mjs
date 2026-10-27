/**
 * Live verification driver (FND-10, `.agents/skills/live-verify`).
 *
 * Spawns the built server over stdio against a real AirysChat instance, forces
 * read-only mode, calls read tools and prints a SANITIZED summary: status, latency,
 * top-level keys and array lengths. It never prints values, so output can go straight
 * into specs/<lane>/verification.md.
 *
 * Credentials come from the environment only (inject from the Keychain inline):
 *
 *   AIRYSCHAT_API_KEY="$(security find-generic-password -s airyschat-mcp-staging -w)" \
 *   AIRYSCHAT_BASE_URL=https://staging.airys.app AIRYSCHAT_ACCOUNT_ID=6 \
 *     node scripts/live-verify.mjs                 # every read tool that needs no args
 *     node scripts/live-verify.mjs conversation_get '{"conversation_id": 1}'
 *
 * Any host other than staging.airys.app must be named explicitly by the owner via
 * LIVE_VERIFY_ALLOW_HOST=<host>; it stays read-only either way.
 */

import { spawn } from 'node:child_process';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/server';

const DEFAULT_HOST = 'staging.airys.app';

function fail(message) {
  console.error(`live-verify: ${message}`);
  process.exit(2);
}

for (const name of ['AIRYSCHAT_BASE_URL', 'AIRYSCHAT_API_KEY', 'AIRYSCHAT_ACCOUNT_ID']) {
  if (!process.env[name]) fail(`${name} is not set (see .agents/skills/live-verify/SKILL.md)`);
}
const host = new URL(process.env.AIRYSCHAT_BASE_URL).host;
if (host !== DEFAULT_HOST && process.env.LIVE_VERIFY_ALLOW_HOST !== host) {
  fail(`refusing ${host}: only ${DEFAULT_HOST} unless the owner names it via LIVE_VERIFY_ALLOW_HOST`);
}

const [onlyTool, rawArgs] = process.argv.slice(2);
const toolArgs = rawArgs ? JSON.parse(rawArgs) : {};

const child = spawn(process.execPath, ['dist/index.js'], {
  env: { ...process.env, AIRYSCHAT_READ_ONLY: '1', AIRYSCHAT_FEATURES: process.env.AIRYSCHAT_FEATURES ?? 'experimental' },
  stdio: ['pipe', 'pipe', 'inherit'],
});

const pending = new Map();
let buffer = '';
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  }
});

let nextId = 1;
const call = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 60_000).unref();
  });

/** Shape only — keys and lengths, never values. */
function shape(value, depth = 0) {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (depth >= 1) return `object{${keys.length} keys}`;
    return `{${keys.map((key) => `${key}: ${shape(value[key], depth + 1)}`).join(', ')}}`;
  }
  return typeof value;
}

function summarize(result) {
  const text = (result.content ?? []).map((block) => block.text ?? '').join('\n');
  if (result.isError) {
    // Error texts are produced by this server (result.ts), not by customers; keep the first line.
    return `error — ${text.split('\n')[0].slice(0, 160)}`;
  }
  const fenced = text.match(/```json\n([\s\S]*?)\n```/);
  const untrusted = Boolean(fenced);
  try {
    return `ok — ${shape(JSON.parse(fenced ? fenced[1] : text))}${untrusted ? ' · untrusted-fenced' : ''}`;
  } catch {
    return `ok — non-JSON text (${text.length} chars)`;
  }
}

await call('initialize', {
  protocolVersion: LATEST_PROTOCOL_VERSION,
  capabilities: {},
  clientInfo: { name: 'live-verify', version: '0' },
});
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);

const { tools } = await call('tools/list', {});
const targets = onlyTool
  ? tools.filter((tool) => tool.name === onlyTool)
  : tools.filter((tool) => tool.annotations?.readOnlyHint && !(tool.inputSchema?.required?.length) && tool.name !== 'airyschat_api');
if (onlyTool && targets.length === 0) fail(`tool ${onlyTool} not registered (read-only mode hides write tools)`);

console.log(`# live-verify ${new Date().toISOString().slice(0, 10)} · host ${host} · account ${process.env.AIRYSCHAT_ACCOUNT_ID} · read-only · ${tools.length} tools registered`);
console.log('| Tool | Result | ms |');
console.log('|---|---|---:|');
for (const tool of targets) {
  const started = Date.now();
  let line;
  try {
    line = summarize(await call('tools/call', { name: tool.name, arguments: onlyTool ? toolArgs : {} }));
  } catch (error) {
    line = `transport error — ${error.message}`;
  }
  console.log(`| ${tool.name} | ${line} | ${Date.now() - started} |`);
}
child.kill();
