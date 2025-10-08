import { nyDateStrSafe } from "../time";
import { isTradingDay } from "../nyDay";
import { evaluateCloseRequirement } from "../marketHours";
import { getPrice, clearDailyResultsCache } from "../services/dataService";
import { isOfficialCloseSource } from "../priceSourceGuards";

type Layer = { step: string; ok: boolean; detail?: string };
export type CloseExplain = {
  symbol: string;
  date: string;
  tradingDay: boolean;
  needOfficial: boolean;
  layers: Layer[];
  verdict: "OK" | "MISSING";
};

const YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;
const isYYYYMMDD = (s: string) => YYYYMMDD.test(s);
const norm = (s: string) => (s ?? "").trim().toUpperCase();

export async function explainClose(
  symbolRaw: string,
  dateRaw: string,
): Promise<CloseExplain> {
  const symbol = norm(symbolRaw);
  const date = nyDateStrSafe(dateRaw);
  const layers: Layer[] = [];
  const out: CloseExplain = {
    symbol,
    date,
    tradingDay: isTradingDay(date),
    needOfficial: false,
    layers,
    verdict: "MISSING",
  };

  if (!isYYYYMMDD(date)) {
    layers.push({ step: "date-format", ok: false, detail: "需 YYYY-MM-DD" });
    return out;
  }
  layers.push({
    step: "isTradingDay",
    ok: out.tradingDay,
    detail: out.tradingDay ? "交易日" : "非交易日",
  });

  const req = evaluateCloseRequirement(date);
  out.needOfficial = !!req?.requireOfficialClose;
  layers.push({
    step: "require-official",
    ok: true,
    detail: `requireOfficialClose=${out.needOfficial}`,
  });

  const rec = await getPrice(symbol, date);
  if (rec && Number.isFinite((rec as any).close)) {
    layers.push({
      step: "exists-any",
      ok: true,
      detail: `source=${rec.source ?? "unknown"}`,
    });
  } else {
    layers.push({
      step: "exists-any",
      ok: false,
      detail: "未找到价格（含导入）",
    });
  }

  const strictOk =
    !!rec &&
    Number.isFinite((rec as any).close) &&
    isOfficialCloseSource(rec.source);
  layers.push({
    step: "exists-strict",
    ok: strictOk,
    detail: rec ? `source=${rec.source}` : "no record",
  });

  out.verdict = out.needOfficial
    ? strictOk
      ? "OK"
      : "MISSING"
    : rec && Number.isFinite((rec as any).close)
      ? "OK"
      : "MISSING";
  return out;
}

export async function explainBatch(symbols: string[], dates: string[]) {
  const rows: CloseExplain[] = [];
  for (const d of dates) {
    for (const s of symbols) {
      rows.push(await explainClose(s, d));
    }
  }
  return rows;
}

export async function afterImportMaintenance() {
  await clearDailyResultsCache();
}
