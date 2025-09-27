#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function listTrackedFiles() {
  const output = execSync('git ls-files -z', { encoding: 'buffer' });
  return output
    .toString('utf8')
    .split('\u0000')
    .filter(Boolean);
}

const conflictPatterns = ['<<<<<<<', '=======', '>>>>>>>'];
const skipFiles = new Set(['package-lock.json']);

const offenders = [];

for (const file of listTrackedFiles()) {
  if (skipFiles.has(file)) continue;
  const abs = path.resolve(file);
  let buffer;
  try {
    buffer = fs.readFileSync(abs);
  } catch (err) {
    console.warn(`[conflict-sentinel] 无法读取 ${file}:`, err);
    continue;
  }
  if (buffer.includes(0)) {
    // 二进制文件忽略（PNG/JPG 等可能包含 <<<<<<< 字节序列）
    continue;
  }
  const content = buffer.toString('utf8');
  if (conflictPatterns.some(pattern => content.includes(pattern))) {
    offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error('\u274c 检测到冲突标记，文件列表:\n' + offenders.join('\n'));
  process.exitCode = 1;
} else {
  console.log('\u2705 未发现冲突标记');
}
