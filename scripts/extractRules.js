#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const readmePath = path.join(root, 'README.md');
if (!fs.existsSync(readmePath)) {
  console.error('README.md 不存在，无法抽取规则。');
  process.exit(1);
}

const text = fs.readFileSync(readmePath, 'utf8');
const mustWords = /(必须|应当|应|须|务必|必需|必须遵循|MUST|SHALL)/;
const forbidWords = /(不得|禁止|不可|禁止使用|SHALL NOT|MUST NOT|SHOULD NOT)/;
const onlyWords = /(仅|只|唯有|ONLY)/;
const degradeWords = /(退化|不可用|降级|DEGRADED)/i;

const lines = text.split(/\r?\n/);
let section = null;
let idx = 0;
const rules = [];

for (const raw of lines) {
  const line = raw.trim();
  if (!line) continue;
  if (/^(#+)\s+/.test(line) || /^规则#?\s*\d+/.test(line)) {
    section = line.replace(/^#+\s+/, '');
  }
  if (mustWords.test(line) || forbidWords.test(line) || onlyWords.test(line) || degradeWords.test(line)) {
    rules.push({
      id: `R${(++idx).toString().padStart(3, '0')}`,
      section,
      text: line.replace(/^[-*•]\s*/, ''),
      type: mustWords.test(line)
        ? 'MUST'
        : forbidWords.test(line)
        ? 'FORBID'
        : onlyWords.test(line)
        ? 'ONLY'
        : 'OTHER',
    });
  }
}

if (!rules.length) {
  console.error('未能从 README.md 抽取到任何规范性语句。');
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'rules'), { recursive: true });
const output = {
  generatedAt: new Date().toISOString(),
  count: rules.length,
  rules,
};
fs.writeFileSync(path.join(root, 'rules', 'rules.json'), JSON.stringify(output, null, 2));
console.log(`抽取规则条目：${rules.length}`);
