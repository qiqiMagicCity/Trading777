import { NextRequest, NextResponse } from "next/server";
import { runAll } from "@/app/lib/runAll";
import { apiIoProvider } from "@/app/lib/io/providers";
import { round2 } from "@/app/lib/money";

type M4Leg = {
  fillId: string;
  time: string;
  action: string;
  qty: number;
  lotDateStr: string;
  from: string;
  pnl_raw: number;
};

type SymbolMetrics = {
  M4?: number;
  aux?: {
    breakdown?: {
      m4?: unknown;
      all?: unknown;
    } | unknown;
  };
};

type RunAllPayload = {
  results?: Record<string, SymbolMetrics>;
};

function resolveBaseUrl(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const protocol = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : "";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase();
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "symbol required" }, { status: 400 });
  }

  try {
    const baseUrl = resolveBaseUrl(req);
    const result = (await runAll({ ioProvider: apiIoProvider, baseUrl })) as RunAllPayload;
    const perSymbol = result?.results ?? {};
    const entry = perSymbol[symbol];
    const fallback = result as SymbolMetrics;
    if (!entry && !fallback?.aux?.breakdown) {
      return NextResponse.json({ ok: false, error: "symbol not found" }, { status: 404 });
    }

    const breakdown = entry?.aux?.breakdown ?? fallback?.aux?.breakdown;
    let rawLegs: unknown = [];
    if (Array.isArray((breakdown as { m4?: unknown })?.m4)) {
      rawLegs = (breakdown as { m4: unknown }).m4;
    } else if (Array.isArray((breakdown as { all?: unknown })?.all)) {
      rawLegs = ((breakdown as { all: unknown }).all as unknown[]).filter(
        (row) => (row as { into?: string })?.into === "M4",
      );
    } else if (Array.isArray(breakdown)) {
      rawLegs = (breakdown as unknown[]).filter(
        (row) => (row as { into?: string })?.into === "M4",
      );
    }

    const normalizedLegs: M4Leg[] = (Array.isArray(rawLegs) ? rawLegs : [])
      .map((leg) => ({
        fillId: String((leg as { fillId?: unknown }).fillId ?? ""),
        time: String((leg as { time?: unknown }).time ?? ""),
        action: String((leg as { action?: unknown }).action ?? ""),
        qty: Number((leg as { qty?: unknown }).qty ?? 0),
        lotDateStr: String((leg as { lotDateStr?: unknown }).lotDateStr ?? ""),
        from: String((leg as { from?: unknown }).from ?? ""),
        pnl_raw: Number((leg as { pnl_raw?: unknown }).pnl_raw ?? 0),
        symbol: String((leg as { symbol?: unknown }).symbol ?? symbol),
      }))
      .filter((leg) => leg.fillId.length > 0 || leg.qty !== 0);

    const filteredLegs = normalizedLegs.filter((leg) => leg.symbol === symbol);
    if (!entry && filteredLegs.length === 0) {
      return NextResponse.json({ ok: false, error: "symbol not found" }, { status: 404 });
    }

    const sumRaw = round2(
      filteredLegs.reduce<number>((acc, leg) => acc + Number(leg.pnl_raw ?? 0), 0),
    );

    return NextResponse.json({
      ok: true,
      symbol,
      data: {
        M4: Number(entry?.M4 ?? sumRaw),
        sumRaw,
        legs: filteredLegs,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
