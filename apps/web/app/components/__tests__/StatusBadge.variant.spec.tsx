/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import StatusBadge from "@/components/StatusBadge";

describe("StatusBadge variant matrix", () => {
  const baseMeta = {
    evaluationDay: "2024-01-02",
    latestPriceOk: true,
    officialCloseOk: true,
    degradedReason: null,
    isComplete: true,
    missingPairs: [],
  };

  it("renders live ripple variant with accessible state", () => {
    const { container } = render(
      <StatusBadge
        meta={{ ...baseMeta, mode: "live" }}
        variant="ripple"
      />,
    );

    const badge = screen.getByText("盘中（实时）").closest("span");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-state", "live");
    expect(badge).toHaveAttribute("data-variant", "ripple");
    expect(container.querySelector('[aria-invalid="true"]')).toBeNull();
  });

  it("renders close static variant without ripple animation", () => {
    const { container } = render(
      <StatusBadge
        meta={{ ...baseMeta, mode: "close" }}
        variant="static"
      />,
    );

    const badge = screen.getByText("收盘口径").closest("span");
    expect(badge).toHaveAttribute("data-state", "close");
    expect(badge).toHaveAttribute("data-variant", "static");
    expect(container.querySelector('[class*="animate-ping"]')).toBeNull();
  });

  it("renders pill degraded variant with missing pairs tooltip", () => {
    const meta = {
      ...baseMeta,
      mode: "degraded" as const,
      missingPairs: [
        { day: "2024-01-02", symbol: "AAPL" },
        { day: "2024-01-02", symbol: "MSFT" },
      ],
    };
    const { container } = render(
      <StatusBadge meta={meta} variant="pill" />,
    );

    const badge = container.querySelector("span[data-variant='pill']");
    expect(badge).toHaveAttribute("data-state", "degraded");
    expect(badge).toHaveAttribute("data-variant", "pill");
    expect(badge).toHaveAttribute("title");
    expect(badge?.getAttribute("title")).toContain("缺失标的");
    expect(badge?.getAttribute("title")).toContain("AAPL");
  });

  it("falls back to unknown state when meta is missing", () => {
    const { container } = render(<StatusBadge variant="ripple" />);

    const badge = container.querySelector("span[data-variant='ripple']");
    expect(badge).toHaveTextContent("未知");
    expect(badge).toHaveAttribute("data-state", "unknown");
    expect(badge).toHaveAttribute("data-variant", "ripple");
  });
});
