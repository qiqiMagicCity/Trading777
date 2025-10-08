const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);
const bad = [
  {
    re: /typeof\s+[\w\.]+\.price\s*===\s*['"]number['"]/g,
    msg: "Use result.kind==='quote' instead of typeof x.price",
  },
  {
    re: /['"]price['"]\s+in\s+[\w\.]+/g,
    msg: "Use result.kind==='quote' instead of 'price' in x",
  },
];

const offenders = [];

const walk = (p) => {
  let stat;
  try {
    stat = fs.statSync(p);
  } catch (err) {
    console.warn('QUOTE UNION GUARD ⚠️ unable to access', p, '-', err.message || err);
    return;
  }

  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(p)) {
      if (entry.startsWith('.next') || entry === 'node_modules' || entry === '.turbo' || entry === '.git' || entry === 'scripts') {
        continue;
      }
      walk(path.join(p, entry));
    }
    return;
  }

  if (!exts.has(path.extname(p))) {
    return;
  }

  let contents;
  try {
    contents = fs.readFileSync(p, 'utf8');
  } catch (err) {
    console.warn('QUOTE UNION GUARD ⚠️ unable to read', p, '-', err.message || err);
    return;
  }

  for (const rule of bad) {
    const matches = contents.match(rule.re);
    if (matches) {
      offenders.push({ file: p, count: matches.length, msg: rule.msg });
    }
  }
};

walk(root);

if (offenders.length) {
  console.error('\nQUOTE UNION GUARD ❌ violations:');
  for (const offender of offenders) {
    console.error('-', offender.file, '→', offender.msg, `(x${offender.count})`);
  }
  console.error("\nFix: check result.kind==='quote' before reading price.");
  process.exit(1);
}

console.log('QUOTE UNION GUARD ✅ no violations.');
