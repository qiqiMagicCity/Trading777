/** @jest-environment jsdom */

import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { MissingOfficialCloseBanner } from "@/app/modules/OfficialCloseBanners";
import { useStore } from "@/app/lib/store";
import type { MetricsContract } from "@/app/lib/types/metrics";
import {
  beginBuild,
  beginCommit,
  markPricesReady,
  resetPricesReadyForTests,
} from "@/app/lib/prices/ready";
import {
  commitOfficialCloseVersion,
  resetOfficialCloseVersionForTests,
} from "@/app/lib/prices/buildOfficialCloseMaps";

describe("Official close banner refresh order", () => {
  beforeEach(() => {
    resetPricesReadyForTests();
    resetOfficialCloseVersionForTests();
    const store = useStore.getState();
    store.setOfficialCloseVersion(0);
    store.setMetrics(null);
  });

  it("waits for the next ready version after import before refreshing", async () => {
    const store = useStore.getState();

    const baseMetrics: MetricsContract = {
      M1: 0,
      M2: 0,
      M3: 0,
      M4: 0,
      M5: { behavior: 0, fifo: 0 },
      M6: { total: 0 },
      diagnostics: {
        missingOfficialCloses: [
          {
            symbol: "AAPL",
            date: "2024-06-18",
            purposes: ["runAll"],
            impact: ["WTD/MTD/YTD端点浮盈可能失真"],
            hasFallback: false,
          },
        ],
        pendingOfficialCloses: [],
      },
    };

    beginBuild();
    beginCommit(1);
    store.setMetrics(baseMetrics);
    commitOfficialCloseVersion(1);
    store.setOfficialCloseVersion(1);
    markPricesReady(1);

    render(<MissingOfficialCloseBanner summaries={[]} />);

    await waitFor(() =>
      expect(screen.getByText("官方收盘价缺失提醒")).toBeInTheDocument(),
    );
    expect(screen.getByText("2024-06-18")).toBeInTheDocument();

    const clearedMetrics: MetricsContract = {
      ...baseMetrics,
      diagnostics: {
        missingOfficialCloses: [],
        pendingOfficialCloses: [],
      },
    };

    beginBuild();
    store.setMetrics(clearedMetrics);
    beginCommit(2);
    commitOfficialCloseVersion(2);
    store.setOfficialCloseVersion(2);

    await act(async () => {
      window.dispatchEvent(new Event("pricesImported"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.getByText("官方收盘价缺失提醒")).toBeInTheDocument();

    act(() => {
      markPricesReady(2);
    });

    await waitFor(() =>
      expect(
        screen.queryByText("官方收盘价缺失提醒"),
      ).not.toBeInTheDocument(),
    );
  });
});
