import { NextRequest, NextResponse } from "next/server";
import { runAll } from "@/app/lib/runAll";
import { apiIoProvider } from "@/app/lib/io/providers";

type Leg = {
  fillId: string;
  time: string;
  action: string;
  qty: number;
  lotDateStr: string;
  from: string;
  pnl_raw: number;
};

function getBaseUrl(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return proto + "://" + host;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "";
  if (!symbol) {
    return NextResponse.json({ ok:false, error:"missing symbol" }, { status: 400 });
  }

  try {
    const baseUrl = getBaseUrl(req);
    const r: any = await runAll({ ioProvider: apiIoProvider, baseUrl });
    const res = r?.results?.[symbol];
    if (!res) {
      return NextResponse.json({ ok:false, error:"symbol not found" }, { status: 404 });
    }

    const rawLegs: any[] = Array.isArray(res?.aux?.breakdown?.m4) ? res.aux.breakdown.m4 : [];
    const legs: Leg[] = rawLegs
      .map((l: any) => ({
        fillId: String(l.fillId ?? ""),
        time: String(l.time ?? ""),
        action: String(l.action ?? ""),
        qty: Number(l.qty ?? 0),
        lotDateStr: String(l.lotDateStr ?? ""),
        from: String(l.from ?? ""),
        pnl_raw: Number(l.pnl_raw ?? 0),
      }))
      .filter((leg) => leg.fillId.length > 0 || leg.qty !== 0);

    return NextResponse.json({
      ok: true,
      symbol,
      data: { M4: Number(res.M4 ?? 0), legs }
    });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: String(e) }, { status: 500 });
  }
}
