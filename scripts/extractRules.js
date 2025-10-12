#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const README_PATH = path.join(ROOT, "README.md");
const RULES_DIR = path.join(ROOT, "rules");
const OUTPUT_PATH = path.join(RULES_DIR, "rules.json");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseRulesFromReadme(readmeContent) {
  const lines = readmeContent.split(/\r?\n/);
  const rules = [];
  let currentRule = null;

  const mainRulePattern = /^规则#\d+/;
  const subRulePattern = /^规则[Ａ-ＺA-Z]/;

  for (const line of lines) {
    const trimmed = line.trim();

    if (mainRulePattern.test(trimmed)) {
      if (currentRule) {
        currentRule.body = currentRule.body.join("\n").trimEnd();
        currentRule.subSections = currentRule.subSections.map((section) => ({
          title: section.title,
          content: section.content.join("\n").trimEnd(),
        }));
        rules.push(currentRule);
      }
      currentRule = {
        title: trimmed,
        body: [],
        subSections: [],
      };
      continue;
    }

    if (!currentRule) {
      continue;
    }

    if (trimmed && subRulePattern.test(trimmed)) {
      currentRule.subSections.push({
        title: trimmed,
        content: [],
      });
      continue;
    }

    const activeSubSection = currentRule.subSections[currentRule.subSections.length - 1];
    if (activeSubSection) {
      activeSubSection.content.push(line);
    } else {
      currentRule.body.push(line);
    }
  }

  if (currentRule) {
    currentRule.body = currentRule.body.join("\n").trimEnd();
    currentRule.subSections = currentRule.subSections.map((section) => ({
      title: section.title,
      content: section.content.join("\n").trimEnd(),
    }));
    rules.push(currentRule);
  }

  return rules.map((rule) => ({
    ...rule,
    body: rule.body || "",
  }));
}

function main() {
  if (!fs.existsSync(README_PATH)) {
    console.error(`README not found at ${README_PATH}`);
    process.exit(1);
  }

  const readmeContent = fs.readFileSync(README_PATH, "utf8");
  const rules = parseRulesFromReadme(readmeContent);

  if (rules.length === 0) {
    console.error("未能从 README 中解析到任何规则，请确认文档格式是否包含以『规则#』开头的段落。");
    process.exit(1);
  }

  ensureDir(RULES_DIR);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, README_PATH),
    totalRules: rules.length,
    rules,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`已生成规则快照：${path.relative(ROOT, OUTPUT_PATH)}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseRulesFromReadme,
};
