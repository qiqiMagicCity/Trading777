import { nyDateStrSafe } from "../time";
import { isTradingDay, previousTradingDay } from "../nyDay";
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
  need?: "E" | "E-1" | null;
  prevDate?: string | null;
  missingDates?: string[];
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
    need: null,
    prevDate: null,
    missingDates: [],
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

  const prev = previousTradingDay(date);
  let prevStrictOk = false;
  if (prev && prev !== date) {
    out.prevDate = prev;
    const prevRec = await getPrice(symbol, prev);
    if (prevRec && Number.isFinite((prevRec as any).close)) {
      prevStrictOk = isOfficialCloseSource(prevRec.source);
      layers.push({
        step: "prev-official",
        ok: prevStrictOk,
        detail: prevStrictOk
          ? `source=${prevRec.source ?? "unknown"} @ ${prev}`
          : `缺上一纽约交易日(${prev})官方昨收`,
      });
    } else {
      layers.push({
        step: "prev-official",
        ok: false,
        detail: `缺上一纽约交易日(${prev})官方昨收`,
      });
    }
  }

  const missingDates = new Set<string>();
  let need: "E" | "E-1" | null = null;
  if (!strictOk) {
    need = "E";
    if (isYYYYMMDD(date)) {
      missingDates.add(date);
    }
  }
  if (prev && !prevStrictOk) {
    if (strictOk) {
      need = "E-1";
      missingDates.clear();
      if (isYYYYMMDD(prev)) {
        missingDates.add(prev);
      }
    } else if (isYYYYMMDD(prev)) {
      missingDates.add(prev);
    }
  }
  out.need = need;
  out.missingDates = Array.from(missingDates).sort();

  out.verdict = out.needOfficial
    ? strictOk
      ? "OK"
      : "MISSING"
    : rec && Number.isFinite((rec as any).close)
      ? "OK"
      : "MISSING";

  if (need === "E-1") {
    out.verdict = "MISSING";
  }
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
