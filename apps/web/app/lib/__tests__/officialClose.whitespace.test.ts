import "fake-indexeddb/auto";

import { jest } from "@jest/globals";

describe("official close whitespace handling", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it("buildOfficialCloseMaps keeps packaged closes with noisy whitespace", async () => {
    jest.resetModules();
    (global as typeof globalThis & { fetch?: unknown }).fetch = undefined;
    const loadJsonMock = jest.fn().mockResolvedValue({
      " amd ": {
        "2025-09-19 ": "101.23",
      },
      amzn: {
        "2025-10-03\t": "202.34",
      },
    });
    const getAllPricesMock = jest.fn().mockResolvedValue([]);
    const readOverlayMock = jest.fn().mockResolvedValue([]);

    type OfficialCloseModule = typeof import("@/app/lib/prices/buildOfficialCloseMaps");
    let buildOfficialCloseMaps: OfficialCloseModule["buildOfficialCloseMaps"] | undefined;
    let resetOfficialCloseVersionForTests:
      | OfficialCloseModule["resetOfficialCloseVersionForTests"]
      | undefined;

    await jest.isolateModulesAsync(async () => {
      const dataSource = await import("@/app/lib/dataSource");
      jest.spyOn(dataSource, "loadJson").mockImplementation(loadJsonMock as never);

      const dataService = await import("@/app/lib/services/dataService");
      jest.spyOn(dataService, "getAllPrices").mockImplementation(getAllPricesMock as never);

      const overlayStore = await import("@/app/lib/officialCloseOverlayStore");
      jest
        .spyOn(overlayStore, "readOfficialCloseOverlay")
        .mockImplementation(readOverlayMock as never);

      const mod = await import("@/app/lib/prices/buildOfficialCloseMaps");
      buildOfficialCloseMaps = mod.buildOfficialCloseMaps;
      resetOfficialCloseVersionForTests = mod.resetOfficialCloseVersionForTests;
    });

    if (!buildOfficialCloseMaps || !resetOfficialCloseVersionForTests) {
      throw new Error("failed to load buildOfficialCloseMaps");
    }

    resetOfficialCloseVersionForTests();

    const result = await buildOfficialCloseMaps();

    expect(result.maps.official.AMD?.["2025-09-19"]).toBeCloseTo(101.23);
    expect(result.maps.official.AMZN?.["2025-10-03"]).toBeCloseTo(202.34);
    expect(result.maps.packaged.AMD?.["2025-09-19"]).toBeCloseTo(101.23);
    expect(result.maps.packaged.AMZN?.["2025-10-03"]).toBeCloseTo(202.34);
    expect(loadJsonMock).toHaveBeenCalled();
    expect(getAllPricesMock).toHaveBeenCalled();
    expect(readOverlayMock).toHaveBeenCalled();
  });

  it("requireOfficialClose resolves sanitized symbol and date inputs", async () => {
    jest.resetModules();
    const { setOfficialCloseContext, requireOfficialClose } = await import(
      "@/app/lib/price/requireOfficialClose"
    );
    const { createMissingOfficialCloseDiagnostics } = await import(
      "@/app/lib/diagnostics/reportMissingOfficialClose"
    );

    const release = setOfficialCloseContext({
      map: {
        AMD: {
          "2025-09-19": 321.45,
        },
      },
      overlayMap: {},
      packagedMap: {},
      idbMap: {},
      diagnostics: createMissingOfficialCloseDiagnostics(),
    });

    const result = requireOfficialClose(" amd ", "2025-09-19 \n", "generateDailyResults");
    expect(result).toEqual({ ok: true, price: 321.45 });

    release();
  });
});
