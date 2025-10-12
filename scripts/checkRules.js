#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RULES_DIR = path.join(ROOT, "rules");
const SNAPSHOT_PATH = path.join(RULES_DIR, "rules.json");
const REPORT_PATH = path.join(RULES_DIR, "report.pre.json");

function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      `未找到规则快照：${path.relative(ROOT, SNAPSHOT_PATH)}，请先执行 node scripts/extractRules.js。`
    );
  }
  const raw = fs.readFileSync(SNAPSHOT_PATH, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`无法解析 ${path.relative(ROOT, SNAPSHOT_PATH)}：${error.message}`);
  }
}

function validateRules(snapshot) {
  const violations = [];

  if (!snapshot || typeof snapshot !== "object") {
    violations.push({
      code: "snapshot.invalid",
      message: "规则快照格式不正确，应为对象。",
    });
    return violations;
  }

  if (!Array.isArray(snapshot.rules)) {
    violations.push({
      code: "rules.notArray",
      message: "rules 字段缺失或不是数组。",
    });
    return violations;
  }

  snapshot.rules.forEach((rule, index) => {
    if (!rule || typeof rule !== "object") {
      violations.push({
        code: "rule.invalid",
        message: `第 ${index + 1} 条规则格式异常，应为对象。`,
      });
      return;
    }

    if (!rule.title || typeof rule.title !== "string") {
      violations.push({
        code: "rule.title.missing",
        message: `第 ${index + 1} 条规则缺少标题。`,
      });
    }

    if (typeof rule.body !== "string") {
      violations.push({
        code: "rule.body.invalid",
        message: `第 ${index + 1} 条规则的正文应为字符串。`,
      });
    }

    if (rule.subSections && !Array.isArray(rule.subSections)) {
      violations.push({
        code: "rule.subsections.invalid",
        message: `第 ${index + 1} 条规则的 subSections 字段应为数组。`,
      });
    } else if (Array.isArray(rule.subSections)) {
      rule.subSections.forEach((section, subIndex) => {
        if (!section || typeof section !== "object") {
          violations.push({
            code: "rule.subsection.invalid",
            message: `第 ${index + 1} 条规则的第 ${subIndex + 1} 个子条格式异常。`,
          });
          return;
        }
        if (!section.title || typeof section.title !== "string") {
          violations.push({
            code: "rule.subsection.title",
            message: `第 ${index + 1} 条规则的第 ${subIndex + 1} 个子条缺少标题。`,
          });
        }
        if (typeof section.content !== "string") {
          violations.push({
            code: "rule.subsection.content",
            message: `第 ${index + 1} 条规则的第 ${subIndex + 1} 个子条正文应为字符串。`,
          });
        }
      });
    }
  });

  return violations;
}

function main() {
  let snapshot;
  try {
    snapshot = loadSnapshot();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const violations = validateRules(snapshot);

  const report = {
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, SNAPSHOT_PATH),
    totalRules: Array.isArray(snapshot?.rules) ? snapshot.rules.length : 0,
    violationCount: violations.length,
    violations,
  };

  if (!fs.existsSync(RULES_DIR)) {
    fs.mkdirSync(RULES_DIR, { recursive: true });
  }
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (violations.length > 0) {
    console.error(`规则校验失败：共 ${violations.length} 项。详情见 ${path.relative(ROOT, REPORT_PATH)}。`);
    process.exit(1);
  }

  console.log(`规则校验通过，未发现违规。报告已写入 ${path.relative(ROOT, REPORT_PATH)}。`);
}

if (require.main === module) {
  main();
}

module.exports = {
  validateRules,
};
