import { buildOfficialDiagnosticsForWindow } from "@/app/lib/metrics";
import type { MissingOfficialDateSummary } from "@/app/lib/missingOfficialClose";

describe("official close degradation filters unrelated symbols", () => {
  const missingSummaries: MissingOfficialDateSummary[] = [
    {
      ymd: "2024-06-10",
      date: "2024-06-10",
      symbols: [
        {
          symbol: "AAPL",
          purposes: ["runAll"],
          impact: ["WTD/MTD/YTD端点浮盈可能失真"],
          hasFallback: false,
        },
        {
          symbol: "MSFT",
          purposes: ["runAll"],
          impact: ["WTD/MTD/YTD端点浮盈可能失真"],
          hasFallback: false,
        },
      ],
    },
  ];

  it("keeps only related symbols in missing diagnostics", () => {
    const diag = buildOfficialDiagnosticsForWindow(
      missingSummaries,
      [],
      "2024-06-03",
      "2024-06-14",
      new Set(["AAPL"]),
    );
    expect(diag.missing).toHaveLength(1);
    expect(diag.missing[0]?.symbols).toHaveLength(1);
    expect(diag.missing[0]?.symbols[0]?.symbol).toBe("AAPL");
  });

  it("drops the window when no related symbols are present", () => {
    const diag = buildOfficialDiagnosticsForWindow(
      missingSummaries,
      [],
      "2024-06-03",
      "2024-06-14",
      new Set(["TSLA"]),
    );
    expect(diag.missing).toHaveLength(0);
  });
});
