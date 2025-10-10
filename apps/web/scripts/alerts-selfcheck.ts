import fs from "node:fs";
import path from "node:path";

type Sample = {
  stage: 'SSR' | 'HYDRATE' | 'AFTER_EVENTS';
  kind: string;
  missing?: Array<{ date: string; symbol: string }>;
  snapshotAt?: number;
  reason?: string;
  sources?: string[];
};

function diff(a: Sample[], b: Sample[]) {
  // 简化：以 OfficialCloseBanner 为主，比较 missing 集合大小与内容
  const pick = (xs: Sample[]) =>
    xs.filter((x) => x.kind === "OfficialCloseBanner").at(-1)?.missing ?? [];
  const A = pick(a),
    B = pick(b);
  const key = (x: any) => x.date + ":" + x.symbol;
  const setA = new Set(A.map(key));
  const setB = new Set(B.map(key));
  const onlyA = A.filter((x) => !setB.has(key(x)));
  const onlyB = B.filter((x) => !setA.has(key(x)));
  return { onlyA, onlyB, sizeA: A.length, sizeB: B.length };
}

async function main() {
  // 约定 CI 将三阶段样本以 JSON 注入（如未来接入 Playwright 可自动采集）
  const ssr: Sample[] = [];
  const hydrate: Sample[] = [];
  const after: Sample[] = [];

  const report = {
    meta: { generatedAt: new Date().toISOString() },
    buckets: { ssr, hydrate, after },
    diffs: {
      ssr_vs_hydrate: diff(ssr, hydrate),
      hydrate_vs_after: diff(hydrate, after),
    },
  };

  const outDir = path.join(process.cwd(), "apps/web/public/selfcheck");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "alerts.report.json"),
    JSON.stringify(report, null, 2),
  );

  const md = [
    "# Alerts Self-Check Report",
    "",
    "## Summary",
    "- SSR → HYDRATE diff: size " +
      report.diffs.ssr_vs_hydrate.sizeA +
      " → " +
      report.diffs.ssr_vs_hydrate.sizeB,
    "- HYDRATE → AFTER_EVENTS diff: size " +
      report.diffs.hydrate_vs_after.sizeA +
      " → " +
      report.diffs.hydrate_vs_after.sizeB,
    "",
    "## SSR ↔ HYDRATE only-in-SSR",
    "```json",
    JSON.stringify(report.diffs.ssr_vs_hydrate.onlyA, null, 2),
    "```",
    "## HYDRATE ↔ AFTER only-in-HYDRATE",
    "```json",
    JSON.stringify(report.diffs.hydrate_vs_after.onlyA, null, 2),
    "```",
    "",
    "> 若 SSR 集合大于 CSR，出现“蓝条/黄条闪一下即消失”，即为**水合口径不一致**问题。",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "alerts.report.md"), md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
