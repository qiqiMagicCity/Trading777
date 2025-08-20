import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import runAll from "../app/lib/runAll";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function readJSON(name: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../public", name), "utf-8"),
  );
}

const trades = readJSON("trades.json");
const positions = readJSON("initial_positions.json");
const prices = readJSON("close_prices.json");
const daily = readJSON("dailyResult.json");
const date = "2025-08-01";

function assertClose(actual: number, expected: number, name: string, tol = 0.01) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(name);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, name: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(name);
  }
}

try {
  const res = runAll(date, positions, trades, prices, { dailyResults: daily }, {
    evalDate: '2025-08-01',
  });

  assertClose(res.M1, 111170, "M1");
  assertClose(res.M2, 111420.5, "M2");
  assertClose(res.M3, 1102.5, "M3");
  assertClose(res.M4, 6530, "M4");
  assertClose(res.M5_1, 1670, "M5_1");
  assertClose(res.M5_2, 1320, "M5_2");
  assertClose(res.M6, 8952.5, "M6");
  assertClose(res.M6, res.M4 + res.M3 + res.M5_2, "M6 invariant");
  assertDeepEqual(res.M7, { B: 6, S: 8, P: 4, C: 4, total: 22 }, "M7");
  assertDeepEqual(res.M8, { B: 8, S: 8, P: 5, C: 4, total: 25 }, "M8");
  assertClose(res.M9, 7850, "M9");
  assertDeepEqual(res.M10, { W: 11, L: 2, winRatePct: 84.6 }, "M10");
  assertClose(res.M11, 8952.5, "M11");
  assertClose(res.M12, 8952.5, "M12");
  assertClose(res.M13, 8952.5, "M13");

  const nflxRows = res.aux.breakdown.filter(
    (r: any) => r.symbol === "NFLX" && r.time.includes("09:40"),
  );
  const hasM4 = nflxRows.some((r: any) => r.into === "M4" && r.qty === 100);
  const hasM52 = nflxRows.some((r: any) => r.into === "M5.2" && r.qty === 20);
  if (!(hasM4 && hasM52)) {
    throw new Error("NFLX pair-split");
  }

  console.log("✅ Golden case passed");
} catch (err: any) {
  console.error("❌ Failed", err.message);
  process.exit(1);
}
