/** @jest-environment jsdom */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { PositionsTable } from "../PositionsTable";
import type { Position } from "@/lib/services/dataService";

jest.mock("@/lib/services/priceService", () => ({
  fetchRealtimeQuote: jest.fn(() => Promise.resolve({
    price: 100,
    stale: false,
    priceOk: true,
  })),
}));

describe("PositionsTable breakeven J display", () => {
  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({}) }) as unknown as Response,
    );
  });

  afterEach(() => {
    if (typeof (global.fetch as jest.Mock | undefined)?.mockClear === "function") {
      (global.fetch as jest.Mock).mockClear();
    }
    delete (global as Record<string, unknown>).fetch;
  });

  const renderWithClient = (positions: Position[]) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    });
    return render(
      <QueryClientProvider client={client}>
        <PositionsTable positions={positions} trades={[]} />
      </QueryClientProvider>,
    );
  };

  it("renders negative breakEvenJ with 空头标记 and sticky fallback", async () => {
    const positions: Position[] = [
      {
        symbol: "SHORT-SYM",
        qty: -50,
        avgPrice: 50,
        last: 55,
        priceOk: true,
        breakEvenPrice: -55,
        breakEvenJ: -55,
        breakEvenJSticky: -55,
        stale: false,
      },
      {
        symbol: "FLAT-SYM",
        qty: 0,
        avgPrice: 0,
        last: 0,
        priceOk: true,
        breakEvenPrice: undefined,
        breakEvenJ: undefined,
        breakEvenJSticky: 8,
        stale: false,
      },
    ];

    renderWithClient(positions);

    await waitFor(() => {
      expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
    });

    const rows = screen.getAllByRole("row");
    const dataRow1 = rows[1]!;
    const dataRow2 = rows[2]!;

    const breakEvenCell1 = within(dataRow1).getAllByRole("cell")[7]!;
    expect(breakEvenCell1).toHaveTextContent("55.00");
    expect(breakEvenCell1).toHaveTextContent("空头");

    const breakEvenCell2 = within(dataRow2).getAllByRole("cell")[7]!;
    expect(breakEvenCell2).toHaveTextContent("—");
    expect(within(breakEvenCell2).getByTestId("sticky-break-even")).toHaveTextContent(
      "上次保本价 8.00",
    );
  });
});
