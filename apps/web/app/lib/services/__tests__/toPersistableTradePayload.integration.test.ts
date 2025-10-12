import { formatInTimeZone } from "date-fns-tz";

import { __test__ } from "@/lib/services/dataService";
import { NY_TZ, normalizeToNyDay } from "@/lib/time";

const TIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

describe("toPersistableTradePayload", () => {
  const baseTrade = {
    symbol: "spy",
    price: 100,
    quantity: 1,
    date: "2024-03-15",
    action: "buy" as const,
  };

  it("serializes Date instances using New York timezone", () => {
    const time = new Date("2024-03-15T14:05:06Z");
    const payload = __test__.toPersistableTradePayload({
      ...baseTrade,
      time,
    });

    expect(payload).toBeDefined();
    expect(payload?.time).toBe(
      formatInTimeZone(time, NY_TZ, TIME_FORMAT),
    );
  });

  it("serializes numeric timestamps in New York timezone", () => {
    const timestamp = Date.UTC(2024, 0, 15, 15, 30, 45);
    const payload = __test__.toPersistableTradePayload({
      ...baseTrade,
      time: timestamp,
    });

    expect(payload).toBeDefined();
    expect(payload?.time).toBe(
      formatInTimeZone(timestamp, NY_TZ, TIME_FORMAT),
    );
  });

  it("normalizes string inputs to the corresponding New York trading day", () => {
    const isoDate = "2024-05-20";
    const payload = __test__.toPersistableTradePayload({
      ...baseTrade,
      date: isoDate,
      time: isoDate,
    });

    expect(payload).toBeDefined();
    expect(payload?.time).toBe(
      formatInTimeZone(normalizeToNyDay(isoDate), NY_TZ, TIME_FORMAT),
    );
  });

  it("falls back to the trade date when string input cannot be parsed", () => {
    const date = "2024-06-01";
    const payload = __test__.toPersistableTradePayload({
      ...baseTrade,
      date,
      time: "  not a date  ",
    });

    expect(payload).toBeDefined();
    expect(payload?.time).toBe(
      formatInTimeZone(normalizeToNyDay(date), NY_TZ, TIME_FORMAT),
    );
  });
});
