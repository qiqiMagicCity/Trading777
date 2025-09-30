/** @jest-environment jsdom */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { DashboardMetrics } from "../DashboardMetrics";
import { useStore } from "@/lib/store";
import { calcWtdMtdYtdFromSnapshots } from "@/app/lib/metrics";
import type { DailyResult } from "@/app/lib/types";

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

  it("shows 缺少计算参数 when period values are omitted", () => {
    act(() => {
      useStore.setState({
        metrics: { M12: 222.22 } as any,
        periodHealth: { status: "ok", summaries: [] },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("metric-wtd")).toHaveTextContent("缺少计算参数");
    expect(screen.getByTestId("metric-wtd")).not.toHaveTextContent("0");
    expect(screen.getByTestId("metric-mtd")).toHaveTextContent("222.22");
    expect(screen.getByTestId("metric-ytd")).toHaveTextContent("缺少计算参数");
    expect(screen.getByTestId("period-self-check")).toHaveTextContent(
      "缺少计算参数：请检查 normalizeMetrics 是否返回了 WTD/MTD/YTD。",
    );
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

  it("shows 待补充 only for degraded periods and lists missing parameters", () => {
    act(() => {
      useStore.setState({
        metrics: baseMetrics as any,
        periodHealth: {
          status: "degraded",
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
          degraded: { wtd: true, mtd: false, ytd: true },
        },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("metric-wtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-mtd")).toHaveTextContent("222.22");
    expect(screen.getByTestId("metric-ytd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("period-health-summary")).toHaveTextContent(
      "2025-09-26：AMD（使用最新价兜底）",
    );
  });

  it("shows self-check warning when WTD/MTD/YTD are the same", () => {
    act(() => {
      useStore.setState({
        metrics: { M11: 10, M12: 10, M13: 10 } as any,
        periodHealth: { status: "ok", summaries: [] },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("period-self-check")).toHaveTextContent(
      "检测到 WTD/MTD/YTD 数值完全一致",
    );
  });

  it("renders 待补充 when normalizeMetrics filters out NaN period values", () => {
    act(() => {
      useStore.setState({
        metrics: { M11: Number.NaN, M12: "NaN", M13: undefined } as any,
        periodHealth: {
          status: "degraded",
          summaries: [],
          degraded: { wtd: true, mtd: true, ytd: true },
        },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("metric-wtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-mtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-ytd")).toHaveTextContent("待补充");
  });

  it("renders 待补充 when baseline snapshot expires before window start", () => {
    const daily: DailyResult[] = [
      { date: "2024-09-20", realized: 0, unrealized: 100, unrealizedDelta: 0 },
      { date: "2024-09-24", realized: 5, unrealized: 130, unrealizedDelta: 30 },
      { date: "2024-09-25", realized: -2, unrealized: 128, unrealizedDelta: -2 },
    ];

    const period = calcWtdMtdYtdFromSnapshots(daily, "2024-09-25");

    act(() => {
      useStore.setState({
        metrics: { M11: period.wtd as any, M12: period.mtd as any, M13: period.ytd as any },
        periodHealth: {
          status: "degraded",
          summaries: [],
          degraded: period.degraded,
        },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("metric-wtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-mtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-ytd")).toHaveTextContent("待补充");
  });
});
