/** @jest-environment jsdom */

import React from "react";
import { render, screen, within, act } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  PendingOfficialCloseBanner,
  MissingOfficialCloseBanner,
} from "@/app/modules/OfficialCloseBanners";
import { summarizeMissingOfficialCloses } from "@/app/lib/missingOfficialClose";
import type { MissingOfficialCloseEntry } from "@/app/lib/types/metrics";

describe("official close banner lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  const buildSummaries = (entries: MissingOfficialCloseEntry[]) =>
    summarizeMissingOfficialCloses(entries);

  it("shows blue pending banner, then yellow warning, then disappears", () => {
    const pendingEntries: MissingOfficialCloseEntry[] = [
      {
        symbol: "AMD",
        date: "2024-09-24",
        purposes: ["M6"],
        impact: ["M6过夜桶=0"],
        hasFallback: true,
      },
      {
        symbol: "AAPL",
        date: "2024-09-23",
        purposes: ["M6"],
        impact: ["M6过夜桶=0"],
        hasFallback: false,
      },
    ];

    const missingEntries: MissingOfficialCloseEntry[] = [
      {
        symbol: "TSLA",
        date: "2024-09-22",
        purposes: ["M6"],
        impact: ["M4今日退化（过夜=0）", "M6过夜桶=0"],
        hasFallback: true,
      },
    ];

    const pendingSummaries = buildSummaries(pendingEntries);
    const missingSummaries = buildSummaries(missingEntries);

    const view = render(
      <>
        <PendingOfficialCloseBanner summaries={pendingSummaries} />
        <MissingOfficialCloseBanner key="missing-0" summaries={[]} />
      </>,
    );

    const toast = screen.getByTestId("pending-official-close-toast");
    expect(toast).toBeInTheDocument();
    expect(screen.getByText("等待官方收盘价落地")).toBeInTheDocument();
    expect(screen.queryByText("官方收盘价缺失提醒")).not.toBeInTheDocument();

    const pendingItems = within(toast).getAllByRole("listitem");
    expect(pendingItems[0]).toHaveTextContent("2024-09-24");
    expect(pendingItems[0]).toHaveTextContent("AMD（已暂用兜底）");

    view.rerender(
      <>
        <PendingOfficialCloseBanner summaries={[]} />
        <MissingOfficialCloseBanner
          key={`missing-${missingSummaries.length}`}
          summaries={missingSummaries}
        />
      </>,
    );

    expect(screen.getByTestId("pending-official-close-toast")).toBeInTheDocument();
    const warning = screen.getByText("官方收盘价缺失提醒");
    expect(warning).toBeInTheDocument();

    const warningItem = screen
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes("2024-09-22"));
    expect(warningItem).toBeTruthy();
    expect(warningItem).toHaveTextContent("2024-09-22");
    expect(warningItem).toHaveTextContent("TSLA");

    view.rerender(
      <>
        <PendingOfficialCloseBanner summaries={[]} />
        <MissingOfficialCloseBanner key="missing-0" summaries={[]} />
      </>,
    );

    act(() => {
      jest.advanceTimersByTime(350);
    });

    expect(screen.queryByTestId("pending-official-close-toast")).not.toBeInTheDocument();
    expect(screen.queryByText("官方收盘价缺失提醒")).not.toBeInTheDocument();
  });
});
