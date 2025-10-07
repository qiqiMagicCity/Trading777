import { NextRequest } from "next/server";
import { GET } from "@/app/api/debug/m4/route";
import { runAll } from "@/app/lib/runAll";

jest.mock("@/app/lib/runAll", () => ({
  runAll: jest.fn(),
}));

describe("/api/debug/m4 shape", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns { ok:true, data:{ M4, legs[] } } for an existing symbol", async () => {
    const mockLeg = {
      fillId: "abc",
      time: "2025-01-01T10:00:00-05:00",
      action: "SELL",
      qty: 10,
      lotDateStr: "2024-12-31",
      from: "history",
      pnl_raw: 25,
    };

    (runAll as jest.MockedFunction<typeof runAll>).mockResolvedValue({
      results: {
        AAA: {
          M4: 25,
          aux: {
            breakdown: {
              m4: [mockLeg],
            },
          },
        },
      },
    } as any);

    const request = new NextRequest("https://example.com/api/debug/m4?symbol=AAA", {
      headers: {
        host: "example.com",
        "x-forwarded-proto": "https",
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.symbol).toBe("AAA");
    expect(body.data.M4).toBe(25);
    expect(body.data.legs).toHaveLength(1);
    expect(body.data.legs[0]).toMatchObject({ fillId: "abc", from: "history" });
    expect(runAll).toHaveBeenCalledWith(expect.objectContaining({ ioProvider: expect.anything() }));
  });
});
