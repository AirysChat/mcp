import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig, parseTokenScopes } from '../src/config.js';

const base = { AIRYSCHAT_BASE_URL: 'https://staging.example/', AIRYSCHAT_API_KEY: 'k', AIRYSCHAT_ACCOUNT_ID: '6' };

test('loads required values and strips trailing slashes', () => {
  const config = loadConfig(base);
  assert.equal(config.baseUrl, 'https://staging.example');
  assert.equal(config.accountId, 6);
  assert.deepEqual([...config.toolsets], ['core', 'whatsapp']);
  assert.equal(config.features, 'stable');
  assert.equal(config.readOnly, false);
  assert.equal(config.timeoutMs, 30_000);
});

test('missing required variables fail at startup', () => {
  for (const name of Object.keys(base)) {
    const env = { ...base, [name]: '' };
    assert.throws(() => loadConfig(env), (error: unknown) => error instanceof ConfigError && error.message.includes(name));
  }
});

test('an unexpanded ${VAR} placeholder is reported as an unset variable', () => {
  assert.throws(() => loadConfig({ ...base, AIRYSCHAT_API_KEY: '${AIRYSCHAT_API_KEY}' }), /passed unexpanded/);
});

test('account id must be a positive integer and base URL must be http(s)', () => {
  assert.throws(() => loadConfig({ ...base, AIRYSCHAT_ACCOUNT_ID: '0' }), /positive integer/);
  assert.throws(() => loadConfig({ ...base, AIRYSCHAT_ACCOUNT_ID: 'abc' }), /positive integer/);
  assert.throws(() => loadConfig({ ...base, AIRYSCHAT_BASE_URL: 'ftp://x' }), /http/);
});

test('toolsets are parsed and unknown names rejected', () => {
  assert.deepEqual([...loadConfig({ ...base, AIRYSCHAT_TOOLSETS: ' whatsapp ' }).toolsets], ['whatsapp']);
  assert.deepEqual([...loadConfig({ ...base, AIRYSCHAT_TOOLSETS: 'core,crm' }).toolsets], ['core', 'crm']);
  assert.throws(() => loadConfig({ ...base, AIRYSCHAT_TOOLSETS: 'core,bogus' }), /Unknown toolset\(s\): bogus/);
});

test('AIRYSCHAT_FEATURES accepts stable, beta, experimental (case-insensitive)', () => {
  assert.equal(loadConfig({ ...base, AIRYSCHAT_FEATURES: 'Beta' }).features, 'beta');
  assert.equal(loadConfig({ ...base, AIRYSCHAT_FEATURES: 'experimental' }).features, 'experimental');
  assert.equal(loadConfig({ ...base, AIRYSCHAT_FEATURES: ' ' }).features, 'stable');
  assert.throws(() => loadConfig({ ...base, AIRYSCHAT_FEATURES: 'deprecated' }), /AIRYSCHAT_FEATURES/);
});

test('read-only accepts 1 or true only', () => {
  assert.equal(loadConfig({ ...base, AIRYSCHAT_READ_ONLY: '1' }).readOnly, true);
  assert.equal(loadConfig({ ...base, AIRYSCHAT_READ_ONLY: 'TRUE' }).readOnly, true);
  assert.equal(loadConfig({ ...base, AIRYSCHAT_READ_ONLY: 'yes' }).readOnly, false);
});

test('parseTokenScopes enforces mcp:read < mcp:write < mcp:irreversible and toolset restrictions', () => {
  const readOnly = parseTokenScopes('mcp:read');
  assert.equal(readOnly.maxAccess, 'read');
  assert.equal(readOnly.toolsetsRestricted, false);
  assert.deepEqual([...readOnly.toolsets], ['core', 'whatsapp']);
  assert.deepEqual(readOnly.expandedScopes, ['mcp:read']);

  const writeScoped = parseTokenScopes(['mcp:write', 'mcp:toolset:crm', 'mcp:toolset:reports']);
  assert.equal(writeScoped.maxAccess, 'write');
  assert.equal(writeScoped.toolsetsRestricted, true);
  assert.deepEqual([...writeScoped.toolsets], ['crm', 'reports']);
  assert.deepEqual(writeScoped.expandedScopes, [
    'mcp:read',
    'mcp:write',
    'mcp:toolset:crm',
    'mcp:toolset:reports',
  ]);

  const irreversible = parseTokenScopes('mcp:irreversible');
  assert.equal(irreversible.maxAccess, 'irreversible');
  assert.deepEqual(irreversible.expandedScopes, ['mcp:read', 'mcp:write', 'mcp:irreversible']);

  assert.throws(() => parseTokenScopes('openid profile'), /at least one access scope/);
  assert.throws(() => parseTokenScopes('mcp:read mcp:toolset:unknown'), /Unknown toolset scope/);

  const fromEnv = loadConfig({ ...base, AIRYSCHAT_SCOPES: 'mcp:read,mcp:toolset:reports' });
  assert.equal(fromEnv.readOnly, true);
  assert.equal(fromEnv.maxAccess, 'read');
  assert.equal(fromEnv.toolsetsRestricted, true);
  assert.deepEqual([...fromEnv.toolsets], ['reports']);
});

test('resolves unexpanded ${VAR:-default} placeholders from plugin manifests', () => {
  const cfg = loadConfig({
    ...base,
    AIRYSCHAT_TOOLSETS: '${AIRYSCHAT_TOOLSETS:-core,whatsapp}',
    AIRYSCHAT_FEATURES: '${AIRYSCHAT_FEATURES:-stable}',
    AIRYSCHAT_READ_ONLY: '${AIRYSCHAT_READ_ONLY:-}',
  });
  assert.deepEqual([...cfg.toolsets], ['core', 'whatsapp']);
  assert.equal(cfg.features, 'stable');
  assert.equal(cfg.readOnly, false);
});

test('package.json bin maps unscoped name "mcp" so npx @airyschat/mcp resolves default executable', () => {
  const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    name: string;
    bin: Record<string, string>;
  };
  const unscoped = pkg.name.includes('/') ? pkg.name.split('/')[1]! : pkg.name;
  assert.equal(pkg.bin[unscoped], 'dist/index.js');
  assert.equal(pkg.bin['airyschat-mcp'], 'dist/index.js');
  assert.equal(pkg.bin['airyschat-mcp-http'], 'dist/http.js');
});
