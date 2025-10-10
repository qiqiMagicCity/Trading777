"use client";
import { useCallback, useEffect, useState } from "react";
import type { AlertSample } from "@/app/lib/diagnostics/alertsBus";
import { getBus, pushSample } from "@/app/lib/diagnostics/alertsBus";
import { collectUniverse } from "@/app/lib/diagnostics/universe";
import { scanUnified, scanPackagedOnly } from "@/app/lib/diagnostics/alertsScan";

type ClientStage = Extract<AlertSample["stage"], "HYDRATE" | "AFTER_EVENTS">;

export default function Page() {
  const [rows, setRows] = useState<AlertSample[]>([]);

  const run = useCallback(async (stage: ClientStage) => {
    const universe = await collectUniverse("both");
    const unified = await scanUnified(universe);
    const packaged = await scanPackagedOnly(universe);
    pushSample({
      stage,
      kind: "OfficialCloseBanner(unified)",
      reason: "requireOfficialClose",
      inputs: universe,
      outputs: { count: unified.missing.length },
      missing: unified.missing,
    });
    pushSample({
      stage,
      kind: "OfficialCloseBanner(packaged-only)",
      reason: "packaged-only",
      inputs: universe,
      outputs: { count: packaged.missing.length, error: packaged.error },
      missing: packaged.missing,
    });
    setRows(getBus()?.dump() ?? []);
  }, []);

  useEffect(() => {
    void run("HYDRATE");
  }, [run]);

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-bold">Alerts Self-Check</h1>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-3 py-1 rounded bg-black text-white"
          onClick={() => {
            void run("AFTER_EVENTS");
          }}
        >
          重算（AFTER_EVENTS）
        </button>
      </div>
      <pre className="text-sm bg-gray-100 p-3 rounded">{JSON.stringify(rows, null, 2)}</pre>
    </div>
  );
}
