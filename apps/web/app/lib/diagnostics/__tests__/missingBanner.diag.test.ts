import "fake-indexeddb/auto";
import { explainBatch } from "@/app/lib/diagnostics/explainMissingClose";

describe("diag: explain missing close", () => {
  it("print explanations", async () => {
    const symbols = [
      "AMD",
      "BA",
      "DIS",
      "GOOGL",
      "NVDL",
      "PYPL",
      "TSDD",
      "UAL",
      "AMZN",
      "APP",
      "INTC",
      "SCHW",
      "COST",
    ];
    const dates = ["2025-09-19", "2025-10-03", "2025-10-06"];
    const rows = await explainBatch(symbols, dates);
    const miss = rows.filter((r) => r.verdict === "MISSING");
    // eslint-disable-next-line no-console
    console.log("=== missing:", miss.length, "/", rows.length, "===");
    miss.forEach((r) => {
      // eslint-disable-next-line no-console
      console.log(`[${r.symbol}] ${r.date} -> needOfficial=${r.needOfficial}`);
      r.layers.forEach((l: any) =>
        console.log(
          " -",
          l.step,
          l.ok ? "OK" : "FAIL",
          l.detail ? `— ${l.detail}` : "",
        ),
      );
    });
  });
});
