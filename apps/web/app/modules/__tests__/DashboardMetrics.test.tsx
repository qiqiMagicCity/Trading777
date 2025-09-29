/** @jest-environment jsdom */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { DashboardMetrics } from "../DashboardMetrics";
import { useStore } from "@/lib/store";

const baseMetrics = {
  M11: 111.11,
  M12: 222.22,
  M13: 333.33,
};

describe("DashboardMetrics period cards", () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({ metrics: baseMetrics as any, periodHealth: null });
    });
  });

  afterEach(() => {
    act(() => {
      useStore.setState({ metrics: null, periodHealth: null });
    });
  });

  it("renders WTD/MTD/YTD values from M11/M12/M13", () => {
    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("metric-wtd").textContent || "").toMatch(/111\.11/);
    expect(screen.getByTestId("metric-mtd").textContent || "").toMatch(/222\.22/);
    expect(screen.getByTestId("metric-ytd").textContent || "").toMatch(/333\.33/);
  });

  it("shows 数据缺失 when period health reports missing data", () => {
    act(() => {
      useStore.setState({
        metrics: baseMetrics as any,
        periodHealth: {
          status: "missing",
          summaries: [
            {
              date: "2025-09-26",
              symbols: [
                {
                  symbol: "AMD",
                  fallbacks: ["MARK_PRICE"],
                },
              ],
            },
          ],
        },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("metric-wtd")).toHaveTextContent("数据缺失");
    expect(screen.getByTestId("metric-mtd")).toHaveTextContent("数据缺失");
    expect(screen.getByTestId("metric-ytd")).toHaveTextContent("数据缺失");
  });

  it("shows 待补充 when missing data is ignored", () => {
    act(() => {
      useStore.setState({
        metrics: baseMetrics as any,
        periodHealth: {
          status: "ignored",
          summaries: [
            {
              date: "2025-09-26",
              symbols: [
                {
                  symbol: "AMD",
                  fallbacks: ["MARK_PRICE"],
                },
              ],
            },
          ],
        },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("metric-wtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-mtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-ytd")).toHaveTextContent("待补充");
  });

  it("shows 待补充 when period data is degraded", () => {
    act(() => {
      useStore.setState({
        metrics: baseMetrics as any,
        periodHealth: {
          status: "degraded",
          summaries: [],
          degraded: { wtd: true, mtd: false, ytd: true },
        },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("metric-wtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-mtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-ytd")).toHaveTextContent("待补充");
  });
});
