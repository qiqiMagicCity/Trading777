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
        breakEvenPrice: -55,
        breakEvenJ: -55,
        breakEvenJSticky: -55,
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
    expect(within(shortRow).getByText("55.00")).toBeInTheDocument();
    expect(within(shortRow).getByText("空头")).toBeInTheDocument();

    const stickyRow = screen.getByText("STICK").closest("tr");
    expect(stickyRow).not.toBeNull();
    if (!stickyRow) return;
    expect(within(stickyRow).getByText("—")).toBeInTheDocument();
    expect(within(stickyRow).getByText(/上次保本价 12\.34/)).toBeInTheDocument();
  });
});
