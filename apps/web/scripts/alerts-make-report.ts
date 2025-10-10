import fs from "node:fs";
import path from "node:path";

async function main() {
  // 运行时本页会把采样写到 window.__t7Alerts；这里不直接拿运行态，
  // 先输出一个静态报告框架，前端页面可下载 JSON 后替换（简化CI）。
  const report = {
    meta: { generatedAt: new Date().toISOString() },
    tips: [
      "若 packaged-only 有缺、unified 无缺：说明打包文件缺价，但 IDB/overlay 已补，SSR/早期口径可能误报。",
      "若 unified 也有缺：确为真实缺价（请补 E-1 官方价）。",
      "若出现“蓝条闪一下”：通常为 SSR 快照与 CSR 判定不一致造成。"
    ]
  };
  const outDir = path.join(process.cwd(), "apps/web/public/selfcheck");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "alerts.report.json"),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "alerts.report.md"),
    [
      "# Alerts Self-Check Report",
      "",
      "- 本报告由 /debug/alerts 页面配合生成。",
      "",
      "见同目录 alerts.report.json",
    ].join("\n"),
  );
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
