/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import StatusBadge from "@/components/StatusBadge";

// 轻量构造 GlobalMeta-like 对象（类型细节用 any 回避）
const meta = (mode: "live" | "close" | "degraded", extra: any = {}): any => ({
  mode,
  evaluationDay: "2024-01-05",
  latestPriceOk: true,
  officialCloseOk: true,
  isComplete: mode === "close",
  degradedReason: mode === "degraded" ? "missing" : null,
  missingPairs:
    mode === "degraded"
      ? [
          { day: "2024-01-03", symbol: "AAPL" },
          { day: "2024-01-04", symbol: "MSFT" },
        ]
      : [],
  ...extra,
});

describe("StatusBadge · variant/state matrix", () => {
  test("ripple + live：data-variant= ripple，含动画，data-state= live", () => {
    const { container } = render(<StatusBadge meta={meta("live")} variant="ripple" />);
    const el = screen.getByText(/盘中（实时）/);
    expect(el).toHaveAttribute("data-variant", "ripple");
    expect(el).toHaveAttribute("data-state", "live");
    // 动画类名包含 `animate-ping`（考虑到 motion-safe 前缀，用字符串匹配）
    expect(container.innerHTML).toContain("animate-ping");
  });

  test("static + close：data-variant= static，无动画，data-state= close", () => {
    const { container } = render(<StatusBadge meta={meta("close")} variant="static" />);
    const el = screen.getByText(/收盘口径/);
    expect(el).toHaveAttribute("data-variant", "static");
    expect(el).toHaveAttribute("data-state", "close");
    expect(container.innerHTML).not.toContain("animate-ping");
  });

  test("pill + degraded：data-variant= pill，带 tooltip，data-state= degraded", () => {
    render(<StatusBadge meta={meta("degraded")} variant="pill" />);
    const el = screen.getByText(/待更新/);
    expect(el).toHaveAttribute("data-variant", "pill");
    expect(el).toHaveAttribute("data-state", "degraded");
    expect(el).toHaveAttribute("title");
  });

  test("unknown（无 meta）：文案“未知”，data-state= unknown（variant 兜底不影响渲染）", () => {
    // @ts-expect-error: 测试 unknown 分支
    render(<StatusBadge meta={undefined} variant="ripple" />);
    const el = screen.getByText("未知");
    expect(el).toHaveAttribute("data-state", "unknown");
  });
});
