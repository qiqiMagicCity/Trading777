import { sumWindowByTelescope } from "@/app/lib/metrics";

describe("sumWindowByTelescope", () => {
  it("matches explicit daily accumulation when data is complete", () => {
    const dailyBook = {
      realizedByDay: {
        "2024-06-10": 125.5,
        "2024-06-11": -45.25,
        "2024-06-12": 80,
      },
      uCloseByDay: {
        "2024-06-09": 1_000,
        "2024-06-10": 1_020,
        "2024-06-11": 995,
        "2024-06-12": 1_040,
      },
    } satisfies Record<string, Record<string, number>>;

    const windowTotal = sumWindowByTelescope(
      "2024-06-10",
      "2024-06-12",
      dailyBook,
    );

    const realizedSum = 125.5 - 45.25 + 80;
    const telescope = realizedSum + (1_040 - 1_000);
    expect(windowTotal).toBeCloseTo(telescope, 6);
  });

  it("returns NaN when end unrealized is missing", () => {
    const windowTotal = sumWindowByTelescope(
      "2024-06-10",
      "2024-06-11",
      {
        realizedByDay: { "2024-06-10": 10 },
        uCloseByDay: { "2024-06-09": 100 },
      },
    );
    expect(windowTotal).toBeNaN();
  });
});
