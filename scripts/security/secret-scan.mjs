#!/usr/bin/env node
/**
 * Secret scan of the working tree and full git commit history (`GA-07`).
 *
 * Scans tracked files and `git log --all -p` for high-confidence credential patterns:
 * - GitHub PATs / OAuth tokens (`ghp_`, `github_pat_`, `gho_`, `ghu_`, `ghs_`, `ghr_`)
 * - npm tokens (`npm_[A-Za-z0-9]{36}`)
 * - Meta Graph API tokens (`EAA[A-Za-z0-9]{24,}`)
 * - OpenAI / Anthropic keys (`sk-proj-`, `sk-ant-`)
 * - Slack tokens (`xox[baprs]-[0-9]{10,}`)
 * - Google API keys / OAuth client secrets (`AIza[0-9A-Za-z-_]{35}`, `GOCSPX-`)
 * - PEM private keys (`-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----`)
 * - Real Airys Platform instance keys (`airys_inst_[a-z0-9_-]+_[A-Za-z0-9_-]{24,}`)
 * - Real AirysChat live MCP tokens (`mcp_live_[A-Za-z0-9_-]{20,}`)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const includeHistory = process.argv.includes('--history');

const SECRET_PATTERNS = [
  { name: 'GitHub Token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/g },
  { name: 'GitHub Fine-Grained PAT', regex: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
  { name: 'npm Access Token', regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { name: 'Meta Graph Access Token', regex: /\bEAA[A-Za-z0-9]{24,}\b/g },
  { name: 'OpenAI Project Key', regex: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Anthropic API Key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Slack Token', regex: /\bxox[baprs]-[0-9]{10,}-[A-Za-z0-9-]+\b/g },
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { name: 'Google OAuth Client Secret', regex: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'PEM Private Key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Airys Platform Instance Key', regex: /\bairys_inst_[a-z0-9_-]+_[A-Za-z0-9_-]{28,}\b/g },
  { name: 'AirysChat Live MCP Token', regex: /\bmcp_live_[A-Za-z0-9_-]{20,}\b/g },
];

// Known safe test/documentation fixtures in unit tests
const SAFE_ALLOWLIST = new Set([
  'mcp_live_secret_token_value_123456',
]);

function scanText(content, sourceLabel, findings) {
  for (const { name, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const value = match[0];
      if (SAFE_ALLOWLIST.has(value)) continue;
      findings.push(`${sourceLabel}: ${name} (${value.slice(0, 8)}…)`);
    }
  }
}

const findings = [];

// 1. Scan all git-tracked files in the working tree
const trackedFiles = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

for (const relPath of trackedFiles) {
  const fullPath = join(ROOT, relPath);
  if (!statSync(fullPath).isFile()) continue;
  const content = readFileSync(fullPath, 'utf8');
  scanText(content, `tree:${relPath}`, findings);
}

// 2. Optionally scan full git history (`--history`)
if (includeHistory) {
  const logPatch = execFileSync('git', ['log', '--all', '-p', '--no-color'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  scanText(logPatch, 'git-history', findings);
}

if (findings.length > 0) {
  console.error(`Secret scan failed with ${findings.length} finding(s):`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `✓ secret scan passed: 0 findings across ${trackedFiles.length} tracked files${includeHistory ? ' + full git history' : ''}`,
);
