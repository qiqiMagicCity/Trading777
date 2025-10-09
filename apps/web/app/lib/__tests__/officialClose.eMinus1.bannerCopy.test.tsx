/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { MissingOfficialCloseBanner } from "@/app/modules/OfficialCloseBanners";
import type { MissingOfficialDateSummary } from "@/app/lib/missingOfficialClose";

jest.mock("@/app/lib/bootstrap/pricesImportedListener", () => ({
  attachPricesImportedListener: jest.fn(() => () => {}),
}));

jest.mock("@/app/lib/prices/officialCloseFacade", () => ({
  waitOfficialClosesReady: jest.fn().mockResolvedValue(undefined),
  getMissingOfficialCloses: jest.fn().mockResolvedValue({}),
  getOfficialCloseVersion: jest.fn(() => 1),
}));

const { getMissingOfficialCloses } = require("@/app/lib/prices/officialCloseFacade");

describe("MissingOfficialCloseBanner copy helpers", () => {
  const summaries: MissingOfficialDateSummary[] = [
    {
      ymd: "2025-09-18",
      symbols: [
        { symbol: "AMD", purposes: ["M6"], impact: [], hasFallback: false },
        { symbol: "BA", purposes: ["M6"], impact: [], hasFallback: false },
        { symbol: "DIS", purposes: ["M6"], impact: [], hasFallback: false },
        { symbol: "GOOGL", purposes: ["M6"], impact: [], hasFallback: false },
        { symbol: "NVDL", purposes: ["M6"], impact: [], hasFallback: false },
        { symbol: "PYPL", purposes: ["M6"], impact: [], hasFallback: false },
        { symbol: "TSDD", purposes: ["M6"], impact: [], hasFallback: false },
        { symbol: "UAL", purposes: ["M6"], impact: [], hasFallback: false },
      ],
    },
    {
      ymd: "2025-10-02",
      symbols: [
        { symbol: "APP", purposes: ["M6"], impact: [], hasFallback: false },
        { symbol: "SCHW", purposes: ["M6"], impact: [], hasFallback: false },
      ],
    },
  ];

  beforeEach(() => {
    (getMissingOfficialCloses as jest.Mock).mockResolvedValue({
      "2025-09-18": summaries[0].symbols,
      "2025-10-02": summaries[1].symbols,
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders only previous trading day rows", async () => {
    render(<MissingOfficialCloseBanner summaries={summaries} />);

    expect(
      screen.getByText("系统按纽约交易日计算，当天(E)需要用到上一交易日(E-1)的官方昨收价。请补 E-1 的官方价，补齐后本提示自动消失。"),
    ).toBeInTheDocument();
    const items = await screen.findAllByRole("listitem");
    expect(items[0]).toHaveTextContent("2025-09-18：AMD、BA、DIS、GOOGL、NVDL、PYPL、TSDD、UAL");
    expect(items[1]).toHaveTextContent("2025-10-02：APP、SCHW");
    expect(screen.queryByText(/2025-09-19/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2025-10-03/)).not.toBeInTheDocument();
  });

  it("copies grouped text to clipboard", async () => {
    render(<MissingOfficialCloseBanner summaries={summaries} />);

    const copyButton = await screen.findByTestId("missing-official-copy");
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "2025-09-18：AMD、BA、DIS、GOOGL、NVDL、PYPL、TSDD、UAL\n2025-10-02：APP、SCHW",
      );
    });
  });
});
