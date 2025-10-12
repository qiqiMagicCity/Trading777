/**
 * @jest-environment jsdom
 */

import React from "react";
import { render } from "@testing-library/react";
import { TradingDayProvider, useTradingDay } from "../TradingDayContext";

describe("TradingDayProvider", () => {
  function Show() {
    return <span data-testid="trading-day">{useTradingDay()}</span>;
  }

  test("renders initialTradingDay as-is", () => {
    const { getByTestId } = render(
      <TradingDayProvider initialTradingDay="2025-07-03">
        <Show />
      </TradingDayProvider>,
    );
    expect(getByTestId("trading-day").textContent).toBe("2025-07-03");
  });

  test("fallback to resolveTradingDayStr when no provider", () => {
    const { getByTestId } = render(<Show />);
    expect(getByTestId("trading-day").textContent).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  });
});
