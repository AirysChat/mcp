#!/usr/bin/env node
/**
 * Synchronizes shared `skills/<name>/SKILL.md` into all 4 client plugin bundles
 * (`claude`, `codex`, `gemini`, `antigravity`) and keeps plugin/registry manifest
 * versions in lockstep with `packages/server/package.json` (`GA-01`, `GA-06`).
 *
 * Usage:
 *   node scripts/plugins/sync-plugins.mjs          # sync skills + versions
 *   node scripts/plugins/sync-plugins.mjs --check  # verify zero drift
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checkOnly = process.argv.includes('--check');

const serverPkg = JSON.parse(readFileSync(join(ROOT, 'packages/server/package.json'), 'utf8'));
const version = serverPkg.version;

const PLUGIN_BUNDLES = ['claude', 'codex', 'gemini', 'antigravity'];
const MANIFEST_PATHS = [
  'plugins/claude/.claude-plugin/plugin.json',
  'plugins/codex/.codex-plugin/plugin.json',
  'plugins/gemini/gemini-extension.json',
  'plugins/antigravity/plugin.json',
];

const skillsRoot = join(ROOT, 'skills');
const skillDirs = readdirSync(skillsRoot)
  .filter((entry) => {
    const full = join(skillsRoot, entry);
    return statSync(full).isDirectory() && existsSync(join(full, 'SKILL.md'));
  })
  .sort();

if (skillDirs.length === 0) {
  console.error('No skills found under skills/*/SKILL.md');
  process.exit(1);
}

const drift = [];

// 1. Sync or check skills/<name>/SKILL.md across all 4 plugin bundles
for (const bundle of PLUGIN_BUNDLES) {
  for (const skill of skillDirs) {
    const srcPath = join(skillsRoot, skill, 'SKILL.md');
    const dstPath = join(ROOT, 'plugins', bundle, 'skills', skill, 'SKILL.md');
    const expected = readFileSync(srcPath, 'utf8');
    const current = existsSync(dstPath) ? readFileSync(dstPath, 'utf8') : null;
    if (current !== expected) {
      if (checkOnly) {
        drift.push(`plugins/${bundle}/skills/${skill}/SKILL.md differs from skills/${skill}/SKILL.md`);
      } else {
        mkdirSync(dirname(dstPath), { recursive: true });
        writeFileSync(dstPath, expected, 'utf8');
      }
    }
  }
}

// 2. Sync or check manifest versions
for (const relPath of MANIFEST_PATHS) {
  const fullPath = join(ROOT, relPath);
  const raw = readFileSync(fullPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed.version !== version) {
    if (checkOnly) {
      drift.push(`${relPath} version (${parsed.version}) !== packages/server version (${version})`);
    } else {
      parsed.version = version;
      writeFileSync(fullPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    }
  }
}

// 3. Sync or check server.json version (`GA-06`)
const serverJsonPath = join(ROOT, 'server.json');
if (existsSync(serverJsonPath)) {
  const raw = readFileSync(serverJsonPath, 'utf8');
  const parsed = JSON.parse(raw);
  const pkgVersion = parsed.packages?.[0]?.version;
  if (parsed.version !== version || pkgVersion !== version) {
    if (checkOnly) {
      drift.push(`server.json version (${parsed.version} / ${pkgVersion}) !== packages/server version (${version})`);
    } else {
      parsed.version = version;
      if (Array.isArray(parsed.packages) && parsed.packages[0]) {
        parsed.packages[0].version = version;
      }
      writeFileSync(serverJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    }
  }
}

if (checkOnly) {
  if (drift.length > 0) {
    console.error('Plugin bundle / manifest drift detected:\n  - ' + drift.join('\n  - '));
    console.error('Run `pnpm plugins:sync` to synchronize.');
    process.exit(1);
  }
  console.log(`✓ plugins consistent: ${PLUGIN_BUNDLES.length} bundles × ${skillDirs.length} skills @ v${version}`);
} else {
  console.log(`✓ synced ${skillDirs.length} skills into ${PLUGIN_BUNDLES.length} plugin bundles @ v${version}`);
}
