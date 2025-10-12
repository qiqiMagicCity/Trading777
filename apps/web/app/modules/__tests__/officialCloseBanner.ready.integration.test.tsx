/** @jest-environment jsdom */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("official close banner readiness", () => {
  beforeEach(() => {
    resetPricesReadyForTests();
    resetOfficialCloseVersionForTests();
    const store = useStore.getState();
    store.setOfficialCloseVersion(0);
    store.setMetrics(null);
  });

  it("awaits the next ready version before consuming diagnostics", async () => {
    const store = useStore.getState();

    const metricsV1: MetricsContract = {
      M1: 0,
      M2: 0,
      M3: 0,
      M4: 0,
      M5: { behavior: 0, fifo: 0 },
      M6: { total: 0 },
      diagnostics: {
        missingOfficialCloses: [
          {
            symbol: "TSLA",
            date: "2024-09-22",
            purposes: ["M6"],
            impact: ["M6过夜桶=0"],
            hasFallback: false,
          },
        ],
        pendingOfficialCloses: [],
      },
    };

    const version1 = 1;
    beginBuild();
    beginCommit(version1);
    store.setMetrics(metricsV1);
    commitOfficialCloseVersion(version1);
    store.setOfficialCloseVersion(version1);
    markPricesReady(version1);

    render(<MissingOfficialCloseBanner summaries={[]} />);

    await waitFor(() =>
      expect(screen.getByText("官方收盘价缺失提醒")).toBeInTheDocument(),
    );
    expect(screen.getByText("2024-09-22")).toBeInTheDocument();

    const metricsV2: MetricsContract = {
      ...metricsV1,
      diagnostics: {
        missingOfficialCloses: [],
        pendingOfficialCloses: [],
      },
    };

    const version2 = 2;
    beginBuild();
    beginCommit(version2);
    store.setMetrics(metricsV2);
    commitOfficialCloseVersion(version2);
    store.setOfficialCloseVersion(version2);

    expect(screen.getByText("官方收盘价缺失提醒")).toBeInTheDocument();

    markPricesReady(version2);

    await waitFor(() =>
      expect(screen.queryByText("官方收盘价缺失提醒")).not.toBeInTheDocument(),
    );
  });
});
