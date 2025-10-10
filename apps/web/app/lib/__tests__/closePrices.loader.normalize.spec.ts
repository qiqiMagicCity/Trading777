import { loadJson } from "@/app/lib/dataSource";
import { normalizeCloseMap, type CloseMapByDate } from "../prices/normalizeCloseMap";

describe("loadJson close_prices normalization", () => {
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as any).fetch;
    }
    originalFetch = undefined;
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("converts packaged close_prices into date->symbol map", async () => {
    const payload = { AMZN: { "2025-10-03": "219.51" } };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    global.fetch = fetchMock as any;

    const map = (await loadJson("close_prices")) as CloseMapByDate;

    expect(map).toEqual(normalizeCloseMap(payload));
    expect(map["2025-10-03"]).toBeDefined();
    expect(map["2025-10-03"]?.AMZN).toBeCloseTo(219.51);
  });
});
