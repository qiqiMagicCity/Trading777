/** @jest-environment jsdom */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PositionsTable } from "../PositionsTable";
import type { Position } from "@/lib/services/dataService";

jest.mock("@/lib/services/priceService", () => ({
  fetchRealtimeQuote: jest.fn(() => Promise.resolve({ price: 100 })),
}));

const mockFetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({}) }));

beforeEach(() => {
  (global as typeof globalThis & { fetch?: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  mockFetch.mockClear();
});

describe("PositionsTable breakEvenJ display", () => {
  it("renders 空头徽标并在缺失时展示 sticky J", () => {
    const queryClient = new QueryClient();

    const positions: Position[] = [
      {
        symbol: "SHORT",
        qty: -10,
        avgPrice: 50,
        breakEvenPrice: 55,
        breakEvenJ: 55,
        breakEvenDirection: "SHORT",
        breakEvenJSticky: 55,
        breakEvenDirectionSticky: "SHORT",
        last: 50,
        priceOk: true,
      },
      {
        symbol: "STICK",
        qty: 0,
        avgPrice: 0,
        breakEvenPrice: 0,
        breakEvenJ: null,
        breakEvenJSticky: 12.34,
        breakEvenDirection: null,
        breakEvenDirectionSticky: "LONG",
        last: 0,
        priceOk: true,
      },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <PositionsTable positions={positions} trades={[]} />
      </QueryClientProvider>,
    );

    const shortRow = screen.getByText("SHORT").closest("tr");
    expect(shortRow).not.toBeNull();
    if (!shortRow) return;
    const shortCells = within(shortRow).getAllByRole("cell");
    const shortBreakEvenCell = shortCells[7];
    expect(shortBreakEvenCell).toHaveClass("text-center");
    expect(shortBreakEvenCell).toHaveTextContent("55.00");
    const shortBadge = within(shortBreakEvenCell).getByText("（空头）");
    expect(shortBadge).toHaveClass("text-red-500");

    const stickyRow = screen.getByText("STICK").closest("tr");
    expect(stickyRow).not.toBeNull();
    if (!stickyRow) return;
    const stickyCells = within(stickyRow).getAllByRole("cell");
    const stickyBreakEvenCell = stickyCells[7];
    expect(stickyBreakEvenCell).toHaveClass("text-center");
    expect(within(stickyBreakEvenCell).getByText("—")).toBeInTheDocument();
    expect(within(stickyRow).getByText(/上次多头保本价 12\.34/)).toBeInTheDocument();
  });

  it("renders break-even J for 多头持仓", () => {
    const queryClient = new QueryClient();

    const positions: Position[] = [
      {
        symbol: "LONG",
        qty: 8,
        avgPrice: 80,
        breakEvenPrice: 90,
        breakEvenJ: 90,
        breakEvenDirection: "LONG",
        breakEvenJSticky: 90,
        breakEvenDirectionSticky: "LONG",
        last: 0,
        priceOk: true,
      },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <PositionsTable positions={positions} trades={[]} />
      </QueryClientProvider>,
    );

    const row = screen.getByText("LONG").closest("tr");
    expect(row).not.toBeNull();
    if (!row) return;

    const cells = within(row).getAllByRole("cell");
    const breakEvenCell = cells[7];
    expect(breakEvenCell).toHaveClass("text-center");
    expect(within(breakEvenCell).getByText("90.00")).toBeInTheDocument();
  });
});
