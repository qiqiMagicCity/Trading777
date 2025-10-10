"use client";

import { useEffect, useState } from "react";
import { getBus, pushSample, type AlertSample } from "@/app/lib/diagnostics/alertsBus";
import { collectUniverse } from "@/app/lib/diagnostics/universe";
import { scanPackagedOnly, scanUnified } from "@/app/lib/diagnostics/alertsScan";

export default function Page() {
  const [rows, setRows] = useState<AlertSample[]>([]);

  const run = async (stage: 'HYDRATE' | 'AFTER_EVENTS') => {
    const universe = await collectUniverse('both');
    const unified = await scanUnified(universe);
    const packaged = await scanPackagedOnly(universe);
    pushSample({
      stage,
      kind: 'OfficialCloseBanner(unified)',
      reason: 'requireOfficialClose',
      inputs: universe,
      outputs: { count: unified.missing.length },
      missing: unified.missing,
      snapshotAt: Date.now(),
    });
    pushSample({
      stage,
      kind: 'OfficialCloseBanner(packaged-only)',
      reason: 'packaged-only',
      inputs: universe,
      outputs: { count: packaged.missing.length },
      missing: packaged.missing,
      snapshotAt: Date.now(),
    });
    const bus = getBus();
    setRows(bus?.dump() ?? []);
  };

  useEffect(() => {
    void run('HYDRATE');
  }, []);

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-bold">Alerts Self-Check</h1>
      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1 rounded bg-black text-white"
          onClick={() => void run('AFTER_EVENTS')}
        >
          重算（AFTER_EVENTS）
        </button>
      </div>
      <pre className="text-sm bg-gray-100 p-3 rounded">
        {JSON.stringify(rows, null, 2)}
      </pre>
    </div>
  );
}
