/** @jest-environment jsdom */
import React from "react";
import { act, render, screen, within } from "@testing-library/react";
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

  it("renders issues reported by period health", () => {
    act(() => {
      useStore.setState({
        metrics: baseMetrics as any,
        periodHealth: {
          status: "missing",
          summaries: [],
          issues: [
            { kind: "INVALID_RECORD", message: "持仓 TSLA 的数量无效" },
            { kind: "MISSING_PREV_CLOSE", message: "以下标的缺少昨日收盘价：TSLA" },
          ],
        },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("period-health-summary")).toHaveTextContent(
      "持仓 TSLA 的数量无效",
    );
    expect(screen.getByTestId("period-health-summary")).toHaveTextContent(
      "以下标的缺少昨日收盘价：TSLA",
    );
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

  it("renders 待补充 when backend only returns legacy WTD alias for degraded window", () => {
    act(() => {
      useStore.setState({
        metrics: {
          periods: { WTD: 26030.56 },
          M12: 222.22,
          M13: 333.33,
          _period: { degraded: { wtd: true, mtd: false, ytd: false } },
        } as any,
        periodHealth: {
          status: "degraded",
          summaries: [],
          degraded: { wtd: true, mtd: false, ytd: false },
        },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("metric-wtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-wtd")).not.toHaveTextContent("26030.56");
    expect(screen.getByTestId("metric-mtd").textContent || "").toMatch(/222\.22/);
    expect(screen.getByTestId("metric-ytd").textContent || "").toMatch(/333\.33/);
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

  it("falls back to 待补充 when period value is undefined without degrading state", () => {
    act(() => {
      useStore.setState({
        metrics: { M11: undefined, M12: undefined, M13: undefined } as any,
        periodHealth: { status: "ok", summaries: [] },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    expect(screen.getByTestId("metric-wtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-wtd")).not.toHaveTextContent("$0.00");
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
    const degradeFlags = { wtd: false, mtd: true, ytd: true } as const;
    act(() => {
      useStore.setState({
        metrics: {
          M11: period.wtd as any,
          M12: period.mtd as any,
          M13: period.ytd as any,
          _period: {
            degraded: degradeFlags,
            status: period.status,
            diagnostics: period.diagnostics,
          },
        } as any,
        periodHealth: {
          status: "degraded",
          summaries: [],
          degraded: degradeFlags,
        },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    const wtdCard = screen.getByTestId("metric-wtd");
    expect(wtdCard).not.toHaveTextContent("待补充");
    expect(wtdCard.textContent || "").toMatch(/31\.?00/);
    expect(screen.getByTestId("metric-mtd")).toHaveTextContent("待补充");
    expect(screen.getByTestId("metric-ytd")).toHaveTextContent("待补充");
  });

  it.each([
    [
      "M11",
      "DEGEN_NO_BASELINE",
      "缺基线",
      { baselineYmd: "2025-09-20", distanceBusinessDays: 4 },
    ],
    [
      "M12",
      "DEGEN_STALE_BASELINE",
      "基线过旧",
      {
        baselineYmd: "2025-08-31",
        distanceBusinessDays: 15,
        thresholdBusinessDays: 5,
      },
    ],
    [
      "M13",
      "DEGEN_WINDOW_EMPTY",
      "窗口空",
      { distanceBusinessDays: 0 },
    ],
  ] as const)(
    "renders degrade tooltip for %s", (metricKey, reason, label, baselineMeta) => {
      const degradedState = {
        wtd: metricKey === "M11",
        mtd: metricKey === "M12",
        ytd: metricKey === "M13",
      } as const;

      act(() => {
        useStore.setState({
          metrics: {
            ...baseMetrics,
            _period: {
              degraded: degradedState,
              status: {
                wtd: degradedState.wtd ? "degraded" : "ok",
                mtd: degradedState.mtd ? "degraded" : "ok",
                ytd: degradedState.ytd ? "degraded" : "ok",
              },
              diagnostics: {
                wtd: {
                  status: degradedState.wtd ? "degraded" : "ok",
                  degraded: degradedState.wtd,
                  ...(degradedState.wtd
                    ? { reason, baselineMeta }
                    : {}),
                },
                mtd: {
                  status: degradedState.mtd ? "degraded" : "ok",
                  degraded: degradedState.mtd,
                  ...(degradedState.mtd
                    ? { reason, baselineMeta }
                    : {}),
                },
                ytd: {
                  status: degradedState.ytd ? "degraded" : "ok",
                  degraded: degradedState.ytd,
                  ...(degradedState.ytd
                    ? { reason, baselineMeta }
                    : {}),
                },
              },
            },
          } as any,
          periodHealth: {
            status: "degraded",
            summaries: [],
            degraded: degradedState,
          },
        });
      });

      render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

      const hintId = `period-degrade-hint-${metricKey.toLowerCase()}`;
      const tooltipId = `period-degrade-tooltip-${metricKey.toLowerCase()}`;
      const hint = screen.getByTestId(hintId);
      expect(hint).toHaveTextContent(label);

      const tooltipButton = screen.getByTestId(tooltipId);
      const tooltip = tooltipButton.getAttribute("title");
      expect(tooltip).toBeTruthy();
      expect(tooltip).toContain(label);
      if (baselineMeta.baselineYmd) {
        expect(tooltip).toContain(`基线日期：${baselineMeta.baselineYmd}`);
      }
      if (typeof baselineMeta.distanceBusinessDays === "number") {
        const distanceText = `距评估日 ${baselineMeta.distanceBusinessDays} 个交易日`;
        if (reason === "DEGEN_STALE_BASELINE") {
          expect(tooltip).toContain(`${distanceText}（阈值 5）`);
        } else {
          expect(tooltip).toContain(distanceText);
        }
      }
      const expectedBase =
        metricKey === "M11" ? "WTD" : metricKey === "M12" ? "MTD" : "YTD";
      expect(tooltipButton).toHaveAttribute(
        "aria-label",
        `${expectedBase}退化原因：${label}`,
      );

      const others = ["m11", "m12", "m13"].filter(
        (key) => key !== metricKey.toLowerCase(),
      );
  for (const other of others) {
    expect(screen.queryByTestId(`period-degrade-hint-${other}`)).toBeNull();
  }
},
  );

  it("renders parse failure diagnostics with tooltip summary", () => {
    act(() => {
      useStore.setState({
        metrics: {
          ...baseMetrics,
          _period: {
            degraded: { wtd: true, mtd: false, ytd: false },
            status: { wtd: "degraded", mtd: "ok", ytd: "ok" },
            diagnostics: {
              wtd: {
                status: "degraded",
                degraded: true,
                reason: "DEGEN_PARSE_FAILED",
                parseErrors: [
                  {
                    field: "realized",
                    value: "1,200",
                    code: "PARSE_NUM_FAILED",
                    reason: "INVALID_FORMAT",
                    day: "2025-09-24",
                  },
                  {
                    field: "unrealized",
                    value: " ",
                    code: "PARSE_NUM_FAILED",
                    reason: "EMPTY",
                    day: "2025-09-24",
                  },
                ],
              },
              mtd: { status: "ok", degraded: false },
              ytd: { status: "ok", degraded: false },
            },
          },
        } as any,
        periodHealth: {
          status: "degraded",
          summaries: [],
          degraded: { wtd: true, mtd: false, ytd: false },
        },
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    const hint = screen.getByTestId("period-degrade-hint-m11");
    expect(hint).toHaveTextContent("解析失败");
    const tooltip = screen
      .getByTestId("period-degrade-tooltip-m11")
      .getAttribute("title");
    expect(tooltip).toBeTruthy();
    expect(tooltip).toContain("解析失败");
    expect(tooltip).toContain("realized");
    expect(tooltip).toContain("unrealized");
    expect(tooltip).toContain("1,200");
  });
});

describe("DashboardMetrics intraday breakdown", () => {
  afterEach(() => {
    act(() => {
      useStore.setState({ metrics: null, periodHealth: null });
    });
  });

  it("renders tooltip with NY-day breakdown and sums MTM components", () => {
    act(() => {
      useStore.setState({
        metrics: {
          M6: { total: 90.12 },
          _m6: {
            realizedToday: 0,
            mtmOvernight: 45.12,
            mtmIntradayOpen: 45,
            warnings: [],
          },
        } as any,
        periodHealth: null,
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    const card = screen.getByTestId("metric-m6");
    expect(within(card).getByText(/90\.12/)).toBeInTheDocument();

    const trigger = within(card).getByRole("button", {
      name: "当日盈亏拆解（纽约日口径）",
    });
    const tooltip = trigger.getAttribute("title") || "";
    expect(tooltip).toContain("纽约日口径（America/New_York），20:00–23:59 ET 仍计入当日。");
    expect(tooltip).toContain("已实现盈亏（realized_today）：$0.00");
    expect(tooltip).toContain("隔夜 MTM（mtm_overnight）：$45.12");
    expect(tooltip).toContain("日内 MTM（mtm_intraday_open）：$45.00");
    expect(tooltip).toContain("合计：$90.12");
  });

  it("shows realized-only short-cover scenario with negative totals", () => {
    act(() => {
      useStore.setState({
        metrics: {
          M6: { total: -270.12 },
          _m6: {
            realizedToday: -270.12,
            mtmOvernight: 0,
            mtmIntradayOpen: 0,
            warnings: [],
          },
        } as any,
        periodHealth: null,
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    const card = screen.getByTestId("metric-m6");
    expect(within(card).getByText(/-\$270\.12/)).toBeInTheDocument();

    const trigger = within(card).getByRole("button", {
      name: "当日盈亏拆解（纽约日口径）",
    });
    const tooltip = trigger.getAttribute("title") || "";
    expect(tooltip).toContain("已实现盈亏（realized_today）：-$270.12");
    expect(tooltip).toContain("隔夜 MTM（mtm_overnight）：$0.00");
    expect(tooltip).toContain("日内 MTM（mtm_intraday_open）：$0.00");
  });

  it("keeps zero totals when intraday legs exist but sum to zero", () => {
    act(() => {
      useStore.setState({
        metrics: {
          M6: { total: 0 },
          _m6: {
            realizedToday: 0,
            mtmOvernight: 0,
            mtmIntradayOpen: 0,
            warnings: [],
          },
        } as any,
        periodHealth: null,
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    const card = screen.getByTestId("metric-m6");
    expect(within(card).getByText("$0.00")).toBeInTheDocument();

    const trigger = within(card).getByRole("button", {
      name: "当日盈亏拆解（纽约日口径）",
    });
    expect(trigger).toHaveAttribute("title", expect.stringContaining("合计：$0.00"));
  });

  it("falls back to 待补充 when no intraday snapshot is present", () => {
    act(() => {
      useStore.setState({ metrics: {} as any, periodHealth: null });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    const card = screen.getByTestId("metric-m6");
    expect(card).toHaveTextContent("待补充");
    const trigger = within(card).getByRole("button", {
      name: "当日盈亏拆解（纽约日口径）",
    });
    expect(trigger).toHaveAttribute("title", expect.stringContaining("无当日快照"));
  });

  it("surfaces parse failures and warnings inside tooltip", () => {
    act(() => {
      useStore.setState({
        metrics: {
          tradingDateStr: "2025-05-01",
          M6: { total: 0 },
          _m6: {
            realizedToday: "1,200",
            mtmOvernight: 0,
            mtmIntradayOpen: 0,
            warnings: ["SafePrice: TSLA 缺少当日均价，已按 0 计入。"],
          },
          _period: {
            diagnostics: {
              intraday: {
                reason: "DEGEN_PARSE_FAILED",
                parseErrors: [
                  {
                    code: "PARSE_NUM_FAILED",
                    reason: "INVALID_FORMAT",
                    value: "1,200",
                    trimmed: "1,200",
                    field: "realized_today",
                    day: "2025-05-01",
                  },
                ],
              },
            },
          },
        } as any,
        periodHealth: null,
      });
    });

    render(<DashboardMetrics enrichedTrades={[]} positions={[]} />);

    const card = screen.getByTestId("metric-m6");
    expect(within(card).getByText("$0.00")).toBeInTheDocument();

    const trigger = within(card).getByRole("button", {
      name: "当日盈亏拆解（纽约日口径）",
    });
    const tooltip = trigger.getAttribute("title") || "";
    expect(tooltip).toContain("退化原因：解析失败（DEGEN_PARSE_FAILED）");
    expect(tooltip).toContain("⚠️ SafePrice: TSLA 缺少当日均价，已按 0 计入。");
    expect(tooltip).toContain(
      "解析失败：realized_today：1 条（示例 2025-05-01→1,200）",
    );
    expect(trigger.className).toContain("bg-amber-100");
  });
});
