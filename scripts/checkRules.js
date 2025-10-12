#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const checksPath = path.join(root, 'rules', 'checks.json');
if (!fs.existsSync(checksPath)) {
  console.error('rules/checks.json 不存在，请先运行 rules:extract。');
  process.exit(1);
}

const checks = JSON.parse(fs.readFileSync(checksPath, 'utf8'));
const violations = [];

function grep(pattern) {
  try {
    const out = execSync(
      `rg -n --hidden -S "${pattern}" --glob '!**/__tests__/**' --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/*.fixture.*' apps packages | wc -l`,
      {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
    return parseInt(out, 10) || 0;
  } catch (error) {
    return 0;
  }
}

for (const forbid of checks.forbids || []) {
  const hits = grep(forbid.pattern);
  if (hits > 0) {
    violations.push({ kind: 'FORBID', pattern: forbid.pattern, hits });
  }
}

for (const req of checks.requires || []) {
  if (req.type === 'archTest' && !fs.existsSync(path.join(root, req.file))) {
    violations.push({ kind: 'MISSING_ARCH_TEST', file: req.file });
  }
  if (req.type === 'realtimeFromStore' && !fs.existsSync(path.join(root, req.facade))) {
    violations.push({ kind: 'MISSING_FACADE', file: req.facade });
  }
}

if (violations.length) {
  console.error('规则检查未通过：');
  console.error(JSON.stringify({ violations }, null, 2));
  process.exit(1);
}

console.log('规则检查通过。');
