/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import StatusBadge from "@/components/StatusBadge";
import type { GlobalMeta } from "@/app/lib/mode/globalMeta";

describe("StatusBadge V2 (meta-only)", () => {
  const baseMeta: GlobalMeta = {
    mode: "live",
    evaluationDay: "2025-01-02",
    latestPriceOk: true,
    officialCloseOk: true,
    degradedReason: null,
    isComplete: true,
    missingPairs: [],
  };

  it("renders live state with breathing animation", () => {
    const { container } = render(<StatusBadge meta={baseMeta} />);
    expect(screen.getByText("盘中（实时）")).toBeInTheDocument();
    expect(container.querySelector(".motion-safe\\:animate-ping")).not.toBeNull();
  });

  it("renders close state without animation", () => {
    const { container } = render(
      <StatusBadge
        meta={{ ...baseMeta, mode: "close", latestPriceOk: false, officialCloseOk: true }}
      />,
    );
    expect(screen.getByText("收盘口径")).toBeInTheDocument();
    expect(container.querySelector(".motion-safe\\:animate-ping")).toBeNull();
  });

  it("renders degraded state with missing pairs tooltip", () => {
    const degradedMeta: GlobalMeta = {
      ...baseMeta,
      mode: "degraded",
      degradedReason: "live-latest-missing",
      latestPriceOk: false,
      isComplete: false,
      missingPairs: [
        { day: "2025-01-02", symbol: "AAPL" },
        { day: "2025-01-02", symbol: "MSFT" },
      ],
    };
    render(<StatusBadge meta={degradedMeta} />);
    const badge = screen.getByText("待更新/仅昨收基线");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", expect.stringContaining("AAPL"));
    expect(badge).toHaveAttribute("title", expect.stringContaining("MSFT"));
  });

  it("renders UNKNOWN when meta is absent", () => {
    // @ts-expect-error testing fallback without meta
    const { getByText } = render(<StatusBadge />);
    expect(getByText("未知")).toBeInTheDocument();
  });
});
