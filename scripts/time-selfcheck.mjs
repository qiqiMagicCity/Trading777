#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['apps', 'packages', 'libs', 'server', 'api', 'public'].map((p) => path.join(ROOT, p));
const EXT_OK = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const IGNORE_DIR = new Set(['node_modules', 'dist', 'build', '.next', 'coverage']);
const TEST_FILE_RE = /__tests__|\.test\.|\.spec\./;

const allowlistPath = path.join(ROOT, 'scripts', 'time-allowlist.json');
const allowlist = fs.existsSync(allowlistPath)
  ? JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
  : { lines: [] };

const patterns = [
  { id: 'a', desc: 'toISOString().slice(0,10)', re: /\.toISOString\(\)\.slice\(0,\s*10\)/g, level: 'blocker' },
  { id: 'b', desc: "new Date('YYYY-MM-DD')", re: /new\s+Date\(\s*['"]\d{4}-\d{2}-\d{2}['"]\s*\)/g, level: 'blocker' },
  { id: 'c', desc: 'toLocaleDate/String 可能的时区歧义', re: /\.toLocale(?:Date|String)\s*\(/g, level: 'warn' },
  { id: 'd1', desc: 'Date.UTC(...)', re: /\bDate\.UTC\s*\(/g, level: 'blocker' },
  { id: 'd2', desc: "手工拼接 'T00:00:00Z'/'T23:59:59Z'", re: /T(?:00:00:00|23:59:59)Z/g, level: 'blocker' },
  { id: 'e1', desc: '24*60*60*1000', re: /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/g, level: 'blocker' },
  { id: 'e2', desc: '12*60*60*1000', re: /12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/g, level: 'blocker' },
  { id: 'e3', desc: '86400000/43200000', re: /\b(86400000|43200000)\b/g, level: 'blocker' },
  { id: 'f', desc: 'nowNY()->toNY() 二次转换', re: /nowNY\(\)[\s\S]{0,80}?toNY\s*\(/g, level: 'blocker' },
  { id: 'g', desc: 'toNY(toNY(...)) 重复转换', re: /toNY\s*\(\s*toNY\s*\(/g, level: 'blocker' },
  { id: 'h', desc: "硬编码 'YYYY-MM-DD'", re: /const\s+\w+Day(Str)?\s*=\s*[^;]*(['"])\d{4}-\d{2}-\d{2}\2/g, level: 'blocker' },
  { id: 'i', desc: '可能缺少 TZ 固定（提示）', re: /process\.env\.TZ/g, level: 'info' },
  {
    id: 'j',
    desc: "Intl.DateTimeFormat 未指定 timeZone:'America/New_York'",
    re: /Intl\.DateTimeFormat\s*\((?![^)]*timeZone\s*:\s*['"]America\/New_York['"])[^)]*\)/gs,
    level: 'blocker',
  },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (IGNORE_DIR.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, out);
    } else {
      const ext = path.extname(ent.name);
      if (EXT_OK.has(ext) && !TEST_FILE_RE.test(full)) out.push(full);
    }
  }
  return out;
}

const hits = [];
for (const rootDir of SCAN_DIRS) {
  for (const file of walk(rootDir)) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const p of patterns) {
      if (!p.re.global) {
        p.re = new RegExp(p.re, p.re.flags + 'g');
      }
      p.re.lastIndex = 0;
      let match;
      while ((match = p.re.exec(text)) !== null) {
        const before = text.slice(0, match.index);
        const line = (before.match(/\n/g) || []).length + 1;
        const relativeFile = file.startsWith(`${ROOT}${path.sep}`)
          ? file.slice(ROOT.length + 1)
          : file;
        const signature = `${relativeFile}:${line}:${match[0]}`;
        if (Array.isArray(allowlist.lines) && allowlist.lines.includes(signature)) continue;

        const snippet = lines[line - 1] ?? '';
        const prevSnippet = lines[line - 2] ?? '';
        if (p.id === 'c' && /(Number\(|Math\.|parsed\.y|toFixed\()/i.test(snippet)) continue;
        if (/eslint-disable/.test(snippet) || /eslint-disable/.test(prevSnippet)) continue;

        hits.push({ id: p.id, level: p.level, file: relativeFile, line, text: match[0] });
      }
      p.re.lastIndex = 0;
    }
  }
}

const groups = {};
for (const hit of hits) {
  if (!groups[hit.id]) {
    const pattern = patterns.find((p) => p.id === hit.id);
    groups[hit.id] = { level: pattern?.level ?? 'blocker', items: [] };
  }
  groups[hit.id].items.push(hit);
}

const totals = Object.values(groups).reduce((sum, group) => sum + group.items.length, 0);
const blockerCount = Object.values(groups).reduce(
  (sum, group) => sum + (group.level === 'blocker' ? group.items.length : 0),
  0,
);

const jsonReport = {
  generatedAt: new Date().toISOString(),
  dangerousUsagesTotal: totals,
  blockers: blockerCount,
  groups,
};

fs.writeFileSync(path.join(ROOT, 'selfcheck-time.json'), JSON.stringify(jsonReport, null, 2), 'utf8');

let md = '# 时间系统自检报告\n\n';
md += `总命中: ${totals}，其中 Blocker: **${blockerCount}**\n\n`;
for (const pattern of patterns) {
  const group = groups[pattern.id];
  const count = group ? group.items.length : 0;
  md += `## [${pattern.id}] ${pattern.desc} — ${count} 处（级别: ${pattern.level})\n\n`;
  if (count > 0) {
    md += '| 文件 | 行号 | 命中 |\n|---|---:|---|\n';
    for (const item of group.items) {
      const textEscaped = item.text.replace(/\|/g, '\\|').trim();
      md += `|${item.file.replace(`${ROOT}/`, '')}|${item.line}|${textEscaped}|\n`;
    }
    md += '\n';
  }
}
fs.writeFileSync(path.join(ROOT, 'selfcheck-time.md'), md, 'utf8');

if (blockerCount > 0) {
  console.error('[time-selfcheck] Blockers found:', blockerCount);
  process.exit(2);
} else {
  console.log('[time-selfcheck] OK. No blockers.');
}
