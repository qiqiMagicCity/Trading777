const fs = require('fs');
const path = require('path');

const roots = [path.resolve(__dirname, '..')];
const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);

const bad = [
  {
    re: /toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/g,
    msg: 'Use nyDay.resolveTradingDayStr / day-key helpers; do NOT slice ISO.',
  },
  {
    re: /new\s+Date\(\s*['"]\d{4}-\d{2}-\d{2}['"]\s*\)/g,
    msg: "Do NOT construct Date from 'YYYY-MM-DD' literal (timezone trap). Use nyDay.parseNyDate.",
  },
];

const offenders = [];

const walk = (p) => {
  let st;
  try {
    st = fs.statSync(p);
  } catch (err) {
    console.warn('NYDAY GUARD ⚠️ unable to access', p, '-', err.message || err);
    return;
  }

  if (st.isDirectory()) {
    for (const f of fs.readdirSync(p)) {
      if (f.startsWith('.next') || f === 'node_modules' || f === '.turbo' || f === '.git') {
        continue;
      }
      walk(path.join(p, f));
    }
  } else if (exts.has(path.extname(p))) {
    let txt;
    try {
      txt = fs.readFileSync(p, 'utf8');
    } catch (err) {
      console.warn('NYDAY GUARD ⚠️ unable to read', p, '-', err.message || err);
      return;
    }

    for (const rule of bad) {
      const matches = txt.match(rule.re);
      if (matches) {
        offenders.push({ file: p, count: matches.length, msg: rule.msg });
      }
    }
  }
};

for (const root of roots) {
  walk(root);
}

if (offenders.length) {
  console.error('\nNYDAY GUARD ❌ violations found:');
  for (const offender of offenders) {
    console.error('-', offender.file, '→', offender.msg, `(x${offender.count})`);
  }
  console.error('\nFix: route all day decisions through nyDay.* and trading-day helpers.');
  process.exit(1);
}

console.log('NYDAY GUARD ✅ no violations.');
