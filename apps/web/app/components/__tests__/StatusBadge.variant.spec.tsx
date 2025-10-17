/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import StatusBadge from "../StatusBadge";

const mkMeta = (overrides: Partial<any> = {}) =>
  ({
    mode: "live",
    evaluationDay: "2024-01-02",
    latestPriceOk: true,
    officialCloseOk: true,
    isComplete: true,
    degradedReason: null,
    missingPairs: [],
    ...overrides,
  } as any);

describe("StatusBadge · variants", () => {
  it("ripple + live 显示动效并带 data-variant", () => {
    render(<StatusBadge meta={mkMeta({ mode: "live" })} variant="ripple" />);
    const el = screen.getByText(/盘中/); // 盘中（实时）
    expect(el.getAttribute("data-variant")).toBe("ripple");
    expect(document.querySelector(".motion-safe\\:animate-ping")).toBeTruthy();
  });

  it("static + close 无动效", () => {
    render(<StatusBadge meta={mkMeta({ mode: "close" })} variant="static" />);
    expect(document.querySelector(".motion-safe\\:animate-ping")).toBeNull();
    expect(screen.getByText("收盘口径")).toBeInTheDocument();
  });

  it("pill + degraded 渲染缺失标的 tooltip 且带 data-variant", () => {
    render(
      <StatusBadge
        meta={mkMeta({
          mode: "degraded",
          missingPairs: [{ day: "2024-01-02", symbol: "AAPL" }],
        })}
        variant="pill"
      />,
    );
    const el = screen.getByText(/待更新/);
    expect(el.getAttribute("data-variant")).toBe("pill");
    expect(el.getAttribute("title") || "").toMatch("AAPL");
  });

  it("无 meta 时渲染未知态，带 data-state=unknown 与缺失提示", () => {
    // @ts-expect-error 测试未知态路径
    render(<StatusBadge />);
    const el = screen.getByText("未知");
    expect(el.getAttribute("data-state")).toBe("unknown");
    expect(el.getAttribute("title") || "").toMatch("全局元信息不可用");
  });
});
