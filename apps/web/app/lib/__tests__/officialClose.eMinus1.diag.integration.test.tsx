/** @jest-environment jsdom */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { explainClose } from "@/app/lib/diagnostics/explainMissingClose";
import { MissingOfficialCloseBanner } from "@/app/modules/OfficialCloseBanners";
import type { MissingOfficialDateSummary } from "@/app/lib/missingOfficialClose";
import type { MissingOfficialCloseEntry } from "@/app/lib/types/metrics";

jest.mock("@/app/lib/bootstrap/pricesImportedListener", () => ({
  attachPricesImportedListener: jest.fn(() => () => {}),
}));

jest.mock("@/app/lib/prices/filterMissingOfficialCloses", () => ({
  filterMissingOfficialCloses: jest.fn(),
}));

jest.mock("@/app/lib/services/dataService", () => ({
  getPrice: jest.fn(),
  clearDailyResultsCache: jest.fn(),
}));

const { getPrice } = require("@/app/lib/services/dataService");
const { filterMissingOfficialCloses } = require("@/app/lib/prices/filterMissingOfficialCloses");

describe("official close diagnostics focusing on E-1", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-03-11T14:30:00Z"));
    (getPrice as jest.Mock).mockReset();
    (filterMissingOfficialCloses as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("flags previous trading day when current official close exists", async () => {
    (getPrice as jest.Mock).mockImplementation(async (_symbol: string, date: string) => {
      if (date === "2025-03-10") {
        return { symbol: "AAPL", date, close: 123.45, source: "official/import" };
      }
      return undefined;
    });

    const result = await explainClose("AAPL", "2025-03-10");

    expect(result.need).toBe("E-1");
    expect(result.prevDate).toBe("2025-03-07");
    expect(result.missingDates).toEqual(["2025-03-07"]);
    const prevLayer = result.layers.find((layer) => layer.step === "prev-official");
    expect(prevLayer).toMatchObject({
      ok: false,
      detail: expect.stringContaining("上一纽约交易日(2025-03-07)"),
    });
    expect(result.verdict).toBe("MISSING");
  });

  it("renders banner summary for E-1 gaps", async () => {
    const summaries: MissingOfficialDateSummary[] = [
      {
        ymd: "2025-03-07",
        symbols: [
          { symbol: "AAPL", purposes: ["M6"], impact: ["M6过夜桶=0"], hasFallback: false },
          { symbol: "MSFT", purposes: ["M6"], impact: ["M6过夜桶=0"], hasFallback: true },
        ],
      },
    ];

    const entries: MissingOfficialCloseEntry[] = [
      {
        symbol: "AAPL",
        date: "2025-03-07",
        purposes: ["M6"],
        impact: ["M6过夜桶=0"],
        hasFallback: false,
      },
      {
        symbol: "MSFT",
        date: "2025-03-07",
        purposes: ["M6"],
        impact: ["M6过夜桶=0"],
        hasFallback: true,
      },
    ];
    (filterMissingOfficialCloses as jest.Mock).mockResolvedValue(entries);

    await act(async () => {
      render(<MissingOfficialCloseBanner summaries={summaries} />);
    });

    expect(
      await screen.findByText("系统按纽约交易日计算，当天(E)需要用到上一交易日(E-1)的官方昨收价。请补 E-1 的官方价，补齐后本提示自动消失。"),
    ).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("2025-03-07：AAPL、MSFT");
  });

  it("keeps E-1 requirement after close window on DST week", async () => {
    jest.setSystemTime(new Date("2025-03-11T21:30:00Z"));
    (getPrice as jest.Mock).mockImplementation(async (_symbol: string, date: string) => {
      if (date === "2025-03-11") {
        return { symbol: "AAPL", date, close: 130.12, source: "official/import" };
      }
      return undefined;
    });

    const result = await explainClose("AAPL", "2025-03-11");

    expect(result.needOfficial).toBe(true);
    expect(result.need).toBe("E-1");
    expect(result.prevDate).toBe("2025-03-10");
    expect(result.missingDates).toEqual(["2025-03-10"]);
  });
});
