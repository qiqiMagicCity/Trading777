/** @jest-environment jsdom */

import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { useGlobalMeta, __resetGlobalMetaStoreForTests } from "@/app/state/globalModeStore";

jest.useFakeTimers();

let currentNow = new Date("2025-07-03T10:30:00-04:00");

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: jest.fn(() => new Date(currentNow)),
  };
});

let mockedEvaluationDay = "2025-07-03";
let mockedBeforeClose = true;
let mockedIsTradingDay = true;

jest.mock("@/app/lib/time/evaluationDay", () => ({
  pickEvaluationDay: jest.fn(() => mockedEvaluationDay),
  beforeOfficialClose: jest.fn(() => mockedBeforeClose),
  isTradingDay: jest.fn(() => mockedIsTradingDay),
}));

jest.mock("@/app/lib/symbols/relatedSymbols", () => ({
  getRelatedSymbols: jest.fn(async () => ["AAPL", "MSFT"]),
}));

const liveListeners = new Set<(detail: { symbol: string; ts: number }) => void>();
let liveSymbols = new Set<string>(["AAPL", "MSFT"]);

jest.mock("@/app/state/livePriceStatus", () => ({
  hasLivePriceFor: jest.fn((symbol: string) => liveSymbols.has(symbol)),
  subscribeLivePriceTick: jest.fn((listener: (detail: { symbol: string; ts: number }) => void) => {
    liveListeners.add(listener);
  }),
  unsubscribeLivePriceTick: jest.fn((listener: (detail: { symbol: string; ts: number }) => void) => {
    liveListeners.delete(listener);
  }),
}));

const officialListeners = new Set<() => void>();
let officialPairs = new Set<string>(["2025-07-03:AAPL", "2025-07-03:MSFT"]);

jest.mock("@/app/lib/prices/officialCloseStatus", () => ({
  hasOfficialCloseFor: jest.fn((day: string, symbol: string) => officialPairs.has(`${day}:${symbol}`)),
  subscribeOfficialCloseChanged: jest.fn((listener: () => void) => {
    officialListeners.add(listener);
  }),
  unsubscribeOfficialCloseChanged: jest.fn((listener: () => void) => {
    officialListeners.delete(listener);
  }),
}));

jest.mock("@/app/lib/mode/globalMeta", () => {
  const actual = jest.requireActual("@/app/lib/mode/globalMeta");
  return actual;
});

function emitLive(symbol: string) {
  const detail = { symbol, ts: Date.now() };
  liveListeners.forEach((listener) => listener(detail));
}

function emitOfficialChanged() {
  officialListeners.forEach((listener) => listener());
}

function Viewer() {
  const meta = useGlobalMeta();
  return (
    <div>
      <span data-testid="mode">{meta?.mode ?? "none"}</span>
      <span data-testid="missing">{meta?.missingPairs.length ?? 0}</span>
    </div>
  );
}

describe("globalModeStore", () => {
  beforeEach(() => {
    currentNow = new Date("2025-07-03T10:30:00-04:00");
    mockedEvaluationDay = "2025-07-03";
    mockedBeforeClose = true;
    mockedIsTradingDay = true;
    liveSymbols = new Set(["AAPL", "MSFT"]);
    officialPairs = new Set(["2025-07-03:AAPL", "2025-07-03:MSFT"]);
    __resetGlobalMetaStoreForTests();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it("reacts to live price and official close events", async () => {
    render(<Viewer />);

    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId("mode").textContent).toBe("live"));

    liveSymbols = new Set(["AAPL"]);
    emitLive("AAPL");
    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId("mode").textContent).toBe("degraded"));
    await waitFor(() => expect(screen.getByTestId("missing").textContent).toBe("1"));

    mockedBeforeClose = false;
    currentNow = new Date("2025-07-03T16:05:00-04:00");
    officialPairs = new Set(["2025-07-03:AAPL"]);
    emitOfficialChanged();
    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId("mode").textContent).toBe("degraded"));
    await waitFor(() => expect(screen.getByTestId("missing").textContent).toBe("1"));

    officialPairs = new Set(["2025-07-03:AAPL", "2025-07-03:MSFT"]);
    emitOfficialChanged();
    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId("mode").textContent).toBe("close"));
    await waitFor(() => expect(screen.getByTestId("missing").textContent).toBe("0"));
  });
});
