/** @jest-environment jsdom */

import React from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom";
import { act } from "react";

import { PositionsTable } from "../PositionsTable";
import { DashboardMetrics } from "../DashboardMetrics";
import { useStore } from "@/lib/store";

jest.mock("@/lib/services/priceService", () => ({
  fetchRealtimeQuote: jest.fn(() => Promise.resolve({ kind: 'quote', price: 100 })),
}));

const mockFetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({}) }));

describe("Positions total M4 matches dashboard", () => {
  beforeEach(() => {
    (global as typeof globalThis & { fetch?: typeof fetch }).fetch =
      mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    act(() => {
      useStore.setState({ metrics: null, periodHealth: null });
    });
    mockFetch.mockClear();
  });

  it("renders identical M4_today totals and degraded hints", async () => {
    await act(async () => {
      useStore.setState({
        metrics: {
          M4: 0,
          M4_today: {
            total: 123.45,
            realized: 50,
            mtmOvernight: 60,
            mtmIntradayOpen: 13.45,
            degraded: true,
            reason: "missing_official_close_prev",
          },
          M9: 0,
        } as any,
        periodHealth: null,
      });
    });

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <div>
          <DashboardMetrics enrichedTrades={[]} positions={[]} />
          <PositionsTable positions={[]} trades={[]} />
        </div>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const valueMatches = screen.getAllByText(/\$123\.45/);
    expect(valueMatches.length).toBeGreaterThanOrEqual(2);

    const tableRow = screen.getByText("今日盈亏(M4)").closest("tr");
    expect(tableRow).toBeTruthy();
    if (tableRow) {
      expect(within(tableRow).getByText(/\$123\.45/)).toBeInTheDocument();
    }

    const dashboardCard = screen.getByText("今天持仓平仓盈利").closest("div");
    expect(dashboardCard).toBeTruthy();

    const degradedBadges = screen.getAllByTitle("因缺官方昨收，过夜=0，M4为退化值");
    expect(degradedBadges.length).toBeGreaterThanOrEqual(2);
  });
});
