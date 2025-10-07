/** @jest-environment jsdom */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  PendingOfficialCloseBanner,
  MissingOfficialCloseBanner,
} from "@/app/modules/OfficialCloseBanners";
import { summarizeMissingOfficialCloses } from "@/app/lib/missingOfficialClose";
import type { MissingOfficialCloseEntry } from "@/app/lib/types/metrics";

describe("official close banner lifecycle", () => {
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
        <MissingOfficialCloseBanner summaries={[]} />
      </>,
    );

    expect(screen.getByText("等待官方收盘价落地")).toBeInTheDocument();
    expect(screen.queryByText("官方收盘价缺失提醒")).not.toBeInTheDocument();

    const pendingItems = screen.getAllByRole("listitem");
    expect(pendingItems[0]).toHaveTextContent("2024-09-24");
    expect(pendingItems[0]).toHaveTextContent("AMD（已暂用兜底）");

    view.rerender(
      <>
        <PendingOfficialCloseBanner summaries={[]} />
        <MissingOfficialCloseBanner summaries={missingSummaries} />
      </>,
    );

    expect(screen.queryByText("等待官方收盘价落地")).not.toBeInTheDocument();
    const warning = screen.getByText("官方收盘价缺失提醒");
    expect(warning).toBeInTheDocument();

    const warningContainer = warning.parentElement?.parentElement as HTMLElement;
    const warningList = within(warningContainer).getAllByRole("listitem");
    expect(warningList[0]).toHaveTextContent("2024-09-22");
    expect(warningList[0]).toHaveTextContent("影响：M4今日退化（过夜=0）、M6过夜桶=0");

    view.rerender(
      <>
        <PendingOfficialCloseBanner summaries={[]} />
        <MissingOfficialCloseBanner summaries={[]} />
      </>,
    );

    expect(screen.queryByText("官方收盘价缺失提醒")).not.toBeInTheDocument();
  });
});
