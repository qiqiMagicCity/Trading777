import fs from "fs";
import path from "path";
import { assertSchema } from "@/app/lib/schemas/assertSchema";
import { Trades, Prices, Positions } from "@/app/lib/schemas/real";

// 简单 CSV 解析（首行表头，逗号分隔，忽略空行/BOM）
function parseCsv(text: string): Record<string,string>[] {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/).filter(Boolean);
  const [head, ...rows] = lines;
  if (!head) return [];
  const headers = head.split(",").map(h => h.trim());
  return rows.map(line => {
    const cols = line.split(",").map(c => c.trim());
    const obj: Record<string,string> = {};
    headers.forEach((h, i) => obj[h] = (cols[i] ?? "").trim());
    return obj;
  });
}

function readTextIfExists(p: string): string | null {
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  } catch { return null; }
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(p: string, data: any) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  console.log("✅ wrote", p);
}

function seed() {
  const realDir = path.join(process.cwd(), "apps/web/data/real");
  const pubDir  = path.join(process.cwd(), "apps/web/public");

  const tradesCsv = readTextIfExists(path.join(realDir, "trades.csv"));
  const pricesCsv = readTextIfExists(path.join(realDir, "prices.csv"));
  const positionsCsv = readTextIfExists(path.join(realDir, "positions.csv"));

  // trades.csv -> trades.json
  // 允许两种表头：date,time,symbol,side,qty,price 或 time,symbol,action,qty,price（按你项目里用到的命名兼容）
  if (tradesCsv) {
    const rows = parseCsv(tradesCsv).map(r => {
      const date = r.date ?? r.Date ?? "";
      const time = r.time ?? r.Time ?? "";
      const dt = (date || time) ? `${date}${date && time ? " " : ""}${time}` : "";
      const side = (r.side ?? r.action ?? r.Side ?? r.Action ?? "").toUpperCase();
      // qty 统一为数字；若 side=SHORT/SELL 可保留正数并由业务决定正负，或直接在计算处取 sign
      const qty = Number(r.qty ?? r.Qty ?? r.quantity ?? 0);
      const price = Number(r.price ?? r.Price ?? 0);
      const symbol = r.symbol ?? r.Symbol ?? r.ticker ?? "";
      return { datetime: dt, date, time, symbol, side, qty, price };
    });
    writeJson(path.join(pubDir, "trades.json"), assertSchema(rows, Trades));
  } else {
    console.log("⚠️  apps/web/data/real/trades.csv 不存在，跳过 trades.json 生成");
  }

  // prices.csv -> prices.json （收盘价：date,symbol,close）
  if (pricesCsv) {
    const rows = parseCsv(pricesCsv);
    const arr = assertSchema(rows.map(r => ({ date: r.date ?? r.Date ?? "", symbol: r.symbol ?? r.Symbol ?? r.ticker ?? "", close: Number(r.close ?? r.Close ?? r.price ?? 0) })), Prices);
    const byDate: Record<string, Record<string, number>> = {};
    arr.forEach(r => {
      const d = r.date;
      const s = r.symbol;
      const c = r.close;
      byDate[d] ??= {};
      byDate[d][s] = c;
    });
    writeJson(path.join(pubDir, "prices.json"), byDate);
  } else {
    console.log("⚠️  apps/web/data/real/prices.csv 不存在，跳过 prices.json 生成");
  }

  // positions.csv -> positions.json （期初/历史持仓：symbol,qty,price 可选）
  if (positionsCsv) {
    const rows = parseCsv(positionsCsv).map(r => ({
      symbol: r.symbol ?? r.Symbol ?? r.ticker ?? "",
      qty: Number(r.qty ?? r.Qty ?? r.quantity ?? 0),
      avgPrice: Number(r.price ?? r.Price ?? r.avg ?? r.Avg ?? 0),
    }));
    writeJson(path.join(pubDir, "positions.json"), assertSchema(rows, Positions));
  } else {
    console.log("⚠️  apps/web/data/real/positions.csv 不存在，跳过 positions.json 生成");
  }
}

seed();
