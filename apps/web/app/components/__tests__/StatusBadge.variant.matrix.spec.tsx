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

function getBadgeByLabel(text: Parameters<typeof screen.getByText>[0]): HTMLElement {
  const labelNode = screen.getByText(text);
  const badge = labelNode.closest('[role="status"]');
  if (!badge) {
    throw new Error("Status badge wrapper not found");
  }
  return badge as HTMLElement;
}

describe("StatusBadge · variant/state matrix", () => {
  test("ripple + live：data-variant= ripple，含动画，data-state= live", () => {
    const { container } = render(<StatusBadge meta={meta("live")} variant="ripple" />);
    const el = getBadgeByLabel(/盘中（实时）/);
    expect(el).toHaveAttribute("data-variant", "ripple");
    expect(el).toHaveAttribute("data-state", "live");
    // 动画类名包含 `animate-ping`（考虑到 motion-safe 前缀，用字符串匹配）
    expect(container.innerHTML).toContain("animate-ping");
  });

  test("static + close：data-variant= static，无动画，data-state= close", () => {
    const { container } = render(<StatusBadge meta={meta("close")} variant="static" />);
    const el = getBadgeByLabel(/收盘口径/);
    expect(el).toHaveAttribute("data-variant", "static");
    expect(el).toHaveAttribute("data-state", "close");
    expect(container.innerHTML).not.toContain("animate-ping");
  });

  test("pill + degraded：data-variant= pill，带 tooltip，data-state= degraded", () => {
    render(<StatusBadge meta={meta("degraded")} variant="pill" />);
    const el = getBadgeByLabel(/待更新/);
    expect(el).toHaveAttribute("data-variant", "pill");
    expect(el).toHaveAttribute("data-state", "degraded");
    expect(el).toHaveAttribute("title");
  });

  test("halo + live：data-variant= halo，ring-2 存在且含动画", () => {
    const { container } = render(<StatusBadge meta={meta("live")} variant="halo" />);
    const el = getBadgeByLabel(/盘中（实时）/);
    expect(el).toHaveAttribute("data-variant", "halo");
    expect(el).toHaveAttribute("data-state", "live");
    expect(el.className).toContain("ring-2");
    expect(container.innerHTML).toContain("motion-safe:animate-ping");
    expect(container.innerHTML).toContain("motion-safe:animate-pulse");
  });

  test("degraded 缺失 ≤10 条：tooltip 不展示“其余 0 条”", () => {
    render(
      <StatusBadge
        meta={meta("degraded", {
          missingPairs: [
            { day: "2024-01-03", symbol: "AAPL" },
            { day: "2024-01-04", symbol: "MSFT" },
          ],
        })}
        variant="pill"
      />,
    );
    const el = getBadgeByLabel(/待更新/);
    const title = el.getAttribute("title");
    expect(title).toBeTruthy();
    expect(title).not.toContain("其余 0 条");
  });

  test("unknown（无 meta）：文案“未知”，data-state= unknown（variant 兜底不影响渲染）", () => {
    // @ts-expect-error: 测试 unknown 分支
    render(<StatusBadge meta={undefined} variant="ripple" />);
    const el = getBadgeByLabel("未知");
    expect(el).toHaveAttribute("data-state", "unknown");
  });

  test("unknown → live：默认 variant 保持，状态切换，aria-live 保留", () => {
    const { rerender } = render(<StatusBadge />);
    const unknownEl = getBadgeByLabel("未知");
    expect(unknownEl).toHaveAttribute("data-state", "unknown");
    expect(unknownEl).toHaveAttribute("data-variant", "ripple");

    rerender(<StatusBadge meta={meta("live")} />);

    expect(screen.queryByText("未知")).not.toBeInTheDocument();
    const liveEl = getBadgeByLabel(/盘中（实时）/);
    expect(liveEl).toHaveAttribute("data-state", "live");
    expect(liveEl).toHaveAttribute("data-variant", "ripple");
    expect(liveEl).toHaveAttribute("aria-live", "polite");
    expect(liveEl).toHaveAttribute("role", "status");
  });

  test("ripple + live + forceMotion：强制使用 animate-*", () => {
    const { container } = render(
      <StatusBadge meta={meta("live")} variant="ripple" forceMotion />,
    );
    expect(container.innerHTML).toContain("animate-ping");
    expect(container.innerHTML).not.toContain("motion-safe:animate-ping");
  });

  test("ripple + live + env 强制动效：读取环境变量", () => {
    const originalEnv = process.env.NEXT_PUBLIC_FORCE_BADGE_MOTION;
    process.env.NEXT_PUBLIC_FORCE_BADGE_MOTION = "1";

    const { container } = render(<StatusBadge meta={meta("live")} variant="ripple" />);
    expect(container.innerHTML).toContain("animate-ping");
    expect(container.innerHTML).not.toContain("motion-safe:animate-ping");

    process.env.NEXT_PUBLIC_FORCE_BADGE_MOTION = originalEnv;
  });
});
