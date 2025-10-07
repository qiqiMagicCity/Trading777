import { summarizeMissingOfficialCloses } from "@/app/lib/missingOfficialClose";
import type { MissingOfficialCloseEntry } from "@/app/lib/types/metrics";

describe("summarizeMissingOfficialCloses", () => {
  const baseEntry = (overrides: Partial<MissingOfficialCloseEntry> = {}): MissingOfficialCloseEntry => ({
    symbol: "AAPL",
    date: "2025-11-10",
    purposes: ["M6"],
    impact: ["M6过夜桶=0"],
    hasFallback: false,
    ...overrides,
  });

  it("returns empty array when no entries provided", () => {
    expect(summarizeMissingOfficialCloses()).toEqual([]);
    expect(summarizeMissingOfficialCloses([])).toEqual([]);
  });

  it("groups entries by date and symbol while sorting purposes and impact", () => {
    const entries: MissingOfficialCloseEntry[] = [
      baseEntry({ purposes: ["M6", "generateDailyResults"], impact: ["M6过夜桶=0", "当日未实现盈亏估值基于兜底"] }),
      baseEntry({ purposes: ["M6"], impact: ["M6过夜桶=0"], hasFallback: true }),
      baseEntry({ symbol: "AMD" }),
      baseEntry({ symbol: "AAPL", date: "2025-11-09", purposes: ["runAll"], impact: ["WTD/MTD/YTD端点浮盈可能失真"] }),
    ];

    expect(summarizeMissingOfficialCloses(entries)).toEqual([
      {
        date: "2025-11-10",
        symbols: [
          {
            symbol: "AAPL",
            purposes: ["generateDailyResults", "M6"],
            impact: ["M6过夜桶=0", "当日未实现盈亏估值基于兜底"],
            hasFallback: true,
          },
          {
            symbol: "AMD",
            purposes: ["M6"],
            impact: ["M6过夜桶=0"],
            hasFallback: false,
          },
        ],
      },
      {
        date: "2025-11-09",
        symbols: [
          {
            symbol: "AAPL",
            purposes: ["runAll"],
            impact: ["WTD/MTD/YTD端点浮盈可能失真"],
            hasFallback: false,
          },
        ],
      },
    ]);
  });

  it("filters empty symbols or dates before grouping", () => {
    const entries: MissingOfficialCloseEntry[] = [
      baseEntry({ symbol: "" }),
      baseEntry({ date: "" }),
      baseEntry({ symbol: "MSFT", purposes: ["M6", ""] }),
    ];

    expect(summarizeMissingOfficialCloses(entries)).toEqual([
      {
        date: "2025-11-10",
        symbols: [
          {
            symbol: "MSFT",
            purposes: ["M6"],
            impact: ["M6过夜桶=0"],
            hasFallback: false,
          },
        ],
      },
    ]);
  });
});
